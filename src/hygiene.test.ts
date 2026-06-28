// Lexicon hygiene gate (HYGIENE-03, decisions D-38..D-42).
//
// WHAT THIS IS: a static-analysis CI gate that walks the authored source surface
// (`src/**` plus the repo-root `index.html`) and FAILS the test run if any
// product-revealing token appears in a devtools-visible context. It is the
// enforcement mechanism for the "apps just exist" illusion: combined with
// `build.sourcemap: false` (D-04) it ensures no symbol, store name, CSS class,
// `data-*` attribute, console/DOM string literal, or comment narrates the
// on-demand mechanic. It runs as part of `npm run test` (D-41), so it fires on
// every future change.
//
// SCAN SCOPE (Open Question 2): every `.ts` / `.tsx` / `.css` / `.html` file
// under `src/`, plus `index.html` at the repo root (which carries the CSP, the
// FOUC script, and the document title — the only other authored, shippable,
// devtools-visible surface). `node_modules`, `dist`, and `.git` are excluded
// because they are not authored source. This file (`hygiene.test.ts`) excludes
// ITSELF so the gate does not match its own regex literals (Pitfall 6).

/// <reference types="node" />
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { describe, it, expect } from "vitest";

// --- Banned token set (D-39, with the word boundaries from Pitfall 6) ---------
//
// Word boundaries matter: a naive `/AI/` matches "air" and "maintain"; a naive
// `/mock/` matches "mockup". Each entry below is tuned to match a real leak and
// nothing benign.
//
// NOTE ON THE `generate*` FAMILY (the one precision judgment call — D-40 / A3):
// Decision D-40 carves out an EXCEPTION allowing the word "generate" in INTERNAL,
// non-user-facing identifiers (e.g. a private `generateCacheKey`), banning it only
// in CSS class names, `data-*` values, DOM/console string literals, and comments.
// For PHASE 1 that carve-out is unnecessary: Assumption A3 holds — Phase 1 ships
// NO internal `generate*` identifier (the key function is `cacheKey`, not
// `generateCacheKey`). So Phase 1 bans the `generate*` family REPO-WIDE across all
// scanned `src/**` + `index.html`, which is the strictest and simplest gate.
//
// >>> PHASE 2 RELAXATION (neutral, mechanic-free instruction): when a future
//     phase legitimately introduces an INTERNAL, non-user-facing `generate*`
//     identifier, this single regex must be relaxed to the D-40 context-aware
//     carve-out — i.e. keep banning `generate*` in CSS files, `*.html`, and
//     string-literal / comment contexts, but permit it in internal TypeScript
//     identifiers. Do NOT loosen the always-banned tokens below; only the
//     `generate*` entry is intended to relax, and only as D-40 specifies. <<<
const BANNED: { regex: RegExp; label: string }[] = [
  { regex: /synthesi[sz]/i, label: "synthesi[sz]" }, // synthesize/synthesized/synthesis — safe to match anywhere (HYGIENE-02)
  { regex: /\bfake\b/i, label: "fake" },
  { regex: /\bmock\b/i, label: "mock" },
  { regex: /\bAI\b/, label: "AI" }, // case-SENSITIVE exact word: matches "AI", never "air"/"maintain"
  { regex: /\bllm\b/i, label: "llm" },
  { regex: /\bgenerat(e|ed|ing)\b/i, label: "generate" }, // see PHASE 2 RELAXATION note above
];

// --- Third-party dependency token allowlist -----------------------------------
//
// Some legitimate, unavoidable third-party package names contain a banned word as
// a substring (here: the IndexedDB test polyfill `fake-indexeddb`, referenced in
// test-infrastructure imports/comments). These references are NOT a devtools-
// visible product surface — Vitest test files and the test-setup module are pruned
// from the production bundle (`vite build`) and never reach the shipped app.
//
// Rather than weaken a word boundary (which could let a REAL leak like a `.fake-*`
// class or a "fake data" string through), we strip ONLY these exact, known package
// tokens from each line before matching. This is surgical: a standalone `fake` on
// the same line — or any other banned token — still trips the gate. Add a new entry
// here ONLY for a genuine third-party package name, never to silence authored copy.
const DEPENDENCY_ALLOWLIST: RegExp[] = [
  /fake-indexeddb/g, // dumbmatter/fakeIndexedDB — IndexedDB polyfill for jsdom (test-only, never shipped)
];

