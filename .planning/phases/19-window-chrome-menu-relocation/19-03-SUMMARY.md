---
phase: 19-window-chrome-menu-relocation
plan: "03"
subsystem: ui
tags: [chrome, snap, tiling, window-management, tdd, work-area, keyboard]
dependency_graph:
  requires: [CHROME-02]
  provides: [CHROME-03]
  affects: [useWindowManager, WindowFrame, DesktopShell]
tech_stack:
  added: []
  patterns:
    - z-mint-outside-updater
    - ref-mirror-live-read
    - work-area-geometry
    - half-rect-application
    - edge-detect-at-commit
    - global-keydown-effect
key_files:
  created: []
  modified:
    - src/ui/useWindowManager.tsx
    - src/ui/useWindowManager.test.tsx
    - src/ui/DesktopShell.tsx
    - src/ui/DesktopShell.test.tsx
    - src/ui/WindowFrame.tsx
    - src/index.css
    - src/ui/Dock.test.tsx
decisions:
  - "Snap stores a `snapSide: left|right|null` marker on WindowEntry (named ops snapLeft/snapRight, not a generic setRect) — matches CONTEXT.md/19-PATTERNS.md naming and gives Ctrl+Left/Right keyboard symmetry; the half-rect geometry is resolved in DesktopShell (same split-of-concern as maximize)"
  - "snapLeft/snapRight clear `maximized` (a window cannot be both maximized and snapped) and mint z OUTSIDE the setState updater (raise the window) — same Strict-Mode purity rule as maximize/focus"
  - "During-drag drop-zone preview is driven from WindowFrame's OWN onPointerMove (gated by a draggingRef) + an onEdgeChange callback — useDrag.ts is left BYTE-IDENTICAL so the 727 drag tests stay green (the lower-risk of the two plan-allowed approaches)"
  - "Edge detection at commit uses the committed x: x<=SNAP_THRESHOLD(20) → snapLeft; x+DEFAULT_FRAME_W(400) >= innerWidth-SNAP_THRESHOLD → snapRight; else the unchanged setPositions path"
  - "Snapped frame reuses Plan 02's explicit-rect mechanism: WindowFrame applies explicit w/h when `pinned = maximized || snapSide != null` (the maximized-only branch was generalized) and the window-map computes snapHalf(side) the same way it computes workArea() for maximize"
  - "Ctrl (NOT Cmd) is the snap modifier — Cmd is reserved for Plan 04's close/minimize; the keydown effect introduced here is documented as Plan 04's extension point so wave 4 adds Cmd/Ctrl+W/M to the SAME listener (no second global keydown)"
  - "preventDefault fires ONLY when activeId() is non-null — with no Vibe OS window active the handler is a no-op and never hijacks browser Ctrl+Arrow text navigation (T-19-08 mitigated)"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-27"
  tasks_completed: 3
  files_changed: 7
---

# Phase 19 Plan 03: Snap-to-Half Summary

**One-liner:** Added first-class half-tiling — dragging a window to the left/right screen edge shows a translucent work-area drop-zone preview and snaps the window to that half on release, with `Ctrl+Left`/`Ctrl+Right` snapping the active window without a drag; snapped geometry uses the work area (menu bar + dock stay visible), the same model as maximize.

## Tasks Completed

| Task | Name | Commits (RED → GREEN) | Files |
|------|------|------------------------|-------|
| 1 | snapSide on WindowEntry + snapLeft/snapRight in the manager | f59b82d (test) → 262ca90 (feat) | useWindowManager.tsx, useWindowManager.test.tsx, Dock.test.tsx |
| 2 | drop-zone overlay + edge-detection snap at drag commit + .desktop-snap-preview CSS | 2817c29 (test) → 263035b (feat) | DesktopShell.tsx, WindowFrame.tsx, index.css, DesktopShell.test.tsx |
| 3 | Ctrl+Left / Ctrl+Right snap the active window (no drag) | 0d153c3 (test) → 3c61732 (feat) | DesktopShell.tsx, DesktopShell.test.tsx |

## What Was Built

