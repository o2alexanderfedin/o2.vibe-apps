---
phase: "14"
plan: "01"
subsystem: registry
tags: [indexeddb, schema, settings, tdd]
dependency_graph:
  requires: []
  provides: [settings-store, SettingRecord, REGISTRY_DB_VERSION-3]
  affects: [src/registry/db.ts]
tech_stack:
  added: []
  patterns: [additive-idb-upgrade, tdd-red-green]
key_files:
  created: [src/registry/db.test.ts]
  modified: [src/registry/db.ts]
decisions:
  - "Additive upgrade guard pattern (if !objectStoreNames.contains) reused verbatim — no migration, existing data untouched"
  - "SettingRecord uses value: unknown + index signature for forward-compat, matching AppRecord pattern"
metrics:
  duration: "4 minutes"
  completed: "2026-06-26T21:46:26Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 14 Plan 01: Registry DB v3 (Settings Store) Summary

**One-liner:** Additive IndexedDB schema bump v2→v3 adding a typed `settings` object store and `SettingRecord` interface for persistent named-theme preference.

## What Was Done

Bumped the Marketplace registry IndexedDB schema from version 2 to version 3 using the existing additive upgrade pattern. Added:

1. `REGISTRY_DB_VERSION` constant: `2` → `3`
2. New `SettingRecord` interface: `{ key: string; value: unknown; [key: string]: unknown }`
3. Extended `RegistrySchema` with `settings: { key: string; value: SettingRecord }`
4. Additive upgrade guard in `openRegistry()`: `if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings")`

TDD cycle followed: RED (failing tests committed first), then GREEN (implementation made tests pass).

## Files Changed

| File | Change |
|------|--------|
| `src/registry/db.ts` | Bumped version 2→3, added `SettingRecord`, extended `RegistrySchema`, added upgrade guard |
| `src/registry/db.test.ts` | NEW — 5 tests for additive v2→v3 migration |

## Tests Added

`src/registry/db.test.ts` — describe block "db — additive upgrade v2→v3 (settings store)":

1. `openRegistry resolves at version 3` — asserts `REGISTRY_DB_VERSION === 3` and `db.version === 3`
2. `settings store is present after upgrade` — asserts `db.objectStoreNames.contains("settings")`
3. `apps, widgets, handlers stores are intact after upgrade` — non-destructive check
4. `existing records in apps store survive the upgrade` — put before close, re-open, get still works
5. `settings store round-trips a key-value record` — put `{ key: "osTheme", value: "noir" }`, get returns `"noir"`

## Verification Status

| Check | Result |
|-------|--------|
| `npx vitest run src/registry/db.test.ts` | 5/5 passed |
| `npx vitest run src/registry/registry.test.ts src/registry/storagePressure.test.ts` | 26/26 passed |
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run src/hygiene.test.ts` | 2/2 passed |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `404456a` | test(14-01) | add failing v2→v3 settings-store migration tests |
| `a8e4ab0` | feat(14-01) | add settings store + SettingRecord, bump registry DB to v3 |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the settings store is a complete, functional IDB object store with no placeholder data.

## Threat Flags

None — the `settings` store is an existing IndexedDB database (same trust boundary as `apps`/`widgets`/`handlers`); no new network endpoints, auth paths, or trust boundaries introduced.

## Self-Check: PASSED

- `src/registry/db.test.ts` exists: FOUND
- `src/registry/db.ts` modified: FOUND
- Commit `404456a` exists: FOUND (test RED)
- Commit `a8e4ab0` exists: FOUND (feat GREEN)
- All 5 db.test.ts tests pass: CONFIRMED
- All 26 existing registry tests pass: CONFIRMED
- TypeScript: 0 errors: CONFIRMED
- Hygiene: 2/2 passed: CONFIRMED
