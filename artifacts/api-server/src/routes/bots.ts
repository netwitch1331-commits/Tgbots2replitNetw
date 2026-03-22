import { createHash } from "crypto";
import { Router, type IRouter } from "express";
import {
  getBots,
  getBotById,
  getCategories,
  addView,
  hasRecentView,
} from "../store.js";
let geoip: { lookup: (ip: string) => { country?: string; city?: string; region?: string; ll?: [number, number] } | null } | null = null;
try {
  geoip = require("geoip-lite");
} catch {
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

  const bots = getBots({ categorySlug: category, search, sortBy });
  const parsed = ListBotsResponse.parse(bots);
  res.json(parsed);
});

router.get("/bots/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid bot id" });
    return;
  }

  const bot = getBotById(id);
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

  const bot = getBotById(id);
  if (!bot) {
    res.status(404).json({ message: "Bot not found" });
    return;
  }

  const rawIp = getRealIp(req);
  const ipHash = hashIp(rawIp);

  if (hasRecentView(id, ipHash)) {
    res.json({ status: "duplicate" });
    return;
  }

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

  addView({
    botId: id,
    viewedAt: new Date(),
    ipHash,
    country,
    countryCode,
    city,
  });

  res.json({ status: "ok" });
});

router.get("/categories", async (_req, res) => {
  const cats = getCategories();
  const parsed = ListCategoriesResponse.parse(cats);
  res.json(parsed);
});

export default router;
