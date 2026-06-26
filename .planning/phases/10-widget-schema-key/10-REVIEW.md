---
phase: 10-widget-schema-key
reviewed: 2026-06-26T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/registry/db.ts
  - src/execution/widgetPrewarm.ts
  - src/execution/handler.ts
  - src/execution/loader.test.ts
  - src/execution/loaderGuardrails.test.ts
  - src/registry/cacheKey.test.ts
  - src/registry/registry.test.ts
  - src/registry/storagePressure.test.ts
  - src/registry/cacheKey.ts
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: resolved
fixed_at: 2026-06-26T04:14:00Z
---

# Phase 10: Code Review Report

**Reviewed:** 2026-06-26
**Fixed:** 2026-06-26
**Depth:** standard
**Files Reviewed:** 9
**Status:** resolved (all findings fixed)

## Summary

Phase 10 delivers two requirements: (1) real typed interfaces for `WidgetRecord` and `HandlerRecord` in `db.ts` (WIDGET-07), and (2) migration of bare `cacheKey()` identity calls to `registryKey("app", type)` across the loader test suite (WIDGET-08). Both are correctly implemented. The interface shapes match the `AppRecord` pattern, the LRU first-write fields are additive and correctly placed at both write sites, the handler `touchHandler` tightening is correct, and all 20 identity-derivation calls in the two loader test files were migrated. The WIDGET-08 audit block in `cacheKey.test.ts` covers all required cross-kind collision scenarios.

Two issues were identified: one Warning (missing LRU hit-refresh for widgets, creating silent divergence from handlers while claiming "parity") and one Info (redundant bracket access on explicitly-typed record fields).

---

## Warnings

### WR-01: Widget registry hits never refresh LRU bookkeeping — "parity" comment overstates the fix ✓ RESOLVED

> **Fixed (commit df5acfc):** Added `touchWidget` helper mirroring `touchHandler`; called on both hit paths in `resolveWidget` and `resolveWidgetTweak`; added `stored &&` guard for TS narrowing; imported `WidgetRecord` type.

**File:** `src/execution/widgetPrewarm.ts:68` and `:143`

**Issue:** The Phase 10 comments at both write sites claim parity "with the handler and app write paths," but the parity is incomplete. On a cache HIT, `handler.ts` calls `touchHandler` (line 196), which increments `useCount` and stamps `updatedAt`. On a cache HIT, `loader.ts` calls `touchRecord` (line 229). Neither `resolveWidget` nor `resolveWidgetTweak` call any equivalent function on a hit — the LRU counters of a cached widget never advance after first write. Widgets therefore accumulate a permanently stale `updatedAt` and `useCount: 0`, making them disproportionately vulnerable to LRU eviction regardless of how frequently they are accessed.

This gap pre-dates Phase 10 (the hit path existed before) but Phase 10 (a) introduced the LRU fields to the widget write shape, (b) added comments claiming handler/app parity, and (c) is the right phase to close this if it is to be closed. The comment "parity with the handler and app write paths" will mislead future authors into believing hit-refresh is already handled.

**Fix:** Either add a `touchWidget` analogue mirroring `touchHandler`, called immediately after a registry hit is confirmed:

```typescript
// resolveWidget — after line 68 (registry hit confirmed)
if (typeof storedSource === "string" && typeof storedJS === "string") {
  logger.info("Widget pre-warm: registry hit for " + widgetType);
  await touchWidget(services, key, stored); // add this
  return { source: storedSource, transpiledJS: storedJS };
}
```

where `touchWidget` mirrors `touchHandler`:

```typescript
async function touchWidget(
  services: Services,
  key: string,
  record: WidgetRecord,
): Promise<void> {
  try {
    const useCount =
      typeof record.useCount === "number" ? record.useCount + 1 : 1;
    await services.registry.put(
      "widgets",
      { ...record, useCount, updatedAt: Date.now() },
      key,
    );
  } catch (err) {
    logger.error("Widget pre-warm: failed to refresh LRU bookkeeping: " + String(err));
  }
}
```

Or, if hit-refresh is intentionally deferred (e.g., the prewarm hot path is latency-sensitive), revise the comment to remove the parity claim and document the known gap explicitly:

