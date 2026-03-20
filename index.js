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

// Фото по рубрикам — Unsplash, каждый раз разные
const PHOTO_QUERIES = {
  "📊 Цена недели":          ["tashkent skyline", "tashkent modern building", "uzbekistan architecture", "tashkent city view"],
  "🏠 Лучшая сделка недели": ["tashkent apartment", "modern apartment tashkent", "uzbekistan new building", "tashkent residential"],
  "🔑 Аренда $400+":         ["luxury apartment interior", "modern living room", "tashkent luxury", "premium apartment"],
  "📍 Район недели":          ["tashkent street", "tashkent park", "uzbekistan neighborhood", "tashkent boulevard"],
  "⚖️ Юридический ликбез":   ["contract signing", "real estate documents", "legal documents uzbekistan", "notary"],
  "❓ Вопрос-ответ":          ["real estate consulting", "property advice", "apartment buying", "uzbekistan real estate"],
  "💰 Считаем инвестицию":   ["investment growth chart", "real estate investment", "property roi", "financial planning"],
  "🚨 Осторожно: мошенники": ["fraud warning", "scam alert", "cyber security lock", "warning sign"],
};

// Полный контент-план: 7 дней
const CONTENT_PLAN = [
  { day: 1, hour: 10, minute: 0, rubric: "📊 Цена недели",          type: "PRICES" },
  { day: 2, hour: 10, minute: 0, rubric: "🏠 Лучшая сделка недели", type: "DEALS" },
  { day: 3, hour: 10, minute: 0, rubric: "🔑 Аренда $400+",         type: "RENT" },
  { day: 4, hour: 10, minute: 0, rubric: "📍 Район недели",          type: "DISTRICT", topic: "Обзор одного района Ташкента — инфраструктура, плюсы и минусы, цены за м², прогноз роста." },
  { day: 5, hour: 10, minute: 0, rubric: "⚖️ Юридический ликбез",   type: "STATIC",   topic: "Один важный юридический аспект при покупке недвижимости в Ташкенте — кадастр, договор, задаток, риски." },
  { day: 6, hour: 10, minute: 0, rubric: "💰 Считаем инвестицию",   type: "STATIC",   topic: "Разбор конкретного объекта недвижимости Ташкента как инвестиции — цена покупки, аренда, ROI, подводные камни." },
  { day: 0, hour: 10, minute: 0, rubric: "🚨 Осторожно: мошенники", type: "STATIC",   topic: "Реальная схема обмана на рынке недвижимости Ташкента в 2025 году. Как распознать и защититься." },
];

function getRandomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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

