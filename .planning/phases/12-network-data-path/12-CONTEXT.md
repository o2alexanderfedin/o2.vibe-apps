# Phase 12: Sanctioned Network-Data Path - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss=true; decisions pre-resolved from REQUIREMENTS.md + codebase scout + LIVE API verification)

<domain>
## Phase Boundary

Give network apps REAL data through a **host-brokered, allowlisted** path — Weather shows real current conditions, Currency shows real FX — while raw `fetch`/XHR stay banned in generated scope, the CSP stays a finite keyless allowlist (never `*`), and nothing the user or devtools sees reveals the on-demand mechanic.

Delivers DATA-01 (host-brokered `fetchData` broker; host builds the URL), DATA-02 (keyless CORS allowlist + CSP), DATA-03 (real Weather/Currency with neutral loading/empty/error), DATA-04 (TTL cache + neutral failure).

**USER STEER (recorded — load-bearing):** v1.1 does NOT gate on Anthropic-key-exfiltration hardening. Keep the host-brokered keyless allowlist (it's a CORS necessity + keeps the path simple and hygiene-safe), but treat it as a **feature/CORS necessity, NOT a security gate** — do NOT design extra key-exfil defenses or block on that threat model. (The data path is keyless: the Anthropic key never enters it.) See [[key-exfil-deprioritized-v11]].

Out of scope: any application server/BFF/proxy; key-bearing or non-CORS providers; un-shadowing raw `fetch`; runtime-error self-heal round-trips; widget composition (Phase 13).
</domain>

<decisions>
## Implementation Decisions

### DATA-01 — host-brokered fetchData (the boundary)
- Add a `DataFetchBroker` with `fetch(sourceId: string, params: unknown): Promise<{ data?: unknown; error?: string }>`. Inject a services-bound closure `fetchData(sourceId, params)` into the HANDLER constrained scope as a NEW allowed `new Function` parameter, placed BEFORE `input` — mirroring how `runHandler` is bound (`loader.ts:135-136`) and how the handler params are built (`handler.ts:117-140`).
- Raw `fetch`/`XMLHttpRequest` STAY in `DENIED_GLOBALS` (shadowed to `undefined`). Generated code calls only `fetchData`; it never builds URLs and never sees raw network.
- The HOST builds the request URL from a curated **source manifest** (`sourceId → { origin, path, allowedParams }`); only manifest-declared params are encoded (via `URLSearchParams`), preventing param-injection/SSRF. A `sourceId` not in the manifest → broker returns a neutral `{ error }` (rejected).

### DATA-02 — keyless CORS allowlist + CSP (origins VERIFIED LIVE 2026-06-26)
Manifest sources (request shapes confirmed by live fetch):
- `weather-geocode` → `https://geocoding-api.open-meteo.com/v1/search` — params `name`, `count`, `language`, `format`. Response: `{ results: [{ name, latitude, longitude, country, country_code, admin1, timezone }] }`.
- `weather-forecast` → `https://api.open-meteo.com/v1/forecast` — params `latitude`, `longitude`, `current`. Response: `{ latitude, longitude, timezone, current_units:{…}, current:{ time, temperature_2m, weather_code, wind_speed_10m } }`.
- `fx-latest` → `https://api.frankfurter.dev/v1/latest` — params `base`, `symbols`. Response: `{ amount, base, date, rates:{ EUR, GBP, JPY, … } }`. (Use the `.dev` host — VERIFIED responding; not `.app`.)
- CSP `connect-src` widened in `index.html` to EXACTLY: `'self' https://api.anthropic.com https://api.open-meteo.com https://geocoding-api.open-meteo.com https://api.frankfurter.dev`. **Never `*`.** Assert each origin (and the absence of `*`) in `src/csp.test.ts`.

### DATA-03 — real Weather + Currency, neutral states
- Define Weather + Currency as **seeded delegated modules** (behavior-free: `initialState` + markup-only `view(state)` with `data-action` + `actionSpec`), so the shell renders deterministically without a model call. Weather `initialState ≈ { query:"", place:"", tempC:null, condition:"", status:"idle" }`; Currency `≈ { base:"USD", rates:null, status:"idle" }`.
- Data fetch goes through a handler (the "backend" layer) that calls `fetchData`. **STRONGLY PREFERRED:** ship a **deterministic seeded handler** for each app's load action (extend the seed pattern to handlers — a seeded-handler lookup that short-circuits the produce path, mirroring how `SEEDED_SOURCES` short-circuits app production). This makes the flagship network apps work WITHOUT any Anthropic call, fully deterministic, and browser-smoke-testable. **Fallback** (if a seeded-handler path proves too invasive): produce the handler on demand (normal delegated flow, needs the user's key) with canned-broker tests + graceful no-key degradation. Planner picks; prefer the seeded path for robustness.
- Neutral, DATA-framed loading/empty/error states (reuse `aria-busy` + the SkeletonCard/neutral-copy patterns): loading = "Loading conditions…"/spinner; empty = "Enter a location"; error = "Couldn't load conditions" / "Try again". NEVER mechanic-framed (no "API", "rate limit", "503", no banned lexicon). The Phase 11 validate-at-merge gate now guards the fetched-data state merge — the derived schema must accommodate the data fields (initialState carries them so the schema is derived correctly).

### DATA-04 — TTL cache + neutral failure
- New `src/host/ttlCache.ts`: in-memory `Map` keyed by `(sourceId + stable-hash(params))` → `{ data, expiresAt }`. Inject `Clock` (DI) for deterministic tests (follow the TokenBucket/backoff Clock-injection precedent). Per-source TTL: weather ~10 min, FX ~daily (or ~30 min). Ephemeral (lost on refresh) — no IndexedDB needed.
- Make the broker rate-limit-friendly by reusing the existing `TokenBucket` + `resilientTransport`/`backoff` host utilities to wrap the data fetch (429-backoff with jitter). Any fetch failure (network, non-2xx, CORS, parse) → neutral `{ error }`/fallback state; never reveal the mechanic and never expose any key (the path is keyless anyway).

