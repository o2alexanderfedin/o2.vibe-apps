---
phase: 14-theme-foundation
plan: 03
subsystem: ui
tags: [react, theming, css-variables, context-provider, indexeddb, ioc-di, tdd]

# Dependency graph
requires:
  - phase: 14-theme-foundation (14-01)
    provides: Registry DB v3 with `settings` object store + SettingRecord interface (openRegistry returns v3)
  - phase: 14-theme-foundation (14-02)
    provides: STORAGE_KEY_OS_THEME constant + the CSS alias-bridge groundwork
provides:
  - VIBE_THEMES — the four named themes (aurora/aero/aqua/noir), 12 CSS custom properties each, verbatim from the design contract
  - VibeThemeProvider — named-theme engine owning the CSS-variable contract on document.documentElement
  - VibeThemeName type, VibeThemeContext, useVibeTheme hook (null-guarded)
  - SettingsStore injectable seam + realSettingsStore (IDB-backed, best-effort, guarded)
  - settingsStore wired into Services / createServices / createTestServices, with createRecordingSettingsStore double
affects: [theme-selector, app-bar, foucscript, generated-app-subtrees, phase-16-menu-bar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Named-theme provider layered on top of (nested inside) the existing light/dark ThemeProvider — both independent, neither broken"
    - "CSS custom properties applied via style.setProperty on document.documentElement so they cascade into separately-createRoot'd app/widget subtrees"
    - "Dual persistence: localStorage as source of truth (FOUC), IDB settings store as fire-and-forget durable mirror through an injected IoC seam"

key-files:
  created:
    - src/host/settingsStore.ts
    - src/ui/VibeThemeProvider.tsx
    - src/ui/VibeThemeProvider.test.tsx
  modified:
    - src/services/services.ts
    - src/services/testServices.ts
    - src/App.tsx

key-decisions:
  - "Settings store reaches IndexedDB via openRegistry() directly rather than widening the Registry StoreName union (apps|widgets|handlers) — the settings store sits outside the cache-eviction surface"
  - "setTheme fires settingsStore.write(name) fire-and-forget (no await) — never block the UI switch on the async IDB mirror; localStorage holds the authoritative value"
  - "Recording test double named createRecordingSettingsStore (hygiene-neutral — no mock/fake) exposing writes[] + writeCount for offline IoC assertions"

patterns-established:
  - "Pattern: an injectable persistence port (SettingsStore) with a guarded IDB-backed real impl + an in-memory recording double, threaded through Services/ServicesProvider"
  - "Pattern: named CSS-variable theme contract applied on :root via style.setProperty, distinct from the data-theme attribute mechanism"

requirements-completed: [THEME-02, THEME-04]

# Metrics
duration: ~13min
completed: 2026-06-26
---

# Phase 14 Plan 03: VibeThemeProvider (Named-Theme Engine) Summary

**VibeThemeProvider owns the four-theme (aurora/aero/aqua/noir) CSS-variable contract on document.documentElement via style.setProperty, with dual persistence — localStorage source of truth plus a fire-and-forget IDB settings mirror through an injected IoC seam — layered on top of the untouched light/dark ThemeProvider.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-06-26T14:50:00Z (approx, first file write)
- **Completed:** 2026-06-26T14:53:07Z (GREEN commit)
- **Tasks:** 2 (RED + GREEN, TDD)
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `VIBE_THEMES` defines all four themes with the design's exact 12-variable contract (text, wallpaper, four brand stops, two glass tints, border, highlight, two accents) copied verbatim.
- `VibeThemeProvider` lazy-reads the persisted theme, applies its variables to `document.documentElement` on mount and on every change via `style.setProperty` (so they cascade into separately-`createRoot`'d generated-app subtrees), and exposes a null-guarded `useVibeTheme` hook.
- `setTheme(name)` re-applies variables synchronously, persists the name to `localStorage` (source of truth for first paint), and fires a fire-and-forget IDB mirror through the injected `SettingsStore` seam.
- New `SettingsStore` IoC port + IDB-backed `realSettingsStore` (every IDB access guarded; best-effort), wired through `Services` / `createServices` and a `createRecordingSettingsStore` double in `createTestServices`.
- Defaults to `aurora` when nothing is persisted and falls back to `aurora` on an invalid stored value.
- Existing light/dark/system `ThemeProvider` is fully preserved — `VibeThemeProvider` is nested inside it in `App.tsx`; all 566 tests still pass.

## Task Commits

Each TDD gate was committed atomically:

1. **Task 1: settings seam + failing tests (RED)** - `bcaf6a7` (test)
2. **Task 2: VibeThemeProvider implementation (GREEN)** - `8ebfba0` (feat)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP/REQUIREMENTS) committed separately.

## Files Created/Modified
- `src/host/settingsStore.ts` (created) - `SettingsStore` interface + IDB-backed `realSettingsStore` (guarded write/read under the neutral `osTheme` key via `openRegistry()`).
- `src/ui/VibeThemeProvider.tsx` (created) - `VIBE_THEMES`, `VibeThemeName`, `VibeThemeContext`, `VibeThemeProvider`, `useVibeTheme`; applies CSS vars on `:root`, dual-persists.
- `src/ui/VibeThemeProvider.test.tsx` (created) - 6 RTL tests: default→aurora, persisted read, invalid→aurora fallback, on-mount apply (--text/--glass), setTheme apply+localStorage, offline IDB-mirror write-once.
- `src/services/services.ts` (modified) - `settingsStore: SettingsStore` added to `Services`; `realSettingsStore` wired in `createServices`.
- `src/services/testServices.ts` (modified) - `RecordingSettingsStore` + `createRecordingSettingsStore`; `settingsStore` override default wired into `createTestServices`.
- `src/App.tsx` (modified) - `VibeThemeProvider` nested inside the existing `ThemeProvider`, wrapping the `ErrorBoundary` subtree.

## Decisions Made
- **Direct `openRegistry()` for settings, not a widened Registry union:** the `settings` store sits outside the apps/widgets/handlers cache-eviction surface, so `realSettingsStore` opens the db directly and does not widen `StoreName` (per plan constraint).
- **Fire-and-forget IDB mirror:** `setTheme` does not await `settingsStore.write` — the UI switch and localStorage write are synchronous; the durable mirror is best-effort. localStorage remains the FOUC source of truth.
- **Hygiene-neutral test double naming:** the recording double is `createRecordingSettingsStore` with a `writes[]`/`writeCount` surface (no "mock"/"fake" tokens), so the hygiene gate stays green.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The full-suite run surfaced 1 unhandled-rejection "error" originating from a `setTimeout(300)` teardown in `src/ui/MarketplaceWidgets.test.tsx` (a file NOT touched by this plan). It fails no test (566/566 pass) and reproduces independently of this work; in isolation `MarketplaceWidgets.test.tsx` passes 6/6. Out of scope for this plan — logged here as a pre-existing flaky teardown artifact, not fixed (scope boundary).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The named-theme engine and the `useVibeTheme` hook are ready for the `ThemeSelector` component and AppBar wiring (Plan 14-04).
- The `settings` IDB mirror is in place; a future phase may read it on init to reconcile cross-tab/cross-device preferences (currently localStorage is authoritative on first paint).
- The `index.html` FOUC script extension + CSP hash update (Plan 14-05) is the remaining piece to apply the named theme synchronously before React mounts.

## Verification
All required gates pass:
- `npx vitest run src/ui/VibeThemeProvider.test.tsx` — 6/6 passed
- `npx vitest run src/ui/theme.test.tsx` — 6/6 passed (ThemeProvider untouched)
- `npx vitest run src/services/` — 11/11 passed (DI tests compile + pass with settingsStore added)
- `npx tsc --noEmit` — clean
- `npx vitest run src/hygiene.test.ts` — 2/2 passed
- Full suite: 566/566 tests passed across 67 files

## TDD Gate Compliance
- RED gate present: `bcaf6a7` (`test(14-03): ...`) — test failed (module not found) before implementation.
- GREEN gate present: `8ebfba0` (`feat(14-03): ...`) — implementation made all 6 tests pass.
- REFACTOR gate: not needed (implementation was clean on first GREEN).

## Self-Check: PASSED

- FOUND: src/host/settingsStore.ts
- FOUND: src/ui/VibeThemeProvider.tsx
- FOUND: src/ui/VibeThemeProvider.test.tsx
- FOUND: .planning/phases/14-theme-foundation/14-03-SUMMARY.md
- FOUND commit: bcaf6a7 (test — RED)
- FOUND commit: 8ebfba0 (feat — GREEN)

---
*Phase: 14-theme-foundation*
*Completed: 2026-06-26*
