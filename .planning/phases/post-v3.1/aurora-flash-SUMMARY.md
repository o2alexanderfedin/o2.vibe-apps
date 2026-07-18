---
phase: post-v3.1
plan: aurora-flash-fix
subsystem: theme
tags: [bug-fix, tdd, fouc, custom-theme, vitest, playwright]
dependency_graph:
  requires: [VibeThemeProvider, index.html FOUC script, SMOKE-02]
  provides: [readStoredCustomVars, no-Aurora-flash-on-reload]
  affects: [VibeThemeProvider.tsx, VibeThemeProvider.test.tsx, e2e/smoke.spec.ts]
tech_stack:
  added: []
  patterns: [localStorage-mirror-as-gap-fallback]
key_files:
  modified:
    - src/ui/VibeThemeProvider.tsx
    - src/ui/VibeThemeProvider.test.tsx
    - e2e/smoke.spec.ts
decisions:
  - Read the localStorage mirror the FOUC script already writes instead of adding a new synchronous IDB path
  - Scope the fix to the final-else branch and currentVars memo only; do not touch setTheme, broadcastTheme, FOUC script, or buildSrcdoc
  - Keep readStoredCustomVars as a module-level pure function (no React dependency) for testability
metrics:
  duration: ~15 minutes
  completed: 2026-06-30
  tsc_errors: 0
  vitest_tests: 939
  e2e_tests: 6
---

# Aurora Flash Fix Summary

**One-liner:** Eliminate the post-hydration Aurora flash for active custom themes on reload by reading the localStorage FOUC mirror as the IDB-gap fallback in the apply-effect and currentVars memo.

## The Defect (R-FLASH-01)

On hard reload with an active custom theme (`marketplace.osTheme = "custom:foo"` and `vibe.customTheme.foo` set):

1. The FOUC inline script in `index.html` correctly paints the custom vars on `:root` **before** React mounts.
2. React mounts; `VibeThemeProvider`'s apply-effect fires synchronously.
3. At this moment, `customThemesState` is an empty `Map` (its source `refreshCustomThemes` is async — awaits IDB) **and** `pendingCustomVarsRef.current` is `null` (fresh mount, no `setTheme` call).
4. The apply-effect hit the final `else` and applied `VIBE_THEMES["aurora"]` (#f3f1ff) **over** the correct custom value — an Aurora flash — until the async IDB read resolved and re-applied the custom vars.
5. The `currentVars` memo had the same Aurora fallback in the gap (affected any frame opened during the gap).

SMOKE-02 false-passed because it waited 1500ms for IDB to resolve before asserting, so the Aurora flash was gone by assertion time.

## The Fix

`readStoredCustomVars(name: string): Record<string, string> | null` — reads `localStorage["vibe.customTheme." + name]`, parses with full defensive guards (try/catch, non-object/array rejection mirroring T-22-01), and returns null on any failure.

**Apply-effect final else branch** (was: `applyVarsToRoot(VIBE_THEMES[DEFAULT_THEME])`):
```
const ls = readStoredCustomVars(name);
if (ls !== null) { applyVarsToRoot(ls); }
else { applyVarsToRoot(VIBE_THEMES[DEFAULT_THEME]); }
```

**currentVars memo** (was: `customThemesState.get(name) ?? VIBE_THEMES[DEFAULT_THEME]`):
```
customThemesState.get(name) ?? readStoredCustomVars(name) ?? VIBE_THEMES[DEFAULT_THEME]
```

When `refreshCustomThemes` later resolves from IDB, the state branch takes over with identical values — no visible change, no flash. The FOUC script, `setTheme`, `broadcastTheme`, and `buildSrcdoc` are not changed.

## Tests (TDD)

**Unit tests added to `VibeThemeProvider.test.tsx`:**

| Test | Phase | Result |
|------|-------|--------|
| AURORA-FLASH-01: apply-effect uses localStorage mirror, not Aurora, during IDB gap | RED → GREEN | Catches the defect |
| AURORA-FLASH-02: apply-effect falls back to Aurora when mirror is absent (deleted theme) | GREEN both | Regression guard |
| AURORA-FLASH-03: currentVars uses localStorage mirror, not Aurora, during IDB gap | RED → GREEN | Catches currentVars gap |

**SMOKE-02 strengthened in `e2e/smoke.spec.ts`:**

- **Sub-test A (FOUC script alone, JS blocked):** Aborts all `**/*.js` module requests via `page.route`, reloads with `waitUntil: "domcontentloaded"`, asserts `document.documentElement.style.getPropertyValue("--text")` equals the custom value. This sub-test **FAILS** if the FOUC custom-theme branch is removed from `index.html`. Previously the test had no such assertion — FOUC could have been broken and the test would still pass.
- **Sub-test B (full hydration):** Renamed misleading `textAtFouc` → `textAfterFullLoad` (it measured the final state after full hydration, not at FOUC time). Added `textStableAfterHydration` for the settle-phase assertion.

## Verification Gate Results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 939 passed (0 failed) |
| `npm run e2e` | 6 passed (0 failed) |

## Commits

| Hash | Message |
|------|---------|
| e38fa9e | fix(theme): prevent Aurora flash on custom-theme reload during IDB gap |
| 66f8a8f | fix(e2e): strengthen SMOKE-02 to genuinely verify FOUC and no post-hydration flash |

## Deviations from Plan

None — plan executed exactly as specified.

## Known Stubs

None.

## Threat Flags

None. The new `readStoredCustomVars` function is a pure read of an existing localStorage key (`vibe.customTheme.<name>`) that was already set by the existing `ThemeEditor` save path and read by the existing FOUC inline script. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- `src/ui/VibeThemeProvider.tsx` — modified (readStoredCustomVars + apply-effect + currentVars) ✓
- `src/ui/VibeThemeProvider.test.tsx` — modified (3 new AURORA-FLASH tests) ✓
- `e2e/smoke.spec.ts` — modified (SMOKE-02 split into sub-test A + B, textAtFouc renamed) ✓
- Commit e38fa9e exists ✓
- Commit 66f8a8f exists ✓
- tsc: 0 errors ✓
- vitest: 939 passed ✓
- e2e: 6 passed ✓
