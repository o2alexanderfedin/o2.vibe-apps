---
phase: 16-desktop-shell
plan: "01"
subsystem: window-chrome
tags: [chrome, appshell, windowframe, css, tdd]
dependency_graph:
  requires: [15-03]
  provides: [hideClose-prop, title-group-markup, titlebar-grid-css]
  affects: [AppShell, WindowFrame, Marketplace, MarketplaceWidgets]
tech_stack:
  added: []
  patterns:
    - "hideClose prop pattern: optional boolean on AppShellProps suppresses inner × when surrounding chrome owns close"
    - "3-column CSS grid on titlebar: auto (traffic-lights) | 1fr (title-group) | auto (spacer)"
    - "title-group wrapper: flex+center, icon-first, for grouped centered title display"
key_files:
  created:
    - src/ui/AppShell.test.tsx
  modified:
    - src/ui/AppShell.tsx
    - src/ui/WindowFrame.tsx
    - src/ui/WindowFrame.test.tsx
    - src/index.css
    - src/ui/Marketplace.test.tsx
    - src/ui/MarketplaceWidgets.test.tsx
decisions:
  - "hideClose defaults to false — standalone AppShell retains inner × by design"
  - "hideClose=true always when inside WindowFrame — traffic-light is the single authoritative close"
  - "Made AppShell children optional to satisfy TypeScript createElement overload in tests"
  - "CSS uses grid-template-columns: auto 1fr auto with only 2 grid children; 3rd auto column is implicit empty spacer that balances the titlebar visually"
  - "Use fireEvent.click (not userEvent.click) for traffic-light close in tests to avoid jsdom pointer-lifecycle error on component unmount"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-27T01:32:08Z"
  tasks: 3
  files_modified: 7
  files_created: 1
---

# Phase 16 Plan 01: Chrome Fixes (AppShell hideClose + WindowFrame Title-Group + CSS) Summary

**One-liner:** AppShell hideClose prop suppresses redundant inner × in windowed mode; WindowFrame groups icon+title centered via 3-col grid; all 606 tests green.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | AppShell hideClose prop (TDD) | c8f9e9e | src/ui/AppShell.tsx, src/ui/AppShell.test.tsx |
| 2 | WindowFrame title-group + hideClose pass-through (TDD) | 87c150d | src/ui/WindowFrame.tsx, src/ui/WindowFrame.test.tsx |
| 3 | Titlebar centering CSS + cascade CSS check | 45f9fc4 | src/index.css |
| fix | Update pre-existing tests to traffic-light close | 846b5aa | src/ui/Marketplace.test.tsx, src/ui/MarketplaceWidgets.test.tsx |

## What Was Built

### AppShell hideClose prop

`AppShellProps` gains an optional `hideClose?: boolean` field. When `true`, the inner `×` `<button aria-label="Close {displayName}">` is not rendered. The `⋮` App options button and `ContextualPrompt` are unaffected. Standalone AppShell behavior is preserved (default `false` renders the × as before).

### WindowFrame title-group + hideClose pass-through

The titlebar markup is restructured so `window-chrome__icon` and `window-chrome__title` are siblings inside a new `<div className="window-chrome__title-group">` placed between the traffic-lights group and the right edge — icon first, then title (matching the design). The `.window-chrome__title` span is preserved so `frameByTitle()` selectors and existing assertions stay green.

`WindowBodyProps` gains `hideClose?: boolean`; `WindowFrame` passes `hideClose={true}` into `WindowBody`, which forwards it to `<AppShell hideClose={true}>`. This means framed apps render no inner `×` — the traffic-light is the single authoritative close.

### Titlebar centering CSS

`.window-chrome__titlebar` changed from `display:flex` to `display:grid; grid-template-columns: auto 1fr auto`. Traffic-lights occupy the `auto` left column; the `.window-chrome__title-group` occupies the `1fr` center column; the third `auto` column is an implicit empty spacer balancing the layout.

`.window-chrome__title-group` is a flex container with `justify-content:center; gap:6px; overflow:hidden; min-width:0`. `.window-chrome__title` drops `flex:1` (the grid column handles sizing) and keeps ellipsis/nowrap/color. `.window-chrome__icon` gets `flex-shrink:0`.

The cascade offset (`CASCADE_OFFSET = 28`) was reviewed against `useWindowManager.test.tsx` expectations and left unchanged — it already satisfies the "gentle offset, stays within viewport, second window down-and-right of first" requirement.

## Verification

```
npx vitest run src/ui/AppShell.test.tsx             → 3/3 passed
npx vitest run src/ui/WindowFrame.test.tsx          → 11/11 passed
npx vitest run src/ui/useWindowManager.test.tsx     → 4/4 passed
npx vitest run src/ui/MarketplaceWindows.test.tsx   → 9/9 passed
npx vitest run (full suite, 73 files)              → 606/606 passed
npx tsc --noEmit                                   → clean
npx vitest run src/hygiene.test.ts                 → 2/2 passed
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AppShell children required type broke TypeScript in tests**

- **Found during:** Task 1 (tsc --noEmit)
- **Issue:** `children: ReactNode` (required) caused TS2769 when tests used `createElement(AppShell, props, child)` — TypeScript validates props object, doesn't see the third argument as `children`
- **Fix:** Changed `children: ReactNode` to `children?: ReactNode` — semantically correct (AppShell renders fine with no children; the content is optional from TypeScript's perspective)
- **Files modified:** src/ui/AppShell.tsx
- **Commit:** c8f9e9e

**2. [Rule 1 - Bug] Pre-existing tests used inner × close (now suppressed in windows)**

- **Found during:** Task 3 final suite run
- **Issue:** `Marketplace.test.tsx` and `MarketplaceWidgets.test.tsx` were clicking `Close Calculator` (the AppShell inner ×) to close windowed apps. After hideClose=true suppresses the inner ×, these tests failed.
- **Fix:** Updated both tests to find the traffic-light Close button via `frame.closest(".window-chrome")` + `within(frame).getByRole("button", { name: "Close" })`. Also switched to `fireEvent.click` (from `user.click`) in Marketplace.test.tsx to avoid a jsdom pointer-lifecycle error when the component unmounts during the async user-event click sequence.
- **Files modified:** src/ui/Marketplace.test.tsx, src/ui/MarketplaceWidgets.test.tsx
- **Commit:** 846b5aa

## Known Stubs

None. All changes are structural (prop threading, CSS, markup) with no placeholder data.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- src/ui/AppShell.tsx: FOUND
- src/ui/AppShell.test.tsx: FOUND
- src/ui/WindowFrame.tsx: FOUND
- src/ui/WindowFrame.test.tsx: FOUND
- src/index.css: FOUND (contains window-chrome__title-group, grid-template-columns)
- Commits c8f9e9e, 87c150d, 45f9fc4, 846b5aa: FOUND in git log
