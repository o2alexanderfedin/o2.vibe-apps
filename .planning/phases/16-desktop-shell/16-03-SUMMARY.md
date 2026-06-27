---
phase: 16-desktop-shell
plan: 03
subsystem: ui
tags: [react, desktop-shell, window-manager, css-animation, theme, vitest, rtl]

# Dependency graph
requires:
  - phase: 16-desktop-shell (16-01)
    provides: window chrome fixes (titlebar centering, hideClose) + glass z-layering scaffold
  - phase: 16-desktop-shell (16-02)
    provides: Dock, MenuBar, MinimalLauncher leaf components + iconForApp + chrome CSS
  - phase: 15-window-manager
    provides: WindowManagerProvider/useWindowManager, WindowFrame, the windowed open flow
provides:
  - DesktopShell root UI (WIN-08) — themed wallpaper + 4 animated blobs behind the windows + dock/menu-bar/launcher over them
  - Ported open flow (handleOpen/handleClose/storeComponent/handleModify) now owned by DesktopShell
  - Dock-driven focus/restore wiring (completes WIN-04 restore UI)
  - Menu-bar active-app name bound to the front-most window; KeyDialog reachable from the account control
  - Shared launcher-based test kit for the desktop open-flow suite
affects: [phase-16-04 (reduced-motion + transitions), phase-17 (full launcher replacing the minimal stub)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Root composition: ThemeProvider > VibeThemeProvider > ErrorBoundary > DesktopShell (ServicesProvider stays in main.tsx)"
    - "Self-contained provider: DesktopShell wraps its OWN WindowManagerProvider so it renders standalone in tests"
    - "Layer stack via z-order + isolation:isolate (no transform/filter on the window container) — Pitfall 3"
    - "Decorative CSS blobs (mix-blend screen, blur, staggered vibeFloat) bound to theme vars (--wall, --b1..--b4)"
    - "Launcher-based test open flow via a shared desktopShellTestKit (replaces storefront-card clicks)"

key-files:
  created:
    - src/ui/DesktopShell.tsx
    - src/ui/DesktopShell.test.tsx
    - src/ui/desktopShellTestKit.tsx
  modified:
    - src/App.tsx
    - src/ui/AppBar.tsx
    - src/index.css
    - src/ui/Marketplace.test.tsx
    - src/ui/MarketplaceDelegated.test.tsx
    - src/ui/MarketplaceFixtures.test.tsx
    - src/ui/MarketplaceGuardrails.test.tsx
    - src/ui/MarketplaceModify.test.tsx
    - src/ui/MarketplaceResilience.test.tsx
    - src/ui/MarketplaceWidgets.test.tsx
    - src/ui/MarketplaceWindows.test.tsx
  deleted:
    - src/ui/Marketplace.tsx

key-decisions:
  - "Deleted Marketplace.tsx outright (plan Option B) — DesktopShell ports the full open flow; keeping a slim Marketplace would duplicate machinery as dead code and break its card-click tests"
  - "Created a shared desktopShellTestKit.tsx so all 8 migrated open-flow files share ONE launcher-based open surface and ONE render wrapper (least churn, no lost coverage)"
  - "Migrated 'storefront stays browsable' assertions to 'the launcher still lists app X' (expectLauncherLists) — the windowed equivalent of the old browsable-grid check"
  - "Wrapped the migrated render helper in VibeThemeProvider because MenuBar renders the relocated ThemeSelector, which calls useVibeTheme()"

patterns-established:
  - "DesktopShell = root layout owning the open flow; leaf chrome (Dock/MenuBar/MinimalLauncher) stays pure props-injection"
  - "Active window = highest-z non-minimized entry; feeds the menu-bar name"

requirements-completed: [WIN-08]

# Metrics
duration: 22min
completed: 2026-06-26
---

# Phase 16 Plan 03: DesktopShell Assembly Summary

**The flat storefront is replaced by the Vibe OS desktop: a themed wallpaper + four animated blob layers behind a windowed open flow, with the dock, menu bar, and minimal launcher wired over it — every windowing/MOD/key-dialog behavior preserved with zero regression (627 tests green).**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-06-26T18:45:00Z
- **Completed:** 2026-06-26T18:56:00Z
- **Tasks:** 3 completed
- **Files modified:** 14 (3 created, 10 modified, 1 deleted)

## Accomplishments
- `DesktopShell` is the new root UI (WIN-08): wallpaper (`var(--wall)`) + 4 staggered `vibeFloat` blobs at z 0, the `.desktop` window container at z 100 (`isolation:isolate`, no transform/filter), and the dock + menu bar at z 9000.
- Ported the proven open flow verbatim (`handleOpen`/`handleClose`/`storeComponent`/`handleModify` + fallbacks), preserving Pitfall 8 (zero-leak close) and Pitfall 9 (mid-flight `isOpenByInstance` guard).
- Completed the WIN-04 restore UI: a dock icon click focuses a window, and clicking a minimized window's dock icon restores it; the menu-bar active-app name tracks the front-most window; the KeyDialog is reachable from the menu-bar account control.
- Migrated all 8 `Marketplace*.test.tsx` files to render `DesktopShell` and open via the launcher through one shared `desktopShellTestKit`, with no coverage lost, plus a new 7-behavior `DesktopShell.test.tsx`.

## Task Commits

Each task was committed atomically:

1. **Task 1: DesktopShell root layout + ported open flow + leaf wiring** - `b11481d` (feat)
2. **Task 2: Wallpaper + animated blob CSS** - `9274e27` (style)
3. **Task 3: Rewire App root; strip grid + ThemeSelector; migrate tests** - `cba0aa9` (feat)

_Plan metadata commit follows this SUMMARY._

## Files Created/Modified
- `src/ui/DesktopShell.tsx` (created) - Root desktop layout owning the ported open flow; wallpaper + 4 blobs + windows + dock + menu bar + launcher + KeyDialog; self-contained WindowManagerProvider.
- `src/ui/DesktopShell.test.tsx` (created) - 7 integration behaviors: blobs render, launcher-open mints window+dock entry, dock focus/restore (WIN-04), zero-leak close, account→KeyDialog, active-app name, ⋮ remove.
- `src/ui/desktopShellTestKit.tsx` (created) - Shared render wrapper (ServicesProvider>VibeThemeProvider>DesktopShell) + launcher-based `openApp`/`expectLauncherLists` + pointer-capture stubs + frame/dock helpers.
- `src/App.tsx` (modified) - Mounts `<DesktopShell/>`; drops the outer WindowManagerProvider, AppBar, Marketplace, and App-level KeyDialog state; keeps ThemeProvider>VibeThemeProvider>ErrorBoundary + dbReady.
- `src/ui/AppBar.tsx` (modified) - Removed the `ThemeSelector` import + element (relocated to MenuBar); kept the Account button + light/dark/system toggle.
- `src/index.css` (modified) - Appended `.desktop-shell` wallpaper, `@keyframes vibeFloat`, blob base + 4 positioned blobs; confirmed `.desktop` retains z 100 + isolation and no transform/filter.
- `src/ui/Marketplace*.test.tsx` (8 modified) - Re-pointed to DesktopShell via the test kit; storefront-card opens → launcher opens; browsable assertions → launcher-listing assertions.
- `src/ui/Marketplace.tsx` (deleted) - Superseded by DesktopShell (open flow ported); no production or test code imports it.

## Decisions Made
- **Delete Marketplace.tsx (plan Option B).** The plan's hard gate is `grep -c "storefront-grid" src/ui/Marketplace.tsx == 0`, and DesktopShell ports the entire open flow. Keeping a slimmed Marketplace would either retain the grid (fails the gate) or duplicate the windowing machinery as dead code while leaving its card-click tests broken. Deleting it and re-pointing the 8 test files to DesktopShell is the least-churn path that keeps the full suite green. `marketplaceUtils.ts` (rankPopular/titleCase) survives — it is independently used by `loader.ts`.
- **Shared `desktopShellTestKit`.** Centralizes the launcher-based open and the VibeThemeProvider-wrapped render so the migration touched each test file's header only, not its assertions.

## Deviations from Plan

None — plan executed as written. The plan explicitly enumerated the test-migration choice (Option B); selecting and documenting it is the planned path, not an unplanned deviation.

## Issues Encountered
- **`TestServicesOverrides` type lost on import trim (Task 3).** `MarketplaceWidgets.test.tsx` keeps a local `servicesForComposedApp(): TestServicesOverrides` helper; trimming the value imports also dropped the type. Re-added a `import type { TestServicesOverrides }` line. Caught by `tsc --noEmit` before the suite run; fixed and re-verified green.

## Known Stubs
- `MinimalLauncher` remains the deliberate minimal stub from 16-02 (CONTEXT decision 4); Phase 17 replaces it with the full launcher. Not a blocking stub — it is a working launch surface and the documented future-plan owner is Phase 17.

## Verification
- `npx vitest run src/ui/DesktopShell.test.tsx` → 7/7 green
- `npx vitest run` → 77 files, 627 tests green (no regression; all 8 migrated Marketplace suites green)
- `npx tsc --noEmit` → exit 0
- `npx vitest run src/hygiene.test.ts` → green (DesktopShell.tsx + new CSS carry no banned tokens)
- `npm run build` → succeeds; `ls dist/assets/*.map` → none (source maps off, hygiene preserved)

## Self-Check: PASSED
- src/ui/DesktopShell.tsx — FOUND
- src/ui/DesktopShell.test.tsx — FOUND
- src/ui/desktopShellTestKit.tsx — FOUND
- src/ui/Marketplace.tsx — DELETED (intentional)
- Commit b11481d — FOUND
- Commit 9274e27 — FOUND
- Commit cba0aa9 — FOUND
