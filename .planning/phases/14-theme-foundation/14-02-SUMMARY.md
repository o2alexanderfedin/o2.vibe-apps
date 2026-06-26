---
phase: 14
plan: 02
subsystem: theme
tags: [css, storage, alias-bridge, backward-compat]
dependency_graph:
  requires: []
  provides: [STORAGE_KEY_OS_THEME, alias-bridge-vars]
  affects: [src/lib/storage.ts, src/index.css]
tech_stack:
  added: []
  patterns: [css-custom-property-alias]
key_files:
  created: [src/aliasBridge.test.ts]
  modified: [src/lib/storage.ts, src/index.css]
decisions:
  - "Alias bridge placed between data-theme :root blocks and base styles :root block for readability"
  - "Test uses node:fs to read CSS source at test-time — no browser environment needed"
metrics:
  duration: ~5m
  completed: 2026-06-26
---

# Phase 14 Plan 02: Alias Bridge + STORAGE_KEY_OS_THEME Summary

**One-liner:** Backward-compat CSS alias bridge (`--color-surface/text/accent` → current contract vars) and `STORAGE_KEY_OS_THEME` constant for pre-v2.0 cached app rendering continuity.

## What Was Done

Added two small additive changes with a source-assertion test:

1. **`src/lib/storage.ts`** — Appended `STORAGE_KEY_OS_THEME = "marketplace.osTheme"` below the two existing constants, following the `marketplace.<camelCaseNeutralWord>` key format.

2. **`src/index.css`** — Added a new unconditional `:root { ... }` alias bridge block after the `data-theme` blocks and before the base-styles block. The block forwards the three pre-v2.0 variable names to the current theme contract:
   - `--color-surface: var(--glass)`
   - `--color-text: var(--text)`
   - `--color-accent: var(--accentA)`

3. **`src/aliasBridge.test.ts`** (new) — Reads `src/index.css` via `node:fs` at test time and asserts via regex that all three exact alias mappings are present.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/storage.ts` | +1 line: `STORAGE_KEY_OS_THEME` constant |
| `src/index.css` | +7 lines: alias bridge `:root` block with comment |
| `src/aliasBridge.test.ts` | NEW: 3 source-assertion tests |

## Tests Added

- `src/aliasBridge.test.ts` — 3 tests verifying each alias mapping exists in the CSS source.

## Verification Status

All 4 required checks passed:

| Check | Result |
|-------|--------|
| `npx vitest run src/aliasBridge.test.ts` | 3/3 passed |
| `grep STORAGE_KEY_OS_THEME src/lib/storage.ts` | OK |
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run src/hygiene.test.ts` | 2/2 passed |

## Commit

`a8e4ab0` — feat(14-01): add settings store + SettingRecord, bump registry DB to v3

Note: This commit was absorbed into the `a8e4ab0` commit alongside the pre-staged `db.ts` changes from the 14-01 plan that were already in the working tree. All plan 14-02 content (storage.ts, index.css, aliasBridge.test.ts) is confirmed present in that commit.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/lib/storage.ts` contains `STORAGE_KEY_OS_THEME` — FOUND
- `src/index.css` contains alias bridge block — FOUND  
- `src/aliasBridge.test.ts` created — FOUND
- Commit `a8e4ab0` contains all three files — CONFIRMED
