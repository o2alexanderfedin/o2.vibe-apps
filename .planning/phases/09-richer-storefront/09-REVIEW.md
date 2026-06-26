---
phase: 09-richer-storefront
reviewed: 2026-06-26T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/execution/loader.ts
  - src/registry/db.ts
  - src/registry/registry.test.ts
  - src/ui/Marketplace.tsx
  - src/ui/marketplaceUtils.test.ts
  - src/ui/marketplaceUtils.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-06-26
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 9 adds three additive optional fields to `AppRecord` (`displayName`, `prompt`, `createdAt`), a `rankPopular` utility with deterministic sort, and a popular-row section in `Marketplace`. The schema changes are correctly additive (no `REGISTRY_DB_VERSION` bump, no `upgrade()` change), the `prompt` field stores `userPrompt` (not the model system-prompt), devtools hygiene is clean (no banned synthesis/generate/LLM/AI tokens in any devtools-visible surface), registry reads go through `services.registry` (no singleton imports), and the popular-row membership filter is correctly owned exclusively by `rankPopular`. No blockers found. Three warnings and one info item follow.

---

## Warnings

### WR-01: `deriveDisplayName` in `loader.ts` duplicates `titleCase` from `marketplaceUtils.ts`

**File:** `src/execution/loader.ts:45-55`

**Issue:** `deriveDisplayName` implements its own title-case logic (split on `[-_]`, capitalize each word, join with space) that is byte-for-byte identical to the `titleCase` function exported from `marketplaceUtils.ts` (lines 11-14). If either implementation diverges (e.g. a bug fix to one), the persisted `displayName` written at first-open and the fallback display name rendered from `titleCase` in `Marketplace.tsx:335` will disagree for the same app type. This is a latent consistency bug.

**Fix:** Import and reuse `titleCase` instead of re-implementing it:

```ts
// src/execution/loader.ts — add import
import { titleCase } from "../ui/marketplaceUtils";

// replace deriveDisplayName base computation:
function deriveDisplayName(type: string, userPrompt?: string): string {
  const base = titleCase(type);        // ← reuse, don't duplicate
  if (userPrompt) {
    const suffix = userPrompt.trim().slice(0, 20).replace(/[^a-zA-Z0-9 ]/g, "").trim();
    return suffix ? `${base} (${suffix})` : base;
  }
  return base;
}
```

Alternatively, move `deriveDisplayName` into `marketplaceUtils.ts` alongside `titleCase` and `rankPopular`, which is the declared home for storefront pure utilities.

---

### WR-02: `touchRecord` re-write silently drops Phase 9 fields if called on a pre-Phase-9 record — no test coverage

**File:** `src/execution/loader.ts:66-89`

**Issue:** `touchRecord` spreads `...record` (typed as `{ source: string; transpiledJS: string } & Record<string, unknown>`) then overrides `cacheKey`, `type`, `useCount`, and `updatedAt`. If the record was written before Phase 9 (no `displayName`, `prompt`, `createdAt`), the spread will simply not carry them — which is correct. But if a record WAS written with Phase 9 fields and then touched, the spread will carry them through, which is also correct. The logic is sound in both cases.

However, there is **no test** that verifies Phase 9 fields (`displayName`, `prompt`, `createdAt`) survive a `touchRecord` call (Tier-3 hit path). The existing loader tests do not exercise this path with a Phase 9 record. If a future refactor of `touchRecord` explicitly lists fields instead of spreading, it will silently strip `displayName`/`prompt`/`createdAt` with no test catching it.

**Fix:** Add a loader test that:
1. Writes a full Phase 9 AppRecord to the in-memory registry.
2. Triggers a Tier-3 hit (clear in-memory caches, call `resolveComponent` again).
3. Reads back the stored record and asserts `displayName`, `prompt`, and `createdAt` are unchanged after the touch.

---

### WR-03: `rankPopular` comparator returns `1` when `a.cacheKey === b.cacheKey` — incorrect for a well-formed comparator

**File:** `src/ui/marketplaceUtils.ts:42`

**Issue:** The sort comparator's final tiebreak is:
```ts
return a.cacheKey < b.cacheKey ? -1 : 1;
```
When `a.cacheKey === b.cacheKey` this returns `1`, meaning "a is greater than b". A comparator should return `0` for equal inputs; some JS engines (V8 Timsort) rely on this for stability guarantees. In practice, IndexedDB cacheKeys are unique so two records sharing the same key cannot exist in the input — but the mathematical incorrectness means the sort contract is technically violated, and it will misfire if the function is ever called with synthetic test data that contains duplicates.

**Fix:**
```ts
// src/ui/marketplaceUtils.ts:42
return a.cacheKey < b.cacheKey ? -1 : a.cacheKey > b.cacheKey ? 1 : 0;
```

---

## Info

### IN-01: No test for `deriveDisplayName` suffix sanitization

**File:** `src/execution/loader.ts:45-55`

**Issue:** The suffix stripping in `deriveDisplayName` (trim, slice to 20 chars, strip `[^a-zA-Z0-9 ]`, trim again, return base-only if empty) has no dedicated unit test. Edge cases such as a `userPrompt` that is entirely punctuation (`"!!!"`), all-whitespace, or exactly 20 characters with a trailing stripped char are unverified.

**Fix:** Add unit tests in `loader.test.ts` (or extract `deriveDisplayName` into `marketplaceUtils.ts` and test it alongside `titleCase` and `rankPopular`). Minimal cases:
- `deriveDisplayName("weather", "!!! all punct !!!")` → `"Weather"` (stripped suffix empty → base only)
- `deriveDisplayName("weather", "show celsius now")` → `"Weather (show celsius no)"` (21-char prompt truncated to 20)
- `deriveDisplayName("my-app")` → `"My App"` (no prompt)

---

_Reviewed: 2026-06-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
