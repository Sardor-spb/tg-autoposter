const Anthropic = require("@anthropic-ai/sdk");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const https = require("https");
const http = require("http");

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;
const ROYEST_API_URL = process.env.ROYEST_API_URL || "https://royest-bot-production.up.railway.app";
const ROYEST_API_TOKEN = process.env.ROYEST_API_TOKEN || "royest2025";
const SCRAPER_API_URL = process.env.SCRAPER_API_URL || "http://yangiuylar-scraper.railway.internal:3001";
const SCRAPER_API_TOKEN = process.env.SCRAPER_API_TOKEN || "yangi2025";
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

const PEXELS_QUERIES = {
  "📊 Цена недели": ["Tashkent city skyline", "real estate market city", "apartment building aerial"],
  "🏠 Лучшая сделка недели": ["apartment keys sale", "real estate deal", "modern apartment sale"],
  "🔑 Аренда $400+": ["modern apartment interior", "cozy apartment living room", "furnished apartment"],
  "🏗️ Новостройки": ["new building construction", "modern residential complex", "apartment construction site"],
  "⚖️ Юридический ликбез": ["contract signing documents", "legal documents pen", "real estate lawyer"],
  "💰 Считаем инвестицию": ["real estate investment", "calculator finance", "property investment money"],
  "🚨 Осторожно: мошенники": ["fraud warning security", "scam alert", "caution sign danger"],
  "📈 Дайджест дня": ["city real estate aerial", "tashkent panorama", "urban skyline buildings"],
};

async function getPexelsPhoto(rubric) {
  if (!PEXELS_API_KEY) return null;
  const queries = PEXELS_QUERIES[rubric] || PEXELS_QUERIES["📈 Дайджест дня"];
  const query = queries[Math.floor(Math.random() * queries.length)];
  return new Promise((resolve) => {
    const url = "https://api.pexels.com/v1/search?query=" + encodeURIComponent(query) + "&per_page=15&orientation=landscape";
    https.get(url, { headers: { Authorization: PEXELS_API_KEY } }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const photos = json.photos || [];
          if (!photos.length) return resolve(null);
          const photo = photos[Math.floor(Math.random() * photos.length)];
          resolve(photo.src.large2x || photo.src.large || photo.src.original);
        } catch(e) { resolve(null); }
      });
    }).on("error", () => resolve(null)).setTimeout(8000, function() { this.destroy(); resolve(null); });
  });
}

const CONTENT_PLAN = [
  { day: 1, hour: 10, minute: 0, rubric: "📊 Цена недели",          type: "PRICES" },
  { day: 2, hour: 10, minute: 0, rubric: "🏠 Лучшая сделка недели", type: "DEALS" },
  { day: 3, hour: 10, minute: 0, rubric: "🔑 Аренда $400+",         type: "RENT" },
  { day: 4, hour: 10, minute: 0, rubric: "🏗️ Новостройки",          type: "NEWBUILDS" },
  { day: 5, hour: 10, minute: 0, rubric: "⚖️ Юридический ликбез",   type: "STATIC", topic: "ЮРИДИКА" },
  { day: 6, hour: 10, minute: 0, rubric: "💰 Считаем инвестицию",   type: "STATIC", topic: "ИНВЕСТИЦИЯ" },
  { day: 0, hour: 10, minute: 0, rubric: "🚨 Осторожно: мошенники", type: "STATIC", topic: "МОШЕННИКИ" },
];

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
  if (!data?.districts?.length) return null;
  return data.districts.map(d => {
    const trend = d.change_percent ? (d.change_percent > 0 ? " ↑+" + d.change_percent + "%" : " ↓" + d.change_percent + "%") : "";
    return d.district + ": $" + d.min_price_per_m2 + "–$" + d.max_price_per_m2 + "/м² (avg $" + d.avg_price_per_m2 + trend + ", " + d.count + " объявл.)";
  }).join("\n");
}

function formatDeals(data) {
  if (!data?.deals?.length) return null;
  return data.deals.map((d, i) => (i+1) + ". " + d.district + " — $" + d.price_usd + " ($" + d.price_per_m2 + "/м², " + d.area + "м², " + d.rooms + "к)" + (d.id ? "\n   🔗 olx.uz/obyavlenie/" + d.id : "")).join("\n");
}

