# Phase 12: Sanctioned Network-Data Path - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 12 new/modified files
**Analogs found:** 11 / 12 (1 net-new with closest-analog guidance)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/data/sourceManifest.ts` | config | request-response | `src/data/appRegistry.ts` | role-match |
| `src/data/dataBroker.ts` | service | request-response | `src/host/resilientTransport.ts` | role-match |
| `src/host/ttlCache.ts` | utility | request-response | `src/host/tokenBucket.ts` | partial (Clock-DI pattern) |
| `src/execution/handler.ts` *(modify)* | service | request-response | self (existing file) | exact |
| `src/services/services.ts` *(modify)* | config | — | self (existing file) | exact |
| `src/services/testServices.ts` *(modify)* | config | — | self (existing file) | exact |
| `index.html` *(modify)* | config | — | self (existing file) | exact |
| `src/csp.test.ts` *(modify)* | test | — | self (existing file) | exact |
| `src/apps/seeds.ts` *(modify — add Weather + Currency delegated modules)* | config | — | self (existing file) | exact |
| `src/apps/weatherHandlers.ts` | config | request-response | `src/apps/seeds.ts` | role-match |
| `src/apps/currencyHandlers.ts` | config | request-response | `src/apps/seeds.ts` | role-match |
| `src/data/dataBroker.test.ts` | test | request-response | `src/execution/handler.test.ts` | role-match |

---

## Pattern Assignments

### `src/data/sourceManifest.ts` (config, request-response)

**Analog:** `src/data/appRegistry.ts`

**Imports pattern** (`src/data/appRegistry.ts` lines 1-9):
```typescript
// Static catalog of app types shown on the storefront (D-09, UI-SPEC §1).
// Neutral lowercase-kebab ids; ...
export interface AppRegistryEntry {
  id: string;
  displayName: string;
  description: string;
  icon: string;
}
export const APP_REGISTRY: AppRegistryEntry[] = [ ... ];
```

**Core pattern — typed readonly catalog** (`src/data/appRegistry.ts` lines 1-60):

Follow the same shape: a typed interface + a `ReadonlyArray` or `ReadonlyMap` constant with every
entry declared inline. The manifest maps `sourceId` → `{ origin, path, allowedParams, ttlMs }`:

```typescript
// Pattern to copy: typed interface + readonly catalog constant.
export interface SourceManifestEntry {
  origin: string;          // e.g. "https://api.open-meteo.com"
  path: string;            // e.g. "/v1/forecast"
  allowedParams: readonly string[]; // only these keys are encoded; others are dropped
  ttlMs: number;           // TTL for the in-memory cache
}

export const SOURCE_MANIFEST: ReadonlyMap<string, SourceManifestEntry> = new Map([
  ["weather-geocode", { ... }],
  ["weather-forecast", { ... }],
  ["fx-latest", { ... }],
]);
```

Verified origins (CONTEXT.md DATA-02, confirmed live 2026-06-26):
- `weather-geocode` → `https://geocoding-api.open-meteo.com` + `/v1/search`; params: `name`, `count`, `language`, `format`
- `weather-forecast` → `https://api.open-meteo.com` + `/v1/forecast`; params: `latitude`, `longitude`, `current`
- `fx-latest` → `https://api.frankfurter.dev` + `/v1/latest`; params: `base`, `symbols`

**No auth/guard pattern** — the manifest is a static read-only config; no DI needed.

---

### `src/data/dataBroker.ts` (service, request-response)

**Analog:** `src/host/resilientTransport.ts` (factory function + injected deps) and `src/host/tokenBucket.ts` (Clock DI)

**Imports pattern** (`src/host/resilientTransport.ts` lines 23-31):
```typescript
import {
  ModelHttpError,
  type MessagesResponse,
  type TransportFn,
} from "./modelClient";
import type { Clock } from "./clock";
import { realClock } from "./clock";
import { TokenBucket } from "./tokenBucket";
import { computeBackoffDelay, type BackoffOptions } from "./backoff";
```

**Interface shape** — export a typed interface so `Services` can carry it optionally:
```typescript
export interface DataFetchBroker {
  fetch(sourceId: string, params: unknown): Promise<{ data?: unknown; error?: string }>;
}
```

