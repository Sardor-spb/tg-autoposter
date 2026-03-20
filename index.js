const Anthropic = require("@anthropic-ai/sdk");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const https = require("https");
const http = require("http");

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;
const ROYEST_API_URL = process.env.ROYEST_API_URL || "http://royest-bot.railway.internal:3000";
const ROYEST_API_TOKEN = process.env.ROYEST_API_TOKEN || "royest2025";
const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "http://yangiuylar-scraper.railway.internal:3001";
const SCRAPER_API_TOKEN = process.env.SCRAPER_API_TOKEN || "yangi2025";

// Прямые URL фото с Unsplash
const PHOTO_URLS = {
  "📊 Цена недели": [
    "https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=1080&q=80",
    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1080&q=80",
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1080&q=80",
  ],
  "🏠 Лучшая сделка недели": [
    "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1080&q=80",
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1080&q=80",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1080&q=80",
  ],
  "🔑 Аренда $400+": [
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1080&q=80",
    "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1080&q=80",
    "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=1080&q=80",
  ],
  "🏗️ Новостройки": [
    "https://images.unsplash.com/photo-1541976590-713941681591?w=1080&q=80",
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1080&q=80",
    "https://images.unsplash.com/photo-1621155346337-1d19476ba7d6?w=1080&q=80",
  ],
  "📍 Район недели": [
    "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1080&q=80",
    "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1080&q=80",
    "https://images.unsplash.com/photo-1444723121867-7a241cacace9?w=1080&q=80",
  ],
  "⚖️ Юридический ликбез": [
    "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1080&q=80",
    "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1080&q=80",
    "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1080&q=80",
  ],
  "💰 Считаем инвестицию": [
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1080&q=80",
    "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=1080&q=80",
    "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1080&q=80",
  ],
  "🚨 Осторожно: мошенники": [
    "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1080&q=80",
    "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=1080&q=80",
    "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=1080&q=80",
  ],
  "📈 Дайджест дня": [
    "https://images.unsplash.com/photo-1551836022-4c4c79ecde51?w=1080&q=80",
    "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1080&q=80",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1080&q=80",
  ],
};

// Контент-план
const CONTENT_PLAN = [
  { day: 1, hour: 10, minute: 0, rubric: "📊 Цена недели",          type: "PRICES" },
  { day: 2, hour: 10, minute: 0, rubric: "🏠 Лучшая сделка недели", type: "DEALS" },
  { day: 3, hour: 10, minute: 0, rubric: "🔑 Аренда $400+",         type: "RENT" },
  { day: 4, hour: 10, minute: 0, rubric: "🏗️ Новостройки",          type: "NEWBUILDS" },
  { day: 5, hour: 10, minute: 0, rubric: "⚖️ Юридический ликбез",   type: "STATIC", topic: "ЮРИДИКА" },
  { day: 6, hour: 10, minute: 0, rubric: "💰 Считаем инвестицию",   type: "STATIC", topic: "ИНВЕСТИЦИЯ" },
  { day: 0, hour: 10, minute: 0, rubric: "🚨 Осторожно: мошенники", type: "STATIC", topic: "МОШЕННИКИ" },
];

