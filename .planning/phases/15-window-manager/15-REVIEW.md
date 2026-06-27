---
phase: 15
reviewed: 2026-06-27T00:39:42Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/ui/useDrag.ts
  - src/ui/useWindowManager.tsx
  - src/ui/WindowFrame.tsx
  - src/ui/Marketplace.tsx
  - src/App.tsx
  - src/index.css
status: fixed
critical_count: 1
warning_count: 4
info_count: 4
findings:
  critical: 1
  blocker: 1
  warning: 4
  info: 4
  total: 9
---

# Phase 15: Code Review Report

**Reviewed:** 2026-06-27T00:39:42Z
**Depth:** standard
**Files Reviewed:** 6 (production source) + 5 test files scanned
**Status:** findings

## Summary

Phase 15 implements a window manager (desktop, draggable glass chrome, z-order,
minimize/restore, zero-leak close) over an in-tree rendering model. The
architecture is sound and well-tested for the things the tests exercise: the
zero-leak close path, the `isOpen` mid-produce guard, the `WindowBody` memo
isolation, bounded z-order, and the devtools-hygiene rules are all correct. No
banned hygiene tokens appear in any production surface (source, comments, or CSS
class names), and the title/icon render path goes through React text nodes only
(no `innerHTML`/`dangerouslySetInnerHTML`). No API key or secret is logged.

There is, however, one **BLOCKER**: the drag implementation double-applies
position. The frame is positioned with CSS `left`/`top` (from props) AND the
drag hook writes an *absolute* `transform: translate(x, y)` on top of it, so a
window jumps to roughly double its coordinates the instant a drag starts, and
the stale transform is never cleared after commit — so every drag compounds the
offset. The existing drag tests do not catch this because they stub
`getBoundingClientRect` and only assert the committed `left`/`top` value (which
is clean), never the rendered on-screen position (`left + transform`).

The remaining findings are robustness/maintainability concerns: a missing rAF
cleanup on unmount, the `windowIdOf` fallback's reliance on a render-flush timing
assumption, a confirmed-dead `unmountApp` call in the close path, and a fragile
global `document.querySelector(".desktop")`.

## Critical Issues

### CR-01: Drag double-applies position — windows jump on grab and accumulate offset

**File:** `src/ui/useDrag.ts:60-64`, `src/ui/WindowFrame.tsx:111`, `src/index.css:697-708`
**Issue:**
The frame is positioned absolutely via the React-controlled inline style
`style={{ left: x, top: y, zIndex: z }}` (`WindowFrame.tsx:111`). During a drag,
`useDrag` writes an **absolute viewport coordinate** into the element's transform:

```ts
elementRef.current.style.transform = `translate(${clamped.x}px,${clamped.y}px)`;
```

where `clamped.x/y` are absolute positions (`startPos + delta`, clamped to
`[0, innerWidth - width]`). Because a CSS `transform: translate()` is applied
**on top of** the element's `left`/`top` box position, the on-screen position
during drag becomes `(left + clamped.x, top + clamped.y)` = `(x + clamped.x,
y + clamped.y)`, not `(clamped.x, clamped.y)`.

Consequences:
1. **Jump on grab:** at `pointerdown`, `dx=dy=0` so `clamped ≈ {x, y}`; the
   element instantly renders at `(2x, 2y)` before the pointer has moved.
2. **Compounding offset:** on `pointerup`, `onCommit(final.x, final.y)` updates
   `positions`, which re-renders the frame with `left/top = final.x/final.y`. But
   React does not own the imperatively-set `transform` (it was set outside the
   vDOM), so the stale `transform: translate(final.x, final.y)` is **never
   cleared**. The element ends at `(2·final.x, 2·final.y)`, and each subsequent
   drag doubles again.

The `MarketplaceWindows.test.tsx` drag test (lines 271-301) only asserts the
committed `style.left`/`style.top` are in-viewport — which they are, because
`onMove`→`positions` is clean. It never reads the rendered position
(`left` + `transform`), so the bug is invisible to the suite.

**Fix (option A — recommended): drag with transform deltas, keep box at origin.**
Position the frame entirely via transform and leave `left/top` at 0:

```tsx
// WindowFrame.tsx
style={{ transform: `translate(${x}px, ${y}px)`, zIndex: z }}
// (drop left/top entirely)
```

and in `useDrag`, write the same transform during drag. Since the box origin is
now `(0,0)`, `transform: translate(absX, absY)` lands exactly at `(absX, absY)`.

**Fix (option B): clear the transform on commit and never set left/top during
drag.** Keep `left/top` as the committed source of truth, but reset the imperative
transform when the drag ends so the re-render's `left/top` is authoritative:

```ts
const onEnd = (endEvent: PointerEvent) => {
  // ...existing teardown...
  const final = clamp(raw);
  if (elementRef.current) elementRef.current.style.transform = ""; // clear stale offset
  onCommit(final.x, final.y);
};
```

