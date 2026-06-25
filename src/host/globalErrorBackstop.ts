// Global async error backstop (Phase 6, RESIL-02).
//
// React error boundaries catch errors thrown DURING render, but NOT errors
// thrown from event handlers, timers, or unhandled promise rejections — those
// escape to `window.onerror` / the `unhandledrejection` event, where the raw
// message (which could narrate the on-demand mechanic) would otherwise reach the
// devtools console untouched. This module installs a backstop that intercepts
// those uncaught async/event-handler errors and routes them to NEUTRAL handling:
//   - the raw detail goes ONLY to the injected (gated) report sink, never to a
//     user-visible surface;
//   - the default browser logging is suppressed (preventDefault) so no revealing
//     message reaches the console.
//
// IoC/DI for testability: the installer is a PURE function that takes an injected
// event-target (with add/removeEventListener) and an injected report callback.
// A test passes a stub target and dispatches synthetic ErrorEvent /
// PromiseRejectionEvent objects, asserting the backstop reported them neutrally
// and called preventDefault — with NO real window and NO real unhandled
// rejection. Production wires the real `window` and the gated logger in main.tsx.

/** Minimal slice of the global object the backstop needs. */
export interface ErrorBackstopTarget {
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

/** Neutral, structured report handed to the injected sink (gated logger). */
export interface ErrorReport {
  /** Where the error surfaced: a window error event or a promise rejection. */
  source: "error" | "unhandledrejection" | "react-uncaught";
  /** A neutral one-line summary (never shown to the user). */
  summary: string;
}

export interface InstallBackstopOptions {
  /** The event target to attach to (the real `window` in production). */
  target: ErrorBackstopTarget;
  /** Where neutral reports go (the gated logger in production). */
  onReport: (report: ErrorReport) => void;
  /**
   * When true (default), the backstop calls `preventDefault()` on the event so
   * the browser's default console logging of the raw error is suppressed — no
   * revealing message reaches devtools. A test can set this false to assert the
   * report path independently.
   */
  suppressDefault?: boolean;
}

/** Best-effort, neutral one-line summary from an arbitrary thrown value. */
function summarize(value: unknown): string {
  if (value instanceof Error) return value.name;
  if (typeof value === "string") return "Error";
  return "Error";
}

/**
 * Install the global async error backstop. Returns an `uninstall` function that
 * removes both listeners (so tests can tear down cleanly and the installer is
 * idempotent across mounts).
 */
export function installGlobalErrorBackstop(
  opts: InstallBackstopOptions,
): () => void {
  const suppress = opts.suppressDefault ?? true;

  const onError = (event: Event): void => {
    const errEvent = event as ErrorEvent;
    opts.onReport({ source: "error", summary: summarize(errEvent.error) });
    if (suppress && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
  };

  const onRejection = (event: Event): void => {
    const rejEvent = event as PromiseRejectionEvent;
    opts.onReport({
      source: "unhandledrejection",
      summary: summarize(rejEvent.reason),
    });
    if (suppress && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
  };

  opts.target.addEventListener("error", onError);
  opts.target.addEventListener("unhandledrejection", onRejection);

  return () => {
    opts.target.removeEventListener("error", onError);
    opts.target.removeEventListener("unhandledrejection", onRejection);
  };
}

/**
 * Build the React `onUncaughtError` handler for `createRoot`. An error that
 * escapes every boundary (rare) is routed to the SAME neutral report sink rather
 * than React's default console dump. Kept tiny and injectable for the same
 * testability reasons as the window backstop.
 */
export function makeReactUncaughtHandler(
  onReport: (report: ErrorReport) => void,
): (error: unknown) => void {
  return (error: unknown) => {
    onReport({ source: "react-uncaught", summary: summarize(error) });
  };
}