// Vitest runs from the repo root (process.cwd() === repo root), so anchor paths
// there rather than on `__dirname` (unavailable under this ESM-typed config).
const REPO_ROOT = process.cwd();
const SRC_DIR = resolve(REPO_ROOT, "src");
const SCANNABLE = /\.(ts|tsx|css|html)$/;
const EXCLUDED_DIRS = new Set(["node_modules", "dist", ".git"]);
// SELF exclusion: anchor on the FULL repo-relative path, not the bare filename.
// A filename-only compare ("hygiene.test.ts") would silently exempt ANY file
// named hygiene.test.ts in any subdirectory (e.g. src/ui/hygiene.test.ts) from
// the scan — a latent escape hatch. Only THIS exact file may carry the gate's
// own regex literals (Pitfall 6).
const SELF_PATH = "src/hygiene.test.ts";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry)) walk(full, acc);
    } else if (SCANNABLE.test(entry)) {
      const relPath = relative(REPO_ROOT, full).split(sep).join("/");
      if (relPath !== SELF_PATH) acc.push(full);
    }
  }
  return acc;
}

interface Violation {
  file: string;
  line: number;
  token: string;
  snippet: string;
}

function scan(): Violation[] {
  const files = walk(SRC_DIR);
  const rootIndex = join(REPO_ROOT, "index.html");
  if (existsSync(rootIndex)) files.push(rootIndex);

  const violations: Violation[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line: string, idx: number) => {
      // Strip known third-party dependency tokens before matching (see allowlist).
      let scanLine = line;
      for (const dep of DEPENDENCY_ALLOWLIST) {
        scanLine = scanLine.replace(dep, "");
      }
      for (const { regex, label } of BANNED) {
        regex.lastIndex = 0;
        if (regex.test(scanLine)) {
          violations.push({
            file: relative(REPO_ROOT, file).split(sep).join("/"),
            line: idx + 1,
            token: label,
            snippet: line.trim().slice(0, 160),
          });
        }
      }
    });
  }
  return violations;
}

describe("lexicon hygiene gate (HYGIENE-03)", () => {
  it("contains no mechanic-revealing tokens in src/** or index.html", () => {
    const violations = scan();
    const report = violations
      .map((v) => `  ${v.file}:${v.line} [${v.token}] ${v.snippet}`)
      .join("\n");
    expect(
      violations,
      violations.length === 0
        ? ""
        : `Mechanic-revealing token(s) found in a devtools-visible surface:\n${report}\n` +
            `Fix the source to use neutral product language (see CONTEXT.md D-39 / UI-SPEC Copywriting Contract).`,
    ).toEqual([]);
  });

  it("actually scans a non-trivial number of source files (gate is wired, not a no-op)", () => {
    // Guards against a silently-empty scan (e.g. a path regression that walks nothing).
    const fileCount = walk(SRC_DIR).length;
    expect(fileCount).toBeGreaterThan(5);
  });

  it("explicitly covers the Phase-16, Phase-17, Phase-18, and Phase-20 source files (Pitfall 11 — new surfaces stay gated)", () => {
    // Pitfall 11: v2.0 added new devtools-visible surfaces (the desktop shell,
    // dock, menu bar, search/launcher panel, app icons, window frame, and window
    // manager). Phase 18 added colorCheck and sanitizeDisplayName as new source
    // files. Phase 20 added the opaque-origin frame layer (bridge, mount/srcdoc
    // builder, and the frame host component). The walk is recursive so these are
    // covered automatically — but a future path/layout regression could stop
    // scanning them silently. Assert the scanned set still contains each file by
    // name so that regression fails loudly here.
    //
    // NOTE: the React CJS embed lives OUTSIDE src/ (embed/reactEmbed.ts) on
    // purpose — the scanner must not walk React's vendored source (it carries a
    // "Fake" identifier and process.env, which would trip the gate). So there is
    // deliberately no embed/reactEmbed.generated.ts entry here; the embed is not
    // part of the authored, gated src/** surface.
    const scanned = new Set(
      walk(SRC_DIR).map((f) => relative(REPO_ROOT, f).split(sep).join("/")),
    );
    for (const file of [
      "src/ui/DesktopShell.tsx",
      "src/ui/Dock.tsx",
      "src/ui/MenuBar.tsx",
      "src/ui/SearchLauncherPanel.tsx",   // Phase 17 — the search/launcher surface
      "src/ui/iconForApp.tsx",
      "src/ui/WindowFrame.tsx",            // Phase 15 — window chrome surface
      "src/ui/useWindowManager.tsx",       // Phase 15 — window manager open() boundary
      "src/ui/VibeThemeProvider.tsx",      // Phase 14 — theme provider surface
      "src/execution/colorCheck.ts",       // Phase 18 — post-compile color check
      "src/ui/sanitizeDisplayName.ts",     // Phase 18 — display name sanitizer
      "src/execution/frameBridge.ts",      // Phase 20 — typed postMessage bridge
      "src/execution/frameMount.ts",       // Phase 20 — frame registry + srcdoc builder
      "src/ui/SandboxFrame.tsx",           // Phase 20 — opaque-origin frame host
    ]) {
      expect(scanned, `hygiene gate must scan ${file}`).toContain(file);
    }
  });
});

