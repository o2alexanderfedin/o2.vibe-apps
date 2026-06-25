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

/**
 * Transpile a PLAIN TS/JS handler to runnable JS (Phase 8, HANDLER-01).
 *
 * Handlers are NOT React components — they are an async `handler(input)`
 * function over local data. So this path strips TS type annotations only
 * (preset-typescript) and DELIBERATELY omits the react preset / JSX transform:
 * a handler that accidentally contains JSX is a malformed handler, not something
 * to silently compile against a React global that the handler scope does not get.
 *
 * It is otherwise identical to `transpile`: the CommonJS module transform is kept
 * so a handler that uses `export`/`import` does not survive as raw ESM into the
 * `new Function` evaluator (the same SyntaxError trap the React path avoids), and
 * a Babel error is wrapped in the same `TranspileError` so the producer's
 * self-heal loop can feed it back verbatim (DRY across both paths).
 *
 * Plain JS already runs as-is, but routing it through the same Babel call keeps a
 * single code path (one set of plugins, one error shape) rather than branching on
 * "does this look like TS" — KISS.
 */
export function transpileHandler(source: string, opts?: TranspileOptions): string {
  let result: { code?: string | null };
  try {
    result = Babel.transform(source, {
      filename: opts?.filename ?? "handler.ts",
      // TS type-stripping only — NO react preset, NO JSX transform (Phase 8).
      presets: [["typescript", { isTSX: false, allExtensions: true }]],
      // Same CommonJS rewrite as the React path so export/import don't leak into
      // the new Function evaluator as raw ESM.
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
