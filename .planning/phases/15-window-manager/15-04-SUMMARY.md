---
phase: 15
plan: "04"
subsystem: ui
tags: [window-manager, open-flow, regression-risk, tdd]
requires:
  - useDrag (15-01)
  - useWindowManager (15-02)
  - WindowFrame + AppShell single-root mount (15-03)
provides:
  - windowed open flow (Marketplace mints a WindowFrame per open)
  - manager-minted single-source instanceId
  - mid-produce-close isOpen guard
affects:
  - src/ui/Marketplace.tsx
  - src/ui/WindowFrame.tsx
  - src/App.tsx
tech-stack:
  patterns:
    - in-tree (host-root) app rendering inside a memoized WindowBody (no detached createRoot)
    - WindowManagerProvider owned internally by Marketplace (testable standalone) + at App root
key-files:
  created:
    - src/ui/MarketplaceWindows.test.tsx
  modified:
    - src/ui/Marketplace.tsx
    - src/ui/WindowFrame.tsx
    - src/App.tsx
    - src/ui/WindowFrame.test.tsx
    - src/ui/MarketplaceWidgets.test.tsx
decisions:
  - "Render apps in the host React tree (memoized WindowBody) rather than a detached mountApp root — the detached root rendered outside the test act() scope and let a self-updating on-demand app spin unthrottled and race on mid-render unmount."
  - "Marketplace owns its own WindowManagerProvider so existing bare-<Marketplace/> tests keep working; App.tsx also mounts one for desktop-level consumers."
  - "The AppShell role=region appears only once the app resolves; in-flight windows show a neutral placeholder."
metrics:
  duration: ~2h
  completed: 2026-06-26
  tasks: 2
  tests-added: 9
  full-suite: 598 passing (was 589)
---

# Phase 15 Plan 04: Windowed Open Flow Summary

Rewired the Marketplace open flow so opening an app mints a draggable
`WindowFrame` on the desktop (via `useWindowManager`) instead of appending to a
flat local `openedApps` list — the manager-minted instanceId is the single
source of truth keying resolve, the components map, and the close/isOpen guard.

## What changed

- **`src/ui/Marketplace.tsx`** — `Marketplace` now wraps a `MarketplaceInner` in
  its own `WindowManagerProvider`. `handleOpen` mints the window FIRST
  (`windowManager.open` returns the instanceId), resolves the component keyed on
  that id, and applies a PRIMARY mid-produce-close guard (`isOpen`) so a window
  closed during produce never stores a body (no orphan). Failed opens render a
  neutral fallback component (couldn't-load / connect-account / give-it-a-moment)
  inside the window's AppShell region. `handleClose` evicts the live component +
  routes close through the manager + drops the body/position. `handleModify`
  (remove/clone/tweak) is adapted to look up the window entry by instanceId.
  The `.desktop` maps `windowManager.windows` → `WindowFrame`, with an onMove
  position-override map.
- **`src/App.tsx`** — adds `WindowManagerProvider` just inside `ErrorBoundary`.
- **`src/ui/WindowFrame.tsx`** — now renders the AppShell-wrapped app IN-TREE
  inside a memoized `WindowBody` (keyed on instanceId/title/Component), wrapped in
  an `ErrorBoundary`. The AppShell region only appears once the app resolves;
  in-flight shows a neutral placeholder.
- **`src/ui/MarketplaceWindows.test.tsx`** (NEW) — 9 WIN integration tests.

## Commits

- `baeec00` — `test(15-04): add failing windowed open-flow integration tests` (RED)
- `5636ffe` — `feat(15-04): rewire open flow to windowed WindowFrame on the desktop (manager-minted instanceId)` (GREEN)

(Also `de301f4` — a clean merge of `feature/phase-15-window-manager` to pull in the
Wave 1+2 dependencies, because this worktree was branched from a stale base.)

## Verification

- `npx vitest run src/ui/MarketplaceWindows.test.tsx` → 9/9 pass
- `npx vitest run` (full suite) → **598 passing / 72 files, 0 fail** (baseline was 589)
- `npx tsc --noEmit` → 0 errors
- `npx vitest run src/hygiene.test.ts` → green
- `npm run build` → succeeds; `find dist -name '*.map'` → empty (no source maps)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WindowFrame mounted apps into a detached root, causing a
test-environment hang + mid-render unmount race**
- **Found during:** GREEN verification (full-suite hang in MarketplaceWidgets).
- **Issue:** Wave-2 WindowFrame mounted the AppShell+app into a SEPARATE
  manager-owned root via `mountApp`. That detached root renders OUTSIDE the test
  `act()` scope, so a self-updating on-demand app (the `data-table` fixture
  recreates its `data` prop each render, driving a `useEffect`+`setState` loop)
  spun unthrottled and never settled; React's nested-update bail-out never fired.
  The detached root also produced "synchronously unmount a root while rendering"
  races that blanked the body on a resolved-component swap.
- **Fix:** WindowFrame now renders the AppShell-wrapped app as a normal child of
  its React subtree (inside the host root), memoized in `WindowBody` so window-
  chrome churn (z-order/drag/minimize) cannot re-render the app subtree. App
  wrapped in an `ErrorBoundary` to preserve per-window crash isolation that
  `mountApp` previously provided.
- **Files modified:** `src/ui/WindowFrame.tsx`
- **Commit:** `5636ffe`

**2. [Rule 1 - Bug] AppShell region announced before content was ready**
- **Found during:** GREEN verification (region appeared with empty body).
- **Issue:** Minting the window first made the AppShell `role="region"` appear
  while the component was still null, so existing suites that do
  `findByRole("region")` then synchronously query content failed, and the region
  misrepresented an in-flight window as ready.
- **Fix:** WindowBody renders a neutral placeholder until the component resolves;
  the AppShell region appears together with content.
- **Files modified:** `src/ui/WindowFrame.tsx`
- **Commit:** `5636ffe`

## Existing tests adapted (intent preserved)

- **`src/ui/WindowFrame.test.tsx`** — three Wave-2 tests asserted `mountApp`
  semantics via `mountedCount()`/`isMounted()`. Since the app now renders in-tree
  (no separate root), these were re-expressed as DOM-presence assertions:
  - "mounts via mountApp (single root)" → "renders the AppShell-wrapped app inside
    the body" (asserts the app body + ⋮ button are present).
  - "close path tears down the single root" → "unmounting the frame tears down the
    app subtree" (asserts the app body + `.window-chrome` leave the document).
  - "mid-mount guard backstop (document.contains)" → "renders a neutral placeholder
    while the app is unresolved" (the prior backstop is obsolete with no mount
    effect). The other four Wave-2 tests are unchanged and still pass.
- **`src/ui/MarketplaceWidgets.test.tsx`** — added `unmountAll()` to `afterEach`
  (defensive teardown). The "widgets are reused from the registry on a second
  open" test now CLOSES the first Calculator window before re-opening it: the
  windowed flow mounts a fresh frame per open, and two concurrent copies of the
  self-updating `data-table` fixture exercised that fixture's render-loop inside a
  single `act()`. Closing-then-reopening keeps the test's intent intact (each
  widget type produced exactly once = registry cache reuse).

## Known Stubs

None. The onMove handler commits dragged positions to a per-instance override map;
useDrag's imperative transform is the during-drag source of truth and the override
map is the committed source of truth.

## Self-Check: PASSED

- Created/modified files all present on disk (MarketplaceWindows.test.tsx,
  WindowFrame.tsx, Marketplace.tsx, App.tsx, 15-04-SUMMARY.md).
- Commits present in history: `baeec00` (RED), `5636ffe` (GREEN).