- **useWindowManager.tsx**: `WindowEntry` gains `snapSide: "left" | "right" | null`; `open()` defaults it to `null`. New `snapLeft(id)` / `snapRight(id)` callbacks set `snapSide`, clear `maximized` (a window cannot be both), capture the entry's current x/y into `restoreRect` (w/h = `DEFAULT_W/DEFAULT_H`), and mint a fresh z OUTSIDE the updater (raise to front). Both are exposed on `WindowManagerValue` + the returned `value`.
- **DesktopShell.tsx**: Module-level `SNAP_THRESHOLD = 20` and `DEFAULT_FRAME_W = 400` constants + a `snapHalf(side)` helper that returns the left/right HALF of `workArea()` (`{ x, y, w: round(wa.w/2), h: wa.h }`). New `snapPreview` useState. In the window map, a snapped entry derives x/y/w/h from `snapHalf(entry.snapSide)` (same rect-application path maximize uses via `area`). The per-frame `onMove` (drag commit) now checks edge proximity: `x <= SNAP_THRESHOLD → snapLeft`, `x + DEFAULT_FRAME_W >= innerWidth - SNAP_THRESHOLD → snapRight`, else the unchanged `setPositions`; it clears `snapPreview`. A new `onEdgeChange` prop drives `snapPreview` during the drag. A conditional `.desktop-snap-preview desktop-snap-preview--{side}` overlay renders above the windows, below the dock/menu-bar. A new global keydown `useEffect` (mount add / unmount remove) snaps the active window on `Ctrl+ArrowLeft`/`ArrowRight` via `activeId()` + `snapLeft/snapRight`, calling `preventDefault` only when a window is active — documented as Plan 04's extension point.
- **WindowFrame.tsx**: `WindowFrameProps` gains `snapSide` + `onEdgeChange`. The explicit width/height inline style now applies when `pinned = maximized || snapSide != null` (the maximized-only condition was generalized), and a `window-chrome--snap-{side}` marker class is added. During a titlebar drag (tracked by `draggingRef`, set on pointerdown / cleared on pointerup), `onPointerMove` reports edge proximity through `reportEdge(clientX)` → `onEdgeChange(side)`, de-duplicated by `lastEdgeRef` so the parent is only notified on a side change. `useDrag.ts` was NOT touched — its `onCommit` contract and the 727 drag tests are byte-identical.
- **index.css**: `.desktop-snap-preview` (+ `--left` / `--right`) — a `position: fixed` overlay within the work area (`top: 40px` menu bar, `bottom: 88px` dock reserve), `width: 50vw`, translucent + theme-aware (`var(--glass)` / `var(--hi)`), rounded, `pointer-events: none`, `z-index: 8000` (above the window stack, below the dock/menu-bar at 9000). All class names + copy carry no banned token and no iframe/sandbox/isolation word.
- **Tests**: 5 manager cases (snapSide default null; snapLeft sets side + captures restoreRect; snapRight sets side; snapping clears maximized; snapLeft raises z); 2 edge-drag integration cases (drag to left/right edge snaps to the work-area half, menu bar + dock stay present); 3 keyboard cases (Ctrl+ArrowLeft snaps left + preventDefault; Ctrl+ArrowRight snaps right; no-window Ctrl+ArrowLeft is a harmless no-op with no preventDefault).

## Verification Results

- `npx vitest run` — **744 tests, 83 files, all pass** (+10 over the Plan 02 baseline of 734: 5 manager + 2 edge-drag + 3 keyboard).
- `npm run typecheck` (`tsc --noEmit`) — **0 errors**.
- `npx vitest run src/hygiene.test.ts src/csp.test.ts` — green (no banned tokens, including iframe/sandbox/isolation, in the new identifiers/classes; CSP/FOUC hash untouched).
- `npm run build` — clean; **0 source-map files** in `dist`. (Pre-existing chunk-size warning for the full Babel bundle is unchanged and out of scope.)
- This plan's added lines (`f59b82d~1..HEAD`) contain **none** of `iframe` / `sandbox` / `isolation` / `synthesi`.
- Acceptance greps:
  - `snapSide` in useWindowManager.tsx → 5 (≥3); `snapLeft|snapRight` → 7 (≥4); `maximized: false` → 4 (both snap callbacks clear it).
  - `snapPreview` in DesktopShell.tsx → 3 (≥3); `SNAP_THRESHOLD` → 7 (≥2); `snapLeft|snapRight` → 2 (≥2); `ArrowLeft|ArrowRight` → 2 (≥2); `preventDefault` → 3 (≥1); `activeId` → 1 (≥1).
  - `desktop-snap-preview` in index.css → 3 (base + left + right).
  - `onCommit` in useDrag.ts → unchanged (useDrag not in the diff).
