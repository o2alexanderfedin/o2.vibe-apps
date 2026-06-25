// Unit tests for the produce-cost guardrail sliding window (Phase 7, RESIL-05).
//
// The Clock is INJECTED via createStubClock, so the rolling window is driven by
// virtual time: a test fills the window, asserts the (N+1)th throws, advances the
// clock past the window, and asserts recovery — all INSTANTLY, with zero real
// waits and no real timers. Doubles are named stub (never the banned tokens).

import { describe, expect, it } from "vitest";
import { createStubClock } from "./clock";
import {
  createProduceGate,
  ProduceThrottledError,
  DEFAULT_PRODUCE_CAP,
  DEFAULT_PRODUCE_WINDOW_MS,
} from "./produceGate";

describe("produce gate — sliding-window soft cap (RESIL-05)", () => {
  it("allows up to N produce calls within the window, blocks N+1 with the neutral error", () => {
    const clock = createStubClock();
    const gate = createProduceGate({ clock, cap: 3, windowMs: 1000 });

    // The first N (3) calls are allowed (within the window, no clock advance).
    expect(() => gate.tryAcquire()).not.toThrow();
    expect(() => gate.tryAcquire()).not.toThrow();
    expect(() => gate.tryAcquire()).not.toThrow();

    // The (N+1)th call is blocked with the neutral throttled error.
    expect(() => gate.tryAcquire()).toThrow(ProduceThrottledError);
  });

  it("the throttled error carries neutral, mechanic-free copy (no banned tokens)", () => {
    const err = new ProduceThrottledError();
    expect(err.message).toMatch(/give it a moment/i);
    // No status codes, no "cap"/"limit"/"throttle"/"rate" mechanic leak.
    expect(err.message).not.toMatch(/cap|limit|throttle|rate|429|quota/i);
  });

  it("RECOVERS after the window slides past the recorded calls (clock-driven, no real waits)", () => {
    const clock = createStubClock();
    const gate = createProduceGate({ clock, cap: 2, windowMs: 1000 });

    gate.tryAcquire(); // t=0
    gate.tryAcquire(); // t=0 — window now full
    expect(() => gate.tryAcquire()).toThrow(ProduceThrottledError);

    // Advance virtual time PAST the window so both recorded calls slide out.
    clock.sleep(1001);

    // Capacity is free again — the gate recovers automatically.
    expect(() => gate.tryAcquire()).not.toThrow();
    expect(() => gate.tryAcquire()).not.toThrow();
    expect(() => gate.tryAcquire()).toThrow(ProduceThrottledError);
  });

  it("a PARTIAL slide frees exactly the calls that aged out, not the whole window", () => {
    const clock = createStubClock();
    const gate = createProduceGate({ clock, cap: 2, windowMs: 1000 });

    gate.tryAcquire(); // t=0
    clock.sleep(600); // t=600
    gate.tryAcquire(); // t=600 — window holds {0, 600}, full
    expect(() => gate.tryAcquire()).toThrow(ProduceThrottledError);

    // Advance to t=1100: the t=0 call (age 1100 > 1000) slides out; t=600 stays.
    clock.sleep(500);
    // Exactly one slot freed → one allowed, then full again.
    expect(() => gate.tryAcquire()).not.toThrow();
    expect(() => gate.tryAcquire()).toThrow(ProduceThrottledError);
  });

  it("calls exactly AT the window boundary slide out (cutoff is inclusive)", () => {
    const clock = createStubClock();
    const gate = createProduceGate({ clock, cap: 1, windowMs: 1000 });

    gate.tryAcquire(); // t=0
    expect(() => gate.tryAcquire()).toThrow(ProduceThrottledError);

    // Advance to exactly t=1000 — the t=0 call's age equals windowMs, so it ages out.
    clock.sleep(1000);
    expect(() => gate.tryAcquire()).not.toThrow();
  });

  it("exposes named, configurable default constants (N=10 per 5-minute window)", () => {
    expect(DEFAULT_PRODUCE_CAP).toBe(10);
    expect(DEFAULT_PRODUCE_WINDOW_MS).toBe(5 * 60 * 1000);

    // With the defaults: 10 allowed in the window, the 11th blocked.
    const clock = createStubClock();
    const gate = createProduceGate({ clock });
    for (let i = 0; i < DEFAULT_PRODUCE_CAP; i++) {
      expect(() => gate.tryAcquire()).not.toThrow();
    }
    expect(() => gate.tryAcquire()).toThrow(ProduceThrottledError);
  });

  it("rejects invalid configuration (cap < 1, window <= 0)", () => {
    const clock = createStubClock();
    expect(() => createProduceGate({ clock, cap: 0 })).toThrow();
    expect(() => createProduceGate({ clock, windowMs: 0 })).toThrow();
  });

  it("uses ONLY the injected clock for window timing — no real Date.now dependence", () => {
    // A clock frozen at a fixed instant: every call lands in the same window, so
    // the cap is reached deterministically regardless of real wall-clock time.
    const frozen = { now: () => 5_000, sleep: () => Promise.resolve() };
    const gate = createProduceGate({ clock: frozen, cap: 2, windowMs: 1000 });
    gate.tryAcquire();
    gate.tryAcquire();
    expect(() => gate.tryAcquire()).toThrow(ProduceThrottledError);
  });
});
