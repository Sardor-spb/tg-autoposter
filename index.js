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

// Прямые URL фото с Unsplash — Telegram грузит сам
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

// ─── Контент-план 9 рубрик — цикл 2 недели ───────────────────────────────────
// Неделя 1: Пн-Вс как раньше
// Неделя 2: добавляются новостройки вместо одной рубрики
// Реализация: чередование через номер недели года
const CONTENT_PLAN = [
  { day: 1, hour: 10, minute: 0, rubric: "📊 Цена недели",          type: "PRICES" },
  { day: 2, hour: 10, minute: 0, rubric: "🏠 Лучшая сделка недели", type: "DEALS" },
  { day: 3, hour: 10, minute: 0, rubric: "🔑 Аренда $400+",         type: "RENT" },
  { day: 4, hour: 10, minute: 0, rubric: "🏗️ Новостройки",          type: "STATIC", topic: "НОВОСТРОЙКИ_ТАШКЕНТ" },
  { day: 5, hour: 10, minute: 0, rubric: "⚖️ Юридический ликбез",   type: "STATIC", topic: "ЮРИДИКА" },
  { day: 6, hour: 10, minute: 0, rubric: "💰 Считаем инвестицию",   type: "STATIC", topic: "ИНВЕСТИЦИЯ" },
  { day: 0, hour: 10, minute: 0, rubric: "🚨 Осторожно: мошенники", type: "STATIC", topic: "МОШЕННИКИ" },
];

// Темы для статичных рубрик — чередуются каждую неделю
const STATIC_TOPICS = {
  "НОВОСТРОЙКИ_ТАШКЕНТ": [
    "Как проверить застройщика в Ташкенте перед покупкой котлована 2026: лицензия, реестр, история объектов, финансовая устойчивость.",
    "Где купить новостройку в Ташкенте в 2026 году: топ районов — Юнусабад, Мирзо-Улугбек, Сергели. Цены, сроки сдачи, надёжные застройщики.",
    "Как читать договор долевого участия (ДДУ) в Ташкенте: на что обратить внимание, опасные пункты, что должно насторожить.",
    "Котлован vs готовое жильё в Ташкенте: разница в цене, риски, потенциал роста, реальные примеры 2026 года.",
    "Документы застройщика которые нужно проверить до подписания договора в Узбекистане: разрешение на строительство, кадастр, финансовые гарантии.",
    "ISA Homes, Munis Group, Milliy Qurilish — как выбрать застройщика в Ташкенте: рейтинг надёжности, реальные отзывы 2026.",
  ],
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
    "Коммерческая vs жилая недвижимость в Ташкенте: что выгоднее покупать для сдачи в аренду в 2026 году.",
    "Портфельная инвестиция: 2 однушки в Чиланзаре vs 1 двушка в Мирабаде — что лучше по доходности.",
    "Разбор: новостройка в Мирзо-Улугбеке за $60,000 — рост цены до сдачи и арендный потенциал.",
    "Топ-5 ошибок инвесторов в недвижимость Ташкента которые стоят денег — реальные кейсы 2026.",
  ],
  "МОШЕННИКИ": [
    "Схема двойной продажи квартиры в Ташкенте в 2026 году: как работает и как не попасться.",
    "Фейковые агентства недвижимости Ташкента: 5 признаков что перед вами мошенники.",
    "Аванс и задаток: как мошенники забирают деньги и исчезают — реальные схемы Ташкента 2026.",
    "Поддельные документы на квартиру в Ташкенте: как проверить подлинность через гос. реестры.",
    "Мошенничество при аренде жилья в Ташкенте: топ схем и как защититься в 2026 году.",
    "Застройщик-однодневка: как распознать что компания не достроит дом — 7 признаков.",
  ],
};

function getWeeklyTopic(topicKey) {
  const weekNum = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const topics = STATIC_TOPICS[topicKey];
  if (!topics) return topicKey;
  return topics[weekNum % topics.length];
}

function getRandomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getPhotoUrl(rubric) {
  const urls = PHOTO_URLS[rubric] || PHOTO_URLS["📈 Дайджест дня"];
  return getRandomItem(urls);
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

function formatPrices(data) {
  if (!data?.districts?.length) return "Данные временно недоступны. Ориентиры: Шайхантахур $3000-5000/м², Мирабад $2000-4000/м², Юнусабад $1200-2000/м², Чиланзар $900-1400/м², Сергели $600-900/м².";
  return "Реальные данные OLX.uz за 7 дней:\n" + data.districts.map(d => {
    const trend = d.change_percent !== null ? (d.change_percent > 0 ? " ↑+" + d.change_percent + "%" : d.change_percent < 0 ? " ↓" + d.change_percent + "%" : "") : "";
    return d.district + ": $" + d.min_price_per_m2 + "-" + d.max_price_per_m2 + "/м² (avg $" + d.avg_price_per_m2 + trend + ", " + d.count + " объявл.)";
  }).join("\n");
}

function formatDeals(data) {
  if (!data?.deals?.length) return "Топ сделок временно недоступен.";
  return data.deals.map((d, i) => (i+1) + ". " + d.district + " — $" + d.price_usd + " ($" + d.price_per_m2 + "/м², " + d.area + "м², " + d.rooms + "к)").join("\n");
}

function formatRent(data) {
  if (!data?.districts?.length) return "Ориентиры аренды $400+: Шайхантахур $800-2000, Мирабад $600-1500, Юнусабад $500-1000, Чиланзар $400-700/мес";
  let result = "Аренда $400+ по районам (данные OLX.uz):\n" + data.districts.map(d =>
    d.district + ": $" + d.min_price_per_m2 + "-" + d.max_price_per_m2 + "/мес (" + d.count + " объявл.)"
  ).join("\n");
  if (data.top_deals?.length) {
    result += "\n\nЛучшие предложения недели:\n" + data.top_deals.map((d,i) =>
      (i+1) + ". " + d.district + " — $" + d.price_usd + "/мес (" + d.area + "м², " + d.rooms + "к)"
    ).join("\n");
  }
  return result;
}

async function buildPromptData(item) {
  if (item.type === "PRICES") {
    const data = await apiGet("/api/prices");
    return { topic: "Цены на квартиры (продажа) по районам Ташкента.\n" + formatPrices(data), extra: "Укажи тренд роста/падения по каждому району если есть данные." };
  }
  if (item.type === "DEALS") {
    const data = await apiGet("/api/deals");
    return { topic: "Лучшие сделки недели — самые дешёвые квартиры за м² на OLX.uz.\n" + formatDeals(data), extra: "Объясни почему эти объекты выгодны и на что обратить внимание при проверке." };
  }
  if (item.type === "RENT") {
    const data = await apiGet("/api/rent");
    return { topic: "Аренда квартир от $400/месяц в Ташкенте.\n" + formatRent(data), extra: "Только $400+. Что получаешь за эти деньги, какие районы лучше для каких целей." };
  }
  // STATIC — подбираем тему на эту неделю
  const topic = getWeeklyTopic(item.topic);
  return { topic, extra: "" };
}

async function generatePost(rubric, promptData) {
  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1200,
    messages: [{ role: "user", content: `Ты эксперт по недвижимости Ташкента. Напиши Telegram пост.

РУБРИКА: ${rubric}
ТЕМА: ${promptData.topic}
УТОЧНЕНИЕ: ${promptData.extra || ""}

СТРУКТУРА:
1. Цепляющий заголовок (1 строка)
2. 2-3 абзаца с конкретными цифрами и практическими советами
3. Ключевой вывод для читателя
4. Призыв к комментариям
5. 2-3 хештега
6. Разделитель: ——
7. ПОЛНЫЙ перевод на узбекский язык (такой же объём — не краткий пересказ)

Без markdown. До 1800 символов. Год: 2026. Только реальные данные и актуальные советы.` }],
  });
  return response.content[0].text;
}

async function publishPost(item) {
  console.log("[" + new Date().toISOString() + "] Генерирую: " + item.rubric);
  try {
    const promptData = await buildPromptData(item);
    const [text, photoUrl] = await Promise.all([
      generatePost(item.rubric, promptData),
      Promise.resolve(getPhotoUrl(item.rubric))
    ]);
    const caption = text.length > 1024 ? text.substring(0, 1021) + "..." : text;
    await bot.sendPhoto(CHANNEL_ID, photoUrl, { caption });
    console.log("[" + new Date().toISOString() + "] Опубликовано: " + item.rubric);
  } catch(e) {
    console.error("[" + new Date().toISOString() + "] Ошибка:", e.message);
    try {
      const promptData = await buildPromptData(item);
      const text = await generatePost(item.rubric, promptData);
      await bot.sendMessage(CHANNEL_ID, item.rubric + "\n\n" + text);
    } catch(e2) { console.error("Fallback ошибка:", e2.message); }
  }
}

