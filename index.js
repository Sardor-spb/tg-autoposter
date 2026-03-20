const Anthropic = require("@anthropic-ai/sdk");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const https = require("https");
const http = require("http");
const fs = require("fs");

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;
const ROYEST_API_URL = process.env.ROYEST_API_URL || "http://royest-bot.railway.internal:3000";
const ROYEST_API_TOKEN = process.env.ROYEST_API_TOKEN || "royest2025";

const CONTENT_PLAN = [
  { day: 1, hour: 10, minute: 0, rubric: "📊 Цена недели", topic: "РЕАЛЬНЫЕ_ЦЕНЫ", color: "1a1a2e" },
  { day: 2, hour: 10, minute: 0, rubric: "📍 Район недели", topic: "Обзор района Ташкента — инфраструктура, плюсы и минусы, цены, прогноз роста.", color: "0d1b2a" },
  { day: 3, hour: 10, minute: 0, rubric: "⚖️ Юридический ликбез", topic: "Один юридический аспект при покупке недвижимости в Ташкенте. Кадастр, договор, задаток.", color: "1a0533" },
  { day: 4, hour: 10, minute: 0, rubric: "❓ Вопрос-ответ", topic: "Частый вопрос покупателей недвижимости Ташкента. Котлован, торги, застройщики.", color: "0f1923" },
  { day: 5, hour: 10, minute: 0, rubric: "💰 Считаем инвестицию", topic: "Разбор объекта недвижимости Ташкента как инвестиции. Цена, аренда, ROI.", color: "0a2e1a" },
  { day: 6, hour: 10, minute: 0, rubric: "🚨 Осторожно: мошенники", topic: "Схема обмана на рынке недвижимости Ташкента. Как защититься.", color: "2e0a0a" },
];

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, (res) => {
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(dest); });
    }).on("error", (e) => { fs.unlink(dest, () => {}); reject(e); });
  });
}

function fetchRealPrices() {
  return new Promise((resolve) => {
    const urlObj = new URL(ROYEST_API_URL + "/api/prices");
    const protocol = urlObj.protocol === "https:" ? https : http;
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
      path: urlObj.pathname,
      headers: { "x-api-token": ROYEST_API_TOKEN }
    };
    const req = protocol.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

function formatPricesForPrompt(pricesData) {
  if (!pricesData || !pricesData.districts || pricesData.districts.length === 0) {
    return "Данные по ценам временно недоступны. Используй актуальные ориентиры: Шайхантахур от $3000-5000/м², Мирабад $2000-4000/м², Юнусабад $1200-2000/м², Сергели $600-900/м².";
  }
  const lines = pricesData.districts.map(d =>
    d.district + ": avg $" + (d.avg_price_per_m2 || "?") + "/м² (объявлений: " + d.count + ", диапазон: $" + d.min_price_per_m2 + "-" + d.max_price_per_m2 + ")"
  ).join("\n");
  return "Реальные данные OLX.uz за 7 дней:\n" + lines;
}

async function generatePost(rubric, topic, item) {
  let realTopic = topic;
  if (topic === "РЕАЛЬНЫЕ_ЦЕНЫ") {
    const pricesData = await fetchRealPrices();
    const pricesText = formatPricesForPrompt(pricesData);
    realTopic = "Цены на квартиры по районам Ташкента. " + pricesText;
  }

  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 800,
    messages: [{ role: "user", content: "Ты эксперт по недвижимости Ташкента. Напиши короткий Telegram пост (максимум 900 символов).\nРУБРИКА: " + rubric + "\nТЕМА И ДАННЫЕ: " + realTopic + "\nПравила: заголовок (1 строка), 2-3 абзаца с конкретными цифрами, вывод, призыв к комментариям, 2-3 хештега. Потом разделитель —— и краткая версия на узбекском (150 символов).\nБез markdown. Весь текст не более 900 символов. Используй только предоставленные реальные данные — не выдумывай цифры." }],
  });
  return response.content[0].text;
}

async function publishPost(rubric, topic, item) {
  console.log("[" + new Date().toISOString() + "] Генерирую: " + rubric);
  let imagePath = null;
  try {
    const text = await generatePost(rubric, topic, item);
    const imageUrl = "https://placehold.co/1080x1080/" + item.color + "/ffffff/png?text=" +
      encodeURIComponent(rubric + "\n@sardorestate");
    imagePath = "/tmp/post_" + Date.now() + ".png";
    await downloadImage(imageUrl, imagePath);
    const caption = text.length > 950 ? text.substring(0, 950) + "..." : text;
    await bot.sendPhoto(CHANNEL_ID, imagePath, { caption: caption });
    console.log("[" + new Date().toISOString() + "] Опубликовано: " + rubric);
  } catch (e) {
    console.error("[" + new Date().toISOString() + "] Ошибка:", e.message);
    try {
      const text = await generatePost(rubric, topic, item);
      await bot.sendMessage(CHANNEL_ID, rubric + "\n\n" + text);
    } catch (e2) { console.error("Fallback ошибка:", e2.message); }
  } finally {
    if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  }
}

CONTENT_PLAN.forEach((item) => {
  cron.schedule(item.minute + " " + (item.hour - 5) + " * * " + item.day, () => {
    publishPost(item.rubric, item.topic, item);
  });
  console.log("Запланировано: " + item.rubric + " день " + item.day + " " + item.hour + ":00 Ташкент");
});

if (process.env.TEST_MODE === "true") {
  publishPost("📊 Цена недели", "РЕАЛЬНЫЕ_ЦЕНЫ", CONTENT_PLAN[0]);
}

console.log("Автопостер с реальными данными запущен.");
