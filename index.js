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

// ─── Фото по рубрикам ────────────────────────────────────────────────────────
const PHOTO_QUERIES = {
  "📊 Цена недели":          ["tashkent skyline", "tashkent modern building", "uzbekistan architecture", "tashkent city view"],
  "🏠 Лучшая сделка недели": ["tashkent apartment", "modern apartment tashkent", "uzbekistan new building", "tashkent residential"],
  "🔑 Аренда $400+":         ["luxury apartment interior", "modern living room", "tashkent luxury", "premium apartment"],
  "📍 Район недели":          ["tashkent street", "tashkent park", "uzbekistan neighborhood", "tashkent boulevard"],
  "⚖️ Юридический ликбез":   ["contract signing", "real estate documents", "notary uzbekistan", "legal papers"],
  "💰 Считаем инвестицию":   ["investment growth", "real estate investment", "property roi", "financial planning"],
  "🚨 Осторожно: мошенники": ["fraud warning", "scam alert", "cyber security", "warning sign"],
  "📈 Дайджест дня":         ["tashkent evening", "city lights tashkent", "uzbekistan real estate", "tashkent skyline night"],
};

// ─── Контент-план 10:00 ──────────────────────────────────────────────────────
const CONTENT_PLAN = [
  { day: 1, hour: 10, minute: 0, rubric: "📊 Цена недели",          type: "PRICES" },
  { day: 2, hour: 10, minute: 0, rubric: "🏠 Лучшая сделка недели", type: "DEALS" },
  { day: 3, hour: 10, minute: 0, rubric: "🔑 Аренда $400+",         type: "RENT" },
  { day: 4, hour: 10, minute: 0, rubric: "📍 Район недели",          type: "STATIC", topic: "Обзор одного района Ташкента — инфраструктура, плюсы и минусы, цены за м², прогноз роста." },
  { day: 5, hour: 10, minute: 0, rubric: "⚖️ Юридический ликбез",   type: "STATIC", topic: "Важный юридический аспект при покупке недвижимости в Ташкенте — кадастр, договор, задаток, риски." },
  { day: 6, hour: 10, minute: 0, rubric: "💰 Считаем инвестицию",   type: "STATIC", topic: "Разбор конкретного объекта как инвестиции — цена, аренда, ROI, подводные камни." },
  { day: 0, hour: 10, minute: 0, rubric: "🚨 Осторожно: мошенники", type: "STATIC", topic: "Реальная схема обмана на рынке недвижимости Ташкента 2025. Как распознать и защититься." },
];

// ─── Ежедневный дайджест в 20:00 ─────────────────────────────────────────────
// Как курс валют: чистая статистика, цены продажи + аренда, ссылки на OLX
const DAILY_DIGEST = { hour: 20, minute: 0 };

// ─── Утилиты ─────────────────────────────────────────────────────────────────
function getRandomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

async function getPhoto(rubric) {
  const queries = PHOTO_QUERIES[rubric] || ["tashkent city"];
  try {
    const buf = await downloadBuffer("https://source.unsplash.com/1080x1080/?" + encodeURIComponent(getRandomItem(queries)));
    return buf.length > 10000 ? buf : null;
  } catch(e) { return null; }
}

