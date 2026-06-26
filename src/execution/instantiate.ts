// Component instantiation from a transpiled JS string (Phase 2, LOOP-06/07;
// Phase 4 wires the real `useWidget`).
//
// Security note: this phase uses a plain new Function() scope. The user
// explicitly deferred sandbox/iframe isolation (SEC-01/02/03 are out of scope
// for Phase 2). App source runs in global scope and can reach window, document,
// etc. This is intentional for the MVP; hardening is a later phase.
//
// A SINGLE shared React instance is injected into every function scope to
// prevent "Invalid hook call" errors that arise when two separate React copies
// are loaded. The reference is captured once at module load and never re-imported.
//
// `useWidget` (Phase 4, WIDGET-03): the synchronous widget accessor injected
// into the function scope. It is a pure `Map.get` over the per-instance
// widget-component map that the pre-warm pass (WIDGET-02) populates BEFORE the
// host component renders. Because every declared widget is resolved ahead of
// render, `useWidget(type)` never does async work at render time — it returns
// the already-resolved component (or null for an undeclared type, which the host
// can render around). When no map is supplied (an app with no widgets), the
// accessor is a closed-over empty-map getter that always returns null, preserving
// the stable call signature seeded apps relied on.

import React from "react";
import type { ComponentType } from "react";

/** The shared React instance injected into every instantiated component scope. */
const sharedReact = React;

/**
 * The synchronous widget accessor signature injected into a component scope.
 * Returns the resolved component for a declared widget type, or null otherwise.
 * NEVER triggers async work — it is a pure read of the pre-warmed map (WIDGET-03).
 */
export type UseWidget = (type: string) => ComponentType | null;

/**
 * Build a synchronous `useWidget` bound to a specific widget-component map.
 * The map is populated by the pre-warm pass before the host renders, so this is
 * a pure `Map.get` (WIDGET-03). Exported for direct unit testing.
 */
export function makeUseWidget(
  widgetMap: ReadonlyMap<string, ComponentType>,
): UseWidget {
  return (type: string) => widgetMap.get(type) ?? null;
}

/** Empty-map accessor for apps that declare no widgets (always returns null). */
export const NULL_USE_WIDGET: UseWidget = makeUseWidget(new Map());

/**
 * The backend-style data-handler accessor injected into a component scope
 * (Phase 8, HANDLER-01). A produced app calls `runHandler(intent, input)` —
 * a TWO-arg, services-bound binding — and gets back a `Promise<{ data?, error? }>`.
 * The third argument (`services`) is closed over by the loader when it binds this,
 * so the app never sees the registry, transport, or key. Defaults to a no-op that
 * resolves to a neutral `{ error }` for apps instantiated without the binding
 * (e.g. direct unit tests of a component), preserving a stable call signature.
 */
export type RunHandler = (
  intent: string,
  input: unknown,
) => Promise<{ data?: unknown; error?: string }>;

/** Default handler accessor for scopes instantiated without one (neutral error). */
const NULL_RUN_HANDLER: RunHandler = () =>
  Promise.resolve({ error: "This operation could not be completed." });

/**
 * `require` shim injected into every instantiated component scope.
 *
 * Babel's CommonJS transform rewrites `import React from "react"` into
 * `require("react")`. Produced component code occasionally keeps that import,
 * so the evaluator must resolve "react"/"react-dom" to the SINGLE shared React
 * instance (a second React copy would trigger "Invalid hook call"). Any other
 * specifier throws a clear error rather than silently returning undefined.
 */
function requireShim(specifier: string): unknown {
  if (specifier === "react" || specifier === "react-dom") {
    return sharedReact;
  }
  throw new Error(
    `Component requested an unavailable module "${specifier}". ` +
      `Only "react" is provided in this scope.`,
  );
}

/**
 * Instantiate a React component from transpiled JS.
 *
 * The transpiled JS must define `App` as a function (no default export).
 * A CJS-style module/exports shim is provided so Babel's CommonJS output
 * (`module.exports = ...` or `exports.default = ...`) resolves correctly.
 *
 * @param transpiledJS  The Babel-compiled JS string.
 * @param useWidget     The synchronous widget accessor injected into the scope
 *                      (Phase 4). Defaults to an always-null accessor for apps
 *                      that declare no widgets, preserving the prior signature.
 * @param runHandler    The services-bound backend-style data-handler accessor
 *                      injected into the scope (Phase 8, HANDLER-01). Defaults to
 *                      a neutral no-op so components instantiated without it (e.g.
 *                      direct unit tests) keep a stable call signature.
 *
 * Throws `InstantiateError` if the code fails to execute or does not export
 * an `App` function.
 */
export function instantiate(
  transpiledJS: string,
  useWidget: UseWidget = NULL_USE_WIDGET,
  runHandler: RunHandler = NULL_RUN_HANDLER,
): ComponentType {
  const mod: { exports: Record<string, unknown> } = { exports: {} };

  try {
    // Parameters: module, exports, React, useWidget, runHandler, require — only
    // these names are in scope. `require` resolves "react"/"react-dom" to the
    // shared React (see requireShim); `runHandler` is the services-bound accessor.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function("module", "exports", "React", "useWidget", "runHandler", "require", transpiledJS);
    fn(mod, mod.exports, sharedReact, useWidget, runHandler, requireShim);
  } catch (err) {
    throw new InstantiateError(
      err instanceof Error ? err.message : String(err),
      err,
    );
  }

  // The seeded apps define `function App()` which Babel hoists but does NOT
  // attach to exports automatically. Look in mod.exports first (for compiled
  // code that uses export default), then fall back to the function declared in
  // the script scope. Because Babel wraps in a function body, `App` is local
  // to that body — so we re-run with a return statement if needed.
  let App = mod.exports["default"] ?? mod.exports["App"];

  if (!App) {
    // Second-pass: re-evaluate and explicitly return App from the script scope.
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn2 = new Function(
        "module",
        "exports",
        "React",
        "useWidget",
        "runHandler",
        "require",
        transpiledJS + "\nreturn typeof App !== 'undefined' ? App : undefined;",
      );
      App = fn2(mod, mod.exports, sharedReact, useWidget, runHandler, requireShim) as unknown;
      // (useWidget/runHandler are the injected accessors; same refs as pass one.)
    } catch (err) {
      throw new InstantiateError(
        err instanceof Error ? err.message : String(err),
        err,
      );
    }
  }

  if (typeof App !== "function") {
    throw new InstantiateError(
      "Transpiled code did not export an App function",
      null,
    );
  }

  return App as ComponentType;
}

/** Structured error thrown by instantiate() on execution or export failures. */
export class InstantiateError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "InstantiateError";
    this.cause = cause;
  }
}
