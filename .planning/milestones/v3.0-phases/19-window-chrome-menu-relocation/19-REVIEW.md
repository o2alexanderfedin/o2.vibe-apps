---
phase: 19-window-chrome-menu-relocation
reviewed: 2026-06-27T14:35:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/ui/WindowFrame.tsx
  - src/ui/AppShell.tsx
  - src/ui/useWindowManager.tsx
  - src/ui/DesktopShell.tsx
  - src/ui/snapConstants.ts
  - src/index.css
  - src/ui/WindowFrame.test.tsx
  - src/ui/AppShell.test.tsx
  - src/ui/useWindowManager.test.tsx
  - src/ui/DesktopShell.test.tsx
  - src/ui/Dock.test.tsx
  - src/ui/MarketplaceModify.test.tsx
  - src/ui/MarketplaceWindows.test.tsx
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: clean
---

# Phase 19: Code Review Report (Re-Review)

**Reviewed:** 2026-06-27T14:35:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** clean

## Summary

This is a re-review verifying that the fixer resolved the prior 2 Critical + 5 Warning
findings and that the significant refactor (eliminating the DesktopShell `positions`
map so the `WindowEntry` x/y is the single authoritative geometry) introduced no
regressions to drag, focus/z-ordering, or restore.

**Verdict: every prior finding is resolved, no regressions found, zero new Critical or
Warning issues.** All 80 tests across the 13 in-scope files pass; `tsc --noEmit` is clean.
Only 3 low-severity Info-level quality observations remain (dead struct fields, a JS/CSS
duplicated-constant sync hazard, and an odd-width preview/commit rounding mismatch) — none
affects correctness.

### Prior-finding verification

| ID | Prior issue | Status | Evidence |
|----|-------------|--------|----------|
| CR-01 | Snapped window stuck (could not be freed) | **RESOLVED** | `maximize()` clears `snapSide` (useWindowManager.tsx:262); `unsnap()` added and READS restoreRect (329-347); DesktopShell `onMove` unsnaps a snapped window before committing free geometry (702-704). Covered by `useWindowManager.test.tsx` "maximize clears snapSide" + "unsnap clears snapSide…restores prior geometry", and `DesktopShell.test.tsx` "dragging a SNAPPED window…un-snaps" + "snap → maximize → un-maximize". |
| CR-02 | keydown hijacks app text inputs | **RESOLVED** | Editable-target guard at the TOP of `handleKeyDown` (DesktopShell.tsx:563-571) covers BOTH the close/minimize chord and the Ctrl+Arrow snap branch. Covered by "Ctrl+ArrowLeft inside an app's own input does NOT snap" + "Cmd+W inside an app's own input does NOT close". |
| WR-01 | Dead/stale restoreRect | **RESOLVED** | `setGeometry()` keeps entry x/y authoritative on free-drag commit (234-246); `maximize`/`snapLeft`/`snapRight` capture EFFECTIVE x/y into restoreRect; `unmaximize`/`unsnap` READ restoreRect to write x/y back. Covered by "unmaximize restores the captured prior geometry from restoreRect". |
| WR-02 | Snap preview/commit coordinate mismatch | **RESOLVED** | Commit is now driven off the SAME reported edge side (`lastEdgeRef`, set by `reportEdge`) via the new `onSnap(side)` callback instead of a recomputed x+nominal-width; `DEFAULT_FRAME_W` removed. Covered by "a frame wider than 400px dragged to the right edge snaps right (preview == commit)". |
| WR-03 | Stale geometry on resize | **RESOLVED** | Viewport mirrored into state via a resize listener (DesktopShell.tsx:521-527); `workArea`/`snapHalf` take the mirrored size. Covered by "a maximized window's rect tracks a browser resize". |
| WR-04 | Cmd+Shift+W bypass / case sensitivity | **RESOLVED** | Chord excludes Shift (`!e.shiftKey`) and normalizes case (`e.key.toLowerCase()`) at DesktopShell.tsx:577,583. Covered by "Cmd+W with Caps Lock…STILL closes" + "Cmd+Shift+W does NOT close". |
| WR-05 | Duplicated active-window logic | **RESOLVED** | Single `activeWindow()` source of truth (useWindowManager.tsx:381-391); `activeId()` and the menu-bar name both derive from it. Covered by "activeWindow returns the same entry activeId resolves to". |

### `positions`-map elimination — regression scrutiny (no regressions found)

- **Drag persists correctly.** Free-drag commit routes `onMove → setGeometry`, writing the
  dragged x/y onto the entry. `MarketplaceWindows.test.tsx` "drags via the titlebar…clamps
  within the viewport" still asserts the +60/+40 delta lands exactly once (no double-apply).
- **Snapped-drag un-snap sequencing is correct.** `onMove` issues `unsnap()` then
  `setGeometry()` as two functional `setWindows(prev => …)` updaters. React chains them in
  order, so by the time `setGeometry`'s updater runs, `prev` already has `snapSide === null`
  (cleared by `unsnap`), so its `!w.maximized && w.snapSide === null` guard passes and the
  dragged position wins. Verified by the passing "dragging a SNAPPED window…lands there" test.
