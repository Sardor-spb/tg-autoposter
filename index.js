const Anthropic = require("@anthropic-ai/sdk");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const { createCanvas } = require("canvas");
const fs = require("fs");

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;

const CONTENT_PLAN = [
  { day: 1, hour: 10, minute: 0, rubric: "📊 Цена недели", topic: "Средние цены на квартиры по районам Ташкента. Юнусабад, Мирзо-Улугбек, Сергели, Чиланзар, Янги Узбекистон.", emoji: "📊", color: "#1a1a2e", accent: "#e94560" },
  { day: 2, hour: 10, minute: 0, rubric: "📍 Район недели", topic: "Обзор района Ташкента — инфраструктура, плюсы и минусы, цены, прогноз роста.", emoji: "📍", color: "#16213e", accent: "#0f3460" },
  { day: 3, hour: 10, minute: 0, rubric: "⚖️ Юридический ликбез", topic: "Один юридический аспект при покупке/продаже недвижимости в Ташкенте. Кадастр, договор, задаток.", emoji: "⚖️", color: "#0f3460", accent: "#533483" },
  { day: 4, hour: 10, minute: 0, rubric: "❓ Вопрос-ответ", topic: "Частый вопрос покупателей недвижимости Ташкента. Котлован, торги, застройщики, доходность аренды.", emoji: "❓", color: "#1b1b2f", accent: "#e43f5a" },
  { day: 5, hour: 10, minute: 0, rubric: "💰 Считаем инвестицию", topic: "Разбор объекта недвижимости Ташкента как инвестиции. Цена, аренда, ROI, подводные камни.", emoji: "💰", color: "#162447", accent: "#1f4068" },
  { day: 6, hour: 10, minute: 0, rubric: "🚨 Осторожно: мошенники", topic: "Схема обмана на рынке недвижимости Ташкента. Как защититься.", emoji: "🚨", color: "#1a0000", accent: "#c0392b" },
];

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = words[n] + " ";
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY;
}

function generateImage(rubric, firstLine, item) {
  const width = 1080;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, item.color);
  grad.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Accent rectangle top
  ctx.fillStyle = item.accent;
  ctx.fillRect(0, 0, width, 8);

  // Grid pattern
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 60) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
  }
  for (let i = 0; i < height; i += 60) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
  }

  // Big circle decoration
  ctx.beginPath();
  ctx.arc(width - 150, 200, 300, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(width - 150, 200, 200, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fill();

  // Channel name
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "bold 28px Arial";
  ctx.fillText("@sardorestate", 60, 80);

  // Rubric badge
  ctx.fillStyle = item.accent;
  ctx.beginPath();
  ctx.roundRect(60, 120, ctx.measureText(rubric).width + 40, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px Arial";
  ctx.fillText(rubric, 80, 154);

  // Main headline
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 58px Arial";
  const lastY = wrapText(ctx, firstLine, 60, 280, width - 120, 72);

  // Divider
  ctx.fillStyle = item.accent;
  ctx.fillRect(60, lastY + 40, 80, 4);

  // Bottom info
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "24px Arial";
  ctx.fillText("Недвижимость Ташкента • Честно и по делу", 60, height - 100);

  // Accent bottom
  ctx.fillStyle = item.accent;
  ctx.fillRect(0, height - 8, width, 8);

  const filename = "/tmp/post_image.png";
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(filename, buffer);
  return filename;
}

async function generatePost(rubric, topic) {
  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    messages: [{ role: "user", content: "Ты эксперт по недвижимости Ташкента.\nНапиши Telegram пост.\nРУБРИКА: " + rubric + "\nТЕМА: " + topic + "\nСтруктура: заголовок (1 строка, до 60 символов), пустая строка, 3-4 абзаца с фактами и советами, вывод, призыв к комментариям, хештеги.\nПотом разделитель —— и краткая версия на узбекском (50%).\nБез markdown. Первая строка — только заголовок.\nОтвечай ТОЛЬКО текстом поста." }],
  });
  return response.content[0].text;
}

async function publishPost(rubric, topic, item) {
  console.log("[" + new Date().toISOString() + "] Генерирую: " + rubric);
  try {
    const text = await generatePost(rubric, topic);
    const firstLine = text.split("\n")[0].replace(/[*_]/g, "").substring(0, 80);
    const imagePath = generateImage(rubric, firstLine, item);
    await bot.sendPhoto(CHANNEL_ID, imagePath, {
      caption: text,
      disable_notification: false
    });
    fs.unlinkSync(imagePath);
    console.log("[" + new Date().toISOString() + "] Опубликовано с фото: " + rubric);
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
  publishPost("📊 Цена недели", "Средние цены на квартиры по районам Ташкента.", CONTENT_PLAN[0]);
}

console.log("Автопостер с картинками запущен.");
