---
phase: "09-richer-storefront"
plan: "01"
subsystem: registry-schema, loader, storefront-utils
tags: [schema, indexeddb, loader, ranking, phase-9, store-01, store-02]
dependency_graph:
  requires: []
  provides:
    - AppRecord.displayName (Phase 9)
    - AppRecord.prompt (Phase 9)
    - AppRecord.createdAt (Phase 9)
    - deriveDisplayName helper in loader.ts
    - rankPopular utility in marketplaceUtils.ts
    - titleCase utility in marketplaceUtils.ts
  affects:
    - src/registry/db.ts
    - src/execution/loader.ts
    - src/ui/marketplaceUtils.ts
tech_stack:
  added: []
  patterns:
    - additive optional-field schema (no DB version bump, [key:string]:unknown catch-all)
    - static registry lookup with deriveDisplayName fallback
    - pure sort/filter utility with sole ownership of membership filter
key_files:
  created:
    - src/ui/marketplaceUtils.ts
  modified:
    - src/registry/db.ts
    - src/execution/loader.ts
    - src/ui/marketplaceUtils.test.ts
decisions:
  - "displayName fallback chain: static APP_REGISTRY label first, then deriveDisplayName(type, userPrompt)"
  - "prompt stores user intent string only (userPrompt), never the model system-prompt (hygiene-critical)"
  - "createdAt set on fresh record write only; touchRecord ...record spread preserves it without override"
  - "REGISTRY_DB_VERSION stays 2 — additive-no-migration pattern identical to Phase 7 LRU fields"
  - "rankPopular is the SOLE owner of the useCount>=1 membership filter (consumers don't re-apply)"
  - "deriveDisplayName suffix stripped to [a-zA-Z0-9 ] and capped at 20 chars for hygiene safety"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-26"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 09 Plan 01: AppRecord Schema Extension + rankPopular Utility Summary

**One-liner:** Additive AppRecord fields (displayName, prompt, createdAt) wired into loader fresh-record writes, plus pure rankPopular/titleCase utility (sole owner of useCount>=1 filter, sort desc/desc/asc).

## What Was Built

### Task 1 — Extend AppRecord schema (src/registry/db.ts)

Added three optional fields to `AppRecord` following the Phase 7 additive-no-migration pattern:

- `displayName?: string` — human-readable title for storefront cards
- `prompt?: string` — user intent string only; never the model system-prompt (devtools/IndexedDB hygiene-critical)
- `createdAt?: number` — epoch ms on first write; never overwritten on touch

No DB version bump. No `upgrade()` change. The existing `[key: string]: unknown` catch-all ensures old records satisfy the interface. Top comment block updated to document the Phase 9 additive-field annotation.

### Task 2 — Extend loader + create marketplaceUtils (src/execution/loader.ts, src/ui/marketplaceUtils.ts)

**loader.ts changes:**
- Added `APP_REGISTRY` import from `../data/appRegistry`
- Added module-private `deriveDisplayName(type, userPrompt?)` helper: title-cases the type slug (split on `[-_]`, capitalize each word); for tweak variants appends a hygiene-safe suffix (first 20 chars of userPrompt stripped to `[a-zA-Z0-9 ]`, trimmed, wrapped in parens)
- Extended fresh-record write to set `createdAt: Date.now()`, `displayName` (static APP_REGISTRY label first, deriveDisplayName fallback), and `prompt: userPrompt ?? undefined`
- `touchRecord()` unchanged — `...record` spread already carries the new fields forward; `createdAt` is not in the override block so it is preserved on touch

**src/ui/marketplaceUtils.ts (new file):**
- `titleCase(slug): string` — splits on `[-_]`, capitalizes each word
- `rankPopular(records, topN=5)` — sole owner of `useCount >= 1` membership filter; sorts useCount desc, updatedAt desc, cacheKey asc; slices to topN; pure function, no React, no async

## Decisions Made

- `prompt` stores only the user's intent string (`userPrompt`). The model system-prompt built by `buildPrompt()` contains mechanic lexicon and must never reach IndexedDB (HYGIENE-01..05 compliance).
- `rankPopular` owns the `useCount >= 1` filter so Marketplace.tsx (Plan 09-03) does not duplicate it.
- `deriveDisplayName` suffix is stripped to `[a-zA-Z0-9 ]` before appending — removes any accidental mechanic tokens a user might have typed.
- Pre-existing tsc errors in `marketplaceUtils.test.ts` (indexed array access without optional chaining) fixed as Rule 1 (blocking tsc gate).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing tsc errors in marketplaceUtils.test.ts**
- **Found during:** Task 2 tsc verification
- **Issue:** `ranked[0].cacheKey`, `ranked[1].cacheKey`, etc. — array element access with no optional chaining, typed as `T | undefined` causing TS2532 "Object is possibly undefined" errors
- **Fix:** Changed to `ranked[0]?.cacheKey` etc. (optional chaining) — same runtime behavior, tsc-clean
- **Files modified:** src/ui/marketplaceUtils.test.ts
- **Commit:** e9655fc

## Verification Results

- `npx tsc --noEmit`: clean (exit 0)
- `npm test` full suite: 385 passed / 53 test files
- Hygiene grep on `src/ui/marketplaceUtils.ts` (non-comment lines): 0 banned tokens
- `grep displayName\|prompt\|createdAt src/registry/db.ts`: shows all three optional fields
- `grep rankPopular\|titleCase src/ui/marketplaceUtils.ts`: shows both exports
- `grep createdAt.*Date.now\|displayName.*staticEntry\|prompt.*userPrompt src/execution/loader.ts`: shows fresh-record extension
- REGISTRY_DB_VERSION: still 2 (verified)
- touchRecord(): unchanged (verified — override block contains only useCount and updatedAt)

## Self-Check: PASSED

- [x] src/registry/db.ts — displayName?, prompt?, createdAt? declared with JSDoc
- [x] src/execution/loader.ts — fresh-record write sets all three fields; deriveDisplayName added; APP_REGISTRY imported
- [x] src/ui/marketplaceUtils.ts — created; rankPopular and titleCase exported
- [x] Commits exist: 35806b8 (Task 1), e9655fc (Task 2)
- [x] tsc clean; 385 tests green; hygiene grep = 0

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | 35806b8 | feat(09-01): extend AppRecord schema with displayName, prompt, createdAt |
| Task 2 | e9655fc | feat(09-01): extend loader write sites and create rankPopular utility |