// ─── Ежедневный дайджест 20:00 Ташкент ───────────────────────────────────────
async function publishDailyDigest() {
  console.log("[" + new Date().toISOString() + "] Генерирую дайджест...");
  try {
    const [priceData, dealsData, rentData] = await Promise.all([
      apiGet("/api/prices"), apiGet("/api/deals"), apiGet("/api/rent")
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
      rentData.districts.forEach(d => {
        rentBlock += "• " + d.district + ": $" + d.min_price_per_m2 + " – $" + d.max_price_per_m2 + "/мес\n";
      });
    } else {
      rentBlock += "• Шайхантахур: $800 – $2000/мес\n• Мирабад/Яккасарай: $600 – $1500/мес\n• Юнусабад: $500 – $1000/мес\n• Чиланзар: $400 – $700/мес\n";
    }

    let dealsBlock = "";
    if (dealsData?.deals?.length) {
      const cheapest = dealsData.deals[0];
      const priciest = dealsData.deals[dealsData.deals.length - 1];
      dealsBlock = "\n💡 Самая дешёвая по м²:\n" +
        cheapest.district + " — $" + cheapest.price_usd + " ($" + cheapest.price_per_m2 + "/м², " + cheapest.area + "м²)\n" +
        (cheapest.id ? "🔗 olx.uz/obyavlenie/" + cheapest.id + "\n" : "") +
        "\n📌 Самая дорогая из топа:\n" +
        priciest.district + " — $" + priciest.price_usd + " ($" + priciest.price_per_m2 + "/м², " + priciest.area + "м²)\n" +
        (priciest.id ? "🔗 olx.uz/obyavlenie/" + priciest.id + "\n" : "");
    }

    let rentDealsBlock = "";
    if (rentData?.top_deals?.length) {
      const cheapRent = rentData.top_deals[0];
      rentDealsBlock = "\n💡 Лучшая аренда $400+:\n" +
        cheapRent.district + " — $" + cheapRent.price_usd + "/мес (" + cheapRent.area + "м², " + cheapRent.rooms + "к)\n" +
        (cheapRent.id ? "🔗 olx.uz/obyavlenie/" + cheapRent.id + "\n" : "");
    }

    const text = "📈 ДАЙДЖЕСТ НЕДВИЖИМОСТИ\n" + today + "\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      saleBlock + rentBlock + dealsBlock + rentDealsBlock +
      "\n━━━━━━━━━━━━━━━━━━━━\n" +
      "Данные: OLX.uz | @sardorestate";

    const caption = text.length > 1024 ? text.substring(0, 1021) + "..." : text;
    await bot.sendPhoto(CHANNEL_ID, getPhotoUrl("📈 Дайджест дня"), { caption });
    console.log("[" + new Date().toISOString() + "] Дайджест опубликован");
  } catch(e) {
    console.error("[" + new Date().toISOString() + "] Ошибка дайджеста:", e.message);
  }
}

// ─── Расписание ───────────────────────────────────────────────────────────────
CONTENT_PLAN.forEach((item) => {
  cron.schedule(item.minute + " " + (item.hour - 5) + " * * " + item.day, () => publishPost(item));
  console.log("Запланировано: " + item.rubric + " день " + item.day + " " + item.hour + ":00 Ташкент");
});

// Дайджест каждый день 20:00 Ташкент = 15:00 UTC
cron.schedule("0 15 * * *", () => publishDailyDigest());
console.log("Запланировано: 📈 Дайджест — каждый день 20:00 Ташкент");

if (process.env.TEST_MODE === "true") publishPost(CONTENT_PLAN[0]);
if (process.env.TEST_DIGEST === "true") publishDailyDigest();

console.log("Автопостер v6 запущен — 7 рубрик + новостройки + юрист + дайджест 20:00.");
