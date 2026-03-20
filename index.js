const Anthropic = require("@anthropic-ai/sdk");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const https = require("https");
const fs = require("fs");

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;

const CONTENT_PLAN = [
  { day: 1, hour: 10, minute: 0, rubric: "📊 Цена недели", topic: "Средние цены на квартиры по районам Ташкента. Юнусабад, Мирзо-Улугбек, Сергели, Чиланзар, Янги Узбекистон.", color: "1a1a2e" },
  { day: 2, hour: 10, minute: 0, rubric: "📍 Район недели", topic: "Обзор района Ташкента — инфраструктура, плюсы и минусы, цены, прогноз роста.", color: "0d1b2a" },
  { day: 3, hour: 10, minute: 0, rubric: "⚖️ Юридический ликбез", topic: "Один юридический аспект при покупке недвижимости в Ташкенте. Кадастр, договор, задаток.", color: "1a0533" },
  { day: 4, hour: 10, minute: 0, rubric: "❓ Вопрос-ответ", topic: "Частый вопрос покупателей недвижимости Ташкента. Котлован, торги, застройщики.", color: "0f1923" },
  { day: 5, hour: 10, minute: 0, rubric: "💰 Считаем инвестицию", topic: "Разбор объекта недвижимости Ташкента как инвестиции. Цена, аренда, ROI.", color: "0a2e1a" },
  { day: 6, hour: 10, minute: 0, rubric: "🚨 Осторожно: мошенники", topic: "Схема обмана на рынке недвижимости Ташкента. Как защититься.", color: "2e0a0a" },
];

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(dest); });
    }).on("error", (e) => { fs.unlink(dest, () => {}); reject(e); });
  });
}

async function generatePost(rubric, topic) {
  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 800,
    messages: [{ role: "user", content: "Ты эксперт по недвижимости Ташкента. Напиши короткий Telegram пост (максимум 900 символов всего).\nРУБРИКА: " + rubric + "\nТЕМА: " + topic + "\nСтруктура: заголовок (1 строка), 2-3 коротких абзаца с фактами, вывод одной строкой, призыв к комментариям, 2-3 хештега.\nПотом разделитель —— и краткая версия на узбекском (200 символов максимум).\nБез markdown. Весь текст не более 900 символов." }],
  });
  return response.content[0].text;
}

async function publishPost(rubric, topic, item) {
  console.log("[" + new Date().toISOString() + "] Генерирую: " + rubric);
  let imagePath = null;
  try {
    const text = await generatePost(rubric, topic);

    // Генерируем картинку через PlaceHold.co - простой, надёжный, бесплатный
    const imageUrl = "https://placehold.co/1080x1080/" + item.color + "/ffffff/png?text=" +
      encodeURIComponent(rubric + "\n@sardorestate");

    imagePath = "/tmp/post_" + Date.now() + ".png";
    await downloadImage(imageUrl, imagePath);

    // Отправляем фото + текст как caption (ограничен 1024 символами)
    const caption = text.length > 950 ? text.substring(0, 950) + "..." : text;
    await bot.sendPhoto(CHANNEL_ID, imagePath, { caption: caption });

    console.log("[" + new Date().toISOString() + "] Опубликовано: " + rubric);
  } catch (e) {
    console.error("[" + new Date().toISOString() + "] Ошибка:", e.message);
    // Fallback: отправляем просто текст
    try {
      const text = await generatePost(rubric, topic);
      await bot.sendMessage(CHANNEL_ID, rubric + "\n\n" + text);
      console.log("[" + new Date().toISOString() + "] Отправлено текстом: " + rubric);
    } catch (e2) {
      console.error("Fallback тоже не сработал:", e2.message);
    }
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
  publishPost("📊 Цена недели", "Средние цены на квартиры по районам Ташкента.", CONTENT_PLAN[0]);
}

console.log("Автопостер запущен.");
