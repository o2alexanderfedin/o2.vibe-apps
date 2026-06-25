// Token-bucket limiter unit tests (Phase 6, RESIL-04).
//
// The Clock is INJECTED (a stub that advances ONLY on sleep), so rate limits are
// verified INSTANTLY with zero real waits. These tests pin: immediate run within
// capacity, rate-throttled queueing (the bucket SLEEPS rather than failing), the
// concurrency cap, and that a throwing task never leaks a slot.
import { describe, expect, it } from "vitest";
import { createStubClock } from "./clock";
import { TokenBucket } from "./tokenBucket";

describe("TokenBucket — construction guards", () => {
  it("rejects invalid options", () => {
    const clock = createStubClock();
    expect(() => new TokenBucket({ capacity: 0, refillPerSec: 1, maxConcurrent: 1, clock })).toThrow();
    expect(() => new TokenBucket({ capacity: 1, refillPerSec: 0, maxConcurrent: 1, clock })).toThrow();
    expect(() => new TokenBucket({ capacity: 1, refillPerSec: 1, maxConcurrent: 0, clock })).toThrow();
  });
});

describe("TokenBucket — rate limiting (injected stub clock, no real waits)", () => {
  it("runs tasks immediately while tokens remain (no sleep)", async () => {
    const clock = createStubClock();
    const bucket = new TokenBucket({ capacity: 3, refillPerSec: 1, maxConcurrent: 5, clock });

    const results = await Promise.all([
      bucket.run(() => Promise.resolve("a")),
      bucket.run(() => Promise.resolve("b")),
      bucket.run(() => Promise.resolve("c")),
    ]);

    expect(results).toEqual(["a", "b", "c"]);
    // Three tokens, three calls — none had to wait.
    expect(clock.slept).toEqual([]);
  });

  it("throttles past capacity by SLEEPING (queueing), not failing", async () => {
    const clock = createStubClock();
    // capacity 1, refill 1/sec → the 2nd and 3rd calls each wait ~1s.
    const bucket = new TokenBucket({ capacity: 1, refillPerSec: 1, maxConcurrent: 5, clock });

    const ran: string[] = [];
    await Promise.all([
      bucket.run(() => { ran.push("1"); return Promise.resolve(); }),
      bucket.run(() => { ran.push("2"); return Promise.resolve(); }),
      bucket.run(() => { ran.push("3"); return Promise.resolve(); }),
    ]);

    // All three ran (none failed); rate-token fairness across simultaneously
    // queued callers is not a bucket guarantee, so assert the SET, not order.
    expect(ran.sort()).toEqual(["1", "2", "3"]);
    // First runs free; the next two each sleep ~1000ms for a refilled token.
    expect(clock.slept.length).toBe(2);
    for (const ms of clock.slept) expect(ms).toBeGreaterThanOrEqual(1000);
    // Virtual time advanced — but no REAL time elapsed (stub clock).
    expect(clock.current).toBeGreaterThanOrEqual(2000);
  });

  it("refills over elapsed virtual time so later calls are free again", async () => {
    const clock = createStubClock();
    const bucket = new TokenBucket({ capacity: 2, refillPerSec: 2, maxConcurrent: 5, clock });

    // Drain both tokens immediately.
    await bucket.run(() => Promise.resolve());
    await bucket.run(() => Promise.resolve());
    expect(bucket.availableTokens).toBe(0);

    // Advance virtual time by sleeping a full second → 2 tokens refill.
    await clock.sleep(1000);
    expect(bucket.availableTokens).toBe(2);
  });
});

describe("TokenBucket — concurrency cap", () => {
  it("caps simultaneous in-flight tasks at maxConcurrent (FIFO queueing)", async () => {
    const clock = createStubClock();
    // Plenty of tokens; concurrency is the binding constraint.
    const bucket = new TokenBucket({ capacity: 100, refillPerSec: 100, maxConcurrent: 2, clock });

    let peak = 0;
    let active = 0;
    // Each task parks on a manually-controlled promise so we can observe peak.
    const gates: Array<() => void> = [];
    const makeTask = () => () =>
      new Promise<void>((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        gates.push(() => {
          active -= 1;
          resolve();
        });
      });

    // Launch 4 tasks; only 2 may be active at once.
    const runs = [bucket.run(makeTask()), bucket.run(makeTask()), bucket.run(makeTask()), bucket.run(makeTask())];

    // Let microtasks settle so the first 2 start.
    await Promise.resolve();
    await Promise.resolve();
    expect(bucket.currentInFlight).toBeLessThanOrEqual(2);

    // Release tasks one at a time; each release frees a slot for a queued task.
    while (gates.length > 0) {
      const release = gates.shift()!;
      release();
      await Promise.resolve();
      await Promise.resolve();
    }

    await Promise.all(runs);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("releases the concurrency slot even when the task throws", async () => {
    const clock = createStubClock();
    const bucket = new TokenBucket({ capacity: 10, refillPerSec: 10, maxConcurrent: 1, clock });

    await expect(
      bucket.run(() => Promise.reject(new Error("task failed"))),
    ).rejects.toThrow("task failed");

    // The slot was released — a subsequent task runs (no permanent leak).
    expect(bucket.currentInFlight).toBe(0);
    await expect(bucket.run(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });
});
