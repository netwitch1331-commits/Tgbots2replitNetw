import { createHash } from "crypto";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botsTable, categoriesTable, botViewsTable } from "@workspace/db/schema";
import { ilike, eq, desc, asc, sql, and, gte } from "drizzle-orm";
let geoip: { lookup: (ip: string) => { country?: string; city?: string; region?: string; ll?: [number, number] } | null } | null = null;
try {
  geoip = require("geoip-lite");
} catch {
  // geoip-lite data files unavailable (e.g. Vercel serverless) — skip geolocation
}
import {
  ListBotsResponse,
  GetBotResponse,
  ListCategoriesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function hashIp(ip: string): string {
  const salt = process.env.IP_SALT || "tgbots_salt_2026";
  return createHash("sha256").update(ip + salt).digest("hex");
}

function getRealIp(req: any): string {
  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
}

router.get("/bots", async (req, res) => {
  const { category, search, sortBy } = req.query as {
    category?: string;
    search?: string;
    sortBy?: string;
  };

  let query = db.select().from(botsTable).$dynamic();

  if (category) {
    const cat = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, category))
      .limit(1);
    if (cat.length > 0) {
      query = query.where(eq(botsTable.categoryId, cat[0].id));
    }
  }

  if (search) {
    query = query.where(
      sql`(${botsTable.name} ILIKE ${"%" + search + "%"} OR ${botsTable.description} ILIKE ${"%" + search + "%"} OR ${botsTable.username} ILIKE ${"%" + search + "%"})`
    );
  }

  if (sortBy === "name") {
    query = query.orderBy(asc(botsTable.name));
  } else if (sortBy === "popular") {
    query = query.orderBy(desc(botsTable.monthlyUsers));
  } else {
    query = query.orderBy(desc(botsTable.rating));
  }

  const bots = await query;
  const parsed = ListBotsResponse.parse(bots);
  res.json(parsed);
});

router.get("/bots/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid bot id" });
    return;
  }

  const [bot] = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.id, id))
    .limit(1);

  if (!bot) {
    res.status(404).json({ message: "Bot not found" });
    return;
  }

  const parsed = GetBotResponse.parse(bot);
  res.json(parsed);
});

router.post("/bots/:id/view", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid bot id" });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id)).limit(1);
  if (!bot) {
    res.status(404).json({ message: "Bot not found" });
    return;
  }

  const rawIp = getRealIp(req);
  const ipHash = hashIp(rawIp);

  // Deduplication: ignore repeated views from same IP within 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [existing] = await db
    .select({ id: botViewsTable.id })
    .from(botViewsTable)
    .where(
      and(
        eq(botViewsTable.botId, id),
        eq(botViewsTable.ipHash, ipHash),
        gte(botViewsTable.viewedAt, oneDayAgo)
      )
    )
    .limit(1);

  if (existing) {
    res.json({ status: "duplicate" });
    return;
  }

  // Geolocation lookup
  const geo = geoip?.lookup(rawIp) ?? null;
  const countryNames: Record<string, string> = {
    RU: "Россия", US: "США", DE: "Германия", GB: "Великобритания",
    FR: "Франция", UA: "Украина", KZ: "Казахстан", BY: "Беларусь",
    PL: "Польша", TR: "Турция", UZ: "Узбекистан", AZ: "Азербайджан",
    AM: "Армения", GE: "Грузия", MD: "Молдова", KG: "Кыргызстан",
    TJ: "Таджикистан", TM: "Туркменистан", LT: "Литва", LV: "Латвия",
    EE: "Эстония", CN: "Китай", IN: "Индия", BR: "Бразилия",
    JP: "Япония", KR: "Южная Корея", IT: "Италия", ES: "Испания",
    NL: "Нидерланды", SE: "Швеция", NO: "Норвегия", FI: "Финляндия",
    CZ: "Чехия", AT: "Австрия", CH: "Швейцария", CA: "Канада",
    AU: "Австралия", IL: "Израиль", AE: "ОАЭ", SA: "Саудовская Аравия",
  };

  const countryCode = geo?.country || "XX";
  const country = countryNames[countryCode] || geo?.country || "Другие";
  const city = geo?.city || "";

  await db.insert(botViewsTable).values({
    botId: id,
    ipHash,
    country,
    countryCode,
    city,
  });

  res.json({ status: "ok" });
});

router.get("/categories", async (_req, res) => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.name));

  const parsed = ListCategoriesResponse.parse(categories);
  res.json(parsed);
});

export default router;