```typescript
// Phase 10 (WIDGET-07d): include LRU bookkeeping fields on first write.
// NOTE: unlike handlers, widget hits do NOT refresh useCount/updatedAt —
// widgets are pinned at useCount 0 after first write.
```

---

## Info

### IN-01: Bracket access on explicitly-typed `WidgetRecord` fields returns `unknown` instead of `string` ✓ RESOLVED

> **Fixed (commit ad9de80):** Changed `stored?.["source"]` / `stored?.["transpiledJS"]` to dot notation `stored?.source` / `stored?.transpiledJS` in both `resolveWidget` and `resolveWidgetTweak`; runtime typeof guards preserved.

**File:** `src/execution/widgetPrewarm.ts:65-66` and `:141-142`

**Issue:** `stored?.["source"]` and `stored?.["transpiledJS"]` use index-signature bracket notation. Because `WidgetRecord` carries `[key: string]: unknown`, bracket access returns `unknown` even though `source` and `transpiledJS` are explicitly typed `string` fields. The runtime type guards that follow (`typeof storedSource === "string"`) make this safe, but the access form is inconsistent with how `loader.ts` accesses `AppRecord` fields (which uses `stored?.source` / `stored?.transpiledJS`, dot notation, returning `string` directly). This is a pre-existing pattern; Phase 10 did not introduce it, but the new explicit `WidgetRecord` interface makes the inconsistency more visible.

**Fix:** Use dot notation for consistency with the loader and to get the declared string type directly:

```typescript
// Before (widgetPrewarm.ts lines 65-66):
const storedSource = stored?.["source"];
const storedJS = stored?.["transpiledJS"];

// After:
const storedSource = stored?.source;
const storedJS = stored?.transpiledJS;
```

The type guards can then be simplified to existence checks if desired, since dot access now returns `string` (not `unknown`). Apply the same change to lines 141-142 in `resolveWidgetTweak`.

---

## Checks Passed

- **Devtools hygiene (HARD):** No banned token (`synthesi*`, `fake`, `mock`, `AI`, `llm`, `generat*`) found in any comment or source surface in `db.ts`, `widgetPrewarm.ts`, or `handler.ts`.
- **cacheKey.ts unmodified:** Confirmed not touched in any Phase 10 commit (f6ad45a, 7b87437, 6611c50, bf3a9bc).
- **Cache-key contract (WIDGET-08):** All 9 identity calls in `loader.test.ts` and all 11 in `loaderGuardrails.test.ts` migrated to `registryKey("app", type)`. No bare `cacheKey()` identity calls remain.
- **Type tightening correctness:** `WidgetRecord` exposes `cacheKey/type/source/transpiledJS` required fields; `HandlerRecord` exposes `cacheKey/intent/source/transpiledJS`. Both extend `LruMeta` (not `& LruMeta`) with `[key:string]:unknown` catch-all, matching `AppRecord` pattern exactly.
- **`touchHandler` narrowing:** `HandlerRecord` parameter type is correct; the `{ ...record, useCount, updatedAt }` spread preserves all named fields including `intent`, satisfying the `HandlerRecord` constraint. `registry.get("handlers", key)` returns `HandlerRecord | undefined`, so passing `stored` (checked truthy) to `touchHandler` is type-safe.
- **LRU write parity (WIDGET-07d):** Both write sites in `widgetPrewarm.ts` (lines 101-105 and 160-164) include `useCount: 0, updatedAt: Date.now()`. Both cover the seeded and produced miss paths (the put is after the shared try/catch for `resolveWidget`; the put is inside the miss-only `else` branch for `resolveWidgetTweak`, which has no seeded path — correct).
- **WIDGET-08 audit block:** 6 `it()` assertions at `cacheKey.test.ts:114`. Covers all required pairs: app-vs-widget, app-vs-handler, widget-vs-handler collision, plus prompt-variant distinctness for all three kinds. The load-bearing assertion `registryKey("app","weather") !== registryKey("widget","weather")` is present.
- **Test fixtures:** `registry.test.ts` widget/handler fixtures include all required named fields (`cacheKey`, `type`/`intent`, `source`, `transpiledJS`). `storagePressure.test.ts` cross-store fixture (line 171-172) includes the same required fields plus LRU bookkeeping.

---

_Reviewed: 2026-06-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
