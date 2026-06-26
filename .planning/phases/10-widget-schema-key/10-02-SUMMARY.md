---
phase: "10-widget-schema-key"
plan: "02"
subsystem: "registry / execution / tests"
tags: [test-migration, key-derivation, collision-audit, WIDGET-08]
dependency_graph:
  requires: ["10-01"]
  provides: ["WIDGET-08 audit test block", "registryKey identity in loader tests"]
  affects: []
tech_stack:
  added: []
  patterns:
    - "registryKey('app', type) for all app identity-derivation in test doubles"
    - "WIDGET-08 describe block pattern for cross-kind collision audit"
key_files:
  modified:
    - src/execution/loader.test.ts
    - src/execution/loaderGuardrails.test.ts
    - src/registry/cacheKey.test.ts
decisions:
  - "Migrated all 9 cacheKey(type) identity calls in loader.test.ts to registryKey('app', type)"
  - "Migrated all 11 cacheKey(type) identity calls in loaderGuardrails.test.ts to registryKey('app', type)"
  - "Added WIDGET-08 audit block at end of cacheKey.test.ts (not a new file) per PATTERNS.md placement decision"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-26"
  tasks_completed: 2
  files_changed: 3
  tests_before: 393
  tests_after: 399
---

# Phase 10 Plan 02: Test Migration and WIDGET-08 Collision Audit Summary

Migrated all bare `cacheKey(type)` identity-derivation calls in `loader.test.ts` and `loaderGuardrails.test.ts` to `registryKey("app", type)`, and added a 6-assertion WIDGET-08 collision-distinctness audit block to `cacheKey.test.ts`.

## What Changed

### Task 1 — Test double migration (loader.test.ts, loaderGuardrails.test.ts)

Every dynamic `import { cacheKey }` used to derive an app identity key was changed to `import { registryKey }`, and every `await cacheKey(type)` call in an identity context was changed to `await registryKey("app", type)`.

**loader.test.ts:** 9 identity calls migrated across 8 test cases (the WR-02 test also had a `cacheKey("notes")` call that was migrated).

**loaderGuardrails.test.ts:** 11 identity calls migrated across 6 test cases covering the produce-cost cap (RESIL-05), LRU bookkeeping (RESIL-06), and storage-pressure eviction (RESIL-06).

The test doubles now mirror production's identity derivation: `resolver.ts` uses `registryKey("app", appType)` to derive the key passed to `resolveComponent`. With the old `cacheKey(type)`, the test keys were structurally correct (consistent within each test) but numerically different from production — a silent divergence. After migration, the test-computed keys are byte-identical to what production would compute.

### Task 2 — WIDGET-08 audit block (cacheKey.test.ts)

Added a new `describe("WIDGET-08 key-derivation audit — cross-kind collision prevention", ...)` block at the end of `cacheKey.test.ts` with 6 `it()` assertions:

1. App vs widget for same type slug (`"weather"`) are distinct — the Phase 13 anti-collision guard.
2. App vs handler for same type slug are distinct.
3. Widget vs handler for same type slug are distinct.
4. App baseline vs prompt variant (`"dark mode"`) are distinct.
5. Widget baseline vs instruction variant (`"compact layout"`) are distinct.
6. Two handler intents (`"get weather data"` vs `"get stock price"`) are distinct.

The block is titled with `WIDGET-08` so the audit purpose is self-documenting. It extends the existing `cacheKey.test.ts` rather than adding a separate file.

## Verification Output

```
tsc --noEmit:  exits 0 (no errors)

npm test:
  Test Files  53 passed (53)
       Tests  399 passed (399)   ← up from 393 (+6 new audit tests)
    Start at  03:53:26
    Duration  14.74s

npm run build:  ✓ built in 984ms
  No *.map files in dist/assets/ (sourcemaps disabled — hygiene rule)
```

## Checks

- No bare `cacheKey(` identity calls remain in loader.test.ts or loaderGuardrails.test.ts
- `registryKey("app"` present 9 times in loader.test.ts, 11 times in loaderGuardrails.test.ts
- WIDGET-08 describe block at cacheKey.test.ts line 114
- 6 new collision-distinctness tests pass
- Load-bearing assertion `registryKey("app","weather") !== registryKey("widget","weather")` passes — Phase 13 widget activation cannot introduce app/widget key collision
- Hygiene gate: no banned token (`synthesize/synthesized/synthesis`) introduced in any modified file

## Commits

- `6611c50` — refactor(10-02): migrate bare cacheKey(type) to registryKey("app", type) in loader tests
- `bf3a9bc` — test(10-02): add WIDGET-08 collision-distinctness audit to cacheKey.test.ts

## Deviations from Plan

**Deviation: worktree branch base reset to phase-10 feature branch**

The worktree branch (`worktree-agent-a1143fb0dcc3f90f9`) started at the same commit as `main` (pre-phase-10 work), while plan 10-02 depends on 10-01 being done. The 10-01 commits existed on the local `feature/phase-10-widget-schema-key` branch but had not been incorporated into the worktree. Applied `git reset --hard feature/phase-10-widget-schema-key` to bring the worktree up to the post-10-01 state before executing 10-02. This is correct — `registryKey` did not exist in `cacheKey.ts` before this reset. No 10-02-specific code was affected.

No other deviations — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — this plan modifies only test files; no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- src/execution/loader.test.ts: exists and contains `registryKey("app"` (9 occurrences)
- src/execution/loaderGuardrails.test.ts: exists and contains `registryKey("app"` (11 occurrences)
- src/registry/cacheKey.test.ts: contains `WIDGET-08` at line 114
- Commits 6611c50 and bf3a9bc: both present in git log
- Test count: 399 (>=393 target met)
- tsc: exits 0
- Build: clean, no sourcemaps
