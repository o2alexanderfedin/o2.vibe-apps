---
phase: 19-window-chrome-menu-relocation
plan: "02"
subsystem: ui
tags: [chrome, maximize, window-management, tdd, work-area]
dependency_graph:
  requires: [CHROME-01]
  provides: [CHROME-02]
  affects: [useWindowManager, WindowFrame, DesktopShell]
tech_stack:
  added: []
  patterns: [z-mint-outside-updater, ref-mirror-live-read, transform-only-position, work-area-geometry]
key_files:
  created: []
  modified:
    - src/ui/useWindowManager.tsx
    - src/ui/useWindowManager.test.tsx
    - src/ui/WindowFrame.tsx
    - src/ui/WindowFrame.test.tsx
    - src/ui/DesktopShell.tsx
    - src/ui/MarketplaceWindows.test.tsx
    - src/ui/Dock.test.tsx
decisions:
  - "Maximize = zoom-to-work-area (viewport minus 40px menu bar minus 88px dock reserve), NOT the OS Fullscreen API — menu bar + dock stay visible (CHROME-02 anti-feature: full-screen hides the product identity)"
  - "Both maximize AND unmaximize mint z outside the setState updater (raise the window), matching the focus/restore Strict-Mode purity rule"
  - "Drag is gated while maximized via an early-return before onFocus()/handlePointerDown — the simplest CONTEXT.md path (disable drag while maximized for v1)"
  - "activeId() reads a live windowsRef mirror so an event-handler caller resolves the front-most window synchronously without a stale closure (needed by Wave-3 keyboard shortcuts)"
  - "DesktopShell resolves the work-area rect (it owns the menu-bar/dock layout constants); the manager carries only the maximized toggle + restoreRect, keeping the geometry concern in one place"
  - "Maximized frame applies an explicit width/height inline style ONLY when maximized; the non-maximized path stays transform-only + CSS-min so the existing 727 position/drag tests are byte-identical"
metrics:
  duration: "~7 minutes"
  completed: "2026-06-27"
  tasks_completed: 3
  files_changed: 7
---

# Phase 19 Plan 02: Maximize Work Area Summary

**One-liner:** Added maximize = zoom-to-work-area (viewport minus menu bar minus dock, not OS full-screen) toggled via the now-enabled green traffic-light and titlebar double-click, with drag gated while maximized and prior geometry restored on un-maximize.

## Tasks Completed

| Task | Name | Commits (RED → GREEN) | Files |
|------|------|------------------------|-------|
| 1 | WindowEntry.maximized + restoreRect + maximize/unmaximize/activeId in the manager | 14facd3 (test) → aa6f7ab (feat) | useWindowManager.tsx, useWindowManager.test.tsx, Dock.test.tsx |
| 2 | WindowFrame max button + double-click + drag gating | 2ef8f31 (test) → 3596765 (feat) | WindowFrame.tsx, WindowFrame.test.tsx |
| 3 | workArea() geometry + maximize wiring in DesktopShell; integration test | 41f97f6 (test) → 2fbcdb2 (feat) | DesktopShell.tsx, MarketplaceWindows.test.tsx |

## What Was Built

- **useWindowManager.tsx**: `WindowEntry` gains `maximized: boolean` + `restoreRect: {x,y,w,h} | null`. `open()` defaults both (`false`/`null`). New `maximize(id)` captures the entry's current x/y into `restoreRect` (w/h = `DEFAULT_W/DEFAULT_H`), sets `maximized: true`, and mints z outside the updater (raise). `unmaximize(id)` clears `maximized` and mints a fresh z; `restoreRect` is left intact for DesktopShell to read. New `activeId()` reads a live `windowsRef` mirror → highest-z non-minimized id, or `null`. All three are exposed on `WindowManagerValue` + the `value` object.
- **WindowFrame.tsx**: `WindowFrameProps` gains `maximized` + `onMaximize` (+ optional `w`/`h` for the maximized rect). The green max traffic-light is no longer `disabled`; its `onClick` calls `e.stopPropagation()` then `onMaximize()`. The titlebar div gains `onDoubleClick={onMaximize}`. Drag is gated while maximized: the titlebar `onPointerDown` early-returns `if (maximized)` before `onFocus()`/`handlePointerDown`. When maximized, the frame applies an explicit `width`/`height` inline style and a `.window-chrome--maximized` marker class; the non-maximized branch stays transform-only + CSS-min.
- **DesktopShell.tsx**: Added module-level `MENU_BAR_H = 40` / `DOCK_RESERVE = 88` constants and a `workArea()` helper returning `{ x: 0, y: 40, w: innerWidth, h: innerHeight - 40 - 88 }`. In the window map, a maximized entry derives x/y/w/h from `workArea()` (ignoring the drag positions override / cascade); a non-maximized entry renders unchanged. `onMaximize` is wired per entry to toggle `unmaximize`/`maximize` by `entry.maximized`.
- **Tests**: 5 manager cases (defaults, maximize captures prior x/y, unmaximize clears, maximize raises z, activeId resolution + null-when-all-minimized); 3 WindowFrame cases (enabled max button calls onMaximize, double-click calls onMaximize, drag suppressed while maximized); 1 integration case (double-click fills the work area at (0,40) with the explicit work-area width/height, `.menu-bar` + `.dock` stay present, second double-click restores prior geometry + clears explicit size).

