// Global async backstop tests (Phase 6, RESIL-02).
//
// The installer is a pure function taking an injected event-target and an
// injected report sink — so a test attaches a STUB target, dispatches synthetic
// error / unhandledrejection events, and asserts the backstop reported them
// NEUTRALLY (name only, no raw message) and suppressed the default console dump.
// No real window, no real unhandled rejection.
import { describe, expect, it, vi } from "vitest";
import {
  installGlobalErrorBackstop,
  makeReactUncaughtHandler,
  type ErrorBackstopTarget,
  type ErrorReport,
} from "./globalErrorBackstop";

/** A controllable event target that records listeners and dispatches to them. */
function createStubTarget(): ErrorBackstopTarget & {
  dispatch(type: string, event: Partial<Event>): void;
  listenerCount(type: string): number;
} {
  const listeners = new Map<string, Set<(e: Event) => void>>();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event) {
      for (const l of listeners.get(type) ?? []) l(event as Event);
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

describe("installGlobalErrorBackstop", () => {
  it("attaches error and unhandledrejection listeners", () => {
    const target = createStubTarget();
    installGlobalErrorBackstop({ target, onReport: () => {} });
    expect(target.listenerCount("error")).toBe(1);
    expect(target.listenerCount("unhandledrejection")).toBe(1);
  });

  it("routes a window 'error' event to a NEUTRAL report (name only, no raw message)", () => {
    const target = createStubTarget();
    const reports: ErrorReport[] = [];
    installGlobalErrorBackstop({
      target,
      onReport: (r) => reports.push(r),
      suppressDefault: false,
    });

    const secretError = new RangeError("internal mechanic detail leaked");
    target.dispatch("error", {
      error: secretError,
      preventDefault: () => {},
    } as Partial<Event>);

    expect(reports).toHaveLength(1);
    expect(reports[0]!.source).toBe("error");
    // Only the error NAME — the revealing message is never carried.
    expect(reports[0]!.summary).toBe("RangeError");
    expect(reports[0]!.summary).not.toContain("mechanic");
  });

  it("routes an 'unhandledrejection' to a neutral report", () => {
    const target = createStubTarget();
    const reports: ErrorReport[] = [];
    installGlobalErrorBackstop({
      target,
      onReport: (r) => reports.push(r),
      suppressDefault: false,
    });

    target.dispatch("unhandledrejection", {
      reason: new TypeError("revealing rejection text"),
      preventDefault: () => {},
    } as Partial<Event>);

    expect(reports).toHaveLength(1);
    expect(reports[0]!.source).toBe("unhandledrejection");
    expect(reports[0]!.summary).toBe("TypeError");
    expect(reports[0]!.summary).not.toContain("revealing");
  });

  it("suppresses the default browser logging via preventDefault when enabled", () => {
    const target = createStubTarget();
    installGlobalErrorBackstop({ target, onReport: () => {}, suppressDefault: true });

    const preventDefault = vi.fn();
    target.dispatch("error", {
      error: new Error("x"),
      preventDefault,
    } as Partial<Event>);

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("uninstall removes both listeners", () => {
    const target = createStubTarget();
    const uninstall = installGlobalErrorBackstop({ target, onReport: () => {} });
    uninstall();
    expect(target.listenerCount("error")).toBe(0);
    expect(target.listenerCount("unhandledrejection")).toBe(0);
  });
});

describe("makeReactUncaughtHandler", () => {
  it("routes a React uncaught error to the same neutral sink", () => {
    const reports: ErrorReport[] = [];
    const handler = makeReactUncaughtHandler((r) => reports.push(r));

    handler(new EvalError("secret render detail"));

    expect(reports).toHaveLength(1);
    expect(reports[0]!.source).toBe("react-uncaught");
    expect(reports[0]!.summary).toBe("EvalError");
    expect(reports[0]!.summary).not.toContain("secret");
  });
});
