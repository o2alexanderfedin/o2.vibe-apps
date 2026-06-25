// Produce-cost guardrail — sliding-window soft cap (Phase 7, RESIL-05).
//
// A cache MISS that has to call the model (the produce path) is the only place
// that spends real budget; a cache HIT is free. This gate counts the misses in a
// rolling time window and soft-caps them: it allows up to N produce calls per
// window, and BLOCKS the (N+1)th with a neutral, mechanic-free error. Because the
// window SLIDES, the cap recovers automatically — once the oldest recorded miss
// falls outside the window, capacity frees up again with no manual reset.
//
// Where it hooks: the loader calls `tryAcquire()` immediately before
// `produceComponent()` (i.e. only on a full miss that reaches the model). Cache
// hits never touch the gate, so browsing already-opened apps is never throttled.
//
// IoC/DI: the Clock is INJECTED. Window math reads `clock.now()` only, so a stub
// clock lets a test fill the window, assert the block, advance the clock past the
// window, and assert recovery — all INSTANTLY, with zero real waits or timers.

import type { Clock } from "./clock";
import { logger } from "../lib/logger";

/** Default cap: produce calls allowed per rolling window (named, configurable). */
export const DEFAULT_PRODUCE_CAP = 10;
/** Default rolling window length in ms (5 minutes; named, configurable). */
export const DEFAULT_PRODUCE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Neutral, user-surfaceable error raised when the produce cost cap is exceeded.
 * The copy is mechanic-free (HYGIENE) and frames the situation as a brief pause,
 * not a failure: the window slides, so a moment later it recovers on its own. The
 * UI maps this to the existing failed-open fallback, swapping in this softer copy.
 */
export class ProduceThrottledError extends Error {
  constructor() {
    super("You're opening a lot of apps quickly — give it a moment.");
    this.name = "ProduceThrottledError";
  }
}

export interface ProduceGateOptions {
  /** Injected time seam — real clock in prod, stub clock in tests. */
  clock: Clock;
  /** Max produce calls per window (defaults to DEFAULT_PRODUCE_CAP). */
  cap?: number;
  /** Rolling window length in ms (defaults to DEFAULT_PRODUCE_WINDOW_MS). */
  windowMs?: number;
}

/**
 * The injectable produce-cost gate. `tryAcquire()` is the single method the
 * produce path calls; everything else is internal window bookkeeping.
 */
export interface ProduceGate {
  /**
   * Record one produce call against the rolling window. Returns normally if the
   * call is within the cap (and the timestamp is recorded), or THROWS
   * ProduceThrottledError if the cap is already exceeded for the current window.
   */
  tryAcquire(): void;
}

/**
 * Build a sliding-window produce gate. Implementation: a list of the epoch-ms
 * timestamps of recent produce calls. On each `tryAcquire()` it prunes
 * timestamps older than `windowMs`, then either records `now` (under cap) or
 * throws (at/over cap). The list is bounded by `cap` plus whatever is still
 * inside the window, so it stays small.
 */
export function createProduceGate(opts: ProduceGateOptions): ProduceGate {
  const cap = opts.cap ?? DEFAULT_PRODUCE_CAP;
  const windowMs = opts.windowMs ?? DEFAULT_PRODUCE_WINDOW_MS;
  if (cap < 1) throw new Error("produce cap must be >= 1");
  if (windowMs <= 0) throw new Error("produce window must be > 0");

  // Timestamps (epoch ms) of the produce calls still inside the current window.
  const recent: number[] = [];

  return {
    tryAcquire(): void {
      const now = opts.clock.now();
      const cutoff = now - windowMs;
      // Drop calls that have slid out of the window (recover automatically).
      while (recent.length > 0 && recent[0]! <= cutoff) {
        recent.shift();
      }
      if (recent.length >= cap) {
        // Soft cap exceeded — block this produce with a neutral message.
        logger.warn(
          `Produce gate: soft cap reached (${recent.length}/${cap} in window) — blocking`,
        );
        throw new ProduceThrottledError();
      }
      recent.push(now);
    },
  };
}