and during `onMove`, write `transform: translate(dx, dy)` using the **delta only**
(not the absolute clamped position), so it layers correctly on the existing
`left/top`. Note option B makes viewport clamping during the visual drag harder
(the delta isn't clamped against the box), so option A is cleaner. Add a test that
asserts the **effective** on-screen position (e.g. compare `getBoundingClientRect`
against a non-stubbed layout, or assert `transform` is empty/identity post-commit).

## Warnings

### WR-01: `useDrag` never cancels a pending rAF (or detaches listeners) on unmount

**File:** `src/ui/useDrag.ts:1-98`
**Issue:**
`useDrag` registers `pointermove`/`pointerup`/`pointercancel` on the captured
handle and schedules `requestAnimationFrame` during a move, but has **no
`useEffect` cleanup**. If the WindowFrame unmounts mid-drag (e.g. the window is
closed through a path other than `pointerup` while a drag is active, or a parent
re-render tears the subtree down), the move/end listeners are only removed inside
`onEnd` — which never fires — and the last-scheduled rAF is never cancelled. The
rAF callback is guarded by `if (elementRef.current)` so it is harmless after
unmount (no crash), and the detached handle node's listeners are GC-eligible, so
this is not a hard leak — but it relies entirely on `onEnd` running. The hook
should defensively clean up.

**Fix:** Track the active handle/listeners in a ref and add an unmount cleanup:

```ts
useEffect(() => {
  return () => {
    cancelAnimationFrame(rafId.current);
    // also: if a drag is active, detach listeners from the captured handle ref
  };
}, []);
```

### WR-02: `windowIdOf` fallback masks a real failure if `windows` is stale-but-open

**File:** `src/ui/Marketplace.tsx:204-206`, `220`, `236`
**Issue:**
`windowIdOf(iid)` resolves an instanceId to its window id by searching the live
`windowManagerRef.current.windows`, falling back to the synthetic
`` `win-from-${iid}` `` when not found. The `isOpen` guard then checks this id
against `openIdsRef` (which only ever contains real `win-${n}` ids). The fallback
is **correct for the closed case** (a closed window is absent from `windows` →
fallback id → `isOpen` returns false → result dropped — the intended behavior).
But it is only correct for the **open** case by a timing assumption: that React
has flushed the `setWindows` from the synchronous `wm.open()` call before the
post-`await` `windowIdOf` runs. If `windows` were ever stale while the window is
genuinely open (the entry not yet in the rendered array), `windowIdOf` returns the
fallback id, `isOpen` returns **false for a still-open window**, and the resolved
component is silently dropped + evicted — leaving a permanent "Preparing…"
placeholder with no error. The guard would be more robust keyed on the
instanceId the manager already owns.

**Fix:** Add an `isOpenByInstance(instanceId)` to the manager (it already mirrors
ids synchronously in `openIdsRef`; mirror instanceIds too), and have `handleOpen`
guard on that directly instead of round-tripping instanceId → id → `isOpen`. This
removes the `windows`-array dependency entirely:

```ts
// useWindowManager: keep a Set<instanceId> alongside the id set, updated
// synchronously in open()/close(); expose isOpenByInstance(iid).
if (!windowManagerRef.current.isOpenByInstance(instanceId)) { /* drop */ }
```

### WR-03: `unmountApp(entry.instanceId)` in `close()` is dead code in the in-tree model

**File:** `src/ui/useWindowManager.tsx:156`
**Issue:**
`close()` calls `unmountApp(entry.instanceId)`, but in the Phase 15 in-tree
rendering model nothing calls `mountApp` — the app renders as a normal React
child of `WindowFrame` (`WindowBody` → `AppShell` → `Component`), so the
`roots` map in `mount.ts` is always empty for these instances and `unmountApp` is
a guaranteed no-op (it early-returns when `roots.get(id)` is undefined). The
comment block at the top of the file (lines 4-8) and the `WindowManagerValue.close`
doc ("unmount its root — MUST be called before discarding the entry") actively
describe a mechanism that no longer exists, which is misleading for the next
maintainer. It is defensive, not harmful — but it implies a root-teardown
contract that the in-tree model does not have.

**Fix:** Either remove the `unmountApp` call and the `import { unmountApp }`
(teardown now happens purely by removing the entry → React unmounts the subtree),
or keep it but replace the misleading comments with an explicit note that it is a
defensive no-op retained only for the legacy/iframe upgrade path. Do not leave the
"MUST be called before discarding the entry" wording, which is now false.

### WR-04: `document.querySelector(".desktop")` is a fragile global lookup

**File:** `src/ui/useDrag.ts:48`, `74`
**Issue:**
`onMove`/`onEnd` toggle `desktop--dragging` via
`document.querySelector(".desktop")`, grabbing the **first** `.desktop` in the
whole document. Today there is exactly one (Marketplace's), so it works. But it
couples a generic drag hook to a global DOM class outside its own ref tree, and
silently no-ops if the class is renamed or if a second desktop is ever introduced
(e.g. App.tsx's outer `WindowManagerProvider` gains a desktop-level consumer).
The `desktop--dragging` rule only re-applies `user-select: none`, so a miss
degrades to text-selectable drags rather than breakage — hence a warning, not a
blocker.

**Fix:** Pass the desktop element (or a `setDragging` callback) into `useDrag`
via options, or resolve `.desktop` once from `elementRef.current.closest(".desktop")`
so the lookup is scoped to this frame's own ancestor rather than the global
document.

## Info

### IN-01: `clamp` reads `getBoundingClientRect()` on every pointermove

**File:** `src/ui/useDrag.ts:26-35`
**Issue:** `clamp` calls `el.getBoundingClientRect()` per move to read
`width`/`height`. Width/height do not change during a drag, so this forces a
layout read on every move. (Flagged as info only — performance is out of v1
review scope; noting because it is also a correctness foot-gun: once CR-01 is
fixed with a transform-based position, `getBoundingClientRect` will reflect the
*transformed* rect, so make sure clamp keeps reading only width/height, never x/y.)
**Fix:** Capture `width`/`height` once at `pointerdown` and reuse for the drag.

### IN-02: `cascadePlace` cascades from the last array entry, not the last-opened

**File:** `src/ui/useWindowManager.tsx:80-83`
**Issue:** `cascadePlace` offsets from `existing[existing.length - 1]`. After a
middle window is closed and a new one opened, the cascade anchors on whatever is
now last in the array, which can place a new window exactly on top of an older
one. Cosmetic; the viewport clamp prevents off-screen placement.
**Fix:** Optionally anchor the cascade on a monotonically increasing counter
(e.g. `counter % N` steps) rather than the last array element.

### IN-03: `DEFAULT_W`/`DEFAULT_H` (400×300) drift from CSS `min-width/height` (320×240)

**File:** `src/ui/useWindowManager.tsx:24-25` vs `src/index.css:700-701`
**Issue:** Cascade-clamp arithmetic uses 400×300 as the assumed window size, but
the CSS floor is 320×240 and the actual rendered size is content-driven. The clamp
is therefore approximate — a window can still end slightly past the viewport edge
if its real size exceeds the assumed constant. Low impact (the drag clamp uses the
real `getBoundingClientRect`), but the two magic numbers should be reconciled or
documented as a deliberate over-estimate.
**Fix:** Comment the constants as intentional over-estimates, or measure the real
frame size for the open-time clamp.

### IN-04: `onModify` optional-chaining means a missing handler silently no-ops

**File:** `src/ui/WindowFrame.tsx:25`, `80`; `src/ui/AppShell.tsx:44`
**Issue:** `onModify?` is optional throughout; `AppShell.handleApply` calls
`onModify?.(instruction)`. In the live Marketplace path it is always provided, so
this is fine, but a future caller that forgets `onModify` gets a contextual prompt
whose "Apply" silently does nothing with no feedback. Acceptable by design (the
comment notes "Apply is then a no-op closer"), noted for awareness.
**Fix:** None required; consider a dev-only warning if Apply is invoked with no
`onModify` bound.

---

## Fixes Applied

All in-scope findings (CR-01 + the 4 warnings) were resolved. Each fix is an
atomic commit on `feature/phase-15-window-manager`.

| Finding | Status | Commit | Notes |
|---------|--------|--------|-------|
| **CR-01** (blocker) | fixed | `ac7d514` | WindowFrame positions purely via `transform: translate()` (box origin pinned at desktop top-left 0,0 in CSS); React owns the transform so the imperative drag write is replaced cleanly on commit — no double-applied left/top + transform. Tests assert the EFFECTIVE rendered position (parsed from `translate()`) is applied exactly once. IN-01 verified: `clamp` reads only `rect.width`/`rect.height`. |
| **WR-01** | fixed | `57e861b` | `useDrag` adds a `useEffect` unmount cleanup that `cancelAnimationFrame`s a pending rAF. |
| **WR-04** | fixed | `d265480` | Both `document.querySelector(".desktop")` call sites replaced with `elementRef.current?.closest(".desktop")` (null-guarded). |
| **WR-03** | fixed | `4b31a8f` | Dead `unmountApp` call + import removed from `close()`; file/close doc comments rewritten to describe the in-tree teardown (entry removal → React unmounts subtree). Unit test updated to assert in-tree behavior. |
| **WR-02** | fixed | `0e97f79` | Added `isOpenByInstance(instanceId)` to the manager (second ref mirror updated synchronously in open/close); `handleOpen` guards on it directly (both paths), removing the `windows`-array round-trip and the synthetic `win-from-*` fallback id. |

**Info findings (IN-01..IN-04):** out of scope for this fix pass (IN-01's
correctness note was verified as part of CR-01; the rest are cosmetic/perf).

**Gate results after fixes:** `tsc --noEmit` 0 errors · full vitest suite
600 passed (was 598; +2 net new drag tests) · `hygiene.test.ts` green ·
`npm run build` succeeds with zero `*.map` files in `dist`.

---

_Reviewed: 2026-06-27T00:39:42Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Fixes applied: 2026-06-26 — Claude (gsd-code-fixer)_