function formatRent(data) {
  if (!data?.districts?.length) return null;
  let r = data.districts.map(d => d.district + ": $" + d.min_price_per_m2 + "–$" + d.max_price_per_m2 + "/мес (" + d.count + " объявл.)").join("\n");
  if (data.top_deals?.length) r += "\n\nЛучшие предложения:\n" + data.top_deals.map((d,i) => (i+1) + ". " + d.district + " — $" + d.price_usd + "/мес (" + d.area + "м², " + d.rooms + "к)" + (d.id ? "\n   🔗 olx.uz/obyavlenie/" + d.id : "")).join("\n");
  return r;
}

function formatNewBuilds(data) {
  if (!data?.complexes?.length) return null;
  const sample = data.complexes.sort(() => Math.random() - 0.5).slice(0, 4);
  return sample.map(c => {
    const price = c.price_per_m2_usd ? "$" + c.price_per_m2_usd + "/м²" : "цена по запросу";
    const deadline = c.deadline ? " | сдача: " + c.deadline : "";
    const installment = c.installment_months ? " | рассрочка " + c.installment_months + " мес" : "";
    return "• " + c.name + " (" + (c.district || "Ташкент") + ") — " + price + deadline + installment;
  }).join("\n");
}

async function buildPromptData(item) {
  if (item.type === "PRICES") {
    const data = await apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/prices");
    const formatted = formatPrices(data);
    return { topic: formatted ? "Реальные данные мониторинга OLX за 7 дней:\n" + formatted : null, extra: "Аналитический разбор — какие районы растут, какие падают, где выгоднее покупать сейчас и почему." };
  }
  if (item.type === "DEALS") {
    const data = await apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/deals");
    const formatted = formatDeals(data);
    return { topic: formatted ? "Топ выгодных сделок по данным OLX:\n" + formatted : null, extra: "Объясни почему эти объекты выгодны по цене за м² и на что обратить внимание при проверке." };
  }
  if (item.type === "RENT") {
    const data = await apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/rent");
    const formatted = formatRent(data);
    return { topic: formatted ? "Аренда $400+ по данным OLX:\n" + formatted : null, extra: "Что реально можно снять за эти деньги в каждом районе, какие районы лучше для каких целей." };
  }
  if (item.type === "NEWBUILDS") {
    const data = await apiGet(SCRAPER_API_URL, SCRAPER_API_TOKEN, "/api/complexes?limit=20");
    const cheapest = await apiGet(SCRAPER_API_URL, SCRAPER_API_TOKEN, "/api/cheapest?limit=3");
    const nb = formatNewBuilds(data);
    const cheap = cheapest?.complexes?.length ? "\n\nСамые доступные:\n" + cheapest.complexes.map(c => "• " + c.name + " от $" + c.price_per_m2_usd + "/м²" + (c.installment_months ? ", рассрочка " + c.installment_months + " мес" : "") + (c.deadline ? ", сдача " + c.deadline : "")).join("\n") : "";
    return { topic: nb ? nb + cheap : null, extra: "Как выбрать новостройку, документы застройщика, финансовые гарантии." };
  }
  return { topic: getWeeklyTopic(item.topic), extra: "" };
}

async function generatePost(rubric, promptData) {
  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2500,
    messages: [{ role: "user", content: `Ты эксперт по недвижимости Ташкента. Напиши Telegram пост.

РУБРИКА: ${rubric}
ДАННЫЕ: ${promptData.topic || "используй экспертные знания о рынке Ташкента 2026"}
УТОЧНЕНИЕ: ${promptData.extra || ""}

СТРОГАЯ СТРУКТУРА (не нарушай):

=== РУССКИЙ ТЕКСТ ===
[Цепляющий заголовок]

[2-3 абзаца с конкретными цифрами и советами]

[Ключевой вывод]

[Призыв к комментариям]

#хештег1 #хештег2 #хештег3

——————————

=== O'ZBEKCHA MATN ===
[Такой же заголовок на узбекском]

[Те же 2-3 абзаца полностью на узбекском, не сокращай]

[Тот же вывод на узбекском]

[Тот же призыв на узбекском]

#hashteg1 #hashteg2 #hashteg3

Требования:
- Без markdown
- Каждая часть (RU и UZ) — минимум 600 символов
- Год: 2026
- Данные подаём как собственный мониторинг рынка, без упоминания OLX или других источников` }],
  });
  return response.content[0].text;
}

