---
phase: 12-network-data-path
fixed_at: 2026-06-26T07:10:00Z
review_path: .planning/phases/12-network-data-path/12-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-06-26T07:10:00Z
**Source review:** .planning/phases/12-network-data-path/12-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (5 Warnings + 3 Info)
- Fixed: 8
- Skipped: 0

Full test suite result: 541 tests passing (up from 538; 3 new tests added by WR-01 and WR-02 fixes). TypeScript: 0 errors. Hygiene test: passes.

## Fixed Issues

### WR-01: DENIED_GLOBALS omits WebSocket

**Files modified:** `src/execution/handler.ts`, `src/apps/handlers.test.ts`
**Commit:** d72ad8c
**Applied fix:** Added `"WebSocket"` to the `DENIED_GLOBALS` array after `XMLHttpRequest`. Added a new test in `handlers.test.ts` proving `typeof WebSocket === 'undefined'` inside the handler scope, mirroring the existing fetch/XHR bypass-proof test.

---

### WR-02: Weather handler empty-query path can freeze UI in status: "loading"

**Files modified:** `src/apps/weatherHandlers.ts`, `src/apps/seededHandlers.test.ts`
**Commit:** 57cf35d
**Applied fix:** Changed the empty-query short-circuit in the handler source string from `Object.assign({}, state)` to `Object.assign({}, state, { status: "idle" })`. Updated the existing test to assert `status === "idle"` and added a new regression test covering the stuck-loading edge case (input `status: "loading"` with empty query → result `status: "idle"`).

---

### WR-03: handler.ts uses raw Date.now() for LRU timestamps — bypasses injected Clock

**Files modified:** `src/execution/handler.ts`
**Commit:** e0c3ce6
**Applied fix:** Added an optional `nowFn: () => number = Date.now` parameter to both `touchHandler` and `resolveHandlerJS`. The parameter is threaded from `resolveHandlerJS` into `touchHandler`. Production behavior is unchanged (default is `Date.now`). External call sites (`runHandler`) are unmodified. Tests can now pass a deterministic clock via the private internal seam.

---

### WR-04: Module-level mutable lastFetchedUrl creates fragile test ordering dependency

**Files modified:** `src/data/dataBroker.test.ts`
**Commit:** 4634e64
**Applied fix:** Refactored `okFetch()` to return `{ fn: ReturnType<typeof vi.fn>; getLastUrl: () => string }` with a closure-scoped `lastUrl` variable. Tests that need URL inspection destructure `{ fn, getLastUrl }` and call `getLastUrl()` after the fetch; tests that only need call-count assertions use `.fn` directly. All URL/param assertions are semantically identical to before — only the read mechanism changed. The module-level `let lastFetchedUrl` declaration and all manual resets are gone.

---

### WR-05: TtlCache module header comment inaccurately claims Map cannot grow unboundedly

**Files modified:** `src/host/ttlCache.ts`
**Commit:** eff1cdb
**Applied fix:** Replaced "expired entries are deleted on access so the Map does not grow unboundedly" with an accurate description: expired entries are deleted on access (lazy eviction), but keys written but never read again persist until the cache instance is reclaimed. Notes that for bounded allowlist key sets this is acceptable, and recommends adding a max-size eviction policy if the key space becomes unbounded.

---

### IN-01: Stale comment in seededHandlers.test.ts claims short-circuit "is not yet in place"

**Files modified:** `src/apps/seededHandlers.test.ts`
**Commit:** 88b75d1
**Applied fix:** Replaced the stale preamble comment with an accurate description of the two test strategies present in the file: (1) short-circuit tests using an empty registry to confirm the seeded path fires before any registry lookup; (2) behavior tests using a pre-seeded registry to exercise handler logic with specific fixture shapes.

---

### IN-02: Source comments in weatherHandlers.ts and currencyHandlers.ts reveal the mechanic

**Files modified:** `src/apps/weatherHandlers.ts`, `src/apps/currencyHandlers.ts`
**Commit:** c6e857a
**Applied fix:** Rewrote both file headers in neutral data-framing terms. Removed "to be produced on demand instead" (replaced with "fallback cache path to be used") and removed "ZERO model calls" (replaced with a description of what fetchData does: geocoding + conditions mapping for weather; FX rates mapping for currency). Both comments pass the hygiene test with zero banned-lexicon matches.

---

### IN-03: dataBroker.ts default construction crashes where globalThis.fetch is undefined

**Files modified:** `src/data/dataBroker.ts`
**Commit:** 8637437
**Applied fix:** Replaced `opts.fetchFn ?? globalThis.fetch.bind(globalThis)` (eager evaluation at construction) with `opts.fetchFn ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init))` (lazy wrapper evaluated at call time). Production browser behavior is identical; the undefined dereference is now deferred to the actual fetch call rather than construction.

---

_Fixed: 2026-06-26T07:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