**Factory function pattern** (`src/host/resilientTransport.ts` lines 69-103):
```typescript
// DI: all external dependencies arrive via the options bag — no singleton imports.
export interface DataBrokerOptions {
  clock?: Clock;            // for TTL cache + rate-limit sleep
  limiter?: TokenBucket;    // reuse existing TokenBucket for 429-backoff
  ttlCache?: TtlCache;      // injected so tests can stub hit/miss behavior
  fetchFn?: typeof fetch;   // injected for no-network tests
}

export function createDataBroker(opts: DataBrokerOptions = {}): DataFetchBroker {
  const clock = opts.clock ?? realClock;
  // ...
  return {
    async fetch(sourceId, params) {
      const entry = SOURCE_MANIFEST.get(sourceId);
      if (!entry) return { error: "Requested data is not available." };
      // build URL from manifest only — no caller-supplied URL, no param injection
      // check TTL cache hit first
      // else: rate-limit-wrapped real fetch → parse → cache → return { data }
      // any failure (non-2xx, CORS, parse, timeout) → neutral { error }
    },
  };
}
```

**Error handling pattern** (`src/host/resilientTransport.ts` lines 84-100 and `src/execution/handler.ts` lines 258-272):
```typescript
// All failures → neutral { error }; mechanic never surfaced.
// Pattern: catch at the outermost boundary, return { error: NEUTRAL_COPY }.
// The neutral copy must never name the origin, rate limit, status code, or provider.
try {
  // ... fetch + parse
} catch {
  return { error: "Couldn't load this data right now." };
}
```

**Rate-limit wrapping pattern** (`src/host/resilientTransport.ts` lines 76-100):
```typescript
// Wrap the actual fetch call in limiter.run(() => ...) so the shared TokenBucket
// governs rate + concurrency; retry on 429 with computeBackoffDelay.
return await opts.limiter.run(() => fetchFn(url.toString()));
```

---

### `src/host/ttlCache.ts` (utility, request-response) — NET-NEW, no exact analog

**Closest analog:** `src/host/tokenBucket.ts` — for the Clock-DI pattern.

**Clock DI pattern** (`src/host/tokenBucket.ts` lines 22-47):
```typescript
import type { Clock } from "./clock";

export interface TokenBucketOptions {
  // ...
  clock: Clock;   // injected time seam — realClock in prod, stubClock in tests
}

export class TokenBucket {
  constructor(private readonly opts: TokenBucketOptions) {
    this.lastRefillMs = opts.clock.now();  // reads clock at construction
  }
  // uses opts.clock.now() in every time-dependent method
  // uses opts.clock.sleep(ms) to queue callers (never raw setTimeout)
}
```

**Pattern to implement** — copy the Clock injection exactly; model the cache as a plain class or factory:

```typescript
import type { Clock } from "./clock";

export interface TtlCacheOptions {
  clock: Clock;   // same DI seam as TokenBucket
}

interface CacheEntry {
  data: unknown;
  expiresAt: number;  // clock.now() + ttlMs at write time
}

export class TtlCache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly opts: TtlCacheOptions) {}

  get(key: string): unknown | undefined {
    const entry = this.store.get(key);
    if (!entry || this.opts.clock.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: unknown, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: this.opts.clock.now() + ttlMs });
  }
}
```

**Stub clock pattern for tests** (`src/host/clock.ts` lines 36-57):
```typescript
// createStubClock is exported from src/host/clock.ts and advances `current`
// only when sleep() is called — so TTL hit/miss is deterministic in tests:
const clock = createStubClock(0);
const cache = new TtlCache({ clock });
cache.set("k", { data: 42 }, 60_000);
expect(cache.get("k")).toEqual({ data: 42 }); // hit: current=0, expires=60000
clock.sleep(70_000);                           // advances virtual clock to 70000
expect(cache.get("k")).toBeUndefined();        // miss: expired
```

---

### `src/execution/handler.ts` *(modify — inject `fetchData` param into constrained scope)*

**Analog:** self — the existing file is the authoritative pattern.

**DENIED_GLOBALS pattern** (`src/execution/handler.ts` lines 70-78):
```typescript
export const DENIED_GLOBALS: readonly string[] = [
  "fetch",
  "XMLHttpRequest",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "window",
  "document",
];
```

