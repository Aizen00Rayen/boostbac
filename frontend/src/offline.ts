import NetInfo from "@react-native-community/netinfo";
import { storage } from "@/src/utils/storage";
import { api } from "@/src/api";

const CACHE_KEY = "boostbac_offline_cards";
const PENDING_KEY = "boostbac_pending_reviews";

export type CachedCard = {
  card_id: string;
  question: string;
  answer: string;
  subject: string;
  topic: string;
  difficulty: string;
};

type Pending = { card_id: string; rating: string };

export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected !== false;
  } catch {
    return true;
  }
}

// Cache today's due queue so review works offline
export async function cacheQueue(cards: CachedCard[]): Promise<void> {
  await storage.setItem(CACHE_KEY, JSON.stringify(cards));
}

export async function getCachedQueue(): Promise<CachedCard[]> {
  const raw = (await storage.getItem<string>(CACHE_KEY, "")) ?? "";
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Queue a review submission made while offline
export async function addPending(sub: Pending): Promise<void> {
  const list = await getPending();
  list.push(sub);
  await storage.setItem(PENDING_KEY, JSON.stringify(list));
}

export async function getPending(): Promise<Pending[]> {
  const raw = (await storage.getItem<string>(PENDING_KEY, "")) ?? "";
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function clearPending(): Promise<void> {
  await storage.removeItem(PENDING_KEY);
}

// Push any queued offline reviews to the server. Returns number synced.
export async function flushPending(): Promise<number> {
  if (!(await isOnline())) return 0;
  const list = await getPending();
  if (list.length === 0) return 0;
  let synced = 0;
  for (const p of list) {
    try {
      await api("/review/submit", { method: "POST", body: p, timeout: 15000 });
      synced += 1;
    } catch {
      // stop on first failure; keep the rest for next time
      const remaining = list.slice(synced);
      await storage.setItem(PENDING_KEY, JSON.stringify(remaining));
      return synced;
    }
  }
  await clearPending();
  return synced;
}
