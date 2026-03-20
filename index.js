const Anthropic = require("@anthropic-ai/sdk");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;

const CONTENT_PLAN = [
  { day: 1, hour: 10, minute: 0, rubric: "📊 Цена недели", topic: "Средние цены на квартиры по районам Ташкента. Юнусабад, Мирзо-Улугбек, Сергели, Чиланзар, Янги Узбекистон." },
  { day: 2, hour: 10, minute: 0, rubric: "📍 Район недели", topic: "Обзор района Ташкента — инфраструктура, плюсы и минусы, цены, прогноз роста. Чередуй: Сергели, Юнусабад, Мирзо-Улугбек, Чиланзар." },
  { day: 3, hour: 10, minute: 0, rubric: "⚖️ Юридический ликбез", topic: "Один юридический аспект при покупке/продаже недвижимости в Ташкенте. Кадастр, договор, задаток, обременения." },
  { day: 4, hour: 10, minute: 0, rubric: "❓ Вопрос-ответ", topic: "Частый вопрос покупателей недвижимости Ташкента. Котлован, торги, застройщики, доходность аренды." },
  { day: 5, hour: 10, minute: 0, rubric: "💰 Считаем инвестицию", topic: "Разбор объекта недвижимости Ташкента как инвестиции. Цена, аренда, ROI, подводные камни." },
  { day: 6, hour: 10, minute: 0, rubric: "🚨 Осторожно: мошенники", topic: "Схема обмана на рынке недвижимости Ташкента. Как защититься." },
];

async function generatePost(rubric, topic) {
  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    messages: [{ role: "user", content: "Ты эксперт по недвижимости Ташкента. Напиши Telegram пост.\nРУБРИКА: " + rubric + "\nТЕМА: " + topic + "\nСтруктура: заголовок с эмодзи, 3-4 абзаца с фактами, вывод, призыв к комментариям, хештеги.\nПотом разделитель —— и краткая версия на узбекском (50%).\nБез markdown. Только текст поста." }],
  });
  return response.content[0].text;
}

async function publishPost(rubric, topic) {
  console.log("[" + new Date().toISOString() + "] Генерирую: " + rubric);
  try {
    const text = await generatePost(rubric, topic);
    await bot.sendMessage(CHANNEL_ID, text, { disable_web_page_preview: true });
    console.log("[" + new Date().toISOString() + "] Опубликовано: " + rubric);
  } catch (e) {
    console.error("[" + new Date().toISOString() + "] Ошибка:", e.message);
  }
}

CONTENT_PLAN.forEach((item) => {
  cron.schedule(item.minute + " " + (item.hour - 5) + " * * " + item.day, () => {
    publishPost(item.rubric, item.topic);
  });
  console.log("Запланировано: " + item.rubric + " день " + item.day + " " + item.hour + ":00 Ташкент");
});

if (process.env.TEST_MODE === "true") {
  publishPost("📊 Цена недели", "Средние цены на квартиры по районам Ташкента.");
}

console.log("Автопостер запущен.");