// Темы ротации по неделям
const WEEKLY_TOPICS = {
  "ЮРИДИКА": [
    "Задаток при покупке квартиры в Ташкенте в 2026 году: как оформить правильно, какую сумму давать, что прописать в договоре.",
    "Проверка юридической чистоты квартиры в Узбекистане: кадастр, обременения, долги, арест имущества — пошаговая инструкция.",
    "Нотариальное оформление сделки с недвижимостью в Ташкенте в 2026: стоимость, сроки, список документов.",
    "Налоги при покупке и продаже квартиры в Узбекистане в 2026 году: кто платит, сколько, как законно оптимизировать.",
    "Договор купли-продажи недвижимости в Ташкенте: опасные пункты, что должно быть обязательно, красные флаги.",
    "Как переоформить квартиру в Ташкенте если есть несколько собственников или наследство.",
  ],
  "ИНВЕСТИЦИЯ": [
    "Разбор: квартира в Юнусабаде за $85,000 — сколько приносит в аренду и когда окупится.",
    "Котлован в Сергели за $45,000 — реальный ROI через 2 года по данным рынка Ташкента 2026.",
    "Коммерческая vs жилая недвижимость в Ташкенте: что выгоднее покупать для сдачи в аренду в 2026.",
    "Портфельная инвестиция: 2 однушки в Чиланзаре vs 1 двушка в Мирабаде — что лучше по доходности.",
    "Топ-5 ошибок инвесторов в недвижимость Ташкента которые стоят денег — реальные кейсы 2026.",
  ],
  "МОШЕННИКИ": [
    "Схема двойной продажи квартиры в Ташкенте в 2026 году: как работает и как не попасться.",
    "Фейковые агентства недвижимости Ташкента: 5 признаков что перед вами мошенники.",
    "Аванс и задаток: как мошенники забирают деньги и исчезают — реальные схемы Ташкента 2026.",
    "Поддельные документы на квартиру в Ташкенте: как проверить подлинность через гос. реестры.",
    "Мошенничество при аренде жилья в Ташкенте: топ схем и как защититься в 2026 году.",
  ],
};

function getWeeklyTopic(key) {
  const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const topics = WEEKLY_TOPICS[key] || [];
  return topics[week % topics.length] || key;
}

function getRandomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function getPhotoUrl(rubric) { return getRandomItem(PHOTO_URLS[rubric] || PHOTO_URLS["📈 Дайджест дня"]); }

