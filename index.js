const Anthropic = require("@anthropic-ai/sdk");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const sharp = require("sharp");
const fs = require("fs");

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;

const CONTENT_PLAN = [
  { day: 1, hour: 10, minute: 0, rubric: "📊 Цена недели", topic: "Средние цены на квартиры по районам Ташкента. Юнусабад, Мирзо-Улугбек, Сергели, Чиланзар, Янги Узбекистон.", bg: "#1a1a2e", accent: "#e94560" },
  { day: 2, hour: 10, minute: 0, rubric: "📍 Район недели", topic: "Обзор района Ташкента — инфраструктура, плюсы и минусы, цены, прогноз роста.", bg: "#0d1b2a", accent: "#1e6091" },
  { day: 3, hour: 10, minute: 0, rubric: "⚖️ Юридический ликбез", topic: "Один юридический аспект при покупке недвижимости в Ташкенте. Кадастр, договор, задаток.", bg: "#1a0533", accent: "#7b2d8b" },
  { day: 4, hour: 10, minute: 0, rubric: "❓ Вопрос-ответ", topic: "Частый вопрос покупателей недвижимости Ташкента. Котлован, торги, застройщики.", bg: "#0f1923", accent: "#00b4d8" },
  { day: 5, hour: 10, minute: 0, rubric: "💰 Считаем инвестицию", topic: "Разбор объекта недвижимости Ташкента как инвестиции. Цена, аренда, ROI.", bg: "#0a2e1a", accent: "#2d6a4f" },
  { day: 6, hour: 10, minute: 0, rubric: "🚨 Осторожно: мошенники", topic: "Схема обмана на рынке недвижимости Ташкента. Как защититься.", bg: "#2e0a0a", accent: "#c0392b" },
];

function wrapSvgText(text, x, y, width, fontSize, lineHeight) {
  const words = text.split(" ");
  let lines = [];
  let current = "";
  const charsPerLine = Math.floor(width / (fontSize * 0.6));
  for (const word of words) {
    if ((current + word).length > charsPerLine) {
      if (current) lines.push(current.trim());
      current = word + " ";
    } else {
      current += word + " ";
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.map((line, i) =>
    '<tspan x="' + x + '" dy="' + (i === 0 ? "0" : lineHeight) + '">' + line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</tspan>"
  ).join("");
}

async function generateImage(rubric, headline, item) {
  const W = 1080, H = 1080;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${item.bg};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="${item.accent}"/>
  <rect x="0" y="${H - 8}" width="${W}" height="8" fill="${item.accent}"/>
  <circle cx="${W - 100}" cy="200" r="350" fill="rgba(255,255,255,0.02)"/>
  <circle cx="${W - 100}" cy="200" r="220" fill="rgba(255,255,255,0.02)"/>
  <rect x="0" y="0" width="6" height="${H}" fill="${item.accent}"/>
  <text x="60" y="80" font-family="Arial, sans-serif" font-size="26" fill="rgba(255,255,255,0.5)">@sardorestate</text>
  <rect x="55" y="108" width="340" height="56" rx="28" fill="${item.accent}"/>
  <text x="80" y="146" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#ffffff">${rubric.replace(/&/g, "&amp;")}</text>
  <text x="60" y="${280}" font-family="Arial, sans-serif" font-size="52" font-weight="bold" fill="#ffffff">
    ${wrapSvgText(headline, 60, 280, 900, 52, 68)}
  </text>
  <rect x="60" y="520" width="80" height="5" fill="${item.accent}"/>
  <text x="60" y="${H - 80}" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.35)">Недвижимость Ташкента · Честно и по делу</text>
</svg>`;

  const buf = Buffer.from(svg);
  const pngBuf = await sharp(buf).png().toBuffer();
  const path = "/tmp/post_" + Date.now() + ".png";
  fs.writeFileSync(path, pngBuf);
  return path;
}

async function generatePost(rubric, topic) {
  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    messages: [{ role: "user", content: "Ты эксперт по недвижимости Ташкента.\nНапиши Telegram пост.\nРУБРИКА: " + rubric + "\nТЕМА: " + topic + "\nСтруктура: заголовок (1 строка, до 55 символов, без эмодзи), пустая строка, 3-4 абзаца с фактами и советами, вывод, призыв к комментариям, хештеги.\nПотом разделитель —— и краткая версия на узбекском (50%).\nБез markdown. Первая строка — только заголовок (до 55 символов).\nОтвечай ТОЛЬКО текстом поста." }],
  });
  return response.content[0].text;
}

async function publishPost(rubric, topic, item) {
  console.log("[" + new Date().toISOString() + "] Генерирую: " + rubric);
  let imagePath = null;
  try {
    const text = await generatePost(rubric, topic);
    const firstLine = text.split("\n")[0].trim().substring(0, 55);
    imagePath = await generateImage(rubric, firstLine, item);
    await bot.sendPhoto(CHANNEL_ID, imagePath, { caption: text });
    console.log("[" + new Date().toISOString() + "] Опубликовано: " + rubric);
  } catch (e) {
    console.error("[" + new Date().toISOString() + "] Ошибка:", e.message);
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

console.log("Автопостер с картинками запущен.");
