// In-browser TSX → JS transpiler seam (Phase 2, LOOP-05).
//
// Babel is configured for:
//   - TypeScript (including TSX syntax, type-annotation stripping)
//   - React classic runtime (emits React.createElement — no import of react/jsx-runtime)
//
// The classic runtime is non-negotiable: the new Function scope injects only the
// React global, so automatic-runtime output (which emits `_jsx(...)` plus an
// import of "react/jsx-runtime") would throw at instantiation time.
//
// One compile per session: the caller is responsible for checking the in-memory
// transpiledCache before calling transpile(); this module is a pure function and
// does not cache internally — caching lives in the resolver (LOOP-04).

import * as Babel from "@babel/standalone";

/** Options accepted by transpile(). */
export interface TranspileOptions {
  /** Source file name used in Babel error messages (optional). */
  filename?: string;
}

/**
 * Transpile TSX source to classic-React JS.
 *
 * Throws a `TranspileError` on syntax / type errors so callers can surface
 * a neutral error message without catching the raw Babel exception.
 */
export function transpile(source: string, opts?: TranspileOptions): string {
  let result: { code?: string | null };
  try {
    result = Babel.transform(source, {
      filename: opts?.filename ?? "app.tsx",
      presets: [
        ["typescript", { isTSX: true, allExtensions: true }],
        ["react", { runtime: "classic" }],
      ],
    });
  } catch (err) {
    throw new TranspileError(
      err instanceof Error ? err.message : String(err),
      err,
    );
  }
  if (!result.code) {
    throw new TranspileError("Transpiler returned empty output", null);
  }
  return result.code;
}

/** Structured error thrown by transpile() on compile failures. */
export class TranspileError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "TranspileError";
    this.cause = cause;
  }
}
