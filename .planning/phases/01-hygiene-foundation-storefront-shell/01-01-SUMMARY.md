---
phase: 01-hygiene-foundation-storefront-shell
plan: 01
subsystem: infra
tags: [vite, react, typescript, vitest, indexeddb, idb, fake-indexeddb, jsdom, csp, fouc, logger, walking-skeleton]

# Dependency graph
requires: []
provides:
  - Vite 8 + React 19.2 + TypeScript strict SPA scaffold with sourcemaps off
  - Vitest 4 test infrastructure with all three jsdom-gap workarounds (crypto.subtle, IndexedDB, matchMedia)
  - Walking Skeleton: page renders, registry performs real IndexedDB probe write+delete at startup
  - Gated logger (off by default, [Marketplace] prefix when localStorage.debug truthy)
  - Neutral localStorage key constants (marketplace.apiKey, marketplace.theme)
  - CSP meta tag restricting connect-src to self + api.anthropic.com
  - FOUC-blocking theme script in index.html
  - IndexedDB registry with apps/widgets/handlers stores + in-memory Map fallback
  - All three jsdom gaps handled in src/test/setup.ts
affects:
  - 01-02: storefront UI components inherit CSS variables from this plan's variable contract
  - 01-03: cache key derivation builds on registry interface established here
  - 01-04: hygiene gate tests scan code created in this plan
  - All phases: must import src/lib/logger.ts for any logging (no direct console.* allowed)
  - All phases: must await dbReady before any registry get/put/del call

# Tech tracking
tech-stack:
  added:
    - vite@^8
    - react@^19.2 + react-dom@^19.2
    - typescript@^6 (strict mode)
    - idb@^8 (typed IndexedDB wrapper)
    - "@babel/standalone@^7.26 (runtime dep, not exercised in Phase 1)"
    - lucide-react@^1
    - vitest@^4 + @vitest/ui@^4
    - jsdom@^29 (explicit devDep per Vitest 4 Pitfall 1)
    - fake-indexeddb@^6
    - "@testing-library/react@^16 + jest-dom@^6 + user-event@^14"
  patterns:
    - Gated logger reads gate once at module load; all logging goes through src/lib/logger.ts
    - IndexedDB probe write+delete at startup; degrade to Map fallback behind identical async interface
    - CSS variables on :root[data-theme] with FOUC blocking script in index.html
    - TDD: tests written alongside implementation for registry and logger modules

key-files:
  created:
    - package.json
    - tsconfig.json
    - tsconfig.node.json
    - vite.config.ts
    - .gitignore
    - index.html
    - src/main.tsx
    - src/App.tsx
    - src/index.css
    - src/vite-env.d.ts
    - src/test/setup.ts
    - src/lib/logger.ts
    - src/lib/logger.test.ts
    - src/lib/storage.ts
    - src/registry/db.ts
    - src/registry/registry.ts
    - src/registry/registry.test.ts
  modified: []

key-decisions:
  - "sourcemap: false in vite.config.ts — master devtools-hygiene switch, must never be toggled true"
  - "@babel/standalone@^7.26 pinned as runtime dep (not devDep) so Phase 2 eager-load works; v7 keeps classic-runtime default"
  - "jsdom explicit devDep required by Vitest 4 (dropped auto-install); set as environment:jsdom in vite.config.ts test block"
  - "Navigator.storage.persist() guarded with typeof check — jsdom lacks navigator.storage; guard required for tests"
  - "logger gate read once at module load via IIFE with try/catch; no live toggling; localStorage access can throw in strict privacy"
  - "All three jsdom gaps handled in src/test/setup.ts: fake-indexeddb/auto, matchMedia stub, jest-dom matchers"
  - "Task 3 implementation was created during Task 2 setup (needed for typecheck); tests written in Task 3 confirmed GREEN immediately"

patterns-established:
  - "Pattern: All logging goes through src/lib/logger.ts — no direct console.* calls anywhere else"
  - "Pattern: Registry callers always await dbReady before get/put/del"
  - "Pattern: CSS variables defined on :root[data-theme=light|dark]; FOUC script sets data-theme before React mounts"
  - "Pattern: Neutral naming throughout — no synthesize/AI/generate/fake/mock in identifiers, CSS, or copy"

requirements-completed: [LOOP-03, HYGIENE-04, SEC-04, HYGIENE-01, HYGIENE-02]

# Metrics
duration: 7min
completed: 2026-06-24
---

# Phase 01 Plan 01: Scaffold + Walking Skeleton Summary

**Vite 8 + React 19.2 + TypeScript strict SPA scaffold with IndexedDB probe+Map fallback registry, gated [Marketplace] logger, CSP meta tag, FOUC blocking theme script, and sourcemaps-off production build — all 16 tests green**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-24T22:32:41Z
- **Completed:** 2026-06-24T22:39:41Z
- **Tasks:** 3
- **Files created:** 17

## Accomplishments

- Greenfield SPA scaffold: `npm run dev` serves, `npm run build` produces clean bundle with no `.map` files, `npx tsc --noEmit` passes strict TypeScript
- IndexedDB registry with real probe write+delete at startup; degrades to in-memory `Map` fallback with identical async interface; 16 tests cover both paths
- Gated logger silent by default; `[Marketplace]` prefix active when `localStorage.debug` is truthy; zero direct `console.*` calls outside `src/lib/logger.ts`
- CSP meta tag with exact `connect-src 'self' https://api.anthropic.com` clause; FOUC-blocking inline script reads `marketplace.theme` and sets `data-theme` before React mounts
- All three Vitest jsdom gaps patched in `src/test/setup.ts`: `fake-indexeddb/auto`, `window.matchMedia` stub, `@testing-library/jest-dom/vitest` matchers

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold project, install dependencies, wire build + test config** - `5ae03cd` (feat)
2. **Task 2: index.html, main.tsx, App.tsx skeleton, CSS variables, test setup** - `58a4d4f` (feat)
3. **Task 3: Logger tests + registry tests (TDD GREEN)** - `98809e2` (test)

