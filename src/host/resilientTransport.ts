// Resilient transport wrapper at the single egress (Phase 6, RESIL-04).
//
// Wraps an inner `TransportFn` (the real fetch transport, or a canned one in
// tests) with two cooperating rate-limit defenses, both anchored at the ONE
// egress chokepoint so apps, widgets, and tweaks all share them (DRY):
//
//   1. Proactive: every request passes through a shared TokenBucket limiter, so
//      the platform never bursts past a known rate / concurrency cap.
//   2. Reactive: a 429 (ModelHttpError.isRateLimited) triggers exponential
//      backoff + full jitter, HONORING the `retry-after` header when present.
//      After `maxRetries` exhausted attempts it surfaces a neutral
//      `ModelUnavailableError` (no mechanic, no raw status leaked to the user).
//
// Non-rate-limit errors (401, 500, network) are NOT retried here — a 401 must
// fast-fail to the reconfigure path, and a 500 is not helped by hammering. They
// propagate unchanged so callers can branch on the typed error.
//
// IoC/DI: the inner transport, the Clock (sleep/now), the limiter, and the rng
// are ALL injected. A test substitutes a canned transport returning a 429×N then
// success, a stub Clock (instant, recording every slept delay), and a fixed rng —
// so the entire backoff schedule is verified with ZERO real waits.

import {
  ModelHttpError,
  type MessagesResponse,
  type TransportFn,
} from "./modelClient";
import type { Clock } from "./clock";
import { realClock } from "./clock";
import { TokenBucket } from "./tokenBucket";
import { computeBackoffDelay, type BackoffOptions } from "./backoff";

/**
 * Neutral, user-surfaceable error raised when retries are exhausted (or another
 * unrecoverable transport failure occurs). The message is mechanic-free
 * (HYGIENE): callers map it to the existing "couldn't load, try again" fallback.
 * The original cause is retained for the gated logger only — never shown.
 */
export class ModelUnavailableError extends Error {
  readonly cause?: unknown;
  constructor(cause?: unknown) {
    super("The service is busy right now. Please try again.");
    this.name = "ModelUnavailableError";
    this.cause = cause;
  }
}

export interface ResilientTransportOptions {
  /** The transport to wrap (real fetch transport, or a canned one in tests). */
  inner: TransportFn;
  /** Shared limiter governing rate + concurrency at the single egress. */
  limiter: TokenBucket;
  /** Injected time seam — real clock in prod, stub clock in tests. */
  clock?: Clock;
  /** Max RETRY attempts after the initial try (so total tries = maxRetries + 1). */
  maxRetries?: number;
  /** Backoff schedule knobs (base/max/rng). */
  backoff?: BackoffOptions;
}

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 500, maxDelayMs: 30_000 };

/**
 * Build a `TransportFn` that runs every request through the shared limiter and
 * retries 429s with backoff + jitter + retry-after. Drop-in for the plain
 * transport: callers (modelClient → producer → loader) see the SAME signature.
 */
export function createResilientTransport(
  opts: ResilientTransportOptions,
): TransportFn {
  const clock = opts.clock ?? realClock;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoff = opts.backoff ?? DEFAULT_BACKOFF;

  return async (url, init): Promise<MessagesResponse> => {
    // Attempt 0 is the initial try; attempts 1..maxRetries are backed-off retries.
    let attempt = 0;
    for (;;) {
      try {
        // The limiter governs BOTH the initial call and every retry, so a retry
        // storm still respects the shared rate/concurrency budget.
        return await opts.limiter.run(() => opts.inner(url, init));
      } catch (err) {
        // Only 429 is retryable here. Everything else (401, 500, network) is the
        // caller's to branch on — propagate it unchanged.
        const rateLimited =
          err instanceof ModelHttpError && err.isRateLimited;
        if (!rateLimited) throw err;

        attempt += 1;
        if (attempt > maxRetries) {
          // Retries exhausted → neutral, mechanic-free error for the UI.
          throw new ModelUnavailableError(err);
        }

        const retryAfterSec = (err as ModelHttpError).retryAfter;
        const delayMs = computeBackoffDelay(attempt, backoff, retryAfterSec);
        await clock.sleep(delayMs);
      }
    }
  };
}