// Отправка поста: фото отдельно, текст отдельно (лимит 4096 вместо 1024)
async function publishPost(item) {
  console.log("[" + new Date().toISOString() + "] Генерирую: " + item.rubric);
  try {
    const [promptData, photoUrl] = await Promise.all([
      buildPromptData(item),
      getPexelsPhoto(item.rubric),
    ]);
    const text = await generatePost(item.rubric, promptData);

    // Сначала фото без подписи
    if (photoUrl) {
      await bot.sendPhoto(CHANNEL_ID, photoUrl);
    }

    // Потом полный текст отдельным сообщением — лимит 4096 символов
    const chunks = [];
    for (let i = 0; i < text.length; i += 4000) {
      chunks.push(text.slice(i, i + 4000));
    }
    for (const chunk of chunks) {
      await bot.sendMessage(CHANNEL_ID, chunk);
    }

    console.log("[" + new Date().toISOString() + "] Опубликовано: " + item.rubric);
  } catch(e) {
    console.error("[" + new Date().toISOString() + "] Ошибка:", e.message);
  }
}

async function publishDailyDigest() {
  console.log("[" + new Date().toISOString() + "] Генерирую дайджест...");
  try {
    const [priceData, dealsData, rentData] = await Promise.all([
      apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/prices"),
      apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/deals"),
      apiGet(ROYEST_API_URL, ROYEST_API_TOKEN, "/api/rent"),
    ]);

    const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tashkent" });

    let saleBlock = "🏠 ПРОДАЖА — цены за 1м²:\n";
    if (priceData?.districts?.length) {
      priceData.districts.forEach(d => {
        const trend = d.change_percent ? (d.change_percent > 0 ? " ↑+" + d.change_percent + "%" : " ↓" + d.change_percent + "%") : "";
        saleBlock += "• " + d.district + ": $" + d.min_price_per_m2 + " – $" + d.max_price_per_m2 + trend + "\n";
      });
    } else {
      saleBlock += "⏳ Данные обновляются...\n";
    }

    let rentBlock = "\n🔑 АРЕНДА от $400/мес:\n";
    if (rentData?.districts?.length) {
      rentData.districts.forEach(d => { rentBlock += "• " + d.district + ": $" + d.min_price_per_m2 + " – $" + d.max_price_per_m2 + "/мес\n"; });
    } else {
      rentBlock += "⏳ Данные обновляются...\n";
    }

    let dealsBlock = "";
    if (dealsData?.deals?.length) {
      const c = dealsData.deals[0];
      dealsBlock = "\n💡 Лучшая сделка дня:\n" + c.district + " — $" + c.price_usd + " ($" + c.price_per_m2 + "/м², " + c.area + "м²)" + (c.id ? "\n🔗 olx.uz/obyavlenie/" + c.id : "") + "\n";
    }

    let rentDealsBlock = "";
    if (rentData?.top_deals?.length) {
      const cr = rentData.top_deals[0];
      rentDealsBlock = "\n💡 Лучшая аренда $400+:\n" + cr.district + " — $" + cr.price_usd + "/мес (" + cr.area + "м², " + cr.rooms + "к)" + (cr.id ? "\n🔗 olx.uz/obyavlenie/" + cr.id : "") + "\n";
    }

    const text = "📈 ДАЙДЖЕСТ НЕДВИЖИМОСТИ\n" + today + "\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      saleBlock + rentBlock + dealsBlock + rentDealsBlock +
      "\n━━━━━━━━━━━━━━━━━━━━\n" +
      "@sardorestate";

    const photoUrl = await getPexelsPhoto("📈 Дайджест дня");
    if (photoUrl) {
      await bot.sendPhoto(CHANNEL_ID, photoUrl);
    }
    await bot.sendMessage(CHANNEL_ID, text);
    console.log("[" + new Date().toISOString() + "] Дайджест опубликован");
  } catch(e) { console.error("Ошибка дайджеста:", e.message); }
}

// Расписание — 10:00 Ташкент = 05:00 UTC
CONTENT_PLAN.forEach(item => {
  cron.schedule(item.minute + " " + (item.hour - 5) + " * * " + item.day, () => publishPost(item));
});

// Дайджест 20:00 Ташкент = 15:00 UTC
cron.schedule("0 15 * * *", () => publishDailyDigest());

if (process.env.TEST_MODE === "true") publishPost(CONTENT_PLAN[0]);
if (process.env.TEST_DIGEST === "true") publishDailyDigest();

console.log("Автопостер v9 — фото отдельно, полный текст без обрезки, полный UZ перевод");
