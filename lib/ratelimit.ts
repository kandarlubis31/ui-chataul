/**
 * IP-based rate limiting with two backends:
 *
 * 1. Upstash Redis (@upstash/ratelimit) — used automatically when
 *    UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set. Sliding window
 *    is shared across ALL serverless instances (Vercel, etc.).
 * 2. In-memory Map fallback — zero-dependency, per-instance only. Fine for
 *    self-hosted single-node deployments; best-effort on serverless.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

// ── Backend 1: Upstash Redis (serverless-ready) ──

const upstashURL = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const upstashLimiters = new Map<string, Ratelimit>();

function getUpstashLimiter(maxRequests: number, windowMs: number): Ratelimit | null {
  if (!upstashURL || !upstashToken) return null;
  const key = `${maxRequests}:${windowMs}`;
  let limiter = upstashLimiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: new Redis({ url: upstashURL, token: upstashToken }),
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms` as `${number} ms`),
      prefix: "chataul:rl",
      analytics: false,
    });
    upstashLimiters.set(key, limiter);
  }
  return limiter;
}

/**
 * Async rate limit: Upstash when configured, in-memory fallback otherwise.
 * Never throws — if Redis is unreachable it degrades to the local limiter.
 */
export async function checkRateLimitAsync(
  ip: string,
  maxRequests = 20,
  windowMs = 60_000,
): Promise<RateLimitResult> {
  const limiter = getUpstashLimiter(maxRequests, windowMs);
  if (limiter) {
    try {
      const r = await limiter.limit(ip);
      return {
        allowed: r.success,
        remaining: r.remaining,
        resetMs: Math.max(0, r.reset - Date.now()),
      };
    } catch (e) {
      console.warn("[chataul] Upstash rate limit failed, using in-memory fallback:", e);
    }
  }
  return checkRateLimit(ip, maxRequests, windowMs);
}

// ── Backend 2: in-memory sliding window (per-instance fallback) ──

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 60_000);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(
  ip: string,
  maxRequests = 20,
  windowMs = 60_000,
): RateLimitResult {
  cleanup();

  const now = Date.now();
  const entry = store.get(ip) ?? { timestamps: [] };

  // Filter out timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  const remaining = Math.max(0, maxRequests - entry.timestamps.length);

  if (entry.timestamps.length >= maxRequests) {
    // Calculate when the oldest request expires
    const oldest = entry.timestamps[0];
    const resetMs = oldest + windowMs - now;
    return { allowed: false, remaining: 0, resetMs };
  }

  entry.timestamps.push(now);
  store.set(ip, entry);

  return { allowed: true, remaining: remaining - 1, resetMs: 0 };
}