## Files Created/Modified

- `package.json` — runtime deps (react, react-dom, idb, @babel/standalone@^7.26, lucide-react) + dev deps (vite@^8, vitest@^4, jsdom@^29 explicit, fake-indexeddb@^6, testing-library)
- `tsconfig.json` — strict:true, ES2020, react-jsx automatic runtime, noUncheckedIndexedAccess
- `tsconfig.node.json` — for vite.config.ts typing
- `vite.config.ts` — sourcemap:false, minify, es2020, test block with jsdom + setupFiles
- `.gitignore` — node_modules, dist, editor/OS noise
- `index.html` — CSP meta, FOUC blocking script, #root div
- `src/main.tsx` — createRoot render
- `src/App.tsx` — Walking Skeleton: kicks registry init via dbReady on mount
- `src/index.css` — full CSS variable contract (10 vars × 2 themes) + base body styles
- `src/vite-env.d.ts` — Vite client types reference
- `src/test/setup.ts` — fake-indexeddb/auto, matchMedia stub, jest-dom matchers
- `src/lib/logger.ts` — gated logger (off by default, [Marketplace] prefix)
- `src/lib/logger.test.ts` — 8 tests: gate-off silence + gate-on prefix behavior
- `src/lib/storage.ts` — STORAGE_KEY_API + STORAGE_KEY_THEME neutral constants
- `src/registry/db.ts` — RegistrySchema + openRegistry with apps/widgets/handlers stores
- `src/registry/registry.ts` — dbReady promise, probe write+delete, navigator.storage guard, Map fallback, get/put/del async interface
- `src/registry/registry.test.ts` — 8 tests: happy path (fake-indexeddb), fallback path (stubbed openRegistry), navigator.storage guard

## Decisions Made

- `@babel/standalone@^7.26` pinned as a **runtime** dep — Phase 2 eager-loads it; v7 keeps the classic-runtime default that Phase 2 depends on (Babel 8 flips to automatic runtime which breaks the `new Function` scope)
- `jsdom` installed as explicit **devDep** per Vitest 4 breaking change (Pitfall 1 in RESEARCH.md)
- `navigator.storage?.persist()` guarded with `typeof` check — jsdom has no `navigator.storage`; unguarded call would throw in tests
- Implementation files (logger.ts, storage.ts, db.ts, registry.ts) were created during Task 2 because App.tsx required them to typecheck; Task 3 TDD tests confirmed GREEN immediately — no RED phase needed since implementations were already correct

## Deviations from Plan

None — plan executed exactly as written. Implementation files were created slightly earlier (Task 2 instead of Task 3) because App.tsx imports from registry and logger and TypeScript strict mode would fail without them. This is not a deviation from intent — Task 3's TDD obligation was fulfilled with the test files and all 16 tests passing green.

## Issues Encountered

- Node 23.11.0 produces EBADENGINE warnings for jsdom@29 (requires ^20.19.0 | ^22.12.0 | >=24.0.0) — this is a warning, not an error; installation succeeded and tests pass normally.

## Known Stubs

- `src/App.tsx` — Walking Skeleton shell; will be replaced by full ThemeProvider+AppBar+Marketplace tree in Plan 02

## Threat Flags

None — all surfaces established in this plan were pre-planned in the threat model (T-01-01 through T-01-06). CSP, sourcemaps-off, gated logger, and neutral naming are all in place as designed.

## Next Phase Readiness

- Registry interface (`dbReady`, `get`, `put`, `del`) is ready for Plans 02-04 consumers
- CSS variable contract is in place for ThemeProvider (Plan 02)
- Logger is ready for all-phases use; no other module may call `console.*` directly
- Test infrastructure handles all three jsdom gaps; Plan 02 theme tests can use the matchMedia stub immediately
- `src/host/modelClient.ts` stub not yet created — Plan 02 can add it or defer to Plan 04

---

## Self-Check

Verifying claims before finalizing:

- [x] `vite.config.ts` exists and contains `sourcemap: false`
- [x] `package.json` has `@babel/standalone` in dependencies (not devDependencies)
- [x] `package.json` has `jsdom` in devDependencies
- [x] `index.html` contains `connect-src 'self' https://api.anthropic.com`
- [x] `index.html` contains FOUC script with `marketplace.theme`
- [x] `src/index.css` has ≥18 `--color-` declarations (actual: 22)
- [x] `src/test/setup.ts` imports `fake-indexeddb/auto` and defines `window.matchMedia`
- [x] `src/App.tsx` imports `dbReady` and `logger`
- [x] `src/registry/registry.ts` exports `dbReady`, `get`, `put`, `del` and guards `navigator.storage`
- [x] `src/registry/registry.ts` uses `"__probe__"` key for probe write+delete
- [x] `npx vitest run src/lib/logger.test.ts src/registry/registry.test.ts` exits 0 (16/16 passing)
- [x] `npx tsc --noEmit` exits 0
- [x] `npm run build` succeeds with no `.map` files in `dist/`
- [x] Commits 5ae03cd, 58a4d4f, 98809e2 exist in git log

## Self-Check: PASSED

*Phase: 01-hygiene-foundation-storefront-shell*
*Completed: 2026-06-24*
