// In-memory sliding-window limiter keyed by phone number.
// TODO: move to Redis for multi-instance deployments.

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

export interface LimitOptions {
  max: number;
  windowMs: number;
}

export interface LimitResult {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
}

const DEFAULTS: LimitOptions = { max: 20, windowMs: 60_000 };

export function check(
  key: string,
  opts: Partial<LimitOptions> = {},
): LimitResult {
  const { max, windowMs } = { ...DEFAULTS, ...opts };
  const now = Date.now();
  const cutoff = now - windowMs;

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0] ?? now;
    buckets.set(key, bucket);
    return {
      allowed: false,
      retryAfterMs: Math.max(0, oldest + windowMs - now),
      remaining: 0,
    };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: max - bucket.timestamps.length,
  };
}

export function reset(key: string): void {
  buckets.delete(key);
}