**params build pattern** (`src/execution/handler.ts` lines 117-123) — `fetchData` is ADDED as a new allowed param BEFORE `input`:
```typescript
const params = [
  "module",
  "exports",
  "require",
  ...DENIED_GLOBALS,  // shadowed to undefined — fetch stays denied here
  "fetchData",        // NEW: the host-brokered data accessor (services-bound closure)
  "input",            // always last
];
```

**Call site pattern** (`src/execution/handler.ts` lines 138-140) — pass the services-bound closure positionally:
```typescript
// Positional args: CJS shims, one undefined per denied global, then fetchData, then input.
const deniedArgs = DENIED_GLOBALS.map(() => undefined);
const result = await fn(mod, mod.exports, requireShim, ...deniedArgs, fetchData, input);
```

**Bound-closure precedent** (`src/execution/loader.ts` lines 135-136) — the same pattern as `runHandler`:
```typescript
// Bind services so the generated handler never sees the Services object.
const boundRunHandler = (intent: string, input: unknown) =>
  runHandler(intent, input, services);
// Apply the same pattern for fetchData:
const boundFetchData = (sourceId: string, params: unknown) =>
  services.fetchDataBroker?.fetch(sourceId, params)
    ?? Promise.resolve({ error: "Data not available." });
```

`fetchData` must be `undefined`-safe: when `services.fetchDataBroker` is absent (no data path wired), the handler receives a stub that returns a neutral error — the core loop is never blocked.

---

### `src/services/services.ts` *(modify — add optional `fetchDataBroker` to `Services`)*

**Analog:** self — the existing interface is the pattern.

**Services interface shape** (`src/services/services.ts` lines 30-47):
```typescript
export interface Services {
  transport: TransportFn;
  registry: Registry;
  getApiKey: ApiKeyGetter;
  produceGate: ProduceGate;
  storage: StoragePressureSeam;
  // NEW — optional; core flow unaffected when absent:
  fetchDataBroker?: DataFetchBroker;
}
```

**createServices prod wiring** (`src/services/services.ts` lines 88-99) — add one new key:
```typescript
export function createServices(): Services {
  return {
    transport: createModelTransport(),
    registry: realRegistry,
    getApiKey: localStorageApiKeyGetter,
    produceGate: createProduceGate({ clock: realClock }),
    storage: navigatorStorageSeam,
    // NEW: real broker wired with manifest + limiter + ttlCache + realClock
    fetchDataBroker: createDataBroker({ clock: realClock }),
  };
}
```

---

### `src/services/testServices.ts` *(modify — add `fetchDataBroker` override slot)*

**Analog:** self — the existing override pattern is the template.

**TestServicesOverrides extension** (`src/services/testServices.ts` lines 68-76):
```typescript
export interface TestServicesOverrides {
  transport?: TransportFn;
  registry?: Registry;
  apiKey?: string | null;
  produceGate?: ProduceGate;
  storage?: StoragePressureSeam;
  fetchDataBroker?: DataFetchBroker;  // NEW: inject a canned broker for handler tests
}
```

**createTestServices wiring** (`src/services/testServices.ts` lines 85-95):
```typescript
export function createTestServices(overrides: TestServicesOverrides = {}): Services {
  // ...existing fields...
  return {
    transport: overrides.transport ?? unusedTransport,
    registry: overrides.registry ?? createInMemoryRegistry(),
    getApiKey,
    produceGate: overrides.produceGate ?? passthroughProduceGate,
    storage: overrides.storage ?? noPressureStorageSeam,
    fetchDataBroker: overrides.fetchDataBroker,  // undefined by default = no-op path
  };
}
```

**Canned broker test double** (new helper, mirror of `cannedTransport`):
```typescript
// A broker that returns a fixed response — for handler integration tests.
export function cannedBroker(response: { data?: unknown; error?: string }): DataFetchBroker {
  return { fetch: (_sourceId, _params) => Promise.resolve(response) };
}

// A broker that should never be called — mirrors unusedTransport.
export const unusedBroker: DataFetchBroker = {
  fetch: () => { throw new Error("DataFetchBroker was invoked unexpectedly"); },
};
```

---

### `index.html` *(modify — widen `connect-src` to the four allowlisted origins)*

