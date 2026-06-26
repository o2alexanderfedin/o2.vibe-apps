---
phase: 11-reliability-hardening
plan: "01"
subsystem: execution
tags: [zod, validation, state-schema, delegated-shell, reliability]

# Dependency graph
requires:
  - phase: 10-thin-shell
    provides: DelegatedShell + makeDelegatedComponent + the merge step being patched
provides:
  - Lenient-partial state validation at the DelegatedShell merge step (RELY-01)
  - deriveStateSchema(initialState) helper using zod/mini (RELY-03)
  - zod as a production dependency (subpath zod/mini available)
  - 17 new tests proving schema semantics + keep-prior behavior + no-op paths
affects:
  - 11-02-PLAN (RELY-02 no-op path builds on the same merge step)
  - Any future plan touching DelegatedShell props or the merge logic

# Tech tracking
tech-stack:
  added:
    - zod ^4.4.3 (production dep; zod/mini subpath used)
  patterns:
    - "Derive schema once at instantiation (makeDelegatedComponent), not per-click"
    - "Lenient partial schema: looseObject + optional fields = partial+passthrough+type-check"
    - "safeParse gates setState; success → merge, failure → gated logger.error + keep prior"
    - "TDD RED/GREEN for behavior-adding tasks"

key-files:
  created:
    - src/execution/stateSchema.ts
    - src/execution/delegatedValidation.test.tsx
  modified:
    - src/execution/delegated.tsx
    - package.json
    - package-lock.json

key-decisions:
  - "Use z.looseObject(shape) with z.optional(...) per field — lenient partial passthrough (not z.object().partial() which still rejects unknown keys in some zod versions)"
  - "Schema derived once in makeDelegatedComponent (not DelegatedShell hook) to avoid re-derivation on re-render"
  - "stateSchema added as explicit DelegatedShellProps field — makes the dependency visible and testable"
  - "Neutral log message 'Delegated: state update skipped' — no banned tokens, follows existing gated logger pattern"
  - "null/undefined initialState values map to z.unknown() — lenient, honors reliability paradox"

patterns-established:
  - "Schema derivation pattern: derive from initialState at instantiation, pass as prop, validate at merge"
  - "Gated logger for silent validation failures — never surface to UI, only to debug-enabled devtools"

requirements-completed:
  - RELY-01
  - RELY-03

# Metrics
duration: 11min
completed: 2026-06-26
---

# Phase 11 Plan 01: Reliability Hardening — State Schema Validation Summary

**Lenient-partial zod/mini schema validation at the DelegatedShell merge step — keeps prior state when a produced handler returns a known field with the wrong type**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-06-26T11:38:00Z
- **Completed:** 2026-06-26T11:41:00Z
- **Tasks:** 2 (Task 1: install + helper; Task 2: TDD wire-in)
- **Files modified:** 5

## Accomplishments

- Installed zod ^4.4.3 as a production dependency (zod/mini subpath available)
- Created `src/execution/stateSchema.ts` with `deriveStateSchema(initialState)` — a lenient-partial schema builder using `z.looseObject` + `z.optional` per field
- Wired `stateSchema.safeParse(next)` at the merge step in `DelegatedShell.onClick` — known-field type corruption is rejected and prior state kept; all valid paths (partial update, unknown keys) proceed as before
- Schema derived ONCE per module lifecycle in `makeDelegatedComponent`, not inside the click handler
- 17 new tests covering: schema semantics (accept partial/unknown/empty; reject type mismatches), keep-prior behavior, no-op paths (error result, throw, no-state), and real calc regression
- All 416 tests green (399 pre-existing + 17 new); tsc clean; build clean (0 source maps)

## Task Commits

1. **Task 1: Install zod + create deriveStateSchema helper** — `226eefa` (chore)
2. **Task 2 RED: Failing tests for merge-step validation** — `b9057be` (test)
3. **Task 2 GREEN: Wire schema validation into DelegatedShell** — `91adb2b` (feat)

**Plan metadata:** (to be added by final commit)

## Files Created/Modified

- `src/execution/stateSchema.ts` — `deriveStateSchema(initialState)` helper; imports from `zod/mini`; exports only the derivation function
- `src/execution/delegatedValidation.test.tsx` — 17 tests for schema semantics, keep-prior behavior, no-op paths
- `src/execution/delegated.tsx` — Added `deriveStateSchema` import; `stateSchema` prop on `DelegatedShellProps`; schema derived in `makeDelegatedComponent`; `safeParse` gate in `onClick`
- `package.json` — Added `"zod": "^4.4.3"` to `dependencies`
- `package-lock.json` — Updated with zod installation

## Decisions Made

- `z.looseObject(shape)` chosen over `z.object(shape)` because looseObject passes unknown keys through without rejecting — satisfying the lenient-partial requirement
- Each field wrapped in `z.optional(...)` so the schema doesn't require all keys (partial updates pass)
- `null`/`undefined`/plain-object initialState values map to `z.unknown()` — maximally lenient for ambiguous types
- Schema prop added to `DelegatedShellProps` (not stored on `DelegatedModule`) to keep module clean and make the dependency visible via the component interface
- Log message `"Delegated: state update skipped"` — neutral, no mechanic-revealing tokens

## Deviations from Plan

None — plan executed exactly as specified. The schema derivation approach (stateSchema as DelegatedShellProps field, derived in makeDelegatedComponent) matched the planner's stated preference precisely.

## Issues Encountered

None. The zod/mini `z.looseObject` API was available and behaved exactly as documented (confirmed via node -e test before writing code).

## User Setup Required

None - no external service configuration required. zod is installed as a production dependency and available in node_modules.

## Known Stubs

None — all validation logic is fully wired. The schema is derived from real initialState and validated against real handler output.

## Threat Flags

No new threat surface introduced. The validation is:
- Pure client-side synchronous check (no network, no extra model calls)
- Applied only in the existing DelegatedShell onClick handler
- Schema built from developer-controlled initialState (trusted input)
- zod/mini imported only in host shell code, never in generated code scope

## Next Phase Readiness

- Phase 11-02 (RELY-02: no-op path for unhandled actions) can proceed — it builds on the same merge step and DelegatedShell machinery
- The `stateSchema` prop pattern is established and documented; future plans touching DelegatedShellProps should include it

---
*Phase: 11-reliability-hardening*
*Completed: 2026-06-26*

## Self-Check: PASSED

Files verified:
- FOUND: src/execution/stateSchema.ts
- FOUND: src/execution/delegatedValidation.test.tsx
- FOUND: src/execution/delegated.tsx (modified)

Commits verified:
- FOUND: 226eefa (chore: install zod + stateSchema helper)
- FOUND: b9057be (test: RED phase tests)
- FOUND: 91adb2b (feat: GREEN phase wire-in)

Test suite: 416 passed (54 test files)
Typecheck: 0 errors
Build: clean, 0 source maps
Hygiene: no banned tokens in modified files
