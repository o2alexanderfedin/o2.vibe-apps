// Component instantiation from a transpiled JS string (Phase 2, LOOP-06/07).
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
// `useWidget` is stubbed (always returns null) because widget composition is
// a Phase 3+ concern. The stub keeps the call signature stable so seeded apps
// can reference it without errors.

import React from "react";
import type { ComponentType } from "react";

/** The shared React instance injected into every instantiated component scope. */
const sharedReact = React;

/** Stub for the widget composition hook (Phase 3+). */
function useWidget(_type: string): null {
  return null;
}

/**
 * Instantiate a React component from transpiled JS.
 *
 * The transpiled JS must define `App` as a function (no default export).
 * A CJS-style module/exports shim is provided so Babel's CommonJS output
 * (`module.exports = ...` or `exports.default = ...`) resolves correctly.
 *
 * Throws `InstantiateError` if the code fails to execute or does not export
 * an `App` function.
 */
export function instantiate(transpiledJS: string): ComponentType {
  const mod: { exports: Record<string, unknown> } = { exports: {} };

  try {
    // Parameters: module, exports, React, useWidget — only these names are in scope.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function("module", "exports", "React", "useWidget", transpiledJS);
    fn(mod, mod.exports, sharedReact, useWidget);
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
        transpiledJS + "\nreturn typeof App !== 'undefined' ? App : undefined;",
      );
      App = fn2(mod, mod.exports, sharedReact, useWidget) as unknown;
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
