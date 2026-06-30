---
phase: 21-desktop-persistence
plan: "01"
subsystem: host/settings + host/layout
tags:
  - settings-store
  - layout-persistence
  - tdd
  - idb
  - type-guard
dependency_graph:
  requires:
    - "src/registry/db.ts (openRegistry, SettingRecord, settings store at DB v3)"
    - "src/ui/useWindowManager.tsx (WindowEntry interface)"
    - "src/services/services.ts (SettingsStore in Services bundle)"
  provides:
    - "SettingsStore.writeRaw/readRaw — raw-key settings store seam for Phase 21 layout persistence"
    - "RecordingSettingsStore.rawWrites/rawWriteCount — per-key write tracking for Plan 21-04 debounce tests"
    - "layoutPersistence.ts — LAYOUT_KEY, LayoutEntry, isLayoutEntry, serializeLayout, deserializeLayout"
  affects:
    - "Plan 21-03 (DesktopShell save effect uses writeRaw + LAYOUT_KEY + serializeLayout)"
    - "Plan 21-03 (DesktopShell restore effect uses readRaw + LAYOUT_KEY + deserializeLayout)"
    - "Plan 21-04 (debounce test uses RecordingSettingsStore.rawWriteCount)"
tech_stack:
  added: []
  patterns:
    - "best-effort IDB mirror with try/catch swallow — same guard pattern as write()/read()"
    - "pure module for layout transforms (no React, no IDB, zero external deps)"
    - "isLayoutEntry strict 7-key check: Object.keys length guard + per-key Set membership + typeof checks"
    - "TDD RED/GREEN commits — separate test commit before implementation commit"
key_files:
  created:
    - src/host/layoutPersistence.ts
    - src/host/layoutPersistence.test.ts
    - src/host/settingsStore.raw.test.ts
  modified:
    - src/host/settingsStore.ts
    - src/services/testServices.ts
decisions:
  - "isLayoutEntry checks exact key count (7) plus Set membership so objects with extra fields (e.g. instanceId) return false — prevents stale or tampered IDB data from silently passing through"
  - "deserializeLayout wraps JSON.parse in try/catch and returns [] for any failure — corrupt data yields fresh desktop start, never an error propagated to the user (T-21-01)"
  - "serializeLayout maps fields explicitly (not spread + omit) so the inclusion set is exact and can never accidentally include a future WindowEntry field (T-21-02)"
  - "REGISTRY_DB_VERSION kept at 3 — windowLayout is an additive IDB key under the existing settings store; no schema change required"
metrics:
  duration_minutes: 7
  completed_date: "2026-06-30"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 2
  tests_added: 48
  tests_total_after: 875
---

# Phase 21 Plan 01: Settings Store Raw Methods and Layout Persistence Foundation Summary

**One-liner:** Raw-key settings store seam (writeRaw/readRaw) and pure layout persistence module (LayoutEntry/isLayoutEntry/serializeLayout/deserializeLayout) with 48 new TDD tests, zero regressions.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 (RED) | Failing tests for writeRaw/readRaw | ab33287 | src/host/settingsStore.raw.test.ts (+) |
| 1 (GREEN) | Extend SettingsStore + RecordingSettingsStore | c03e0c3 | src/host/settingsStore.ts, src/services/testServices.ts |
| 2 (RED) | Failing tests for layoutPersistence | a4504dc | src/host/layoutPersistence.test.ts (+) |
| 2 (GREEN) | Create layoutPersistence.ts | 521c1a4 | src/host/layoutPersistence.ts (+), src/host/layoutPersistence.test.ts |

## What Was Built

### Task 1: SettingsStore raw-key seam

Extended `src/host/settingsStore.ts` to add two new methods to the `SettingsStore` interface:
- `writeRaw(key: string, value: string): Promise<void>` — stores any string under a caller-supplied IDB key using the same openRegistry() + db.put pattern as `write()`. Best-effort: try/catch swallows IDB errors.
- `readRaw(key: string): Promise<string | null>` — reads from the same settings store by caller-supplied key. Returns null when the key is absent or on any IDB error.

`realSettingsStore` was extended with both implementations. The existing `write()`/`read()` methods using the fixed `SETTINGS_KEY = "osTheme"` constant are unchanged.