function apiGet(path) {
  return new Promise((resolve) => {
    const urlObj = new URL(ROYEST_API_URL + path);
    const protocol = urlObj.protocol === "https:" ? https : http;
    const req = protocol.get({
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
      path: urlObj.pathname,
      headers: { "x-api-token": ROYEST_API_TOKEN }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

// ─── Форматирование данных ────────────────────────────────────────────────────
function formatPrices(data) {
  if (!data?.districts?.length) return "Данные временно недоступны. Ориентиры: Шайхантахур $3000-5000/м², Мирабад $2000-4000/м², Юнусабад $1200-2000/м², Чиланзар $900-1400/м², Сергели $600-900/м².";
  return "Реальные данные OLX.uz за 7 дней:\n" + data.districts.map(d => {
    const trend = d.change_percent !== null ? (d.change_percent > 0 ? " ↑+" + d.change_percent + "%" : d.change_percent < 0 ? " ↓" + d.change_percent + "%" : " →0%") : "";
    return d.district + ": $" + d.min_price_per_m2 + "-" + d.max_price_per_m2 + "/м² (avg $" + d.avg_price_per_m2 + trend + ", " + d.count + " объявл.)";
  }).join("\n");
}

function formatDeals(data) {
  if (!data?.deals?.length) return "Топ сделок временно недоступен.";
  return data.deals.map((d, i) =>
    (i+1) + ". " + d.district + " — $" + d.price_usd + " ($" + d.price_per_m2 + "/м², " + d.area + "м², " + d.rooms + "к)"
  ).join("\n");
}

function formatRent(data) {
  if (!data?.districts?.length) return "Ориентиры аренды $400+: Шайхантахур $800-2000, Мирабад $600-1500, Юнусабад $500-1000, Чиланзар $400-700/мес";
  return data.districts.map(d =>
    d.district + ": $" + d.min_price_per_m2 + "-" + d.max_price_per_m2 + "/мес (avg $" + d.avg_price_usd + ", " + d.count + " объявл.)"
  ).join("\n");
}

// ─── Ежедневный дайджест ──────────────────────────────────────────────────────
// Чистая статистика без ИИ генерации — как курс валют
async function publishDailyDigest() {
  console.log("[" + new Date().toISOString() + "] Генерирую дайджест дня...");
  try {
    const [priceData, dealsData, rentData] = await Promise.all([
      apiGet("/api/prices"),
      apiGet("/api/deals"),
      apiGet("/api/rent")
    ]);

    const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tashkent" });

    // Блок продажи
    let saleBlock = "🏠 ПРОДАЖА — цены за 1м²:\n";
    if (priceData?.districts?.length) {
      priceData.districts.forEach(d => {
        const trend = d.change_percent !== null ? (d.change_percent > 0 ? " ↑+" + d.change_percent + "%" : d.change_percent < 0 ? " ↓" + d.change_percent + "%" : "") : "";
        saleBlock += "• " + d.district + ": $" + d.min_price_per_m2 + " – $" + d.max_price_per_m2 + trend + "\n";
      });
    } else {
      saleBlock += "• Шайхантахур: $3000 – $5000\n• Мирабад: $2000 – $4000\n• Юнусабад: $1200 – $2000\n• Чиланзар: $900 – $1400\n• Сергели: $600 – $900\n";
    }

    // Блок аренды
    let rentBlock = "\n🔑 АРЕНДА от $400/мес:\n";
    if (rentData?.districts?.length) {
      rentData.districts.forEach(d => {
        rentBlock += "• " + d.district + ": $" + d.min_price_per_m2 + " – $" + d.max_price_per_m2 + "/мес\n";
      });
    } else {
      rentBlock += "• Шайхантахур: $800 – $2000/мес\n• Мирабад/Яккасарай: $600 – $1500/мес\n• Юнусабад: $500 – $1000/мес\n• Чиланзар: $400 – $700/мес\n";
    }

    // Лучшая сделка дня
    let dealsBlock = "";
    if (dealsData?.deals?.length) {
      const cheapest = dealsData.deals[0];
      const priciest = dealsData.deals[dealsData.deals.length - 1];
      dealsBlock += "\n💡 Самая дешёвая по м²:\n";
      dealsBlock += cheapest.district + " — $" + cheapest.price_usd + " ($" + cheapest.price_per_m2 + "/м², " + cheapest.area + "м²)\n";
      if (cheapest.id) dealsBlock += "🔗 olx.uz/obyavlenie/" + cheapest.id + "\n";
      dealsBlock += "\n📌 Самая дорогая из подборки:\n";
      dealsBlock += priciest.district + " — $" + priciest.price_usd + " ($" + priciest.price_per_m2 + "/м², " + priciest.area + "м²)\n";
      if (priciest.id) dealsBlock += "🔗 olx.uz/obyavlenie/" + priciest.id + "\n";
    }

    // Лучшая аренда
    let rentDealsBlock = "";
    if (rentData?.top_deals?.length) {
      const cheapRent = rentData.top_deals[0];
      const expRent = rentData.top_deals[rentData.top_deals.length - 1];
      rentDealsBlock += "\n💡 Самая доступная аренда $400+:\n";
      rentDealsBlock += cheapRent.district + " — $" + cheapRent.price_usd + "/мес (" + cheapRent.area + "м², " + cheapRent.rooms + "к)\n";
      if (cheapRent.id) rentDealsBlock += "🔗 olx.uz/obyavlenie/" + cheapRent.id + "\n";
      rentDealsBlock += "\n📌 Топ предложение:\n";
      rentDealsBlock += expRent.district + " — $" + expRent.price_usd + "/мес (" + expRent.area + "м², " + expRent.rooms + "к)\n";
      if (expRent.id) rentDealsBlock += "🔗 olx.uz/obyavlenie/" + expRent.id + "\n";
    }

    const text = "📈 ДАЙДЖЕСТ НЕДВИЖИМОСТИ\n" + today + "\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      saleBlock +
      rentBlock +
      dealsBlock +
      rentDealsBlock +
      "\n━━━━━━━━━━━━━━━━━━━━\n" +
      "Данные: OLX.uz | @sardorestate";

    const photoBuffer = await getPhoto("📈 Дайджест дня");
    const caption = text.length > 1024 ? text.substring(0, 1021) + "..." : text;

    if (photoBuffer && photoBuffer.length > 10000) {
      await bot.sendPhoto(CHANNEL_ID, photoBuffer, { caption });
    } else {
      await bot.sendMessage(CHANNEL_ID, text);
    }
    console.log("[" + new Date().toISOString() + "] Дайджест опубликован");
  } catch(e) {
    console.error("[" + new Date().toISOString() + "] Ошибка дайджеста:", e.message);
  }
}

// ─── Контентные посты (10:00) ─────────────────────────────────────────────────
async function buildPromptData(item) {
  if (item.type === "PRICES") {
    const data = await apiGet("/api/prices");
    return { topic: "Цены на квартиры (продажа) по районам Ташкента.\n" + formatPrices(data), extra: "Укажи тренд роста/падения по каждому району если есть." };
  }
  if (item.type === "DEALS") {
    const data = await apiGet("/api/deals");
    return { topic: "Лучшие сделки недели.\n" + formatDeals(data), extra: "Объясни почему эти объекты выгодны и на что обратить внимание." };
  }
  if (item.type === "RENT") {
    const data = await apiGet("/api/rent");
    const rentStr = formatRent(data);
    const dealsStr = data?.top_deals?.length ? "\nЛучшие предложения:\n" + data.top_deals.map((d,i) => (i+1)+". "+d.district+" — $"+d.price_usd+"/мес ("+d.area+"м², "+d.rooms+"к)").join("\n") : "";
    return { topic: "Аренда квартир от $400/месяц в Ташкенте.\n" + rentStr + dealsStr, extra: "Только $400+. Что получаешь за эти деньги, какие районы лучше для каких целей." };
  }
  return { topic: item.topic, extra: "" };
}

async function generatePost(rubric, promptData) {
  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1200,
    messages: [{ role: "user", content: `Ты эксперт по недвижимости Ташкента. Напиши Telegram пост.

РУБРИКА: ${rubric}
ДАННЫЕ: ${promptData.topic}
УТОЧНЕНИЕ: ${promptData.extra || ""}

СТРУКТУРА:
1. Цепляющий заголовок (1 строка)
2. 2-3 абзаца с конкретными цифрами
3. Практический совет
4. Призыв к комментариям
5. 2-3 хештега
6. Разделитель: ——
7. ПОЛНЫЙ перевод на узбекский (такой же объём)

Без markdown. До 1800 символов. Только реальные данные.` }],
  });
  return response.content[0].text;
}

async function publishPost(item) {
  console.log("[" + new Date().toISOString() + "] Генерирую: " + item.rubric);
  try {
    const [promptData, photoBuffer] = await Promise.all([buildPromptData(item), getPhoto(item.rubric)]);
    const text = await generatePost(item.rubric, promptData);
    const caption = text.length > 1024 ? text.substring(0, 1021) + "..." : text;
    if (photoBuffer && photoBuffer.length > 10000) {
      await bot.sendPhoto(CHANNEL_ID, photoBuffer, { caption });
    } else {
      await bot.sendMessage(CHANNEL_ID, item.rubric + "\n\n" + text);
    }
    console.log("[" + new Date().toISOString() + "] Опубликовано: " + item.rubric);
  } catch(e) {
    console.error("[" + new Date().toISOString() + "] Ошибка:", e.message);
  }
}

// ─── Расписание ───────────────────────────────────────────────────────────────
// Контентные посты 10:00 Ташкент (UTC+5 = UTC 05:00)
CONTENT_PLAN.forEach((item) => {
  cron.schedule(item.minute + " " + (item.hour - 5) + " * * " + item.day, () => publishPost(item));
  console.log("Запланировано: " + item.rubric + " день " + item.day + " " + item.hour + ":00 Ташкент");
});

// Ежедневный дайджест 20:00 Ташкент (UTC+5 = UTC 15:00) — каждый день
cron.schedule("0 15 * * *", () => publishDailyDigest());
console.log("Запланировано: 📈 Дайджест дня — каждый день 20:00 Ташкент");

if (process.env.TEST_MODE === "true") {
  publishPost(CONTENT_PLAN[0]);
}
if (process.env.TEST_DIGEST === "true") {
  publishDailyDigest();
}

console.log("Автопостер v4 запущен — контент 10:00 + дайджест 20:00.");
