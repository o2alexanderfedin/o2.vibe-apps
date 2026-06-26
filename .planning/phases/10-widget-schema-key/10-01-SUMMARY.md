---
phase: "10-widget-schema-key"
plan: "01"
subsystem: "registry/types"
tags: [typescript, registry, types, lru, widget, handler]
dependency_graph:
  requires: []
  provides: [WidgetRecord-interface, HandlerRecord-interface, widget-lru-write-parity]
  affects: [src/registry/db.ts, src/execution/widgetPrewarm.ts, src/execution/handler.ts]
tech_stack:
  added: []
  patterns: [interface-extends-LruMeta, named-required-fields-plus-catch-all]
key_files:
  created: []
  modified:
    - src/registry/db.ts
    - src/execution/widgetPrewarm.ts
    - src/execution/handler.ts
    - src/registry/registry.test.ts
    - src/registry/storagePressure.test.ts
decisions:
  - "WidgetRecord and HandlerRecord use 'extends LruMeta' (interface extension), not '& LruMeta' (type intersection), matching the AppRecord pattern"
  - "HandlerRecord's identity field is 'intent' (not 'type'), matching the actual handler write shape in handler.ts"
  - "touchHandler in handler.ts param updated from Record<string,unknown> to HandlerRecord to satisfy tsc after type tightening"
  - "Test fixtures in registry.test.ts and storagePressure.test.ts updated with required named fields — this is bug correction, not test weakening"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-26"
  tasks: 2
  files_changed: 5
---

# Phase 10 Plan 01: Widget/Handler Schema Typing (WIDGET-07 + WIDGET-07d) Summary

**One-liner:** Replaced `Record<string,unknown>&LruMeta` placeholder type aliases for `WidgetRecord` and `HandlerRecord` with explicit `interface extends LruMeta` declarations (named required fields + catch-all), and added `useCount:0`/`updatedAt:Date.now()` to both widget registry write sites for LRU parity.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Replace WidgetRecord/HandlerRecord placeholders with explicit interfaces in db.ts | f6ad45a |
| 2 | Add LRU write parity to both widget write sites; fix tsc errors surfaced by tighter types | 7b87437 |

## Changes Made

### src/registry/db.ts
Replaced:
```typescript
export type WidgetRecord = Record<string, unknown> & LruMeta;
export type HandlerRecord = Record<string, unknown> & LruMeta;
```
With explicit interfaces:
```typescript
export interface WidgetRecord extends LruMeta {
  cacheKey: string;
  type: string;
  source: string;
  transpiledJS: string;
  [key: string]: unknown;
}
export interface HandlerRecord extends LruMeta {
  cacheKey: string;
  intent: string;
  source: string;
  transpiledJS: string;
  [key: string]: unknown;
}
```

### src/execution/widgetPrewarm.ts
Both widget `registry.put` write sites (in `resolveWidget` and `resolveWidgetTweak`) now include `useCount: 0, updatedAt: Date.now()` for LRU parity with handler/app write paths.

### src/execution/handler.ts (Rule 1 auto-fix)
`touchHandler` parameter changed from `Record<string, unknown>` to `HandlerRecord`; added `import type { HandlerRecord } from "../registry/db"`. Surfaced by the WIDGET-07 type tightening — the spread `{ ...record, useCount, updatedAt }` now correctly infers `HandlerRecord`.

### src/registry/registry.test.ts (Rule 1 auto-fix)
Two test fixtures updated with required `WidgetRecord`/`HandlerRecord` named fields (were missing `cacheKey`, `source`, `transpiledJS`). Tests still verify roundtrip put/get behavior.

### src/registry/storagePressure.test.ts (Rule 1 auto-fix)
LRU eviction test fixture updated: widget and handler records now include required named fields alongside the `updatedAt`/`useCount` fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] handler.ts touchHandler param was loosely typed as Record<string,unknown>**
- **Found during:** Task 2 (tsc run after type tightening)
- **Issue:** `touchHandler(services, key, stored)` passed a `HandlerRecord` but param typed as `Record<string,unknown>` — spread into `put("handlers", ...)` now fails to satisfy `HandlerRecord`.
- **Fix:** Changed param type to `HandlerRecord`; imported `HandlerRecord` from `db.ts`.
- **Files modified:** `src/execution/handler.ts`
- **Commit:** 7b87437

**2. [Rule 1 - Bug] registry.test.ts widget/handler fixtures were incomplete**
- **Found during:** Task 2 (tsc run after type tightening)
- **Issue:** Test fixtures `{ type: "counter" }` and `{ route: "/data" }` missing required fields `cacheKey`, `source`, `transpiledJS` (and `intent` for handlers).
- **Fix:** Added all required named fields to the test objects.
- **Files modified:** `src/registry/registry.test.ts`
- **Commit:** 7b87437

**3. [Rule 1 - Bug] storagePressure.test.ts eviction fixtures were incomplete**
- **Found during:** Task 2 (tsc run after type tightening)
- **Issue:** Eviction test put `{ updatedAt: 100, useCount: 0 }` for widgets/handlers, missing required named fields.
- **Fix:** Added `cacheKey`, `type`/`intent`, `source`, `transpiledJS` to the fixtures.
- **Files modified:** `src/registry/storagePressure.test.ts`
- **Commit:** 7b87437

## Verification Output

### tsc --noEmit
```
(no output — exits 0)
```

### npm test
```
 Test Files  43 passed (43)
      Tests  333 passed (333)
   Start at  03:43:33
   Duration  16.63s
```

Note: The worktree baseline is 333 tests (vs. the plan's >=393 target which reflects the main branch state). All 333 tests pass — no regression from this plan's changes. The test count difference is a worktree isolation artifact; the plan's success criterion of "no regression" is satisfied.

## Known Stubs

None. This plan made no UI changes and introduced no placeholder data.

## Threat Flags

None. This plan makes only internal type-annotation and additive write-literal changes. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check: PASSED

- [x] `src/registry/db.ts` contains `export interface WidgetRecord extends LruMeta` — FOUND
- [x] `src/registry/db.ts` contains `export interface HandlerRecord extends LruMeta` — FOUND
- [x] Old `Record<string, unknown> & LruMeta` aliases gone from db.ts — CONFIRMED
- [x] `src/execution/widgetPrewarm.ts` has 2 write sites with `useCount: 0, updatedAt: Date.now()` — CONFIRMED
- [x] Commit f6ad45a exists — CONFIRMED (Task 1)
- [x] Commit 7b87437 exists — CONFIRMED (Task 2)
- [x] `npx tsc --noEmit` exits 0 — CONFIRMED
- [x] `npm test` passes (333/333) — CONFIRMED
