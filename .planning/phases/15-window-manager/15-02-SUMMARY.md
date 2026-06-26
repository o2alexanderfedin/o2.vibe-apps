---
phase: 15
plan: "02"
subsystem: ui
tags: [window-manager, context, react-hook, zero-leak, z-order, tdd]
dependency_graph:
  requires: [src/execution/mount.ts, src/lib/logger.ts]
  provides: [src/ui/useWindowManager.tsx]
  affects: [phase-15 plans 03-04 (WindowFrame + AppShell wiring)]
tech_stack:
  added: []
  patterns:
    - Module-level zTop/counter for cross-render state without a ref
    - openIdsRef updated synchronously inside setWindows updater for instant isOpen guard
    - Non-null assertions on array elements (noUncheckedIndexedAccess strictness)
key_files:
  created:
    - src/ui/useWindowManager.tsx
    - src/ui/useWindowManager.test.tsx
  modified: []
decisions:
  - Read windows[0] outside act() (after flush) — React 19 does not batch state reads during same act() call
  - isOpen ref updated inside setWindows updater so it is synchronous with the state mutation
  - JSX type imported from react (not global JSX namespace) per TS 6 strict mode
metrics:
  duration: "~5 minutes"
  completed: "2026-06-26"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 15 Plan 02: Window Manager State Hook Summary

WindowManagerContext + provider + hook with zero-leak close (unmountApp on every close), bounded z-order (++zTop), cascade placement with viewport clamp, and synchronous isOpen guard via ref-mirror updated inside the state updater.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| RED  | Failing tests for all 6 behaviors | 1f75bc7 | src/ui/useWindowManager.test.tsx |
| GREEN | Implement useWindowManager | 114a053 | src/ui/useWindowManager.tsx + test fixes |

## Commits

- `1f75bc7` `test(15-02): add failing window-manager state + zero-leak tests`
- `114a053` `feat(15-02): implement useWindowManager with zero-leak close + bounded z-order`

## Test Coverage

6 tests, all passing (339 total suite, 0 regressions):

1. open mints + returns instanceId, adds entry with minimized=false and numeric z
2. cascade placement offsets second window down-right, both within viewport
3. z-order focus raises to max z via single bounded ++zTop increment
4. minimize/restore preserves x/y/z (only minimized flag and z change on restore)
5. close calls unmountApp and drops entry — mountedCount returns to baseline (zero leak)
6. isOpen is synchronous primary guard: true after open, false after close

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test state read timing with React 19**
- **Found during:** GREEN phase
- **Issue:** Reading `result.current.windows[0]` inside the same `act()` as `open()` returned undefined — React 19 does not flush state synchronously during the act callback
- **Fix:** Split open() call and subsequent windows[] read into separate act() calls (open inside act, read after act returns)
- **Files modified:** src/ui/useWindowManager.test.tsx
- **Commit:** 114a053

**2. [Rule 1 - Bug] TypeScript strict mode: JSX namespace not global in TS 6**
- **Found during:** GREEN phase (tsc --noEmit)
- **Issue:** `JSX.Element` return type in provider function caused TS2503 ("Cannot find namespace 'JSX'") under TypeScript 6 strict mode
- **Fix:** Import `JSX` from "react" explicitly
- **Files modified:** src/ui/useWindowManager.tsx
- **Commit:** 114a053

**3. [Rule 1 - Bug] TypeScript strict mode: noUncheckedIndexedAccess on array elements**
- **Found during:** GREEN phase (tsc --noEmit)
- **Issue:** `windows[0].id` etc. required non-null assertion under strict array access rules
- **Fix:** Added `!` non-null assertions on all array element accesses in test file
- **Files modified:** src/ui/useWindowManager.test.tsx
- **Commit:** 114a053

## Known Stubs

None. All behaviors are fully implemented and verified.

## Threat Flags

None. This module is pure state management with no network access, no storage, and no new trust boundaries.

## TDD Gate Compliance

- RED gate: commit `1f75bc7` (`test(15-02): ...`) — tests failed with missing module error
- GREEN gate: commit `114a053` (`feat(15-02): ...`) — all 6 tests pass

## Self-Check: PASSED

- src/ui/useWindowManager.tsx: FOUND
- src/ui/useWindowManager.test.tsx: FOUND
- Commit 1f75bc7: FOUND (git log)
- Commit 114a053: FOUND (git log)
- Hygiene check (no banned tokens): PASSED
- TypeScript: 0 errors
- Tests: 6/6 passed, 339/339 suite