## Verification Results

- `npm test` — 734 tests, 83 files, all pass (+9 from the Wave-1 baseline of 725: 5 manager + 3 WindowFrame + 1 integration)
- `npm run typecheck` (`tsc --noEmit`) — 0 errors
- `npm test -- src/hygiene.test.ts src/csp.test.ts` — 13 tests pass (no banned tokens, including iframe/sandbox/isolation, in new identifiers; CSP/FOUC hash untouched)
- `grep -c maximized src/ui/useWindowManager.tsx` → 7 (≥3); `restoreRect` → 6 (≥2); `activeId` → 4 (≥2); `const z = ++zTop` → 5 (baseline 3 + 2 for maximize/unmaximize)
- `grep -c disabled src/ui/WindowFrame.tsx` → 0 (max button enabled); `onMaximize` → 4 (≥3); `onDoubleClick` → 1; `if (maximized) return` → 1
- `grep -c workArea src/ui/DesktopShell.tsx` → 3 (≥2); `MENU_BAR_H` → 4 with `MENU_BAR_H = 40` matching `.menu-bar { height: 40px }` (src/index.css:896); `onMaximize` → 1
- No new npm dependencies

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dock.test.tsx WindowEntry fixture missing the two new required fields**
- **Found during:** Task 1 (typecheck after adding `maximized`/`restoreRect` to `WindowEntry`)
- **Issue:** `Dock.test.tsx`'s `makeWindow` factory builds a typed `WindowEntry` literal; the two new required fields broke `tsc` with TS2322.
- **Fix:** Added `maximized: false, restoreRect: null` to the `makeWindow` defaults.
- **Files modified:** src/ui/Dock.test.tsx
- **Commit:** aa6f7ab

## Known Stubs

None — all wiring is complete. The manager ops connect through `WindowFrame` props to `DesktopShell`'s `workArea()`-driven geometry; double-click and the green traffic-light both toggle maximize/restore end-to-end (asserted by the integration test).

## Threat Flags

No new security-relevant surface. The new geometry constants + maximize markers (`maximized`, `restoreRect`, `workArea`, `MENU_BAR_H`, `DOCK_RESERVE`, `window-chrome--maximized`) carry no banned lexicon and no iframe/sandbox/isolation word — hygiene gate confirmed green (T-19-04 mitigated). `restoreRect` is captured at maximize time from the entry's own x/y, and the integration test asserts restore returns to the prior geometry (T-19-05 mitigated). Maximize is pure local state with no network/model involvement (T-19-06 accept).

## Self-Check: PASSED

- src/ui/useWindowManager.tsx — exists, contains "maximized" (7), "restoreRect" (6), "activeId" (4)
- src/ui/WindowFrame.tsx — exists, contains "onMaximize" (4), "onDoubleClick" (1), 0 "disabled"
- src/ui/DesktopShell.tsx — exists, contains "workArea" (3), "MENU_BAR_H = 40"
- Commit 14facd3 (test RED, Task 1) — verified in git log
- Commit aa6f7ab (feat GREEN, Task 1) — verified in git log
- Commit 2ef8f31 (test RED, Task 2) — verified in git log
- Commit 3596765 (feat GREEN, Task 2) — verified in git log
- Commit 41f97f6 (test RED, Task 3) — verified in git log
- Commit 2fbcdb2 (feat GREEN, Task 3) — verified in git log
- Full suite: 734 tests green; tsc: 0 errors; hygiene + CSP gates green
