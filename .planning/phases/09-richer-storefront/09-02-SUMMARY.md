---
phase: "09-richer-storefront"
plan: "02"
subsystem: "registry/tests, ui/tests"
tags: [tdd, registry, marketplace, phase-9, additive-schema]
dependency_graph:
  requires: []
  provides: [registry.test.ts Phase 9 blocks, src/ui/marketplaceUtils.test.ts]
  affects: [src/registry/registry.test.ts, src/ui/marketplaceUtils.test.ts]
tech_stack:
  added: []
  patterns: [dynamic-import test pattern, pure-function test, optional-chaining]
key_files:
  created:
    - src/ui/marketplaceUtils.test.ts
  modified:
    - src/registry/registry.test.ts
decisions:
  - "Committed test file for marketplaceUtils.test.ts while implementation (09-01) was in-flight; tests entered RED state, then GREEN once 09-01's marketplaceUtils.ts landed on branch"
  - "Linter auto-applied optional chaining on ranked[N]?.cacheKey accesses; committed as style fix"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-26"
  tasks_completed: 2
  tasks_total: 2
  files_count: 2
---

# Phase 9 Plan 02: Test Suites for Additive Schema and Popular-Row Ranking Summary

Two test suites locking in the Phase 9 additive-schema contract and the `rankPopular` determinism + membership-filter contract via TDD.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | v1-record compat tests for Phase 9 fields | f841ebe | src/registry/registry.test.ts |
| 2 | rankPopular determinism + membership-filter tests | 5de27da | src/ui/marketplaceUtils.test.ts |
| 2 (style) | Linter optional chaining fix | c5211e5 | src/ui/marketplaceUtils.test.ts |

## What Was Built

### Task 1 — registry.test.ts Phase 9 blocks

Two `it()` blocks appended inside the existing `describe("registry — happy path ...")` block (before its closing brace), mirroring the existing v1-compat test dynamic-import pattern:

- **Test A** `"a record missing displayName/prompt/createdAt reads back without those fields (Phase 9 additive migration)"`: Writes a v2-style record (has `useCount`/`updatedAt`) without the three new fields, asserts all three are `undefined` on readback, and existing fields (`useCount: 3`, `source: "s"`) survive.
- **Test B** `"round-trips displayName, prompt, and createdAt on an AppRecord"`: Uses `appRecord({ cacheKey: "rich", displayName: "Weather", prompt: "show celsius", createdAt: 99999 })`, round-trips through `put`/`get`, asserts all three new fields equal their written values.

Cache keys `"v2-legacy"` and `"rich"` are distinct from all existing test keys to avoid cross-test pollution (T-09-05 mitigation).

### Task 2 — src/ui/marketplaceUtils.test.ts (new file)

Five `it()` tests inside `describe("rankPopular")`. Pure synchronous function tests — no React, no async, no mocks:

1. **ranks by useCount descending** — input `[b:1, a:5, c:3]` → order `a, c, b`
2. **breaks useCount tie by updatedAt descending** — `[old:100, new:500]` both `useCount:3` → `new` first
3. **breaks updatedAt tie by cacheKey ascending** — `[z:2:200, a:2:200]` → `a` first (fully deterministic)
4. **owns the membership filter (cold-start guard)** — `[x:0, y:1]` → only `y`; all-zero input → `[]`
5. **caps output at topN** — 7 records, `rankPopular(records, 3).length === 3`

## Test Results

- `src/registry/registry.test.ts`: **16/16 passed** (14 original + 2 new)
- `src/ui/marketplaceUtils.test.ts`: **5/5 passed** (implementation from 09-01 present when full suite ran)
- Full suite: **385/385 passed across 53 test files**

## Deviations from Plan

### Auto-applied linter fix

**1. [Rule 1 - Style] Optional chaining on ranked array accesses**
- **Found during:** Task 2 (linter ran after test run)
- **Issue:** Linter auto-applied `ranked[N]?.cacheKey` style (strict null safety on indexed access)
- **Fix:** Committed as a separate style commit
- **Files modified:** src/ui/marketplaceUtils.test.ts
- **Commit:** c5211e5

### Parallel execution timing

marketplaceUtils.ts (09-01's output) was not present when marketplaceUtils.test.ts was committed. The test file entered RED state (import resolution failure) as expected per the coordination note. Once 09-01's `feat(09-01)` commit landed on the branch, the full suite turned GREEN with no changes required to the test file.

## Known Stubs

None.

## Threat Flags

None. Test files are not shipped in the production bundle.

## Self-Check: PASSED

- [x] src/registry/registry.test.ts modified — file exists, 2 new it() blocks confirmed
- [x] src/ui/marketplaceUtils.test.ts created — file exists, 5 it() blocks confirmed
- [x] Commit f841ebe exists (Task 1)
- [x] Commit 5de27da exists (Task 2)
- [x] Commit c5211e5 exists (style fix)
- [x] Full suite 385/385 green
- [x] No banned lexicon (synthesize/mock/AI/llm/generate) in test code
- [x] Did NOT modify STATE.md, ROADMAP.md, db.ts, loader.ts, or marketplaceUtils.ts
