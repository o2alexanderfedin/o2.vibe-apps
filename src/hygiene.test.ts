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
const SELF = "hygiene.test.ts";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry)) walk(full, acc);
    } else if (SCANNABLE.test(entry) && entry !== SELF) {
      acc.push(full);
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

  it("explicitly covers the Phase-16 and Phase-17 desktop-shell source files (Pitfall 11 — new surfaces stay gated)", () => {
    // Pitfall 11: v2.0 added new devtools-visible surfaces (the desktop shell,
    // dock, menu bar, search/launcher panel, and app icons). Phase 17 added
    // SearchLauncherPanel as the launcher surface. The walk is recursive so
    // these are covered automatically — but a future path/layout regression could
    // stop scanning them silently. Assert the scanned set still contains each
    // file by name so that regression fails loudly here.
    const scanned = new Set(
      walk(SRC_DIR).map((f) => relative(REPO_ROOT, f).split(sep).join("/")),
    );
    for (const file of [
      "src/ui/DesktopShell.tsx",
      "src/ui/Dock.tsx",
      "src/ui/MenuBar.tsx",
      "src/ui/SearchLauncherPanel.tsx", // Phase 17 — the search/launcher surface
      "src/ui/iconForApp.tsx",
    ]) {
      expect(scanned, `hygiene gate must scan ${file}`).toContain(file);
    }
  });
});
