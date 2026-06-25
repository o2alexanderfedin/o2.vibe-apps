// In-browser TSX → JS transpiler seam (Phase 2, LOOP-05).
//
// Babel is configured for:
//   - TypeScript (including TSX syntax, type-annotation stripping)
//   - React classic runtime (emits React.createElement — no import of react/jsx-runtime)
//   - ESM → CommonJS (transform-modules-commonjs): rewrites `export default X`
//     and `export { X }` into `exports.default = X` / `exports.X = X`, and any
//     `import X from "y"` into `const X = require("y")`. Without this, an
//     `export default App;` (the shape real component output ships) survives
//     into the transpiled string and throws a SyntaxError when handed to the
//     `new Function(...)` evaluator in instantiate.ts — the component then
//     silently fails to render. The plugin ships inside @babel/standalone
//     (verified: `Babel.availablePlugins["transform-modules-commonjs"]`).
//
// The classic runtime is non-negotiable: the new Function scope injects only the
// React global, so automatic-runtime output (which emits `_jsx(...)` plus an
// import of "react/jsx-runtime") would throw at instantiation time.
//
// One compile per session: the caller is responsible for checking the in-memory
// transpiledCache before calling transpile(); this module is a pure function and
// does not cache internally — caching lives in the resolver (LOOP-04).

import * as Babel from "@babel/standalone";

// Guard: fail loud at module load if the bundled Babel is missing the CommonJS
// module transform — that would silently reintroduce the export-survival bug.
if (!("transform-modules-commonjs" in Babel.availablePlugins)) {
  throw new Error(
    "transpile: required Babel plugin 'transform-modules-commonjs' is not bundled in @babel/standalone",
  );
}

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
      // Rewrite ESM export/import into CommonJS exports.*/require(...) so the
      // `new Function("module","exports","React","useWidget","require", ...)`
      // evaluator in instantiate.ts can execute the output without a SyntaxError.
      plugins: ["transform-modules-commonjs"],
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