Extended `src/services/testServices.ts` `RecordingSettingsStore` interface and `createRecordingSettingsStore()` factory:
- `writeRaw` / `readRaw` backed by `Map<string, string[]>` and `Map<string, string>` in-memory
- `rawWrites: ReadonlyMap<string, readonly string[]>` — ordered per-key write history
- `rawWriteCount(key: string): number` — convenience count for Plan 21-04 debounce assertions

### Task 2: layoutPersistence.ts pure module

Created `src/host/layoutPersistence.ts` with zero external dependencies:
- `LAYOUT_KEY = "windowLayout"` — single source of truth for the IDB settings key
- `LayoutEntry` interface — exactly 7 fields: appType, title, icon, x, y, z, minimized
- `isLayoutEntry(v: unknown): v is LayoutEntry` — strict guard: checks `Object.keys(v).length === 7`, every key is in a `Set` of the 7 canonical names, and each field is the correct type
- `serializeLayout(windows: WindowEntry[]): string` — explicit 7-field pick to JSON string; never includes id, instanceId, maximized, restoreRect, snapSide
- `deserializeLayout(raw: string): LayoutEntry[]` — try/catch JSON.parse + `!Array.isArray` guard + `.filter(isLayoutEntry)`; any failure returns []

## Verification

```
npx tsc --noEmit          → 0 errors
npx vitest run            → 90 test files, 875 tests, 0 failures
hygiene.test.ts           → 9/9 pass (no banned tokens in new files)
REGISTRY_DB_VERSION       → 3 (unchanged — grep -c returns 2, value 3)
writeRaw/readRaw in interface + realSettingsStore → confirmed
LAYOUT_KEY = "windowLayout" → confirmed
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict-mode null-check errors in test file**
- **Found during:** Task 2 GREEN phase, `npx tsc --noEmit` run
- **Issue:** TypeScript strict mode (`noUncheckedIndexedAccess` equivalent) flagged `parsed[0]`, `result[0]`, and `result[0] as Record<string, unknown>` as possibly undefined in the test file. TypeScript cannot infer that `toHaveLength(1)` guarantees a non-undefined first element.
- **Fix:** Used non-null assertions (`parsed[0]!`, `result[0]!`, `result[0]!`) after the `toHaveLength` assertions; cast `result[0] as unknown as Record<string, unknown>` for the transient-field check.
- **Files modified:** `src/host/layoutPersistence.test.ts`
- **Commit:** 521c1a4 (included in GREEN commit)

## TDD Gate Compliance

Task 1:
- RED commit `ab33287` — `test(21-01)`: 12 failing tests for writeRaw/readRaw
- GREEN commit `c03e0c3` — `feat(21-01)`: implementation passes all 12 tests

Task 2:
- RED commit `a4504dc` — `test(21-01)`: 36 failing tests for layoutPersistence (module not found)
- GREEN commit `521c1a4` — `feat(21-01)`: implementation passes all 36 tests

Both plans satisfied the RED → GREEN gate sequence.

## Threat Surface Scan

No new network endpoints, auth paths, or trust-boundary surfaces introduced. All changes are:
- Interface extensions to existing seams (SettingsStore, RecordingSettingsStore)
- A new pure helper module (layoutPersistence.ts) with no IDB access of its own

The threat model entries T-21-01 and T-21-02 from the plan are fully mitigated:
- T-21-01 (Tampering via corrupt IDB): `deserializeLayout` try/catch + `isLayoutEntry` filter — confirmed by test cases for invalid JSON, null, objects, mixed arrays
- T-21-02 (Information Disclosure via serialization): `serializeLayout` explicit 7-field pick — confirmed by tests asserting instanceId, id, maximized, restoreRect, snapSide are absent

## Self-Check: PASSED

Files exist:
- src/host/layoutPersistence.ts: FOUND
- src/host/layoutPersistence.test.ts: FOUND
- src/host/settingsStore.raw.test.ts: FOUND

Commits exist:
- ab33287: FOUND (test RED - settingsStore.raw)
- c03e0c3: FOUND (feat GREEN - settingsStore + testServices)
- a4504dc: FOUND (test RED - layoutPersistence)
- 521c1a4: FOUND (feat GREEN - layoutPersistence)

Test results: 875/875 passing, 0 failures.
TypeScript: 0 errors.
REGISTRY_DB_VERSION: 3 (unchanged).
