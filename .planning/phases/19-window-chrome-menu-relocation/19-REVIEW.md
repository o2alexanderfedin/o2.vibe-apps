---
phase: 19-window-chrome-menu-relocation
reviewed: 2026-06-27T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/ui/WindowFrame.tsx
  - src/ui/AppShell.tsx
  - src/ui/useWindowManager.tsx
  - src/ui/DesktopShell.tsx
  - src/index.css
  - src/ui/WindowFrame.test.tsx
  - src/ui/AppShell.test.tsx
  - src/ui/useWindowManager.test.tsx
  - src/ui/DesktopShell.test.tsx
  - src/ui/Dock.test.tsx
  - src/ui/MarketplaceModify.test.tsx
  - src/ui/MarketplaceWindows.test.tsx
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-06-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 19 relocated the `⋮` contextual menu into the `WindowFrame` titlebar (AppShell is now content-only), added zoom-to-work-area maximize, snap-to-half via drag-to-edge and Ctrl+Arrow, and Cmd/Ctrl+W close + Cmd/Ctrl+M minimize. The menu relocation (CHROME-01) is clean and well-tested. Maximize toggle works and is covered end to end.

The hard hygiene rules pass: the "synthesize/synthesized/synthesis" token does NOT appear in any Phase-19 source file (it appears only in `src/hygiene.test.ts`'s own regex and as the W3C `SpeechSynthesis*` global-name list inside the bundled `@babel/standalone` in `dist/` — neither is authored copy nor reveals the mechanic). The "iframe/sandbox/isolation" tokens appear only in source comments and the legitimate CSS `isolation: isolate` property — none in UI-visible copy. No new npm runtime dependency was added (`lucide-react` and `iconForAppType` are pre-existing). No `eval`/`innerHTML`/global pollution introduced.

However, the snap-to-half feature has two correctness defects that break the core "an app renders and works" loop: (1) a snapped window is permanently stuck — there is no path to clear `snapSide`, so the window can never be un-snapped, dragged free, or even maximized cleanly; and (2) the global keydown shortcuts hijack `Ctrl+ArrowLeft/Right` (and Cmd/Ctrl+W/M) while the user is typing inside an app's own input, with no editable-target guard. Both are user-facing regressions that the current tests do not catch because they only exercise the happy path (snap once, never recover; fire keys with no app input focused).

## Critical Issues

### CR-01: A snapped window can never be un-snapped, dragged free, or cleanly maximized (stuck state)

**File:** `src/ui/useWindowManager.tsx:218-284`, `src/ui/DesktopShell.tsx:606-657`
**Issue:** Once `snapSide` is set there is no code path anywhere that clears it back to `null` (confirmed: `grep` for any `snapSide: null` / unsnap path finds only the `open()` default). The asymmetry is the root cause — `snapLeft`/`snapRight` clear `maximized`, but `maximize` does NOT clear `snapSide`, and nothing clears `snapSide` on drag, double-click, or restore. Concrete failure modes:

1. **Drag a snapped window → it springs back.** While snapped, `maximized` is false, so the drag gate `if (maximized) return` (WindowFrame.tsx:204) does NOT fire — the drag proceeds and `onMove` commits a `positions` override (DesktopShell.tsx:653). But in render, `area = entry.snapSide ? snapHalf(...)` still wins over the override (DesktopShell.tsx:606-612), so the frame snaps right back to the half. The dragged position is silently discarded; the window appears frozen.
2. **Double-click a snapped window → maximize leaves a dangling snap marker.** `onMaximize` sees `entry.maximized === false` and calls `windowManager.maximize()` (DesktopShell.tsx:632-636), which sets `maximized: true` WITHOUT clearing `snapSide`. The frame now carries both `window-chrome--maximized` AND `window-chrome--snap-left`, and on the next un-maximize it falls back into the still-snapped half rather than the pre-snap geometry.
3. **No restore-from-snap at all.** There is no UI affordance (no `unsnap`, no clearing on focus/drag) to return a snapped window to a free-floating window.

**Fix:** Add an `unsnap`/clear path and clear `snapSide` on the transitions that should free the window. At minimum:
```ts
// useWindowManager.tsx — clear snapSide when maximizing (mutual exclusivity both ways)
const maximize = useCallback((id: string) => {
  const z = ++zTop;
  setWindows(prev => prev.map(w =>
    w.id !== id ? w : {
      ...w,
      maximized: true,
      snapSide: null, // ADD: maximize clears snap, mirroring snap clearing maximize
      restoreRect: { x: w.x, y: w.y, w: DEFAULT_W, h: DEFAULT_H },
      z,
    },
  ));
}, []);
```
```ts
// DesktopShell.tsx onMove — when a drag commits to a free position, clear the snap
} else {
  windowManager.unsnap(entry.id); // ADD an unsnap() that sets snapSide:null
  setPositions(prev => new Map(prev).set(entry.instanceId, { x: nx, y: ny }));
}
```
Add a matching `unsnap` to `WindowManagerValue` and clear `snapSide` (the same way `unmaximize` clears `maximized`). Add a test that snaps a window then drags it to a free position and asserts it lands there (and loses `window-chrome--snap-*`).

### CR-02: Global keydown shortcuts hijack text-editing keys inside an app's own inputs (no editable-target guard)

**File:** `src/ui/DesktopShell.tsx:528-559`
**Issue:** The single global `keydown` listener acts whenever ANY Vibe OS window is active (`activeId() !== null`), with NO check for the event target. Because a window is "active" the entire time any app is open, the handler hijacks keys the user presses while typing inside the app's own `<input>`/`<textarea>` (generated apps render real inputs in-tree — e.g. the seeded Notes "Add a note…" field):

- `Ctrl+ArrowLeft` / `Ctrl+ArrowRight` are the standard word-by-word caret-move / selection shortcuts on Windows/Linux. Here they `preventDefault()` and snap the window instead of moving the caret (DesktopShell.tsx:547-558). Typing in any app input loses word navigation/selection.
- `Cmd/Ctrl+W` closes the whole window and `Cmd/Ctrl+M` minimizes it (DesktopShell.tsx:533-544) even when focus is in an app input. While Cmd+W intentionally overrides the browser tab-close, doing it while the user is mid-edit in an app field destroys their work with no confirmation.

This directly degrades the product's core promise that "an app renders and works." The existing tests do not catch it because they fire the keys at `window` with no app input focused.

**Fix:** Skip the window shortcuts when the event originates from an editable element (consistent with the codebase's existing `document.activeElement` checks in `KeyDialog.tsx`/`SearchLauncherPanel.tsx`):
```ts
function handleKeyDown(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null;
  // Don't hijack keys the user is typing into an app's own field.
  if (
    t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.isContentEditable)
  ) {
    return;
  }
  const wm = windowManagerRef.current;
  // ...rest unchanged
}
```
Add a test that focuses an input inside an opened app, fires `Ctrl+ArrowLeft`, and asserts the window did NOT snap and `defaultPrevented` is false.

## Warnings

### WR-01: `restoreRect` is captured on every maximize/snap but never read — restore relies on a side effect

**File:** `src/ui/useWindowManager.tsx:231,262,279`; `src/ui/DesktopShell.tsx:606-612`
**Issue:** `maximize`/`snapLeft`/`snapRight` all write `restoreRect: { x: w.x, y: w.y, w: DEFAULT_W, h: DEFAULT_H }`, and the JSDoc says it exists "so unmaximize can return the window exactly where it was." But `grep` confirms `restoreRect` is never read in DesktopShell or WindowFrame — restore actually works only because the render path falls back to `override?.x ?? entry.x` when `area` is null. Worse, the captured value is stale/wrong for a window that was dragged before maximizing: `w.x`/`w.y` hold the original cascade position, NOT the dragged position (drag positions live only in DesktopShell's `positions` map, never written back to the manager). So `restoreRect` is simultaneously dead AND incorrect — a latent trap for any future code that trusts it.
**Fix:** Either (a) delete `restoreRect` and the `w`/`h` it stores until a feature actually consumes it, or (b) make `unmaximize`/an unsnap read `restoreRect` and write `x`/`y` back so restore is authoritative — and capture the *effective* current geometry (including any drag override) when entering the maximized/snapped state, not the stale `w.x/w.y`.

### WR-02: Snap preview (during drag) and snap commit use different coordinate bases — preview can lie for wide frames

**File:** `src/ui/WindowFrame.tsx:141-150`; `src/ui/DesktopShell.tsx:645-651`
**Issue:** The during-drag preview (`reportEdge`) tests the raw pointer `clientX` against the viewport edges (WindowFrame.tsx:144-145), while the commit tests the frame's clamped top-left `nx` plus a hardcoded `DEFAULT_FRAME_W = 400` (DesktopShell.tsx:647-649). For a frame wider than 400px (the min-width is 320 but content can grow the frame), dragging it hard against the right edge clamps `nx = innerWidth - actualWidth`, so `nx + 400 < innerWidth - 20` and the commit does NOT snap — even though the preview overlay was showing because the pointer was within 20px of the edge. Result: the user sees the right drop-zone, releases, and the window does not snap. Left-snap is roughly consistent (clamp drives `nx` to 0), but right-snap is unreliable for any non-default-width frame.
**Fix:** Drive the commit decision off the same signal as the preview (the last `onEdgeChange` side reported during the drag) instead of recomputing from `nx + DEFAULT_FRAME_W`. Pass the reported side through to `onMove`/a dedicated `onSnap` callback so preview and commit are guaranteed to agree.

### WR-03: `window.innerWidth` read in a render-time map callback without resize handling — stale geometry on resize

**File:** `src/ui/DesktopShell.tsx:66-95` (`workArea`/`snapHalf`), `:648-649` (`onMove`)
**Issue:** `workArea()` and `snapHalf()` read `window.innerWidth/innerHeight` directly during render, and `onMove` reads `window.innerWidth` at commit time. There is no `resize` listener and no state dependency on viewport size, so a maximized or snapped window keeps its old rect after the browser is resized until some unrelated state change forces a re-render. The maximize/snap rect will be wrong (too wide/tall or too small) until the next render. Given the manager already re-renders on focus/z changes this is intermittent, which makes it a harder-to-spot correctness gap rather than a hard crash.
**Fix:** Mirror viewport size into state via a `resize` listener (the file already has the matchMedia effect pattern to copy) and recompute `area` from that state, so a resize re-renders pinned windows with a fresh rect.

### WR-04: `Cmd+Shift+W` / uppercase `e.key` bypasses the close/minimize guard

**File:** `src/ui/DesktopShell.tsx:533,548-549`
**Issue:** The handler matches `e.key === "w"` / `"m"` / `"ArrowLeft"` / `"ArrowRight"` with exact lowercase comparisons. When Shift is held or Caps Lock is on, `e.key` for the W/M keys becomes `"W"`/`"M"`, so `Cmd+Shift+W` (a common "close all tabs" chord on macOS) falls through the handler without `preventDefault()` and closes ALL browser tabs instead of the active window — the opposite of the intended "the browser tab is NEVER closed" guarantee (CHROME-04). The snap arrows are unaffected by Shift case but `Shift+Ctrl+ArrowLeft` (extend-selection-by-word) will still snap.
**Fix:** Normalize case and/or explicitly exclude Shift where the chord should not match:
```ts
const key = e.key.toLowerCase();
if (mod && !e.shiftKey && (key === "w" || key === "m")) { ... }
```

### WR-05: `useWindowManager.activeId()` / DesktopShell `activeWindow` duplicate the "highest-z non-minimized" logic

**File:** `src/ui/useWindowManager.tsx:318-326`; `src/ui/DesktopShell.tsx:567-570`
**Issue:** The exact same "filter non-minimized, sort by z desc, take first" selection is implemented twice — once in the manager's `activeId()` (returning an id) and again inline in DesktopShell to compute `activeWindow` (returning the entry, feeding the menu-bar name). They can drift (e.g. a future tweak to tie-breaking in one place but not the other), and the menu-bar name vs. the keyboard-shortcut target could then disagree about which window is "active."
**Fix:** Add an `activeWindow()` (or have DesktopShell derive `activeWindow` from `windowManager.activeId()`), so there is a single source of truth for "which window is front-most."

## Info

### IN-01: `WindowBody` destructures and threads `onClose` but never uses it (dead parameter)

**File:** `src/ui/WindowFrame.tsx:27,42,284-289`
**Issue:** `WindowBodyProps.onClose` is declared, passed from `WindowFrame` (`onClose={onClose}`), and destructured in `WindowBody`, but the function body never calls it (close is handled by the titlebar traffic-light). It is also excluded from the memo comparator, so it is purely dead weight that misleads readers into thinking the body can close itself.
**Fix:** Remove `onClose` from `WindowBodyProps`, the destructure, and the JSX prop.

### IN-02: `.window-chrome--maximized` / `.window-chrome--snap-*` classes have no CSS rules

**File:** `src/index.css` (no matching rules); applied in `src/ui/WindowFrame.tsx:174-176`
**Issue:** `grep` confirms there are zero CSS rules for `.window-chrome--maximized` or `.window-chrome--snap-left/right`. The maximize/snap visual comes entirely from the inline `width`/`height`/`transform` driven by the `w`/`h` props. The classes are effectively test-only hooks. This means there is no CSS fallback: if `w`/`h` are ever undefined for a pinned window (e.g. a future refactor that forgets to pass them), the window silently renders at its content size with no visual indication it is "maximized," and tests that assert the class would still pass.
**Fix:** Either add minimal CSS that ties the visual to the class (defensive), or add a code comment at the className site noting these classes are intentionally style-free test/markup hooks so future maintainers don't assume styling lives in CSS.

### IN-03: Magic numbers `MENU_BAR_H` / `DOCK_RESERVE` duplicate CSS layout constants with no enforced link

**File:** `src/ui/DesktopShell.tsx:49-50`, `:226` (test), `src/index.css:921` (`.menu-bar { height: 40px }`), `:983-991` (`.dock`)
**Issue:** `MENU_BAR_H = 40` and `DOCK_RESERVE = 88` are hand-derived from the CSS (`.menu-bar height:40px`, dock bottom:16 + padding 9*2 + icon 52 ≈ 88). The DesktopShell test hardcodes `window.innerHeight - 40 - 88` too. If anyone changes the menu-bar height or dock padding in CSS, the work-area math silently drifts and maximized windows will overlap the dock/menu bar, with nothing failing until a human notices visually.
**Fix:** Document the coupling more loudly at both sites (the CSS comment should reference the JS constant and vice-versa), or read the actual rendered chrome heights via `getBoundingClientRect()` so the work area tracks the real layout.

### IN-04: `EDGE_THRESHOLD` (WindowFrame) and `SNAP_THRESHOLD` (DesktopShell) are duplicated magic numbers that must stay equal

**File:** `src/ui/WindowFrame.tsx:139`; `src/ui/DesktopShell.tsx:56`
**Issue:** Both are `20` and the comments explicitly say they "mirror" each other ("The snap threshold mirrors DesktopShell's SNAP_THRESHOLD"). They are defined independently in two files with no shared constant, so a change to one silently desynchronizes the preview-vs-commit threshold (compounding WR-02).
**Fix:** Export a single shared `SNAP_THRESHOLD` constant and import it in both WindowFrame and DesktopShell.

---

_Reviewed: 2026-06-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