- No new npm dependencies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dock.test.tsx WindowEntry fixture missing the new required `snapSide` field**
- **Found during:** Task 1 (typecheck after adding `snapSide` to `WindowEntry`).
- **Issue:** `Dock.test.tsx`'s `makeWindow` factory builds a typed `WindowEntry` literal; the new required field broke `tsc` with TS2741 (mirrors the same Plan 02 fixture fix for `maximized`/`restoreRect`).
- **Fix:** Added `snapSide: null` to the `makeWindow` defaults.
- **Files modified:** src/ui/Dock.test.tsx
- **Commit:** 262ca90

### Implementation Choices (within plan-allowed latitude)

- **During-drag preview driven from WindowFrame, not useDrag.** The plan explicitly allowed either adding an `onEdge` callback to `useDrag` OR deriving the preview from the frame's own pointermove. Chose the latter (frame `onPointerMove` + `draggingRef` gate + `onEdgeChange` prop) so `useDrag.ts` stays byte-identical and the 727 drag tests have zero regression risk. `useDrag.ts` is therefore NOT in `files_modified`.

## Known Stubs

None — the snap path is wired end-to-end. Edge drag commits through `onMove` → `snapLeft/snapRight`; the snapped entry renders at `snapHalf(side)` via WindowFrame's `pinned` explicit-rect path; the during-drag preview is driven by `onEdgeChange`; and Ctrl+Left/Right snap the active window via `activeId()`. All paths are asserted by the new tests.

## Threat Flags

No new security-relevant surface beyond the plan's registered threat model.
- **T-19-07 (Information disclosure — snap class names / markers):** mitigated. `.desktop-snap-preview*`, `window-chrome--snap-{side}`, `snapSide`, `snapLeft/snapRight`, `snapHalf`, `SNAP_THRESHOLD`, `onEdgeChange` carry no mechanic lexicon and no iframe/sandbox/isolation word — hygiene gate confirmed green over src/index.css + DesktopShell.tsx + WindowFrame.tsx.
- **T-19-08 (Tampering — Ctrl+Arrow hijacking text navigation):** mitigated. `preventDefault` fires ONLY when `activeId()` is non-null; with no Vibe OS window active the handler is a no-op (asserted: no throw, `defaultPrevented === false`).
- **T-19-09 (DoS — rAF snap-preview loop spinning):** accept (per plan). The preview signal piggybacks the existing single drag-driven pointermove (no new rAF loop) and is cleared on commit — bounded by the drag lifetime.

## Self-Check: PASSED

- src/ui/useWindowManager.tsx — exists, contains "snapSide" (5), "snapLeft"/"snapRight" (7)
- src/ui/DesktopShell.tsx — exists, contains "snapPreview" (3), "SNAP_THRESHOLD" (7), "activeId" (1)
- src/ui/WindowFrame.tsx — exists, contains "snapSide" + "onEdgeChange"
- src/index.css — exists, contains "desktop-snap-preview" (3)
- Commit f59b82d (test RED, Task 1) — verified in git log
- Commit 262ca90 (feat GREEN, Task 1) — verified in git log
- Commit 2817c29 (test RED, Task 2) — verified in git log
- Commit 263035b (feat GREEN, Task 2) — verified in git log
- Commit 0d153c3 (test RED, Task 3) — verified in git log
- Commit 3c61732 (feat GREEN, Task 3) — verified in git log
- Full suite: 744 tests green; tsc: 0 errors; hygiene + CSP gates green; build emits 0 source maps