### Services / wiring
- Add an OPTIONAL `fetchDataBroker?: DataFetchBroker` to the `Services` interface (feature-only; core flow unaffected). Wire a real broker (manifest + limiter + ttlCache + a real `fetch` transport) in `createServices()`; allow a canned broker in `createTestServices()`.

### Hygiene + key steer
- No banned mechanic lexicon in any new code, comment, copy, or manifest string (devtools-visible). Data states are data-framed.
- Per the steer: the allowlist is a CORS/feature necessity. Do NOT add elaborate key-exfil defenses; the Anthropic key simply never enters the keyless data path.

### Claude's Discretion
Exact manifest/broker file layout (`src/data/dataBroker.ts` + `src/data/sourceManifest.ts` suggested), the seeded-handler mechanism, per-source TTL values, the precise neutral copy, and whether Weather geocodes-then-forecasts in one handler or two are at the planner/executor's discretion within the constraints above.
</decisions>

<code_context>
## Existing Code Insights (from codebase scout)

- Handler constrained scope + denylist: `src/execution/handler.ts:70-78` (`DENIED_GLOBALS`), params built `:117-140` (`new Function(...params, body)`), executor `:101-149`. INJECT `fetchData` here as a new allowed param before `input`.
- Bound-closure precedent: `runHandler` bound to services in `src/execution/loader.ts:135-136`.
- `Services` interface: `src/services/services.ts:30-47` (transport, registry, getApiKey, produceGate, storage). Add optional `fetchDataBroker`. Prod wiring `:88-99`; test wiring `src/services/testServices.ts:85-95`.
- CSP: `index.html:15` meta tag — current `connect-src 'self' https://api.anthropic.com`. Tests in `src/csp.test.ts:57-71`.
- Host resilience utils (reuse): `src/host/tokenBucket.ts:35-127`, `src/host/resilientTransport.ts:69-103`, `src/host/backoff.ts:34-50` (all Clock/rng DI). NO existing TTL cache → net-new `src/host/ttlCache.ts`.
- Apps: Weather/Currency are catalog entries only (`src/data/appRegistry.ts:13-40`); NOT seeded (`src/apps/seeds.ts` has only counter/notes), NOT produced yet.
- Delegated flow: `src/execution/delegated.tsx:173-201` (click → runHandler → validate(`stateSchema.safeParse`) → merge). Phase 11's merge-validation now guards data state.
- Neutral UI: `src/ui/SkeletonCard.tsx:4-15` (aria-busy), `src/ui/ErrorBoundary.tsx:33-55` (neutral fallback).
- Test patterns: `src/execution/handler.test.ts:75-117`, `src/services/injection.test.ts:52-72` (DI + real fixtures, no real network).

### Established Patterns
- Capabilities injected as services-bound closures into the constrained scope; everything else shadowed.
- Clock/rng DI for deterministic time/jitter tests; canned transport for no-network tests.
- Errors swallowed → neutral; gated logging; HYGIENE bans the mechanic lexicon devtools-wide.

### Integration Points
- New: `src/data/dataBroker.ts` (+ `sourceManifest.ts`), `src/host/ttlCache.ts`, seeded Weather/Currency modules (+ seeded handlers), `index.html` CSP, `services.ts`/`testServices.ts` wiring.
- The fetched-data state must satisfy the Phase 11 derived schema (initialState declares the data fields).
</code_context>

<specifics>
## Specific Ideas

- Integration test parses REAL-shape fixtures (captured from the live APIs — see verified response shapes above) for geocode, forecast, and FX; assert the handler maps them to the right state fields. Add canned-broker unit tests (handler→fetchData→merge), TTL hit/miss tests (stub Clock), allowlist-rejection test (unknown sourceId → `{error}`), and the CSP `connect-src` assertions (3 origins present, no `*`).
- **Browser CORS smoke (roadmap-flagged GAP — required this phase):** the orchestrator will run a Playwright smoke against `npm run dev` — open Weather, load a city, see a real temperature; open Currency, see real rates; confirm via DevTools Network the requests hit the allowlisted origins and CORS succeeds (the live keyless-CORS was only `curl`/server-verified before).
- Acceptance: tsc 0, full suite green (≥422 + new), build clean (no sourcemaps), hygiene green, CSP test asserts the finite allowlist, plus the browser smoke.

## VERIFIED live API shapes (2026-06-26)
- geocode: `{ results:[{ name, latitude, longitude, country, country_code, admin1, timezone }], generationtime_ms }`
- forecast: `{ latitude, longitude, elevation, timezone, current_units:{ temperature_2m:"°C", weather_code:"wmo code", wind_speed_10m:"km/h" }, current:{ time, interval, temperature_2m, weather_code, wind_speed_10m } }`
- fx: `{ amount, base, date, rates:{ EUR, GBP, JPY } }` (host `api.frankfurter.dev`)
</specifics>

<deferred>
## Deferred Ideas

- Anthropic-key-exfil hardening / iframe sandbox (HARD-01) — explicitly deferred per the user steer; the broker sits behind the same seam so the iframe move stays contained later.
- Key-bearing or non-CORS data providers — out (key-leak surface; allowlist is keyless-CORS only).
- Persisting the data TTL cache to IndexedDB — out for v1.1 (ephemeral in-memory is enough).
- Streaming/websocket data — out.
</deferred>
