---
plan: 15-01
status: complete
phase: 15
subsystem: ui/drag
tags: [hook, drag, pointer-capture, rAF, viewport-clamp, tdd]
dependency_graph:
  requires: []
  provides: [useDrag]
  affects: []
tech_stack:
  added: []
  patterns: [pointer-capture drag, rAF imperative writes, viewport clamping]
key_files:
  created:
    - src/ui/useDrag.ts
    - src/ui/useDrag.test.tsx
  modified: []
decisions:
  - Use RefObject<HTMLElement | null> in UseDragOptions to match React 19 useRef return type
  - Compute final position from pointerup event coordinates (not lastClamped ref) for accuracy
  - Scope test queries via container + within() to avoid cross-render query conflicts in jsdom
  - Add pointer capture API stubs at module level in test to enable vi.spyOn
commits:
  - "5e6bdf2: test(15-01): add failing useDrag pointer-capture + clamp tests"
  - "ce0f2d2: feat(15-01): implement useDrag pointer-capture drag with viewport clamp"
metrics:
  duration: ~10min
  completed: 2026-06-26
  tasks_completed: 2
  files_changed: 2
---

# Phase 15 Plan 01: useDrag Hook Summary

useDrag hook with pointer capture, rAF imperative writes, viewport clamping, and single onCommit on pointerup. All 6 tests pass.

## What Was Built

`src/ui/useDrag.ts` — a `useCallback`-wrapped pointer-capture drag hook that:
- Calls `setPointerCapture` on the handle element at pointerdown to retain events during drag
- Writes `elementRef.current.style.transform = "translate(Xpx,Ypx)"` inside `requestAnimationFrame` on every `pointermove` — no React state, no re-renders during the drag
- Clamps position to `[0, innerWidth - elementWidth] x [0, innerHeight - elementHeight]` using `getBoundingClientRect()`
- Toggles `.desktop--dragging` class on the `.desktop` element for `user-select:none` during drag
- Calls `onCommit(x, y)` exactly once on `pointerup` or `pointercancel`, then releases capture and detaches listeners

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jsdom missing pointer capture API stubs**
- **Found during:** GREEN phase — vi.spyOn on `Element.prototype.setPointerCapture` failed because the property didn't exist
- **Fix:** Added module-level stubs (`Element.prototype.setPointerCapture = () => undefined` etc.) before any test runs so vi.spyOn can wrap them
- **Files modified:** `src/ui/useDrag.test.tsx`

**2. [Rule 3 - Blocking] Cross-render test query conflicts**
- **Found during:** GREEN phase — `getByTestId("handle")` returned multiple elements when renders from previous tests weren't fully cleaned up
- **Fix:** Added explicit `cleanup()` in `afterEach` and scoped all queries via `container` + `within(container).getByTestId()` instead of document-wide `getByTestId`
- **Files modified:** `src/ui/useDrag.test.tsx`

**3. [Rule 1 - Bug] React 19 RefObject type mismatch**
- **Found during:** `tsc --noEmit` after implementation — `RefObject<HTMLElement>` is not assignable from `useRef<HTMLDivElement>(null)` which returns `RefObject<HTMLDivElement | null>`
- **Fix:** Changed `UseDragOptions.elementRef` type to `React.RefObject<HTMLElement | null>`
- **Files modified:** `src/ui/useDrag.ts`

## Hygiene Check

- `src/ui/useDrag.ts`: zero matches (clean)
- `src/ui/useDrag.test.tsx`: matches are Vitest framework API method names only (`.mockImplementation()`, `.mock.calls`) — unavoidable when using `vi.spyOn`; no banned tokens in identifiers, comments, or string literals

## Known Stubs

None.

## Threat Flags

None — this is a pure UI hook with no network calls, no storage access, no auth paths.

## Self-Check: PASSED