**Analog:** self — the existing CSP meta tag at line 15 is the pattern to extend.

**Current connect-src** (`index.html` line 15):
```html
connect-src 'self' https://api.anthropic.com;
```

**Target connect-src** (DATA-02, CONTEXT.md):
```html
connect-src 'self' https://api.anthropic.com https://api.open-meteo.com https://geocoding-api.open-meteo.com https://api.frankfurter.dev;
```

Rule: never `*`; only the four exact origins listed in DATA-02. The rest of the CSP directives are untouched.

---

### `src/csp.test.ts` *(modify — add allowlist assertions for the three new data origins)*

**Analog:** self — the existing test structure at lines 57-71 is the pattern.

**Existing test structure** (`src/csp.test.ts` lines 57-71):
```typescript
describe("CSP inline-script hash guard (CR-01)", () => {
  it("script-src contains the sha256 source matching the inline first-paint script", () => {
    const html = readIndexHtml();
    const expected = sha256Source(inlineScriptBody(html));
    const directive = scriptSrcDirective(html);
    expect(directive).toContain(`'${expected}'`);
  });
  it("keeps the inline script authorized by hash, not by 'unsafe-inline'", () => { ... });
});
```

**Pattern to add** — a new `describe` block for `connect-src`, mirroring the helper extraction pattern:
```typescript
// Helper: extract connect-src from the CSP meta content (mirrors scriptSrcDirective).
function connectSrcDirective(html: string): string {
  const meta = html.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]*)"/);
  if (!meta?.[1]) throw new Error("No Content-Security-Policy meta tag found");
  const directive = meta[1].split(";").map(p => p.trim()).find(p => p.startsWith("connect-src"));
  if (!directive) throw new Error("No connect-src directive in the CSP");
  return directive;
}

describe("CSP connect-src allowlist (DATA-02)", () => {
  it("contains the Anthropic platform origin", () => {
    expect(connectSrcDirective(readIndexHtml())).toContain("https://api.anthropic.com");
  });
  it("contains the forecast API origin", () => {
    expect(connectSrcDirective(readIndexHtml())).toContain("https://api.open-meteo.com");
  });
  it("contains the geocoding API origin", () => {
    expect(connectSrcDirective(readIndexHtml())).toContain("https://geocoding-api.open-meteo.com");
  });
  it("contains the FX rate origin", () => {
    expect(connectSrcDirective(readIndexHtml())).toContain("https://api.frankfurter.dev");
  });
  it("does not contain a wildcard origin", () => {
    expect(connectSrcDirective(readIndexHtml())).not.toContain("*");
  });
});
```

---

### `src/apps/seeds.ts` *(modify — add Weather + Currency delegated module entries)*

**Analog:** self — the existing `SEEDED_SOURCES` Map is the pattern.

**Existing seeded map shape** (`src/apps/seeds.ts` lines 1-7):
```typescript
export const SEEDED_SOURCES: ReadonlyMap<string, string> = new Map([
  ["counter", `...`],
  ["notes", `...`],
]);
```

**Pattern to extend** — add two new delegated module source strings. A delegated seed exports `initialState`, `view(state)`, and `actionSpec` (NOT a monolithic `App`):

