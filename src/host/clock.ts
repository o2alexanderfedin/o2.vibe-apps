// Injectable clock seam (Phase 6 — IoC/DI for time).
//
// Backoff delays and the token-bucket limiter both need to read "now" and to
// "wait". Reaching for `Date.now()` and `setTimeout` directly would make the
// resilience logic untestable without REAL multi-second waits. Instead the time
// surface is an injected `Clock`: production wires the real wall clock, and a
// test substitutes a controllable stub so retry schedules and rate limits are
// verified INSTANTLY (zero real waits).

/** The two time operations the resilience layer needs. */
export interface Clock {
  /** Current epoch milliseconds (monotonic enough for backoff math). */
  now(): number;
  /** Resolve after `ms` milliseconds. */
  sleep(ms: number): Promise<void>;
}

/**
 * Production clock: the real wall clock + a real `setTimeout`. This is the ONLY
 * place business logic touches `Date.now`/`setTimeout` for the resilience path,
 * so tests never hit a real timer (they inject a stub Clock instead).
 */
export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, Math.max(0, ms))),
};

/**
 * A deterministic, virtual clock for tests: `now()` advances ONLY when `sleep`
 * is called (no real timers), so an exponential-backoff schedule that would take
 * many real seconds completes synchronously. `slept` records every requested
 * delay so a test can assert the exact backoff schedule and that retry-after was
 * honored. Lives here (not in test files) so both unit and DI tests share it.
 */
export function createStubClock(startMs = 0): Clock & {
  readonly slept: ReadonlyArray<number>;
  readonly current: number;
} {
  let current = startMs;
  const slept: number[] = [];
  return {
    now: () => current,
    sleep: (ms: number) => {
      const delay = Math.max(0, ms);
      slept.push(delay);
      current += delay;
      return Promise.resolve();
    },
    get slept() {
      return slept;
    },
    get current() {
      return current;
    },
  };
}
