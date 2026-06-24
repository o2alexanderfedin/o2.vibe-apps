---
phase: 01-hygiene-foundation-storefront-shell
plan: 04
subsystem: testing
tags: [vitest, lexicon-gate, ci-hygiene, static-analysis, node-fs, devtools-hygiene]

# Dependency graph
requires:
  - phase: 01-hygiene-foundation-storefront-shell (Plans 01-03)
    provides: the complete Phase 1 source surface (src/** + index.html) that the gate scans and must pass green on
provides:
  - "src/hygiene.test.ts — Vitest lexicon-grep CI gate enforcing the banned-token set (HYGIENE-03)"
  - "Self-verifying static guard that no devtools-visible surface narrates the on-demand mechanic (HYGIENE-01)"
  - "Proof that the 'synthesize' family appears nowhere in the Phase 1 source (HYGIENE-02)"
affects: [phase-2-execution-engine, any-future-phase-touching-src, generate-identifier-introduction]

# Tech tracking
tech-stack:
  added: ["@types/node (devDep — for the gate's node:fs/node:path builtins under strict TS)"]
  patterns:
    - "Lexicon hygiene gate as a Vitest test (Node fs walk + per-line regex scan), wired into npm run test"
    - "Surgical third-party dependency-token allowlist (strip exact package name before matching) instead of weakening word boundaries"
    - "File-scoped Node typing via /// <reference types=\"node\" /> + process.cwd() anchoring (no tsconfig.json change)"

key-files:
  created:
    - src/hygiene.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Banned generate* family repo-wide for Phase 1 (Assumption A3: no internal generate* identifier ships); documented Phase-2 relaxation to the D-40 carve-out in a neutral comment"
  - "Stripped the exact fake-indexeddb package token (test-only, never shipped) before matching rather than loosening /\\bfake\\b/ — keeps the word boundary armed against real leaks"
  - "Installed @types/node and scoped it via a triple-slash reference + process.cwd() anchoring to leave the project-wide tsconfig.json untouched"

patterns-established:
  - "Pattern 1: Static lexicon gate runs in the test process via Node fs; excludes node_modules/dist/.git and itself to avoid self-matching its own regex literals"
  - "Pattern 2: Dependency-token allowlist is the surgical alternative to weakening word boundaries when a legitimate package name contains a banned substring"

requirements-completed: [HYGIENE-01, HYGIENE-02, HYGIENE-03]

# Metrics
duration: 4min
completed: 2026-06-24
---

# Phase 1 Plan 04: Lexicon Hygiene Gate Summary

**Vitest static gate (`src/hygiene.test.ts`) that walks `src/**` + `index.html`, fails any change introducing a mechanic-revealing token (`synthesi[sz]`, `\bfake\b`, `\bmock\b`, `\bAI\b`, `\bllm\b`, `\bgenerat(e|ed|ing)\b`), and passes green on the complete Phase 1 source while running inside `npm run test`.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-24T22:53:06Z
- **Completed:** 2026-06-24T22:56:49Z
- **Tasks:** 1
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Implemented the CI lexicon-grep hygiene gate (HYGIENE-03) as a Vitest test that recursively walks `src/**` (`.ts`/`.tsx`/`.css`/`.html`) and reads the repo-root `index.html`, excluding `node_modules`, `dist`, `.git`, and the gate file itself (Pitfall 6 self-match avoidance).
- Banned-token set exactly per D-39 with Pitfall-6 word boundaries: `/synthesi[sz]/i`, `/\bfake\b/i`, `/\bmock\b/i`, `/\bAI\b/` (case-sensitive), `/\bllm\b/i`, `/\bgenerat(e|ed|ing)\b/i`. Each violation is reported with file, line, token, and snippet so a developer can fix it.
- Documented (in a NEUTRAL, mechanic-free comment) the Phase-1 repo-wide `generate*` ban and the explicit Phase-2 relaxation to the D-40 context-aware carve-out — the one precision judgment call called out in the plan.
- Gate passes green on the full Phase 1 source produced by Plans 01-03 (HYGIENE-01, HYGIENE-02 proven on the real codebase) and runs as part of `npm run test` (D-41) — full suite 6 files / 36 tests all green.
- Verified self-verifying behavior: injecting `// synthesize` (and separately a `/* generated */` CSS comment) turns the gate red with a precise file+line report; removing it restores green (temporary tokens never committed).

## Task Commits

1. **Task 1: Lexicon hygiene gate — scan src/** + index.html, fail on banned tokens, pass on Phase 1 source** - `e35f10b` (feat)

## Files Created/Modified
- `src/hygiene.test.ts` - The Vitest lexicon gate: Node fs walk + per-line regex scan over `src/**` + `index.html`, banned-token set with word boundaries, a surgical `fake-indexeddb` dependency-token allowlist, and a second assertion guarding against a silently-empty scan.
- `package.json` / `package-lock.json` - Added `@types/node` as a devDependency so the gate's `node:fs`/`node:path` builtins type-check under the project's strict TS config.

## Decisions Made
- **`generate*` banned repo-wide for Phase 1:** Per Assumption A3, Phase 1 ships no internal `generate*` identifier (the key function is `cacheKey`, not `generateCacheKey`), so the simplest, strictest gate bans the family everywhere in the scanned surface. A neutral comment instructs Phase 2 to relax this to the D-40 carve-out (permit `generate*` only in internal TS identifiers; keep banning it in CSS, `*.html`, and string-literal/comment contexts) if a future phase introduces such an identifier.
- **`fake-indexeddb` handled via a dependency-token allowlist, not a looser regex:** The only matches against `/\bfake\b/i` on the real source were references to the `fake-indexeddb` test polyfill (an `import` and comments in `registry.test.ts` and `test/setup.ts` — test-only files pruned from the production bundle, never a devtools-visible surface). Rather than weaken the word boundary (which could let a real `.fake-*` class or "fake data" string slip through), the gate strips ONLY the exact `fake-indexeddb` token from each line before matching. Verified surgical: a standalone `fake` on the same line still trips the gate.
- **Node typing scoped to the file, not the project:** Added `@types/node`, then resolved the builtins via `/// <reference types="node" />` and anchored paths on `process.cwd()` (vitest runs from repo root) instead of `__dirname`, leaving `tsconfig.json` completely unchanged to avoid project-wide TS regressions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed @types/node so the gate type-checks under strict TS**
- **Found during:** Task 1 (after the gate passed at runtime, `npm run typecheck` failed on `node:fs`/`node:path`/`__dirname`)
- **Issue:** `src/hygiene.test.ts` is the first file in the project to import Node builtins; `@types/node` was not installed and `node:`-prefixed imports / `__dirname` did not type-check under `strict: true` + `moduleResolution: bundler`. The other Phase 1 tests only use Web Crypto (DOM-typed), so they never needed Node types.
- **Fix:** `npm install -D @types/node`; added `/// <reference types="node" />` to the gate file; replaced `__dirname` with a `process.cwd()`-anchored `REPO_ROOT`/`SRC_DIR`; added explicit `string`/`number` types to the scan callback. No change to `tsconfig.json`.
- **Files modified:** package.json, package-lock.json, src/hygiene.test.ts
- **Verification:** `npm run typecheck` exits 0; gate + full suite still green (6 files / 36 tests).
- **Committed in:** e35f10b (Task 1 commit)

**2. [Rule 1 - Precision] Dependency-token allowlist for `fake-indexeddb`**
- **Found during:** Task 1 (pre-write source scan)
- **Issue:** The naive `/\bfake\b/i` ban flagged 4 legitimate references to the `fake-indexeddb` test polyfill (its hyphenated name yields a `\bfake\b` match). These are test-infrastructure references, never shipped to the browser.
- **Fix:** Added a documented `DEPENDENCY_ALLOWLIST` that strips only the exact `fake-indexeddb` token per line before banned-token matching — surgical, leaves the word boundary fully armed. Confirmed a real leak on the same line still trips the gate.
- **Files modified:** src/hygiene.test.ts
- **Verification:** Gate green on real source; injected `// synthesize` and `/* generated */` both go red.
- **Committed in:** e35f10b (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 precision)
**Impact on plan:** Both auto-fixes were necessary for correctness — the gate must type-check and must pass green on the real source without weakening any word boundary. No scope creep; the gate's banned-token set and word boundaries are exactly as specified in D-39 / Pitfall 6.

## Issues Encountered
- The interactive shell's `grep` is aliased to `ugrep`, which mishandled a multi-line filelist variable during the initial scan; switched to a Node-based scan (identical to the gate's own logic) for reliable, precise results. No impact on deliverables.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The hygiene gate is the enforcement mechanism for the "apps just exist" illusion across all future phases. Combined with `build.sourcemap: false` (Plan 01), no symbol, store name, CSS class, `data-*`, comment, or visible string can narrate the on-demand mechanic without failing `npm run test`.
- **Phase 2 action item (documented in the gate's own comment):** if/when an internal, non-user-facing `generate*` identifier is introduced, relax ONLY the `/\bgenerat(e|ed|ing)\b/i` entry to the D-40 context-aware carve-out (keep banning `generate*` in CSS files, `*.html`, and string-literal/comment contexts; permit it in internal TS identifiers). Do not loosen any other banned token.
- The `DEPENDENCY_ALLOWLIST` pattern is the established way to handle any future legitimate third-party package name that contains a banned substring — add the exact package token there, never weaken a word boundary.

## Threat Surface Scan
No new security-relevant surface introduced. The gate reads files at test time only (Node `fs` over the local source tree); it adds no network endpoint, auth path, or runtime file access in the shipped app. It directly mitigates threat-register entries T-01-15, T-01-16, and T-01-17 (information disclosure via mechanic-revealing tokens / "synthesize" family / false-negative word-boundary errors).

## Known Stubs
None. The gate is a complete, passing test with no placeholder values or unwired data.

## Self-Check: PASSED
- FOUND: src/hygiene.test.ts
- FOUND commit: e35f10b
- Gate passes alone: 2/2 tests
- Full suite passes: 6 files / 36 tests
- typecheck: exit 0
- STATE.md / ROADMAP.md: not modified (orchestrator owns those writes)

---
*Phase: 01-hygiene-foundation-storefront-shell*
*Completed: 2026-06-24*
