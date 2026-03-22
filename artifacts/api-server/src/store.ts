import categoriesData from "../data/categories.json";
import botsData from "../data/bots.json";

export interface Category {
  id: number;
  name: string;
  slug: string;
  emoji: string;
  count: number;
}

export interface Bot {
  id: number;
  username: string;
  name: string;
  description: string;
  category: string;
  categoryId: number;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  isPremium: boolean;
  tags: string[];
  monthlyUsers: number;
  iconEmoji: string;
  telegramUrl: string;
}

export interface BotView {
  id: number;
  botId: number;
  viewedAt: Date;
  ipHash: string | null;
  country: string | null;
  countryCode: string | null;
  city: string | null;
}

let categories: Category[] = [...(categoriesData as Category[])];
let bots: Bot[] = [...(botsData as Bot[])];
let views: BotView[] = [];
let nextBotId = Math.max(0, ...bots.map((b) => b.id)) + 1;
let nextViewId = 1;

export function getCategories(): Category[] {
  return categories.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

export function getCategoryById(id: number): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function getBots(opts?: {
  categorySlug?: string;
  search?: string;
  sortBy?: string;
}): Bot[] {
  let result = [...bots];

  if (opts?.categorySlug) {
    const cat = getCategoryBySlug(opts.categorySlug);
    if (cat) {
      result = result.filter((b) => b.categoryId === cat.id);
    }
  }

  if (opts?.search) {
    const q = opts.search.toLowerCase();
    result = result.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.username.toLowerCase().includes(q)
    );
  }

  if (opts?.sortBy === "name") {
    result.sort((a, b) => a.name.localeCompare(b.name));
  } else if (opts?.sortBy === "popular") {
    result.sort((a, b) => b.monthlyUsers - a.monthlyUsers);
  } else {
    result.sort((a, b) => b.rating - a.rating);
  }

  return result;
}

export function getBotById(id: number): Bot | undefined {
  return bots.find((b) => b.id === id);
}

export function createBot(data: Omit<Bot, "id">): Bot {
  const bot: Bot = { id: nextBotId++, ...data };
  bots.push(bot);
  const cat = categories.find((c) => c.id === bot.categoryId);
  if (cat) cat.count++;
  return bot;
}

export function updateBot(id: number, data: Omit<Bot, "id">): Bot | null {
  const idx = bots.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  const old = bots[idx];
  const updated: Bot = { id, ...data };
  bots[idx] = updated;
  if (old.categoryId !== updated.categoryId) {
    const oldCat = categories.find((c) => c.id === old.categoryId);
    if (oldCat) oldCat.count = Math.max(0, oldCat.count - 1);
    const newCat = categories.find((c) => c.id === updated.categoryId);
    if (newCat) newCat.count++;
  }
  return updated;
}

export function deleteBot(id: number): Bot | null {
  const idx = bots.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  const [removed] = bots.splice(idx, 1);
  const cat = categories.find((c) => c.id === removed.categoryId);
  if (cat) cat.count = Math.max(0, cat.count - 1);
  views = views.filter((v) => v.botId !== id);
  return removed;
}

export function addView(data: Omit<BotView, "id">): BotView {
  const view: BotView = { id: nextViewId++, ...data };
  views.push(view);
  return view;
}

export function hasRecentView(botId: number, ipHash: string): boolean {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return views.some(
    (v) =>
      v.botId === botId &&
      v.ipHash === ipHash &&
      v.viewedAt >= oneDayAgo
  );
}

export function getViewStats() {
  const now = new Date();
  const days7ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const days30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return bots.map((bot) => {
    const botViews = views.filter((v) => v.botId === bot.id);
    const uniqueIps = new Set(botViews.map((v) => v.ipHash).filter(Boolean));
    const last7 = botViews.filter((v) => v.viewedAt >= days7ago);
    const last30 = botViews.filter((v) => v.viewedAt >= days30ago);

    const dailyMap = new Map<string, number>();
    for (const v of last30) {
      const d = v.viewedAt.toISOString().slice(0, 10);
      dailyMap.set(d, (dailyMap.get(d) || 0) + 1);
    }
    const dailyViews = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, views: count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const geoMap = new Map<string, { country: string; countryCode: string; views: number }>();
    for (const v of botViews) {
      const key = v.countryCode || "XX";
      const existing = geoMap.get(key);
      if (existing) {
        existing.views++;
      } else {
        geoMap.set(key, {
          country: v.country || "Неизвестно",
          countryCode: key,
          views: 1,
        });
      }
    }
    const geoBreakdown = Array.from(geoMap.values()).sort((a, b) => b.views - a.views);

    return {
      botId: bot.id,
      botName: bot.name,
      botEmoji: bot.iconEmoji,
      totalViews: botViews.length,
      uniqueVisitors: uniqueIps.size,
      last7Days: last7.length,
      last30Days: last30.length,
      dailyViews,
      geoBreakdown,
    };
  }).sort((a, b) => b.totalViews - a.totalViews);
}
