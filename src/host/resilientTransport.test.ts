// Resilient transport tests (Phase 6, RESIL-04) — DI substitution, zero waits.
//
// The inner transport, the Clock, the limiter, and the rng are ALL injected. A
// canned inner transport returns 429×N then success (or 429 forever), a stub
// Clock records every slept delay and advances virtual time only, and a fixed
// rng pins the jitter — so the whole backoff schedule is verified with NO real
// waits. Doubles are named canned/stub/testTransport (hygiene-safe).
import { describe, expect, it } from "vitest";
import {
  ModelHttpError,
  type MessagesResponse,
  type TransportFn,
} from "./modelClient";
import { createStubClock } from "./clock";
import { TokenBucket } from "./tokenBucket";
import {
  createResilientTransport,
  ModelUnavailableError,
} from "./resilientTransport";

const OK_RESPONSE: MessagesResponse = {
  content: [{ type: "text", text: "ok" }],
  stop_reason: "end_turn",
};

/** A limiter with effectively no throttling, for isolating the retry logic. */
function permissiveLimiter() {
  return new TokenBucket({
    capacity: 1000,
    refillPerSec: 1000,
    maxConcurrent: 100,
    clock: createStubClock(),
  });
}

/**
 * A canned inner transport that throws a 429 (with optional retry-after) for the
 * first `failTimes` calls, then resolves OK. Records the call count.
 */
function rateLimitedThenOk(failTimes: number, retryAfter?: number) {
  let calls = 0;
  const transport: TransportFn = () => {
    calls += 1;
    if (calls <= failTimes) {
      return Promise.reject(new ModelHttpError(429, retryAfter, "rate"));
    }
    return Promise.resolve(OK_RESPONSE);
  };
  return { transport, getCalls: () => calls };
}

describe("createResilientTransport — 429 backoff with injected clock", () => {
  it("retries a transient 429 and succeeds, sleeping per the backoff schedule", async () => {
    const clock = createStubClock();
    const { transport, getCalls } = rateLimitedThenOk(2);
    const resilient = createResilientTransport({
      inner: transport,
      limiter: permissiveLimiter(),
      clock,
      maxRetries: 4,
      backoff: { baseMs: 500, maxDelayMs: 30_000, rng: () => 0.5 },
    });

    const res = await resilient("u", {});

    expect(res).toEqual(OK_RESPONSE);
    // 2 failures + 1 success = 3 inner calls.
    expect(getCalls()).toBe(3);
    // Two retries → two sleeps. rng=0.5: attempt1=500*0.5=250, attempt2=1000*0.5=500.
    expect(clock.slept).toEqual([250, 500]);
    // No REAL time elapsed — only virtual.
    expect(clock.current).toBe(750);
  });

  it("honors retry-after over the computed backoff delay", async () => {
    const clock = createStubClock();
    // 429 with retry-after: 9s, then OK. The 9s hint must win over the tiny
    // computed delay (rng=0 → 0ms computed).
    const { transport } = rateLimitedThenOk(1, 9);
    const resilient = createResilientTransport({
      inner: transport,
      limiter: permissiveLimiter(),
      clock,
      maxRetries: 4,
      backoff: { baseMs: 500, maxDelayMs: 30_000, rng: () => 0 },
    });

    await resilient("u", {});
    // Honored the server hint: 9000ms, not 0.
    expect(clock.slept).toEqual([9000]);
  });

  it("surfaces a neutral ModelUnavailableError when retries are exhausted", async () => {
    const clock = createStubClock();
    // Always 429 — never recovers.
    const { transport, getCalls } = rateLimitedThenOk(Number.MAX_SAFE_INTEGER);
    const resilient = createResilientTransport({
      inner: transport,
      limiter: permissiveLimiter(),
      clock,
      maxRetries: 3,
      backoff: { baseMs: 500, maxDelayMs: 30_000, rng: () => 0.5 },
    });

    const err = await resilient("u", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelUnavailableError);
    // Neutral, mechanic-free message.
    expect((err as ModelUnavailableError).message).not.toMatch(/429|rate|status/i);
    // initial try + 3 retries = 4 inner calls; 3 sleeps.
    expect(getCalls()).toBe(4);
    expect(clock.slept).toHaveLength(3);
    // Proves no real wait: virtual time advanced instantly.
    expect(clock.current).toBeGreaterThan(0);
  });
});

describe("createResilientTransport — non-429 errors are not retried", () => {
  it("propagates a 401 unchanged (no retry, no sleep)", async () => {
    const clock = createStubClock();
    let calls = 0;
    const transport: TransportFn = () => {
      calls += 1;
      return Promise.reject(new ModelHttpError(401, undefined, "bad key"));
    };
    const resilient = createResilientTransport({
      inner: transport,
      limiter: permissiveLimiter(),
      clock,
    });

    const err = await resilient("u", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelHttpError);
    expect((err as ModelHttpError).status).toBe(401);
    // No retry → exactly one call, no sleeps.
    expect(calls).toBe(1);
    expect(clock.slept).toEqual([]);
  });

  it("propagates a 500 unchanged (no retry)", async () => {
    const clock = createStubClock();
    let calls = 0;
    const transport: TransportFn = () => {
      calls += 1;
      return Promise.reject(new ModelHttpError(500, undefined, "boom"));
    };
    const resilient = createResilientTransport({
      inner: transport,
      limiter: permissiveLimiter(),
      clock,
    });

    const err = await resilient("u", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelHttpError);
    expect((err as ModelHttpError).status).toBe(500);
    expect(calls).toBe(1);
    expect(clock.slept).toEqual([]);
  });

  it("passes the success path through unchanged on the first try", async () => {
    const clock = createStubClock();
    const transport: TransportFn = () => Promise.resolve(OK_RESPONSE);
    const resilient = createResilientTransport({
      inner: transport,
      limiter: permissiveLimiter(),
      clock,
    });
    expect(await resilient("u", {})).toEqual(OK_RESPONSE);
    expect(clock.slept).toEqual([]);
  });
});

describe("createResilientTransport — the limiter governs every call (DI seam)", () => {
  it("routes both the initial call and each retry through the shared limiter", async () => {
    const clock = createStubClock();
    // A limiter we can observe: count run() invocations by wrapping the bucket's
    // task. capacity huge so it never throttles — we only assert it's the seam.
    const limiter = new TokenBucket({
      capacity: 1000,
      refillPerSec: 1000,
      maxConcurrent: 100,
      clock,
    });
    let runCount = 0;
    const origRun = limiter.run.bind(limiter);
    limiter.run = (<T>(task: () => Promise<T>) => {
      runCount += 1;
      return origRun(task);
    }) as typeof limiter.run;

    const { transport } = rateLimitedThenOk(2);
    const resilient = createResilientTransport({
      inner: transport,
      limiter,
      clock,
      maxRetries: 4,
      backoff: { baseMs: 500, maxDelayMs: 30_000, rng: () => 0.5 },
    });

    await resilient("u", {});
    // 1 initial + 2 retries = 3 limiter.run() calls — every call went through it.
    expect(runCount).toBe(3);
  });
});