```typescript
// Delegated module shape (behavior-free):
// - initialState: complete state shape + initial values
// - view(state): pure markup with data-action attributes, NO event handlers
// - actionSpec: string description of what each action does to the state shape
//
// The DelegatedShell runtime (src/execution/delegated.tsx) mounts these —
// the shell owns state, event delegation, runHandler dispatch, and merge-gating.
["weather", `
const initialState = {
  query: "",
  place: "",
  tempC: null,
  condition: "",
  status: "idle",       // "idle" | "loading" | "ready" | "error"
};
const actionSpec = \`
  State shape: { query:string, place:string, tempC:number|null, condition:string, status:string }
  search: fetch weather for state.query; set place/tempC/condition/status
\`;
function view(state) {
  // markup only: inputs carry data-action="search", status drives neutral loading/error copy
}
`],
["currency", `
const initialState = { base: "USD", rates: null, status: "idle" };
// ...
`],
```

Weather `initialState` (CONTEXT.md DATA-03): `{ query:"", place:"", tempC:null, condition:"", status:"idle" }`.
Currency `initialState` (CONTEXT.md DATA-03): `{ base:"USD", rates:null, status:"idle" }`.

The derived state schema (`deriveStateSchema` in `src/execution/stateSchema.ts`) uses `initialState` to
produce the Zod schema. Data fields (`tempC`, `rates`) must be in `initialState` so the schema
allows them on merge — otherwise Phase 11's merge-gating rejects the fetched-data state update.

---

### `src/apps/weatherHandlers.ts` + `src/apps/currencyHandlers.ts` (config, request-response)

**Analog:** `src/apps/seeds.ts` (seeded short-circuit pattern from `src/execution/loader.ts` lines 252-263)

**Loader short-circuit pattern** (`src/execution/loader.ts` lines 252-263):
```typescript
// Seeded path: transpile locally, no model call.
const seededSource = userPrompt ? undefined : SEEDED_SOURCES.get(appType);
if (seededSource) {
  source = seededSource;
  transpiledJS = transpile(source, { filename: appType + ".tsx" });
  mode = "app";
}
```

**Pattern to copy** — a `ReadonlyMap<string, string>` (handler intent → handler source) that the
handler resolver checks BEFORE calling `resolveHandlerJS` → model path. The map keys are the exact
intent strings `buildActionIntent(appType, module.actionSpec, action)` produces at runtime.

```typescript
// src/apps/weatherHandlers.ts
// Seeded handler sources for the Weather app's actions.
// The map key must match exactly the intent string DelegatedShell builds at runtime.
export const WEATHER_HANDLER_SOURCES: ReadonlyMap<string, string> = new Map([
  [
    "<exact intent string for weather search action>",
    `
    // handler(input): calls fetchData("weather-geocode", ...) then fetchData("weather-forecast", ...)
    // returns { data: { state: { place, tempC, condition, status:"ready" } } }
    // on error: returns { data: { state: { ...input.state, status:"error" } } }
    `,
  ],
]);
```

Then add a `SEEDED_HANDLER_SOURCES` map (aggregating all app handler maps) consulted in
`src/execution/handler.ts` `resolveHandlerJS()` before the cache lookup — same position as the
loader's `SEEDED_SOURCES` check:

```typescript
// In resolveHandlerJS() before the registry cache get:
const seededHandlerSource = SEEDED_HANDLER_SOURCES.get(intent);
if (seededHandlerSource) {
  return transpileHandler(seededHandlerSource, { filename: "handler.ts" });
}
// ...existing cache-then-produce path...
```

---

### `src/data/dataBroker.test.ts` (test, request-response)

**Analog:** `src/execution/handler.test.ts` (lines 75-117) for test structure; `src/csp.test.ts` for the CSP assertions pattern.

**Test structure pattern** (`src/execution/handler.test.ts` lines 75-118):
```typescript
describe("<unit name> — <requirement tag>", () => {
  it("<behavior on MISS/HIT/error>", async () => {
    // Arrange: inject canned/stub doubles, never real network or IndexedDB.
    // Act: call the unit under test.
    // Assert: verify { data } / { error } shape; verify neutral copy (not.toMatch(/mechanic/i)).
    const services = createTestServices({ fetchDataBroker: cannedBroker({ data: FIXTURE }) });
    const result = await ...;
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual(EXPECTED);
  });
});
```

**Key test cases to cover** (CONTEXT.md `<specifics>`):
1. TTL cache HIT — stub Clock; verify no second fetch call (`cannedFetch` call count = 1 on two invocations).
2. TTL cache MISS — Clock advanced past TTL; verify a second fetch is issued.
3. Allowlist rejection — `sourceId` not in manifest → `{ error }`, neutral copy, no fetch.
4. Param injection guard — extra params not in `allowedParams` are dropped; URL built from manifest only.
5. Non-2xx response → neutral `{ error }`.
6. Handler integration: seeded weather/currency handlers call `fetchData` with real-shape fixtures → correct state fields.
7. No-broker fallback: `services.fetchDataBroker` absent → handler returns neutral `{ error }` (not throw).

**DI / no-network invariant** (`src/execution/handler.test.ts` line 108-116):
```typescript
// Never inject a real fetch transport — always a canned one.
// Test doubles from testServices cover all network-touching behavior.
const services = createTestServices({ apiKey: null });
const result = await runHandler("anything", {}, services);
expect(result.data).toBeUndefined();
expect(result.error).not.toMatch(/key|auth|produce/i);
```

---

## Shared Patterns

### Clock / rng DI for deterministic time
**Source:** `src/host/clock.ts` (lines 11-57), `src/host/tokenBucket.ts` (lines 22-47), `src/host/backoff.ts` (lines 16-23)
**Apply to:** `src/host/ttlCache.ts`, `src/data/dataBroker.ts`

```typescript
// Production: inject realClock
import { realClock } from "../host/clock";
const cache = new TtlCache({ clock: realClock });

