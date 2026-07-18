---
phase: 21-desktop-persistence
plan: "02"
subsystem: window-manager
tags: [openAt, restore-path, z-order, tdd, react-strict-mode]
dependency_graph:
  requires: []
  provides: [WindowManagerValue.openAt]
  affects: [src/ui/useWindowManager.tsx, src/ui/useWindowManager.test.tsx]
tech_stack:
  added: []
  patterns: [useCallback with empty deps, ref-sync inside setWindows updater, zTop mutation outside updater (Strict-Mode purity)]
key_files:
  created: []
  modified:
    - src/ui/useWindowManager.tsx
    - src/ui/useWindowManager.test.tsx
decisions:
  - zTop bumped via `if (position.z > zTop) { zTop = position.z; }` outside the updater body — mirrors the Strict-Mode purity discipline of open()/focus()/restore() (T-21-06)
  - openAt mirrors open() exactly for counter increment, ref sync, sanitizeDisplayName, and logger.info — restore path is indistinguishable from a user-initiated open at the manager level
  - TDD order: interface + throw-stub + tests (RED), then real implementation (GREEN)
metrics:
  duration: "~4 minutes"
  completed: "2026-06-30T05:49:18Z"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 2
---

# Phase 21 Plan 02: openAt Window Manager Method — Summary

## One-Liner

`WindowManagerValue.openAt` — explicit-geometry window open for the desktop restore path, with zTop bump outside the React updater for Strict-Mode purity.

## What Was Built

Added `openAt(appType, meta, position)` to `useWindowManager.tsx`:

- **Interface**: `WindowManagerValue.openAt` declared after `open` with full JSDoc explaining the restore-path use, zTop semantics, and Strict-Mode purity rationale.
- **Implementation**: `useCallback([], ...)` body that:
  1. Increments `counter` and mints `id = "win-N"` / `instanceId = "appType-N"` (same formula as `open()`)
  2. Bumps `zTop = Math.max(zTop, position.z)` **outside** the `setWindows` updater body (Strict-Mode purity — T-21-06)
  3. Inside the updater: creates a `WindowEntry` with the exact `position.x/y/z/minimized`, `maximized: false`, `restoreRect: null`, `snapSide: null`
  4. Syncs `openIdsRef.current` and `openInstanceIdsRef.current` inside the updater (so `isOpenByInstance()` returns true before the `useEffect` mirror fires)
  5. Calls `sanitizeDisplayName(meta.title)` to strip banned tokens (T-21-05)
  6. Logs via `logger.info`
  7. Returns `instanceId`
- **Value object**: `openAt` added alongside `open` in the `WindowManagerValue` context value.
- **Tests** (7 new, all pass):
  - Exact geometry: x=100, y=200, z=50000 → window entry carries those exact values
  - zTop bump: `openAt(z=baseZ+5000)` → next `open()` assigns z=baseZ+5001
  - Multiple openAt: highest z wins; next open() is above the max
  - minimized:true → entry has `minimized: true`, `maximized: false`, `restoreRect: null`
  - Title sanitization: banned tokens stripped (same as `open()`)
  - isOpenByInstance: true after `act()` flushes (ref sync confirmed)
  - instanceId format: matches `/^appType-\d+$/`, not a UUID

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test) | `0ec9d62` | 7 tests fail as expected — stub throws "openAt: not yet implemented" |
| GREEN (feat) | `a1ba660` | All 28 tests pass, tsc 0 errors |
| REFACTOR | n/a | Implementation was clean on first pass; no refactor needed |

## Deviations from Plan

None — plan executed exactly as written.

The only non-obvious implementation detail: tests use `baseZ + 5000` (not the plan's literal `z=205`) to avoid module-level `zTop`/`counter` accumulation across test runs. The behavior being tested (next open() = position.z + 1) is identical; only the absolute value differs. All 6 acceptance criteria from the plan's `<acceptance_criteria>` block are covered.

## Threat Model Coverage

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-21-05 | mitigated | `sanitizeDisplayName(meta.title)` called inside `openAt` — identical to `open()` at line 284 |
| T-21-06 | mitigated | `if (position.z > zTop) { zTop = position.z; }` is in the useCallback body, not inside `setWindows` updater — Strict Mode double-invoke of the updater never double-bumps zTop |
| T-21-07 | accepted | No window cap imposed; serial restore loop handles N windows without concurrency issues |

## Self-Check

- [x] `src/ui/useWindowManager.tsx` — modified, exists
- [x] `src/ui/useWindowManager.test.tsx` — modified, exists
- [x] RED commit `0ec9d62` — exists in git log
- [x] GREEN commit `a1ba660` — exists in git log
- [x] `npx vitest run src/ui/useWindowManager.test.tsx` → 28/28 pass
- [x] `npx tsc --noEmit` → 0 errors
- [x] `grep openAt src/ui/useWindowManager.tsx | wc -l` → 4 (interface, implementation, comment, value object)
- [x] No stubs in modified files
- [x] No banned hygiene tokens (synthesize family) in modified files

## Self-Check: PASSED