async function getPhoto(rubric) {
  const queries = PHOTO_QUERIES[rubric] || ["tashkent city"];
  const query = getRandomItem(queries);
  try {
    const buf = await downloadBuffer("https://source.unsplash.com/1080x1080/?" + encodeURIComponent(query));
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
      res.on("data", (c) => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

function formatPrices(data) {
  if (!data?.districts?.length) return "Данные временно недоступны. Ориентиры: Шайхантахур $3000-5000/м², Мирабад $2000-4000/м², Юнусабад $1200-2000/м², Чиланзар $900-1400/м², Сергели $600-900/м².";
  return "Реальные данные OLX.uz за 7 дней:\n" + data.districts.map(d => {
    const trend = d.change_percent !== null ? (d.change_percent > 0 ? " ↑+" + d.change_percent + "%" : d.change_percent < 0 ? " ↓" + d.change_percent + "%" : " →0%") : "";
    return d.district + ": $" + d.min_price_per_m2 + "-" + d.max_price_per_m2 + "/м² (avg $" + d.avg_price_per_m2 + trend + ", " + d.count + " объявлений)";
  }).join("\n");
}

function formatDeals(data) {
  if (!data?.deals?.length) return "Топ сделок временно недоступен. Ищи объекты с ценой на 15-20% ниже средней по району.";
  return "Топ-" + data.deals.length + " лучших сделок недели по цене за м²:\n" + data.deals.map((d, i) =>
    (i+1) + ". " + d.district + " — $" + d.price_usd + " ($" + d.price_per_m2 + "/м², " + d.area + "м², " + d.rooms + "к)"
  ).join("\n");
}

function formatRent(data) {
  if (!data?.districts?.length && !data?.top_deals?.length) {
    return "Аренда $400+ в Ташкенте: Шайхантахур $800-2000/мес, Мирабад/Яккасарай $600-1500/мес, Юнусабад $500-1000/мес, Чиланзар $400-700/мес. Только квартиры с хорошим ремонтом и локацией.";
  }
  let result = "";
  if (data.districts?.length) {
    result += "Аренда $400+ по районам (реальные данные OLX.uz):\n" + data.districts.map(d =>
      d.district + ": $" + d.min_price_per_m2 + "-" + d.max_price_per_m2 + "/мес (avg $" + d.avg_price_usd + ", " + d.count + " объявлений)"
    ).join("\n");
  } else {
    result += "Ориентиры аренды $400+: Шайхантахур $800-2000, Мирабад $600-1500, Юнусабад $500-1000, Чиланзар $400-700/мес";
  }
  if (data.top_deals?.length) {
    result += "\n\nЛучшие предложения недели:\n" + data.top_deals.map((d, i) =>
      (i+1) + ". " + d.district + " — $" + d.price_usd + "/мес (" + d.area + "м², " + d.rooms + "к)"
    ).join("\n");
  }
  return result;
}

async function buildPromptData(item) {
  if (item.type === "PRICES") {
    const data = await apiGet("/api/prices");
    return { topic: "Цены на квартиры (продажа) по районам Ташкента.\n" + formatPrices(data), extra: "Обязательно укажи тренд роста/падения по каждому району если есть данные." };
  }
  if (item.type === "DEALS") {
    const data = await apiGet("/api/deals");
    return { topic: "Лучшие сделки недели — самые дешёвые квартиры за м² на OLX.uz.\n" + formatDeals(data), extra: "Объясни почему эти объекты выгодны и на что обратить внимание при проверке." };
  }
  if (item.type === "RENT") {
    const data = await apiGet("/api/rent");
    return { topic: "Аренда квартир от $400/месяц в Ташкенте.\n" + formatRent(data), extra: "Только премиум сегмент $400+. Укажи что входит в такую аренду, какие районы лучше для разных целей." };
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
2. 2-3 абзаца на русском с конкретными цифрами
3. Практический вывод или совет
4. Призыв к комментариям
5. 2-3 хештега
6. Разделитель: ——
7. ПОЛНЫЙ перевод на узбекский (такой же объём — заголовок, все абзацы, призыв, хештеги)

Без markdown. Общий текст до 1800 символов. Только реальные данные — не выдумывай цифры.` }],
  });
  return response.content[0].text;
}

async function publishPost(item) {
  console.log("[" + new Date().toISOString() + "] Генерирую: " + item.rubric);
  try {
    const [promptData, photoBuffer] = await Promise.all([
      buildPromptData(item),
      getPhoto(item.rubric)
    ]);
    const text = await generatePost(item.rubric, promptData);
    const caption = text.length > 1024 ? text.substring(0, 1021) + "..." : text;

    if (photoBuffer && photoBuffer.length > 10000) {
      await bot.sendPhoto(CHANNEL_ID, photoBuffer, { caption });
    } else {
      await bot.sendMessage(CHANNEL_ID, item.rubric + "\n\n" + text);
    }
    console.log("[" + new Date().toISOString() + "] Опубликовано: " + item.rubric);
  } catch (e) {
    console.error("[" + new Date().toISOString() + "] Ошибка:", e.message);
  }
}

CONTENT_PLAN.forEach((item) => {
  cron.schedule(item.minute + " " + (item.hour - 5) + " * * " + item.day, () => publishPost(item));
  console.log("Запланировано: " + item.rubric + " день " + item.day + " " + item.hour + ":00 Ташкент");
});

if (process.env.TEST_MODE === "true") {
  publishPost(CONTENT_PLAN[0]);
}

console.log("Автопостер v3 запущен — 7 рубрик, фото, аренда, динамика.");
