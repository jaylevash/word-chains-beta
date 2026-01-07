import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitResult = {
  success: boolean;
  remaining: number;
  reset: number;
};

const memoryStore = new Map<string, { count: number; reset: number }>();
const limiterCache = new Map<string, Ratelimit>();

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

const getLimiter = (limit: number, windowSeconds: number) => {
  const key = `${limit}:${windowSeconds}`;
  const cached = limiterCache.get(key);
  if (cached) return cached;
  if (!redis) return null;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: "wordchains",
  });
  limiterCache.set(key, limiter);
  return limiter;
};

export const rateLimit = async (
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> => {
  const limiter = getLimiter(limit, windowSeconds);
  if (limiter) {
    const result = await limiter.limit(key);
    return {
      success: result.success,
      remaining: result.remaining ?? 0,
      reset: result.reset ?? Date.now() + windowSeconds * 1000,
    };
  }

  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || now > entry.reset) {
    memoryStore.set(key, { count: 1, reset: now + windowSeconds * 1000 });
    return { success: true, remaining: limit - 1, reset: now + windowSeconds * 1000 };
  }
  entry.count += 1;
  memoryStore.set(key, entry);
  return {
    success: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    reset: entry.reset,
  };
};
