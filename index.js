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

// Unsplash фото по рубрикам — реальные фото Ташкента и недвижимости
const PHOTO_QUERIES = {
  "📊 Цена недели":        ["tashkent city", "tashkent skyline", "uzbekistan architecture", "tashkent modern building"],
  "📍 Район недели":       ["tashkent street", "tashkent neighborhood", "uzbekistan city street", "tashkent park"],
  "⚖️ Юридический ликбез": ["contract signing", "real estate documents", "legal papers", "notary document"],
  "❓ Вопрос-ответ":       ["tashkent apartment", "uzbekistan interior", "modern apartment interior", "luxury apartment"],
  "💰 Считаем инвестицию": ["investment growth", "real estate investment", "property investment", "financial growth"],
  "🚨 Осторожно: мошенники": ["fraud warning", "scam alert", "cyber security", "fake documents"]
};

const CONTENT_PLAN = [
  { day: 1, hour: 10, minute: 0, rubric: "📊 Цена недели",        topic: "РЕАЛЬНЫЕ_ЦЕНЫ",                                                                                  color: "e8f4f8" },
  { day: 2, hour: 10, minute: 0, rubric: "📍 Район недели",       topic: "Обзор одного района Ташкента — инфраструктура, плюсы и минусы, цены, прогноз роста.",             color: "f0f8e8" },
  { day: 3, hour: 10, minute: 0, rubric: "⚖️ Юридический ликбез", topic: "Один юридический аспект при покупке недвижимости в Ташкенте. Кадастр, договор, задаток.",        color: "f8f0e8" },
  { day: 4, hour: 10, minute: 0, rubric: "❓ Вопрос-ответ",       topic: "Частый вопрос покупателей недвижимости Ташкента. Котлован, торги, застройщики.",                  color: "f8e8f0" },
  { day: 5, hour: 10, minute: 0, rubric: "💰 Считаем инвестицию", topic: "Разбор объекта недвижимости Ташкента как инвестиции. Цена, аренда, ROI.",                         color: "e8f8e8" },
  { day: 6, hour: 10, minute: 0, rubric: "🚨 Осторожно: мошенники", topic: "Схема обмана на рынке недвижимости Ташкента. Как защититься.",                                  color: "f8e8e8" },
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

// Получаем фото с Unsplash (бесплатный endpoint без API ключа)
async function getPhoto(rubric) {
  const queries = PHOTO_QUERIES[rubric] || ["tashkent city"];
  const query = getRandomItem(queries);
  // Unsplash Source API — бесплатно, без ключа, всегда разные фото
  const url = "https://source.unsplash.com/1080x1080/?" + encodeURIComponent(query);
  try {
    const buf = await downloadBuffer(url);
    if (buf.length > 10000) return buf; // валидное фото
    return null;
  } catch(e) {
    return null;
  }
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
    return "Данные временно недоступны. Ориентиры: Шайхантахур $3000-5000/м², Мирабад $2000-4000/м², Юнусабад $1200-2000/м², Сергели $600-900/м².";
  }
  const lines = pricesData.districts.map(d =>
    d.district + ": $" + d.min_price_per_m2 + "-" + d.max_price_per_m2 + "/м² (avg $" + d.avg_price_per_m2 + ", объявлений: " + d.count + ")"
  ).join("\n");
  return "Реальные данные OLX.uz за 7 дней:\n" + lines;
}

async function generatePost(rubric, topic) {
  let realTopic = topic;
  if (topic === "РЕАЛЬНЫЕ_ЦЕНЫ") {
    const pricesData = await fetchRealPrices();
    realTopic = "Цены на квартиры по районам Ташкента. " + formatPricesForPrompt(pricesData);
  }

  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1200,
    messages: [{ role: "user", content: `Ты эксперт по недвижимости Ташкента. Напиши Telegram пост.

РУБРИКА: ${rubric}
ТЕМА И ДАННЫЕ: ${realTopic}

СТРУКТУРА:
1. Заголовок (цепляющий, 1 строка)
2. 2-3 абзаца на русском с конкретными цифрами
3. Призыв к комментариям
4. 2-3 хештега
5. Разделитель: ——
6. ПОЛНЫЙ перевод на узбекский (такой же объём — заголовок, все абзацы, призыв, хештеги)

Без markdown. Общий текст не более 1800 символов. Только реальные данные.` }],
  });
  return response.content[0].text;
}

async function publishPost(rubric, topic, item) {
  console.log("[" + new Date().toISOString() + "] Генерирую: " + rubric);
  try {
    const [text, photoBuffer] = await Promise.all([
      generatePost(rubric, topic),
      getPhoto(rubric)
    ]);

    const caption = text.length > 1024 ? text.substring(0, 1021) + "..." : text;

    if (photoBuffer && photoBuffer.length > 10000) {
      // Отправляем реальное фото
      await bot.sendPhoto(CHANNEL_ID, photoBuffer, { caption });
      console.log("[" + new Date().toISOString() + "] Опубликовано с фото: " + rubric);
    } else {
      // Fallback — текст без фото
      await bot.sendMessage(CHANNEL_ID, rubric + "\n\n" + text);
      console.log("[" + new Date().toISOString() + "] Опубликовано текстом: " + rubric);
    }
  } catch (e) {
    console.error("[" + new Date().toISOString() + "] Ошибка:", e.message);
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

console.log("Автопостер с фотографиями запущен.");
