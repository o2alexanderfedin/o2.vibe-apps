---
phase: 19-window-chrome-menu-relocation
plan: "01"
subsystem: ui
tags: [chrome, menu-relocation, tdd, refactor]
dependency_graph:
  requires: []
  provides: [CHROME-01]
  affects: [WindowFrame, AppShell, ContextualPrompt, DesktopShell]
tech_stack:
  added: []
  patterns: [useState-toggle, stopPropagation-drag-guard, memo-comparator]
key_files:
  created: []
  modified:
    - src/ui/WindowFrame.tsx
    - src/ui/AppShell.tsx
    - src/ui/AppShell.test.tsx
    - src/ui/WindowFrame.test.tsx
    - src/ui/MarketplaceModify.test.tsx
    - src/ui/MarketplaceWindows.test.tsx
    - src/ui/DesktopShell.test.tsx
decisions:
  - "ContextualPrompt rendered inside .window-chrome after titlebar div (not portalled) — titlebar overflow does not clip popover, KISS/YAGNI per CONTEXT.md"
  - "AppShell keeps displayName prop for role=region aria-label so existing findByRole(region, {name}) tests continue to pass"
  - "⋮ button onClick calls e.stopPropagation() to prevent drag onPointerDown from firing on click"
  - "WindowBody no longer passes onModify or hideClose to AppShell — both are now titlebar-owned"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-27"
  tasks_completed: 3
  files_changed: 7
---

# Phase 19 Plan 01: Menu Relocation Summary

**One-liner:** Moved per-app ⋮ contextual menu from AppShell body into WindowFrame titlebar, making the app body a chrome-free zone for Phase 20 iframe isolation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED — update 5 test files to find ⋮ in titlebar | 6bc28a6 | AppShell.test.tsx, WindowFrame.test.tsx, MarketplaceModify.test.tsx, MarketplaceWindows.test.tsx, DesktopShell.test.tsx |
| 2 | GREEN — move ⋮ + ContextualPrompt to WindowFrame; strip AppShell | 1f08804 | WindowFrame.tsx, AppShell.tsx |
| 3 | Full-suite regression + hygiene gate + tsc | (no source changes) | — |

## What Was Built

- **WindowFrame.tsx**: Added `promptOpen` useState + `handleApply`; renders ⋮ button as third grid column in `.window-chrome__titlebar` (after title-group, right-aligned opposite traffic-lights). `ContextualPrompt` renders inside `.window-chrome` after the titlebar div. `WindowBody` no longer passes `onModify` or `hideClose` to `AppShell`.
- **AppShell.tsx**: Stripped to content-only wrapper — `role="region"` + `aria-label={displayName}` + `app-shell__content` div. Removed `useState`, `MoreVertical`, `ContextualPrompt` imports. Removed `onClose`, `onModify`, `hideClose` props.
- **5 test files**: Updated to find ⋮ in `.window-chrome__titlebar` via `frame.querySelector(".window-chrome__titlebar")` + `within(titlebar)` pattern. Behavioral assertions (transport-call checks, remove/clone/tweak semantics) preserved unchanged.

## Verification Results

- `npm test` — 725 tests, 83 files, all pass (net -2 from AppShell.test.tsx: 3 header tests → 1 region test, expected and acceptable per CONTEXT.md)
- `npm run typecheck` — 0 errors
- `npm test -- src/hygiene.test.ts` — passes (no banned tokens in moved strings)
- `npm test -- src/csp.test.ts` — passes (FOUC/CSP hash untouched)
- `grep -c "app-shell__header" src/ui/AppShell.tsx` — 0
- `grep -c "App options" src/ui/WindowFrame.tsx` — 1 (in titlebar); AppShell.tsx — 0
- `grep -c "ContextualPrompt" src/ui/WindowFrame.tsx` — 2; AppShell.tsx — 0
- No new npm dependencies

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all wiring is complete. The ⋮ button in the titlebar calls `onModify`, which is already plumbed from `DesktopShell.handleModify` through `WindowFrame.onModify`. MOD-01..04 all pass from the titlebar.

## Threat Flags

No new security-relevant surface introduced. The moved strings ("App options", "Options", "Modify"/"Apply"/"Cancel") carry no banned tokens; hygiene gate confirmed green (T-19-01 mitigated). The `onModify` routing from titlebar (T-19-02) has the same attack surface as the prior body ⋮ — remove/clone resolve client-side with no model call.

## Self-Check: PASSED

- src/ui/WindowFrame.tsx — exists, contains "App options" (1 match)
- src/ui/AppShell.tsx — exists, contains no "app-shell__header"
- Commit 6bc28a6 (test RED) — verified in git log
- Commit 1f08804 (feat GREEN) — verified in git log
- Full suite: 725 tests green
- tsc: 0 errors
