// Exponential backoff + full jitter, honoring `retry-after` (Phase 6, RESIL-04).
//
// When the API rate-limits (429), the platform must back off before retrying —
// otherwise a tight retry loop makes the limit worse. The schedule is:
//   - base * 2^(attempt-1)  capped at `maxDelayMs`  → exponential growth
//   - "full jitter": the actual delay is a random value in [0, computed]      →
//     so simultaneous clients don't retry in lockstep (thundering herd).
//   - retry-after override: if the 429 carried a `retry-after` hint, that wins
//     over the computed delay (the server told us exactly how long to wait).
//
// IoC/DI: the random source is INJECTED (`rng: () => number`) so jitter is
// deterministic in tests — a stub `rng` pins the exact delay, letting a test
// assert the schedule without flakiness. The actual SLEEPING happens in the
// caller (resilientTransport) via the injected Clock; this module is pure math.

export interface BackoffOptions {
  /** Base delay in ms for the first retry (before jitter). */
  baseMs: number;
  /** Upper bound on the computed (pre-jitter) delay in ms. */
  maxDelayMs: number;
  /** Random source in [0, 1) — injected for deterministic jitter in tests. */
  rng?: () => number;
}

/**
 * Compute the delay in ms before retry `attempt` (1-based: attempt 1 is the
 * first retry after the initial failure).
 *
 * @param attempt     1-based retry index.
 * @param opts        base/max/rng knobs.
 * @param retryAfterSec  Optional server hint (seconds) from the `retry-after`
 *                       header — when present it OVERRIDES the computed delay.
 */
export function computeBackoffDelay(
  attempt: number,
  opts: BackoffOptions,
  retryAfterSec?: number,
): number {
  // Server hint wins outright — honor exactly what the API asked for.
  if (typeof retryAfterSec === "number" && retryAfterSec >= 0) {
    return Math.round(retryAfterSec * 1000);
  }

  const rng = opts.rng ?? Math.random;
  // Exponential growth, capped: base * 2^(attempt-1), clamped to maxDelayMs.
  const exp = opts.baseMs * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(exp, opts.maxDelayMs);
  // Full jitter: a uniform random point in [0, capped].
  return Math.round(rng() * capped);
}
