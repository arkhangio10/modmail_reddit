import { redis } from "@devvit/web/server";

// TTLs
const PROC_TTL_S = 7 * 24 * 3600;    // idempotency — 7 days
const RATELIMIT_TTL_S = 3600;         // per-hour rate limit — 1 hour
const BUDGET_TTL_S = 24 * 3600;       // daily budget — 24 hours
const HISTORY_TTL_S = 24 * 3600;      // user history cache — 24 hours

// ~$0.0006 per call (800 input tokens × $0.15/M + 800 output tokens × $0.60/M, gpt-4o-mini pricing).
// Stored as integer micros (×1,000,000) so sub-millicent precision is preserved.
const COST_MICROS = 600; // $0.0006 = 600 micros
const DEFAULT_RATE_CAP = 50;


function nowHourKey(sub: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hour = String(now.getUTCHours()).padStart(2, "0");
  return `ratelimit:${sub}:${date}-${hour}`;
}

function todayBudgetKey(sub: string): string {
  return `budget:${sub}:${new Date().toISOString().slice(0, 10)}`;
}

// --- Idempotency ---

/**
 * Returns true if messageId was already processed (caller should skip).
 * Marks it as processed on the first call so retries are safe.
 */
export async function checkAndMarkProcessed(messageId: string): Promise<boolean> {
  const key = `proc:${messageId}`;
  const exists = await redis.exists(key);
  if (exists > 0) {
    console.log("[cache] duplicate event, skipping:", messageId);
    return true;
  }
  await redis.set(key, "1", {
    expiration: new Date(Date.now() + PROC_TTL_S * 1000),
  });
  return false;
}

// --- Per-subreddit hourly rate limit ---

/** Returns true if the subreddit is over the hourly call cap (caller should skip LLM). */
export async function isOverRateLimit(
  sub: string,
  cap: number = DEFAULT_RATE_CAP,
): Promise<boolean> {
  const val = await redis.get(nowHourKey(sub));
  return val !== undefined && val !== null && parseInt(val, 10) >= cap;
}

/** Increments the hourly counter; sets 1h TTL on first call this hour. */
export async function incrementRateLimit(sub: string): Promise<void> {
  const key = nowHourKey(sub);
  const count = await redis.incrBy(key, 1);
  if (count === 1) await redis.expire(key, RATELIMIT_TTL_S);
}

// --- Daily budget cap ---

/** Returns true if today's spend is already at or above the cap (caller should skip LLM). */
export async function isOverBudget(
  sub: string,
  capUsd = 1.0,
): Promise<boolean> {
  const capMicros = Math.round(capUsd * 1_000_000);
  const val = await redis.get(todayBudgetKey(sub));
  return val !== undefined && val !== null && parseInt(val, 10) >= capMicros;
}

/** Records one LLM call's cost; sets 24h TTL on first call today. */
export async function recordSpend(sub: string): Promise<void> {
  const key = todayBudgetKey(sub);
  const count = await redis.incrBy(key, COST_MICROS);
  if (count === COST_MICROS) await redis.expire(key, BUDGET_TTL_S);
}

// --- User-history cache ---

export async function getCachedHistory(username: string): Promise<string | null> {
  return (await redis.get(`history:${username}`)) ?? null;
}

export async function setCachedHistory(
  username: string,
  summary: string,
): Promise<void> {
  await redis.set(`history:${username}`, summary, {
    expiration: new Date(Date.now() + HISTORY_TTL_S * 1000),
  });
}