// Tests: inject createStubClock — zero real waits, fully deterministic
import { createStubClock } from "../host/clock";
const clock = createStubClock(0);
```

### Neutral error copy — never reveal the mechanic
**Source:** `src/execution/handler.ts` (lines 84-85, 259-272), `src/ui/ErrorBoundary.tsx` (lines 33-55)
**Apply to:** `src/data/dataBroker.ts`, all neutral UI states in Weather/Currency seeds

```typescript
// All failure paths return { error: NEUTRAL_COPY } — never a status code, origin name,
// provider name, or any mechanic-exposing term.
const NEUTRAL_FETCH_ERROR = "Couldn't load this data right now.";
// Weather neutral states:
//   loading → "Loading conditions…" (with aria-busy="true")
//   empty   → "Enter a location"
//   error   → "Couldn't load conditions" / "Try again"
// Currency neutral states:
//   loading → "Loading rates…"
//   error   → "Couldn't load rates" / "Try again"
```

### Neutral loading state — aria-busy
**Source:** `src/ui/SkeletonCard.tsx` (lines 4-15), `src/execution/delegated.tsx` (line 209)
**Apply to:** Weather/Currency `view(state)` neutral loading markup

```tsx
// SkeletonCard sets aria-busy="true" on the container while loading.
// DelegatedShell mirrors this with aria-busy on its root div during an in-flight action.
// Weather/Currency view() must express status:"loading" with aria-busy on its root:
<div aria-busy={state.status === "loading" ? "true" : undefined}>
  {state.status === "loading" && <span role="status">Loading conditions…</span>}
  ...
</div>
```

### Swallowed errors → gated logger only
**Source:** `src/execution/handler.ts` (lines 258-272), `src/execution/delegated.tsx` (lines 194-196)
**Apply to:** `src/data/dataBroker.ts`, seeded handler error paths

```typescript
// Never throw out of a broker fetch or seeded handler — return { error }.
// Log diagnostics to the gated logger; never surface to the UI.
import { logger } from "../lib/logger";
try { ... } catch (err) {
  logger.error("DataBroker: fetch failed: " + String(err));
  return { error: NEUTRAL_FETCH_ERROR };
}
```

### Optional Services field — feature-only, core flow unaffected
**Source:** `src/services/services.ts` (lines 30-47), `src/services/testServices.ts` (lines 85-95)
**Apply to:** `fetchDataBroker?: DataFetchBroker` in `Services`

Mark the field optional (`?`) so existing tests that build `createTestServices()` without providing
a broker compile and run unchanged. All code that reads `services.fetchDataBroker` must guard with
`?.` or `?? fallback`.

### Hygiene — no banned mechanic lexicon
**Apply to:** ALL new and modified files (source, test, comments, string literals, manifest keys)

The following tokens must not appear in any devtools-visible surface (source text, comments
shipped in the bundle, string literals, manifest `sourceId` values):
`synthesize`, `synthesized`, `synthesis`, `generate`, `generated`, `on-demand`, `produce`, `compile`.

Source comments in non-shipped test files may use technical terms for developer clarity, but must
not use the specifically banned tokens above. Neutral data-framed copy for UI strings only.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/host/ttlCache.ts` | utility | request-response | No TTL or general-purpose in-memory cache exists in the codebase; closest is the Clock-DI pattern in `src/host/tokenBucket.ts` (see Pattern Assignment above) |

---

## Metadata

**Analog search scope:** `src/execution/`, `src/services/`, `src/host/`, `src/data/`, `src/apps/`, `src/ui/`, `index.html`, `src/csp.test.ts`
**Files scanned:** 15
**Pattern extraction date:** 2026-06-26