describe("sanitize boundary: model-supplied names cannot leak banned tokens to visible surfaces (TGEN-03)", () => {
  // Import sanitizeDisplayName from the source under test.
  // This is NOT a hygiene-gate test — it is a behavioral proof that the
  // sanitization boundary works, placed here to keep all lexicon-safety
  // proofs in one file.
  // NOTE: hygiene.test.ts is excluded from the hygiene scan (SELF exclusion),
  // so it is safe to use dynamic imports that reference the sanitizer here.

  it("strips banned two-letter acronym from a model-supplied display name", async () => {
    const { sanitizeDisplayName } = await import("./ui/sanitizeDisplayName");
    // Construct the input at runtime so the hygiene gate does not flag this line.
    const banned = ["A", "I"].join(""); // "AI"
    expect(sanitizeDisplayName(`${banned} Weather`)).toBe("Weather");
  });

  it("strips banned g*nerate family token from a model-supplied display name", async () => {
    const { sanitizeDisplayName } = await import("./ui/sanitizeDisplayName");
    const banned = ["Gen", "erat", "ed"].join(""); // "Generated"
    expect(sanitizeDisplayName(`${banned} Notes`)).toBe("Notes");
  });

  it("returns neutral fallback 'App' when the entire name is a banned token", async () => {
    const { sanitizeDisplayName } = await import("./ui/sanitizeDisplayName");
    const banned = ["A", "I"].join(""); // "AI"
    expect(sanitizeDisplayName(banned)).toBe("App");
  });
});

// ---------------------------------------------------------------------------
// HYGIENE-07: the words "iframe" / "sandbox" / "isolation" must never reach a
// USER-VISIBLE surface in the opaque-origin frame layer.
//
// These three words are NOT in the repo-wide BANNED set (they are legitimate
// internal vocabulary: a JSX <iframe> element, the sandbox="allow-scripts"
// attribute, an identifier like SandboxFrame, and architecture comments). What
// the product premise forbids is narrating the isolation MECHANIC in copy a user
// could read — an overlay message, a title, a console string, a class name —
// just as the broader lexicon gate forbids "synthesize"/"AI"/etc.
//
// The carve-out that makes this precise: only inspect QUOTED STRING LITERALS
// (single/double/backtick), since user-visible copy is always a string literal,
// while internal identifiers (SandboxFrame, buildSrcdoc) and JSX tag/attribute
// NAMES are never inside quotes. Two literal kinds are explicitly allowed:
//   - the exact HTML attribute value "allow-scripts" (the sandbox token itself),
//   - import path / module specifier literals (lines with `import` or `from "`).
// Everything else is tested against /\b(iframe|sandbox|isolation)\b/i.
// ---------------------------------------------------------------------------

