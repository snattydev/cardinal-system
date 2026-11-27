export interface LoginRateLimiterOptions {
  maxFailures?: number;
  windowMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface FailureWindow {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window per-client failure rate limiter to guard login/Argon2id against brute-force and CPU DoS.
 */
export class LoginRateLimiter {
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, FailureWindow>();

  constructor(opts: LoginRateLimiterOptions = {}) {
    this.maxFailures = opts.maxFailures ?? 10;
    this.windowMs = opts.windowMs ?? 60_000;
    this.maxEntries = opts.maxEntries ?? 10_000;
    this.now = opts.now ?? (() => Date.now());
  }

  private pruneExpired(currentTime: number): void {
    for (const [key, entry] of this.entries) {
      if (currentTime >= entry.resetAt) {
        this.entries.delete(key);
      }
    }
  }

  check(key: string): { allowed: boolean; retryAfterSec: number } {
    const currentTime = this.now();
    const entry = this.entries.get(key);
    if (!entry) {
      return { allowed: true, retryAfterSec: 0 };
    }
    if (currentTime >= entry.resetAt) {
      this.entries.delete(key);
      return { allowed: true, retryAfterSec: 0 };
    }
    if (entry.count >= this.maxFailures) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000)),
      };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  recordFailure(key: string): void {
    const currentTime = this.now();
    const existing = this.entries.get(key);
    if (existing && currentTime < existing.resetAt) {
      existing.count += 1;
      return;
    }
    if (existing) {
      this.entries.delete(key);
    }
    if (this.entries.size >= this.maxEntries) {
      this.pruneExpired(currentTime);
    }
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
    this.entries.set(key, { count: 1, resetAt: currentTime + this.windowMs });
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  size(): number {
    return this.entries.size;
  }
}
