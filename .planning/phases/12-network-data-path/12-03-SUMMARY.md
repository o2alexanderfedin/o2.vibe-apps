---
phase: "12-network-data-path"
plan: "03"
subsystem: execution
tags: [fetchData, handler-scope, data-broker, services-di, constrained-scope, DATA-01]
dependency_graph:
  requires:
    - src/data/dataBroker.ts (DataFetchBroker interface, createDataBroker — Plan 12-01)
  provides:
    - src/execution/handler.ts (executeHandler with fetchData param; runHandler with boundFetchData closure)
    - src/services/services.ts (Services.fetchDataBroker? field; createServices wiring)
    - src/services/testServices.ts (TestServicesOverrides.fetchDataBroker?; cannedBroker; unusedBroker)
  affects:
    - Plans 12-04 and beyond (seeded handlers call fetchData via the injected closure)
tech_stack:
  added: []
  patterns:
    - Services-bound closure injected into constrained scope (mirrors boundRunHandler in loader.ts)
    - Optional Services field — feature-only, core flow unaffected when absent
    - canned/unused test double pattern — mirrors cannedTransport/unusedTransport
    - TDD RED/GREEN gate sequence (test commit then implementation commit)
key_files:
  created: []
  modified:
    - src/services/services.ts
    - src/services/testServices.ts
    - src/execution/handler.ts
decisions:
  - >
    fetchData placed before input in the params array and fn() call, mirroring the
    positional convention already established for the CJS shims and DENIED_GLOBALS.
    This is the required ordering per DATA-01 and PATTERNS.md.
  - >
    executeHandlerSource receives an internal no-op stub (not exposed as a parameter)
    so existing callers (source + input only) compile and run unchanged. The stub
    returns { error: "Data not available." } if fetchData is called.
  - >
    boundFetchData uses ?.fetch() guard + ?? fallback so absent broker returns neutral
    { error } without throwing — preserving the core loop (T-12-03-C).
  - >
    cannedBroker/unusedBroker follow the exact cannedTransport/unusedTransport naming
    and shape convention from testServices.ts, making the data-path test doubles
    immediately discoverable to developers familiar with the existing pattern.
metrics:
  duration: "4 minutes"
  completed: "2026-06-26"
  tasks: 2
  files_modified: 3
  tests_added: 8
  tests_total: 488
---

# Phase 12 Plan 03: DATA-01 Injection — fetchData into Handler Constrained Scope

## One-liner

Services-bound fetchData closure injected into handler new Function() scope before input; real DataFetchBroker wired in createServices(); canned/unused test doubles added; raw fetch/XHR remain denied.

## What Was Built

### Task 1: Services and TestServices wiring (0f232dc)

`src/services/services.ts`:
- Added `import { createDataBroker, type DataFetchBroker }` from dataBroker.ts
- Added optional `fetchDataBroker?: DataFetchBroker` field to `Services` interface with JSDoc (DATA-01)
- Added `fetchDataBroker: createDataBroker({ clock: realClock })` to `createServices()` return

`src/services/testServices.ts`:
- Added `import type { DataFetchBroker }` (type-only import)
- Added `fetchDataBroker?: DataFetchBroker` to `TestServicesOverrides` interface
- Added `fetchDataBroker: overrides.fetchDataBroker` to `createTestServices()` return (undefined by default)
- Exported `cannedBroker(response)` — returns `{ fetch: () => Promise.resolve(response) }`
- Exported `unusedBroker` — throws if ever invoked (mirrors unusedTransport)

### Task 2: Handler constrained scope injection (ab96a94 RED + 9f3cd36 GREEN)

`src/execution/handler.ts`:
- `executeHandler` signature: added `fetchData` parameter before `input`
- Params array: added `"fetchData"` between `...DENIED_GLOBALS` and `"input"`
- `fn()` call: added `fetchData` between `...deniedArgs` and `input` (positional order matches params)
- `runHandler`: builds `boundFetchData` closure using `services.fetchDataBroker?.fetch() ?? Promise.resolve({ error })` before calling `executeHandler`
- `executeHandlerSource`: binds internal no-op stub for `fetchData` — existing callers unchanged

TDD gate sequence:
1. `test(12-03)` commit ab96a94: 2 failing tests (RED gate passed — tests confirmed failing before implementation)
2. `feat(12-03)` commit 9f3cd36: all 33 handler tests pass (GREEN gate)

## Verification Results

- `tsc --noEmit`: 0 errors
- Full test suite: 488/488 passing, 58 test files (was 388 at Wave 1 start; increased by Wave 1 plans 01+02 + 8 new tests here)
- `DENIED_GLOBALS` still contains "fetch" and "XMLHttpRequest" — raw network stays denied
- `"fetchData"` appears in params array BEFORE `"input"` (grep verified)
- `fn(mod, mod.exports, requireShim, ...deniedArgs, fetchData, input)` — positional order correct
- `fetchDataBroker` appears in Services interface and createServices() return
- `cannedBroker` and `unusedBroker` exported from testServices.ts
- Hygiene check: no banned mechanic tokens in any modified shipped source file

## Deviations from Plan

None — plan executed exactly as written. The TDD gate sequence (RED → GREEN) was followed correctly with the tests confirmed failing before implementation.

## Known Stubs

None — all functionality is wired. The `executeHandlerSource` no-op stub is intentional test infrastructure, not a shipped stub. The `unusedBroker` is a sentinel, not a data stub.

## Threat Flags

No new threat surface beyond what is documented in the plan's threat model. All four `mitigate`-disposition threats from the plan are implemented:

- T-12-03-A: boundFetchData is a closure; Services never passed into generated scope
- T-12-03-B: "fetch" and "XMLHttpRequest" remain in DENIED_GLOBALS, shadowed to undefined
- T-12-03-C: absent broker falls back to `Promise.resolve({ error })` — never throws
- T-12-03-D: data path is keyless; Anthropic key never enters fetchData

## TDD Gate Compliance

- RED gate: commit ab96a94 `test(12-03): add failing tests...` — tests confirmed failing before implementation
- GREEN gate: commit 9f3cd36 `feat(12-03): inject fetchData closure...` — all 33 tests passing

## Self-Check: PASSED

- src/services/services.ts: EXISTS (modified)
- src/services/testServices.ts: EXISTS (modified)
- src/execution/handler.ts: EXISTS (modified)
- Commits 0f232dc, ab96a94, 9f3cd36: EXIST in git log
- tsc --noEmit: 0 errors
- npm test: 488/488 passing