// The Phase 20 source files whose user-visible copy this gate protects.
const PHASE20_FILES = [
  "src/execution/frameBridge.ts",
  "src/execution/frameMount.ts",
  "src/ui/SandboxFrame.tsx",
  "src/ui/SandboxFrame.css",
];

const ISOLATION_WORDS = /\b(iframe|sandbox|isolation)\b/i;

// Extract single-quoted, double-quoted, and backtick-quoted string literals from
// a single source line. Deliberately simple (line-scoped, no cross-line template
// handling): user-visible copy lives on one line, and this gate only needs to
// distinguish "inside a quoted string" from "a bare identifier / JSX name".
function extractQuotedLiterals(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

// Decide whether a single source line carries a USER-VISIBLE occurrence of an
// isolation word. Returns the offending literal, or null if the line is clean.
// Exported shape kept local so the scanner can be unit-tested directly below.
function isolationViolationInLine(line: string): string | null {
  // Import / module-specifier lines carry path literals like "./SandboxFrame.css"
  // — those are build wiring, never user copy. Skip the whole line.
  if (/\bimport\b/.test(line) || /\bfrom\s+["']/.test(line)) return null;
  for (const literal of extractQuotedLiterals(line)) {
    if (literal === "allow-scripts") continue; // the sandbox attribute value
    if (ISOLATION_WORDS.test(literal)) return literal;
  }
  return null;
}

interface CopyViolation {
  file: string;
  line: number;
  literal: string;
}

function scanIsolationCopy(): CopyViolation[] {
  const violations: CopyViolation[] = [];
  for (const rel of PHASE20_FILES) {
    const full = resolve(REPO_ROOT, rel);
    if (!existsSync(full)) continue;
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, idx) => {
      const hit = isolationViolationInLine(line);
      if (hit !== null) {
        violations.push({ file: rel, line: idx + 1, literal: hit });
      }
    });
  }
  return violations;
}

describe("HYGIENE-07: iframe/sandbox/isolation absent from user-visible copy", () => {
  it("the Phase 20 files exist (so this gate is scanning real surfaces, not a no-op)", () => {
    for (const rel of PHASE20_FILES) {
      expect(existsSync(resolve(REPO_ROOT, rel)), `${rel} must exist`).toBe(true);
    }
  });

  it("no Phase 20 file puts iframe/sandbox/isolation in a user-visible string literal", () => {
    const violations = scanIsolationCopy();
    const report = violations
      .map((v) => `  ${v.file}:${v.line} quoted literal: ${v.literal}`)
      .join("\n");
    expect(
      violations,
      violations.length === 0
        ? ""
        : `Isolation-mechanic word(s) leaked into user-visible copy:\n${report}\n` +
            `Use neutral product language; these words may only appear as ` +
            `identifiers, JSX names, comments, or the allow-scripts attribute.`,
    ).toEqual([]);
  });

  it("the carve-out distinguishes user-visible copy from the sandbox attribute and identifiers", () => {
    // POSITIVE: a real overlay/copy string mentioning the mechanic IS flagged.
    // (User-visible copy in this codebase is always a string literal — an
    // overlay body, a title prop, a console string — so a quoted literal is the
    // form the gate must catch.)
    expect(
      isolationViolationInLine('  <p className="x">{"This runs in a sandbox"}</p>'),
    ).toBe("This runs in a sandbox");
    expect(
      isolationViolationInLine('  const msg = "iframe isolation active";'),
    ).not.toBeNull();
    expect(
      isolationViolationInLine('  title="Open the isolation panel"'),
    ).toBe("Open the isolation panel");

    // NEGATIVE: the sandbox attribute VALUE is allowed.
    expect(isolationViolationInLine('  sandbox="allow-scripts"')).toBeNull();
    // NEGATIVE: a bare identifier / JSX name is not inside quotes → not matched.
    expect(isolationViolationInLine("export function SandboxFrame() {")).toBeNull();
    expect(isolationViolationInLine("      <iframe ref={iframeRef} />")).toBeNull();
    // NEGATIVE: an import / module specifier path literal is skipped.
    expect(
      isolationViolationInLine('import "./SandboxFrame.css";'),
    ).toBeNull();
  });
});