function apiGet(baseUrl, token, path) {
  return new Promise((resolve) => {
    const urlObj = new URL(baseUrl + path);
    const protocol = urlObj.protocol === "https:" ? https : http;
    const req = protocol.get({
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
      path: urlObj.pathname + (urlObj.search || ''),
      headers: { "x-api-token": token }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

function formatPrices(data) {
  if (!data?.districts?.length) return "Ориентиры: Шайхантахур $3000-5000/м², Мирабад $2000-4000/м², Юнусабад $1200-2000/м², Чиланзар $900-1400/м², Сергели $600-900/м².";
  return "Данные мониторинга за 7 дней:\n" + data.districts.map(d => {
    const trend = d.change_percent ? (d.change_percent > 0 ? " ↑+" + d.change_percent + "%" : " ↓" + d.change_percent + "%") : "";
    return d.district + ": $" + d.min_price_per_m2 + "-" + d.max_price_per_m2 + "/м² (avg $" + d.avg_price_per_m2 + trend + ", " + d.count + " объявл.)";
  }).join("\n");
}

function formatDeals(data) {
  if (!data?.deals?.length) return "Данные временно недоступны.";
  return data.deals.map((d, i) => (i+1) + ". " + d.district + " — $" + d.price_usd + " ($" + d.price_per_m2 + "/м², " + d.area + "м², " + d.rooms + "к)").join("\n");
}

function formatRent(data) {
  if (!data?.districts?.length) return "Ориентиры аренды $400+: Шайхантахур $800-2000, Мирабад $600-1500, Юнусабад $500-1000, Чиланзар $400-700/мес";
  let r = "Аренда $400+ по районам:\n" + data.districts.map(d => d.district + ": $" + d.min_price_per_m2 + "-" + d.max_price_per_m2 + "/мес (" + d.count + " объявл.)").join("\n");
  if (data.top_deals?.length) r += "\n\nЛучшие предложения:\n" + data.top_deals.map((d,i) => (i+1) + ". " + d.district + " — $" + d.price_usd + "/мес (" + d.area + "м², " + d.rooms + "к)").join("\n");
  return r;
}

function formatNewBuilds(data) {
  if (!data?.complexes?.length) {
    return "По данным мониторинга рынка:\nЮнусабад от $900/м² (рассрочка до 24 мес), Мирзо-Улугбек от $750/м² (рассрочка до 18 мес), Сергели от $500/м² (рассрочка до 36 мес). Застройщики: ISA Homes, Munis Group, Milliy Qurilish.";
  }
  // Берём 3 случайных объекта из базы
  const sample = data.complexes.sort(() => Math.random() - 0.5).slice(0, 4);
  return "По данным мониторинга рынка новостроек:\n" + sample.map(c => {
    const price = c.price_per_m2_usd ? "$" + c.price_per_m2_usd + "/м²" : "цена по запросу";
    const deadline = c.deadline ? " | сдача: " + c.deadline : "";
    const installment = c.installment_months ? " | рассрочка " + c.installment_months + " мес" : "";
    const finishing = c.finishing ? " | " + c.finishing : "";
    return "• " + c.name + " (" + (c.district || "Ташкент") + ") — " + price + deadline + installment + finishing;
  }).join("\n");
}

async function buildPromptData(item) {
  if (item.type === "PRICES") {
    const data = await apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/prices");
    return { topic: "Цены на квартиры (продажа) по районам Ташкента.\n" + formatPrices(data), extra: "Укажи тренд роста/падения по каждому району если есть." };
  }
  if (item.type === "DEALS") {
    const data = await apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/deals");
    return { topic: "Лучшие сделки недели — самые дешёвые квартиры за м² на рынке Ташкента.\n" + formatDeals(data), extra: "Объясни почему эти объекты выгодны и на что обратить внимание при проверке." };
  }
  if (item.type === "RENT") {
    const data = await apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/rent");
    return { topic: "Аренда квартир от $400/месяц в Ташкенте.\n" + formatRent(data), extra: "Только $400+. Что получаешь за эти деньги, какие районы лучше для каких целей." };
  }
  if (item.type === "NEWBUILDS") {
    // Берём данные из estate-scraper — реальные новостройки
    const data = await apiGet(SCRAPER_API_URL, SCRAPER_API_TOKEN, "/api/complexes?limit=20");
    const cheapest = await apiGet(SCRAPER_API_URL, SCRAPER_API_TOKEN, "/api/cheapest?limit=3");
    const newBuildsText = formatNewBuilds(data);
    const cheapestText = cheapest?.complexes?.length
      ? "\n\nСамые доступные на сегодня:\n" + cheapest.complexes.map(c => "• " + c.name + " (" + c.district + ") от $" + c.price_per_m2_usd + "/м²" + (c.installment_months ? ", рассрочка " + c.installment_months + " мес" : "") + (c.deadline ? ", сдача " + c.deadline : "")).join("\n")
      : "";
    return {
      topic: newBuildsText + cheapestText,
      extra: "Напиши экспертный разбор: как выбрать новостройку, на что смотреть — документы застройщика, разрешение на строительство, финансовые гарантии. Конкретные советы покупателям 2026."
    };
  }
  // STATIC
  return { topic: getWeeklyTopic(item.topic), extra: "" };
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
2. 2-3 абзаца с конкретными цифрами и практическими советами
3. Ключевой вывод
4. Призыв к комментариям
5. 2-3 хештега
6. Разделитель: ——
7. ПОЛНЫЙ перевод на узбекский язык (такой же объём — не краткий)

Без markdown. До 1800 символов. Год: 2026. Данные подаём как собственный мониторинг рынка — без указания сторонних источников.` }],
  });
  return response.content[0].text;
}

async function publishPost(item) {
  console.log("[" + new Date().toISOString() + "] Генерирую: " + item.rubric);
  try {
    const promptData = await buildPromptData(item);
    const text = await generatePost(item.rubric, promptData);
    const caption = text.length > 1024 ? text.substring(0, 1021) + "..." : text;
    await bot.sendPhoto(CHANNEL_ID, getPhotoUrl(item.rubric), { caption });
    console.log("[" + new Date().toISOString() + "] Опубликовано: " + item.rubric);
  } catch(e) {
    console.error("[" + new Date().toISOString() + "] Ошибка:", e.message);
    try {
      const promptData = await buildPromptData(item);
      const text = await generatePost(item.rubric, promptData);
      await bot.sendMessage(CHANNEL_ID, item.rubric + "\n\n" + text);
    } catch(e2) { console.error("Fallback:", e2.message); }
  }
}

// Ежедневный дайджест 20:00 Ташкент
async function publishDailyDigest() {
  console.log("[" + new Date().toISOString() + "] Генерирую дайджест...");
  try {
    const [priceData, dealsData, rentData] = await Promise.all([
      apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/prices"),
      apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/deals"),
      apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/rent")
    ]);

    const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tashkent" });

    let saleBlock = "🏠 ПРОДАЖА — цены за 1м²:\n";
    if (priceData?.districts?.length) {
      priceData.districts.forEach(d => {
        const trend = d.change_percent ? (d.change_percent > 0 ? " ↑+" + d.change_percent + "%" : " ↓" + d.change_percent + "%") : "";
        saleBlock += "• " + d.district + ": $" + d.min_price_per_m2 + " – $" + d.max_price_per_m2 + trend + "\n";
      });
    } else {
      saleBlock += "• Шайхантахур: $3000 – $5000\n• Мирабад: $2000 – $4000\n• Юнусабад: $1200 – $2000\n• Чиланзар: $900 – $1400\n• Сергели: $600 – $900\n";
    }

    let rentBlock = "\n🔑 АРЕНДА от $400/мес:\n";
    if (rentData?.districts?.length) {
      rentData.districts.forEach(d => { rentBlock += "• " + d.district + ": $" + d.min_price_per_m2 + " – $" + d.max_price_per_m2 + "/мес\n"; });
    } else {
      rentBlock += "• Шайхантахур: $800 – $2000/мес\n• Мирабад: $600 – $1500/мес\n• Юнусабад: $500 – $1000/мес\n• Чиланзар: $400 – $700/мес\n";
    }

    let dealsBlock = "";
    if (dealsData?.deals?.length) {
      const c = dealsData.deals[0];
      const p = dealsData.deals[dealsData.deals.length - 1];
      dealsBlock = "\n💡 Самая дешёвая по м²:\n" + c.district + " — $" + c.price_usd + " ($" + c.price_per_m2 + "/м², " + c.area + "м²)\n" + (c.id ? "🔗 olx.uz/obyavlenie/" + c.id + "\n" : "") +
        "\n📌 Самая дорогая из топа:\n" + p.district + " — $" + p.price_usd + " ($" + p.price_per_m2 + "/м², " + p.area + "м²)\n" + (p.id ? "🔗 olx.uz/obyavlenie/" + p.id + "\n" : "");
    }

    let rentDealsBlock = "";
    if (rentData?.top_deals?.length) {
      const cr = rentData.top_deals[0];
      rentDealsBlock = "\n💡 Лучшая аренда $400+:\n" + cr.district + " — $" + cr.price_usd + "/мес (" + cr.area + "м², " + cr.rooms + "к)\n" + (cr.id ? "🔗 olx.uz/obyavlenie/" + cr.id + "\n" : "");
    }

    const text = "📈 ДАЙДЖЕСТ НЕДВИЖИМОСТИ\n" + today + "\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      saleBlock + rentBlock + dealsBlock + rentDealsBlock +
      "\n━━━━━━━━━━━━━━━━━━━━\n" +
      "@sardorestate";

    const caption = text.length > 1024 ? text.substring(0, 1021) + "..." : text;
    await bot.sendPhoto(CHANNEL_ID, getPhotoUrl("📈 Дайджест дня"), { caption });
    console.log("[" + new Date().toISOString() + "] Дайджест опубликован");
  } catch(e) { console.error("Ошибка дайджеста:", e.message); }
}

// Расписание
CONTENT_PLAN.forEach(item => {
  cron.schedule(item.minute + " " + (item.hour - 5) + " * * " + item.day, () => publishPost(item));
  console.log("Запланировано: " + item.rubric + " день " + item.day + " " + item.hour + ":00 Ташкент");
});

// Дайджест каждый день 20:00 Ташкент = 15:00 UTC
cron.schedule("0 15 * * *", () => publishDailyDigest());

if (process.env.TEST_MODE === "true") publishPost(CONTENT_PLAN[0]);
if (process.env.TEST_DIGEST === "true") publishDailyDigest();

console.log("Автопостер v7 — новостройки из мониторинга, дайджест 20:00");
