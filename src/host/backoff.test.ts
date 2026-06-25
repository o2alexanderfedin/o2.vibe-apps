// Backoff schedule unit tests (Phase 6, RESIL-04).
//
// Pure math, no timers: the rng is INJECTED so jitter is deterministic. These
// tests pin (a) exponential growth, (b) the cap, (c) full-jitter bounds, and
// (d) retry-after overriding the computed delay.
import { describe, expect, it } from "vitest";
import { computeBackoffDelay, type BackoffOptions } from "./backoff";

const base: BackoffOptions = { baseMs: 500, maxDelayMs: 30_000 };

describe("computeBackoffDelay — exponential growth (full jitter at max)", () => {
  // rng = 1 - epsilon → returns the full (un-jittered) computed delay, so we can
  // read the exponential schedule directly.
  const fullRng = () => 0.999999;

  it("grows exponentially: base * 2^(attempt-1)", () => {
    const opts = { ...base, rng: fullRng };
    // attempt 1 → 500, 2 → 1000, 3 → 2000, 4 → 4000
    expect(computeBackoffDelay(1, opts)).toBe(Math.round(500 * 0.999999));
    expect(computeBackoffDelay(2, opts)).toBe(Math.round(1000 * 0.999999));
    expect(computeBackoffDelay(3, opts)).toBe(Math.round(2000 * 0.999999));
    expect(computeBackoffDelay(4, opts)).toBe(Math.round(4000 * 0.999999));
  });

  it("caps the computed delay at maxDelayMs", () => {
    const opts = { baseMs: 500, maxDelayMs: 3000, rng: fullRng };
    // attempt 4 would be 4000 uncapped → capped to 3000.
    expect(computeBackoffDelay(4, opts)).toBe(Math.round(3000 * 0.999999));
    // A very high attempt stays at the cap.
    expect(computeBackoffDelay(20, opts)).toBe(Math.round(3000 * 0.999999));
  });
});

describe("computeBackoffDelay — full jitter bounds", () => {
  it("rng=0 yields 0 delay (lower bound of full jitter)", () => {
    expect(computeBackoffDelay(3, { ...base, rng: () => 0 })).toBe(0);
  });

  it("delay stays within [0, computed] for any rng value", () => {
    // attempt 3 computed ceiling = 2000ms. Sample several rng values.
    for (const r of [0, 0.1, 0.5, 0.75, 0.9999]) {
      const d = computeBackoffDelay(3, { ...base, rng: () => r });
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(2000);
    }
  });

  it("half jitter (rng=0.5) is half the computed ceiling", () => {
    // attempt 2 ceiling = 1000ms; rng=0.5 → 500ms.
    expect(computeBackoffDelay(2, { ...base, rng: () => 0.5 })).toBe(500);
  });
});

describe("computeBackoffDelay — retry-after override", () => {
  it("honors retry-after (seconds) over the computed delay", () => {
    // Even with a tiny computed delay, the 7s server hint wins (→ 7000ms).
    expect(computeBackoffDelay(1, { ...base, rng: () => 0 }, 7)).toBe(7000);
  });

  it("retry-after=0 yields a 0 delay (and still overrides)", () => {
    expect(computeBackoffDelay(5, { ...base, rng: () => 0.999 }, 0)).toBe(0);
  });

  it("ignores a negative retry-after and falls back to the computed delay", () => {
    // Negative hint is invalid → computed delay (rng=0.5, attempt 2 → 500ms).
    expect(computeBackoffDelay(2, { ...base, rng: () => 0.5 }, -3)).toBe(500);
  });
});
