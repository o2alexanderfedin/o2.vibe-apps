// Shared token-bucket limiter at the single egress (Phase 6, RESIL-04).
//
// Every model request funnels through ONE limiter so the platform never bursts
// the API past a known rate — the proactive half of rate-limit handling (the
// reactive half is backoff-on-429 in resilientTransport). Putting the limiter
// at the single egress chokepoint (modelClient) means one instance governs apps,
// widgets, and tweaks alike (DRY): no caller can bypass it.
//
// Model — classic token bucket:
//   - `capacity` tokens, refilled at `refillPerSec` tokens/second (lazy refill:
//     tokens are computed from elapsed time on demand, no background timer).
//   - Each `acquire()` costs one token. If a token is available it returns
//     immediately; otherwise the caller SLEEPS (via the injected Clock) until the
//     next token is due, then retries — so callers QUEUE instead of failing.
//   - `maxConcurrent` caps in-flight requests independently of the rate, so a
//     slow API can't pile up unbounded simultaneous fetches.
//
// IoC/DI: the Clock is INJECTED. Lazy refill reads `clock.now()` and queueing
// waits via `clock.sleep()`, so a stub clock makes rate limits deterministic and
// instant in tests (no real waits, no background interval to leak between tests).

import type { Clock } from "./clock";

export interface TokenBucketOptions {
  /** Max tokens (burst size). Must be ≥ 1. */
  capacity: number;
  /** Sustained refill rate in tokens per second. Must be > 0. */
  refillPerSec: number;
  /** Max simultaneously in-flight `run` calls. Must be ≥ 1. */
  maxConcurrent: number;
  /** Injected time seam (real clock in prod, stub in tests). */
  clock: Clock;
}

export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;
  private inFlight = 0;
  // Resolvers for callers waiting on a concurrency slot, served in FIFO order.
  private readonly concurrencyWaiters: Array<() => void> = [];

  constructor(private readonly opts: TokenBucketOptions) {
    if (opts.capacity < 1) throw new Error("capacity must be >= 1");
    if (opts.refillPerSec <= 0) throw new Error("refillPerSec must be > 0");
    if (opts.maxConcurrent < 1) throw new Error("maxConcurrent must be >= 1");
    this.tokens = opts.capacity;
    this.lastRefillMs = opts.clock.now();
  }

  /** Lazily credit tokens for the time elapsed since the last refill. */
  private refill(): void {
    const now = this.opts.clock.now();
    const elapsedSec = (now - this.lastRefillMs) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(
      this.opts.capacity,
      this.tokens + elapsedSec * this.opts.refillPerSec,
    );
    this.lastRefillMs = now;
  }

  /** Acquire one rate token, sleeping (queueing) until one is available. */
  private async acquireToken(): Promise<void> {
    // Loop: refill, take a token if present, else sleep until the next is due.
    // The loop (not a single wait) is robust to multiple queued callers racing
    // for the same freed token.
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // Time until the next whole token accrues, in ms.
      const deficit = 1 - this.tokens;
      const waitMs = Math.ceil((deficit / this.opts.refillPerSec) * 1000);
      await this.opts.clock.sleep(Math.max(1, waitMs));
    }
  }

  /** Acquire a concurrency slot, queueing (FIFO) if at the cap. */
  private acquireSlot(): Promise<void> {
    if (this.inFlight < this.opts.maxConcurrent) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.concurrencyWaiters.push(() => {
        this.inFlight += 1;
        resolve();
      });
    });
  }

  /** Release a concurrency slot and wake the next FIFO waiter, if any. */
  private releaseSlot(): void {
    this.inFlight -= 1;
    const next = this.concurrencyWaiters.shift();
    if (next) next();
  }

  /**
   * Run `task` under both the rate limit and the concurrency cap. The task does
   * not start until a rate token AND a concurrency slot are both held; the slot
   * is always released (even if the task throws) so a failing request never
   * leaks a permanent slot.
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try {
      await this.acquireToken();
      return await task();
    } finally {
      this.releaseSlot();
    }
  }

  /** Current available token count (rounded) — for tests/diagnostics. */
  get availableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /** Current in-flight count — for tests/diagnostics. */
  get currentInFlight(): number {
    return this.inFlight;
  }
}
