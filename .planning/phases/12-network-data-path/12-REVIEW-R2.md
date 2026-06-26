---
phase: 12-network-data-path
reviewed: 2026-06-26T00:00:00Z
depth: standard
iteration: 2
files_reviewed: 8
files_reviewed_list:
  - src/execution/handler.ts
  - src/apps/weatherHandlers.ts
  - src/apps/currencyHandlers.ts
  - src/host/ttlCache.ts
  - src/data/dataBroker.ts
  - src/data/dataBroker.test.ts
  - src/apps/seededHandlers.test.ts
  - src/apps/handlers.test.ts
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 12: Code Review Report — Re-review Iteration 2

**Reviewed:** 2026-06-26
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This is the second-pass review verifying fixes for the 8 findings from 12-REVIEW.md (5 Warnings + 3 Info). Seven of the eight original findings are fully resolved. One original warning (WR-03) was fixed at the wrong abstraction level: the `nowFn` injectable seam was added to the two private functions (`touchHandler`, `resolveHandlerJS`) but was never threaded through the public entry point (`runHandler`), leaving the seam unreachable from any test or caller. No other new defects were introduced.

---

## Original Finding Disposition

| ID | Title | Status |
|----|-------|--------|
| WR-01 | WebSocket in DENIED_GLOBALS | RESOLVED |
| WR-02 | Empty-query stuck-loading path | RESOLVED |
| WR-03 | nowFn injectable seam | RESIDUAL DEFECT (see below) |
| WR-04 | Module-level mutable lastFetchedUrl | RESOLVED |
| WR-05 | TtlCache comment accuracy | RESOLVED |
| IN-01 | Stale seededHandlers.test.ts preamble | RESOLVED |
| IN-02 | Mechanic lexicon in handler comments | RESOLVED |
| IN-03 | dataBroker.ts eager fetch bind | RESOLVED |

---

## Confirmed Resolutions

**WR-01 — WebSocket in DENIED_GLOBALS:**
`"WebSocket"` is present at `src/execution/handler.ts:87`. The corresponding bypass-proof test is in `src/apps/handlers.test.ts:214-223` using the `executeHandlerSource` escape hatch with a `typeof WebSocket === 'undefined'` check.

**WR-02 — Empty-query stuck-loading fix:**
`src/apps/weatherHandlers.ts:30` now returns `Object.assign({}, state, { status: "idle" })`, overriding any incoming `status` value including `"loading"`. The regression test at `src/apps/seededHandlers.test.ts:262-276` passes `status: "loading"` with an empty query and asserts `state.status === "idle"`.

**WR-04 — Module-level mutable lastFetchedUrl:**
`src/data/dataBroker.test.ts:62-68` refactored `okFetch` to return `{ fn, getLastUrl }` where `lastUrl` is a per-instance closure variable. All URL assertions now call `getLastUrl()` on the instance returned by the call in each test. No module-level mutable exists.

**WR-05 — TtlCache comment accuracy:**
`src/host/ttlCache.ts:7-10` now reads: "Reads check the Clock against the expiry; expired entries are deleted on access (lazy eviction). Note that keys written but never read again will persist in memory until the cache instance is reclaimed. For the bounded allowlist key sets used by this project that is acceptable; add a max-size eviction policy if the key space becomes unbounded." The false "cannot grow unboundedly" claim is gone.

**IN-01 — Stale seededHandlers.test.ts preamble:**
`src/apps/seededHandlers.test.ts:1-10` now accurately describes both test strategies (short-circuit tests and behavior tests). The stale "not yet in place" text is removed.

**IN-02 — Mechanic lexicon in weatherHandlers/currencyHandlers:**
`src/apps/weatherHandlers.ts` and `src/apps/currencyHandlers.ts` contain no instances of the banned terms: "on demand", "model call", "ZERO model calls", "synthesi*", "generat*", "AI", "llm", "fake", or "mock".

**IN-03 — dataBroker.ts eager fetch bind:**
`src/data/dataBroker.ts:70` now reads `opts.fetchFn ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init))`. The bind is deferred to call time; construction in a Node environment without `globalThis.fetch` no longer throws.

---

## Warnings

### WR-01: `nowFn` seam added to private functions but not threaded through public `runHandler` — seam is unreachable

**File:** `src/execution/handler.ts:288`

**Issue:** The fix for the original WR-03 finding added an optional `nowFn: () => number = Date.now` parameter to both `touchHandler` (line 180) and `resolveHandlerJS` (line 209), and wired it correctly within those functions (lines 187, 227, 254). However, `runHandler` — the only public entry point — calls `resolveHandlerJS(intent, services)` at line 288 without passing `nowFn`. The `Services` interface also has no `clock` or `nowFn` field. As a result:

- No caller can inject an alternative `nowFn` through the public API.
- No test can control the `updatedAt` timestamp written to the handler registry on either a cache hit (`touchHandler`) or a cache miss (initial `registry.put`), because the only path from `runHandler` into `resolveHandlerJS` uses the hardwired default.
- The seam exists syntactically but is functionally dead — `runHandler` always runs with real `Date.now`.

The `Services` interface does not carry a `clock` field (only individual services like `DataBroker` and `TokenBucket` receive a clock via their own constructors). The handler module has no other way to receive an injectable clock without either adding `nowFn` to `runHandler`'s signature or adding a `clock` field to `Services`.

**Fix:** Either (a) add `nowFn` to `runHandler` and thread it through:

```ts
export async function runHandler(
  intent: string,
  input: unknown,
  services: Services,
  nowFn: () => number = Date.now,   // ← add
): Promise<HandlerResult> {
  // ...
  transpiledJS = await resolveHandlerJS(intent, services, nowFn);  // ← thread through
```

Or (b) add `clock?: Clock` to the `Services` interface and read it inside `resolveHandlerJS`:

```ts
// In resolveHandlerJS:
const nowFn = services.clock?.now ?? Date.now;
```

Option (a) is a smaller change. Option (b) is more consistent with how other infrastructure (`TokenBucket`, `TtlCache`, `DataBroker`) receives its clock.

---

_Reviewed: 2026-06-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 2 (re-review after fixer pass)_
