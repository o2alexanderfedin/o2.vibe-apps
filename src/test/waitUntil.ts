// Wait, in tests that stub the clock, until a condition holds.
//
// Each step moves the stubbed clock forward a little (so debounces and other
// timers fire) and then gives the real event loop a turn (so real async work,
// such as the SHA-256 digest, can finish). The wait ends when the condition
// holds, not after a fixed number of steps: a slow machine only makes it take
// longer. If the condition still does not hold after `timeoutMs` of real time
// (vitest's own default test timeout), it fails and says what it waited for.
//
// The stubbed clock moves at most `fakeBudgetMs` in one wait; after that the
// steps only yield. Without this limit a long wait on a slow machine would
// also move the stubbed clock far ahead, and a test that depends on "the user
// clicked a moment ago" would see the click expire.

import { act } from "@testing-library/react";
import { vi } from "vitest";

// Captured when this module loads, before any test stubs the clock.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realSetImmediate = globalThis.setImmediate;

/** Vitest's default test timeout. A test that waits must allow more than
 *  this, so that a failed wait reports its own message first. */
export const WAIT_TIMEOUT_MS = 5_000;

export interface WaitOptions {
  /** How far the stubbed clock moves in one step. */
  fakeStepMs: number;
  /** The most the stubbed clock moves in one wait. */
  fakeBudgetMs: number;
  /** Real time to yield after each step; 0 yields one event-loop turn. */
  realYieldMs?: number;
  /** Real time after which the wait fails. */
  timeoutMs?: number;
}

/**
 * Wait until `check` holds: it returns true, or returns nothing without
 * throwing. A `check` that returns false or throws means "not yet"; if the
 * wait fails, the last thrown error is part of the message.
 */
export async function waitUntil(
  what: string,
  check: () => boolean | void,
  { fakeStepMs, fakeBudgetMs, realYieldMs = 0, timeoutMs = WAIT_TIMEOUT_MS }: WaitOptions,
): Promise<void> {
  let expired = false;
  const timer = realSetTimeout(() => {
    expired = true;
  }, timeoutMs);
  let fakeSpent = 0;
  let lastError: unknown;
  const holds = (): boolean => {
    try {
      return check() !== false;
    } catch (err) {
      lastError = err;
      return false;
    }
  };
  try {
    while (!holds()) {
      if (expired) {
        const why =
          lastError instanceof Error ? ": " + lastError.message : "";
        throw new Error(
          `gave up after ${timeoutMs} ms waiting for ${what}${why}`,
        );
      }
      const step = Math.min(fakeStepMs, fakeBudgetMs - fakeSpent);
      fakeSpent += step;
      await act(async () => {
        if (step > 0) await vi.advanceTimersByTimeAsync(step);
        await new Promise<void>((r) => realSetImmediate(r));
      });
      if (realYieldMs > 0) {
        await new Promise<void>((r) => realSetTimeout(r, realYieldMs));
      }
    }
  } finally {
    realClearTimeout(timer);
  }
}