- **Focus/z-ordering intact.** `focus`/`restore`/`maximize`/`snap*` all mint z outside the
  updater (Strict-Mode-safe) and raise correctly; DesktopShell tests assert z-order after
  dock-click and minimize→restore.
- **Restore geometry correct.** `unmaximize`/`unsnap` read restoreRect.x/y; "double-click
  titlebar maximizes…restores" asserts the frame returns to its pre-maximize cascade x/y.
- **commitDrag ↔ onPointerUp ordering holds.** `useDrag`'s native `pointerup` listener
  (attached on the titlebar element) fires before React's delegated synthetic `onPointerUp`
  (root-level in React 19), so `commitDrag` reads `lastEdgeRef` while it is still valid; the
  frame's own `onPointerUp` resets it afterward. The snap-on-release tests pass, confirming.
- **No dangling references** to the removed map: `grep` finds `positions`/`DEFAULT_FRAME_W`
  only in explanatory comments, never live code.

### Project hard-rule compliance

- **"synthesize/synthesized/synthesis" banned token:** not present in any file (the only
  near-match is `synthetic` in a DesktopShell comment — a different word, not on the banned
  list).
- **"iframe/sandbox/isolation" in UI-visible copy:** the tokens appear ONLY in source/JSX
  comments and the legitimate CSS property `isolation: isolate` — never in rendered text,
  `aria-label`s, `title`s, or string literals shown to the user. No UI-visible violation.
- **No new npm runtime dependency:** confirmed — only existing imports (`lucide-react`,
  internal modules); no `package.json` change implied.

## Info

### IN-01: `restoreRect.w` / `restoreRect.h` are written but never read (dead struct fields)

**File:** `src/ui/useWindowManager.tsx:264, 305, 322`
**Issue:** Every `maximize`/`snapLeft`/`snapRight` writes `restoreRect: { x, y, w: DEFAULT_W, h: DEFAULT_H }`, but `unmaximize`/`unsnap` only read `rect.x`/`rect.y` (window size is CSS-min-driven, not tracked in geometry). The `w`/`h` fields are always the same two constants and are never consumed (`grep restoreRect` finds no `.w`/`.h` read), so they carry no information and can mislead a future maintainer into thinking size is restored.
**Fix:** Either drop `w`/`h` from the `restoreRect` type and the three writers, or — if you intend to restore the actual pre-pin size later — capture the live `getBoundingClientRect()` dimensions instead of the placeholder constants. Minimal change:
```ts
// useWindowManager.tsx — narrow the type and writers
restoreRect: { x: number; y: number } | null;
// ...
restoreRect: { x: w.x, y: w.y },
```

### IN-02: Work-area constants duplicated across JS and CSS with no single source

**File:** `src/ui/DesktopShell.tsx:49-50` and `src/index.css:889-892` (`.desktop-snap-preview top:40px; bottom:88px`), `.menu-bar { height: 40px }`
**Issue:** `MENU_BAR_H = 40` / `DOCK_RESERVE = 88` in JS must stay manually in sync with `.menu-bar { height: 40px }` and the snap-preview's hardcoded `top: 40px; bottom: 88px` in CSS. A future change to the menu-bar height or dock reserve in CSS will silently desynchronize the maximized/snapped rect math (and the preview overlay) until someone notices windows overlap the chrome. The comment at DesktopShell.tsx:46-48 acknowledges the mirror but no mechanism enforces it.
**Fix:** Promote these to CSS custom properties (e.g. `--menu-bar-h`, `--dock-reserve`) read by both the CSS rules and JS via `getComputedStyle(document.documentElement).getPropertyValue(...)`, or at minimum add a cross-link comment on BOTH sides and a test asserting the `.menu-bar` computed height equals `MENU_BAR_H`.

### IN-03: Snap preview uses `50vw` while the committed rect uses `Math.round(vw/2)` (odd-width mismatch)

**File:** `src/index.css:893` (`.desktop-snap-preview { width: 50vw }`) vs `src/ui/DesktopShell.tsx:103` (`const halfW = Math.round(wa.w / 2)`)
**Issue:** On an odd-width viewport the during-drag drop-zone preview (`50vw`, exactly half) and the committed snapped window (`Math.round(vw/2)`, rounded) can differ by up to 1px, and the right-half preview/window x-origins likewise differ slightly. Purely cosmetic (the user sees the preview and the landed window off by a subpixel-to-1px), not a correctness defect, but the two halves were specifically refactored to "agree".
**Fix:** Derive the preview width from the same rounded value (render the preview width from `snapHalf(...)` in JS rather than a CSS `50vw`), or accept the ≤1px cosmetic delta. Low priority.

---

_Reviewed: 2026-06-27T14:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
