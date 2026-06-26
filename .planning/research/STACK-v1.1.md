# Stack Research — Milestone v1.1 "Real & Robust"

**Domain:** Client-only, browser-only generative app marketplace — additive features on a shipped v1.0
**Researched:** 2026-06-25
**Confidence:** HIGH (data-API CORS verified empirically via live `curl`; library versions verified live via npm registry)

> **Scope discipline:** This document covers ONLY what the four NEW v1.1 features need. The existing stack (Vite 8, React 19.2, `@babel/standalone` v7 classic, `idb` 8, Haiku via browser fetch, `lucide-react`) is settled in `STACK.md` and is NOT re-litigated here.

---

## Headline Verdict

| Feature | New dependency? | What to add |
|---------|-----------------|-------------|
| **A. Sanctioned network-data path** (Weather / Currency get real data) | **NO npm dep** | Keyless, CORS-`*` public APIs (Open-Meteo + Frankfurter) reached through a new **first-party fetch broker** + a **CSP `connect-src` allowlist edit**. Build the broker in-house (~150 LOC). |
| **B. Reliability hardening** (validate produced reducer state / actionSpec) | **YES — one small dep** | **`zod@^4` via the `zod/mini` subpath** (~1.9 KB gzip, tree-shakeable) for runtime contract validation feeding the self-heal loop. |
| **C. Richer storefront** (persist displayName/prompt, "popular" row) | **NO** | Pure schema-field + IndexedDB-store changes. Existing `idb` 8 + React 19 cover it. |
| **D. Activate widget composition** (type WidgetRecord/HandlerRecord) | **NO** | TypeScript types + the same `zod/mini` schemas from (B). No runtime dep beyond zod. |

**One new runtime dependency total: `zod@^4` (used via `zod/mini`).** Everything else is in-house code, config edits, and types.

---

## Recommended Stack

### Core Technologies (NEW for v1.1)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Open-Meteo API** | (versionless HTTP; `/v1/forecast`, geocoding `/v1/search`) | Real weather data for the Weather app | **No API key for non-commercial use** and **CORS `access-control-allow-origin: *` confirmed live** on both `api.open-meteo.com` and `geocoding-api.open-meteo.com`. The de-facto keyless weather API. Returns WMO `weather_code` + `temperature_2m` + wind in one GET. Geocoding endpoint resolves "Berlin" → lat/long so the app can take a city name. No attribution token, no signup. |
| **Frankfurter API** | `v1` (also has `v2`; `v1/latest`, `v1/currencies` verified working live) | Real FX rates for the Currency app | **No API key, CORS `*` confirmed live.** Data sourced from the **ECB / 84 central banks**, ~30 fiat currencies, daily reference rates. Open-source and self-hostable (a later resilience lever). `GET /v1/latest?base=USD&symbols=EUR,GBP` returns `{amount, base, date, rates}` — trivial to parse, no auth header. Best fit because it is a single stable origin to allowlist in CSP. |
| **zod** | `^4.4.3` (current; use the **`zod/mini`** export) | Runtime validation of LLM-produced reducer state shape + actionSpec contract; gate bad transitions into the self-heal loop | The v1.0 self-heal loop already feeds the **compiler** error back to Haiku on a bad produce (RESIL-04); (B) extends that to **semantic** errors. A zod schema describing the expected `{initialState, actions[]}` contract turns "the reducer returned garbage" into a precise, model-actionable message (`"expected actions[0].type to be string, got undefined"`) — exactly the kind of input the self-heal loop consumes. `zod/mini` is ~1.9 KB gzip and tree-shakeable, so it does **not** meaningfully add to a bundle already carrying ~400-500 KB gzip of Babel. |

### Supporting Libraries (NEW)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **`@fawazahmed0/currency-api`** (CDN, not an npm install) | `@latest` or date-pinned via jsDelivr | Fallback / wider currency + crypto coverage if Frankfurter's ~30 fiat set is too narrow | Keyless, CORS `*` confirmed live (served from `cdn.jsdelivr.net`). Daily updates, 200+ currencies incl. crypto/metals. **Only add if Frankfurter's currency coverage proves insufficient** — each extra origin is another CSP `connect-src` entry and another hygiene surface. Prefer Frankfurter as primary. |

### Development Tools (NEW)

| Tool | Purpose | Notes |
|------|---------|-------|
| (none new) | — | Existing Vitest 4 + `fake-indexeddb` + Testing Library stack covers the new code. Mock the data-fetch broker behind the existing IoC/DI seam (`src/services/`) so tests never hit the live weather/FX APIs — capture one fixture response per API, exactly like the existing Haiku fixtures. |

---

## The Sanctioned Network-Data Path — design constraints (Feature A)

This is the highest-judgment piece. It needs **no library**, but it needs a deliberate shape because two hard project rules collide with letting handlers fetch.

1. **CSP edit is mandatory and is the real "install".** `index.html` line 15 currently pins:
   ```
   connect-src 'self' https://api.anthropic.com
   ```
   and `src/csp.test.ts` pins this exact string in CI. The sanctioned path requires adding the chosen origins:
   ```
   connect-src 'self' https://api.anthropic.com https://api.open-meteo.com https://geocoding-api.open-meteo.com https://api.frankfurter.dev
   ```
   `src/csp.test.ts` must be updated in the same change or CI fails. **Keep this allowlist closed** — it is the egress security boundary now that handlers can fetch. Do NOT widen to a wildcard or add a generic CORS proxy (that would re-open the key-exfiltration surface the CSP exists to close).

2. **The handler scope denies `fetch` today — keep it that way; broker instead.** Handlers run in a `new Function` scope that *shadows* `fetch`/`XMLHttpRequest`/`localStorage`/`window`/`document` to `undefined`. Do **not** simply un-shadow `fetch` — that hands arbitrary generated code the ability to call any allowlisted origin with arbitrary payloads, and (because the API key sits in `localStorage`) re-opens the exfil surface. Instead, inject a **narrow first-party data broker** into the handler scope (same mechanism as the existing `runHandler` / `useWidget` / `require` injections):
   - The broker exposes named, parameterized methods only — e.g. `data.weather({ city })`, `data.fx({ from, to, amount })` — never a raw URL passthrough.
   - The broker is first-party host code: it builds the URL, calls the allowlisted origin, parses JSON, returns a typed result. Generated code chooses *which* method and args, never the destination.
   - This keeps the egress allowlist meaningful and keeps the API key unreachable from the data path.

3. **Add a tiny in-house fetch helper (no dep).** ~50-100 LOC covering: timeout via `AbortController`, one retry with jitter (reuse the existing `src/host/` backoff/token-bucket primitives — do not add a new HTTP library), a per-origin in-memory + IndexedDB response cache (weather/FX are slow-changing; cache by `(method, args)` with a short TTL), and a typed result/error union. This mirrors the existing resilience layer rather than introducing `axios`/`ky`/`ofetch` — native `fetch` is already the project's transport and adding an HTTP client would bloat the bundle and add a hygiene fingerprint for zero benefit.

4. **Hygiene check.** None of these origins or method names touch the banned "synthesi*" lexicon, and weather/FX traffic in the Network tab does not reveal the on-demand mechanic (it looks like any app calling a public API). Safe against HYGIENE-01/02/03.

---

## Reducer-Reliability: why `zod/mini`, not full zod or valibot (Feature B)

**Question posed: is zod the right fit given the bundle is already heavy with Babel?** — Yes, **with the `zod/mini` subpath**, and here is the evidence-based reasoning.

| Option | Version | Bundle (gzip, realistic small schema) | Verdict for this project |
|--------|---------|---------------------------------------|--------------------------|
| **`zod` (full, method API)** | 4.4.3 | ~12-15 KB | Works, best DX, but ships most of the lib regardless of how little you use (method API resists tree-shaking). Overkill for one contract schema. |
| **`zod/mini` (functional API)** | 4.4.3 (same package, `./mini` subpath export — confirmed present in 4.4.3) | **~1.9 KB** | **RECOMMENDED.** Same validation engine, tree-shakeable functional API, ~7x smaller than full zod. Negligible next to Babel's ~400-500 KB. Same package as full zod, so no second dependency, and you can use full-zod ergonomics in tests if wanted. |
| **valibot** | 1.4.1 | ~1.2-1.4 KB | Marginally smaller (~0.5 KB) and excellent tree-shaking, but a **separate ecosystem** with no other footprint in this codebase. The ~0.5 KB win is irrelevant against Babel, and a single-purpose new dependency is a worse trade than a subpath of a library the team is more likely to standardize on. |
| **arktype** | 2.2.1 | larger / type-heavy | No. Its value is TS-type inference at scale, not minimal runtime bundle. Wrong tool for one contract. |

**Decision:** `zod@^4`, imported as `import * as z from "zod/mini"`. The bundle-cost objection is real for *full* zod but is fully answered by `zod/mini`. The win is that a single declarative schema converts a whole class of "the produced reducer is subtly wrong" failures into **structured, model-readable diagnostics** that plug straight into the existing self-heal retry budget — directly serving the milestone's reliability goal.

**Integration point:** validate at the seam where a produced delegated module / action-spec is instantiated (`src/execution/` — `instantiate.ts` / `delegated.tsx` / `producerShell`). On a `z` parse failure, format the issue list and feed it to the next self-heal attempt exactly as the compiler error is fed today (RESIL-04). This also gives Features C and D their schema source of truth.

---

## Features C & D need NO new runtime dependency — confirmed

- **C. Richer storefront** — Persisting `displayName` / `prompt` / `widgetDeps` / `createdAt` (G5) is an `idb` 8 object-store/schema change (bump the IndexedDB version, add fields in `onupgradeneeded`). The "popular" row (POP-01) reads the already-persisted `useCount` (kept for LRU) and sorts — pure React 19 + existing registry code. **Nothing to install.**
- **D. Activate widget composition** — Replacing the `Record<string, unknown>` placeholder `WidgetRecord` / `HandlerRecord` with real types (G3) and folding `kind` + prompt-hash fully into the cache key (G1-followups) is **TypeScript types + the same `zod/mini` schemas** from (B) for runtime validation of the records. The widget generation machinery already exists (WIDGET-01..05, built but dormant); activating it is wiring, not new tech. **Nothing to install** beyond zod (already counted in B).

---

## Installation

```bash
# The ONLY new npm dependency for v1.1 (used via the zod/mini subpath):
npm install zod@^4

# NO other installs. Data APIs are keyless HTTP endpoints (a CSP allowlist edit, not a package).
# fawazahmed0 currency-api, if ever used, is a CDN URL — also not an npm install.
```

```diff
# index.html line 15 — CSP edit (the real "install" for Feature A). Update src/csp.test.ts to match.
- connect-src 'self' https://api.anthropic.com;
+ connect-src 'self' https://api.anthropic.com https://api.open-meteo.com https://geocoding-api.open-meteo.com https://api.frankfurter.dev;
```

```ts
// Feature B usage shape
import * as z from "zod/mini";
const ActionSpec = z.object({ type: z.string(), label: z.string() });
const DelegatedContract = z.object({ initialState: z.unknown(), actions: z.array(ActionSpec) });
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Open-Meteo** (keyless, CORS `*`) | OpenWeatherMap | Never for this project — OWM requires an API key, which (a) means a *second* user-supplied secret or an embedded key (hygiene + exfil risk), and (b) the free tier historically lacks browser CORS. Open-Meteo removes both problems. |
| **Frankfurter** (keyless, CORS `*`, ECB) | `@fawazahmed0/currency-api` (CDN) | Use fawazahmed0 only if you need crypto/metals or >30 currencies. It is keyless+CORS too, but adds a second origin to the CSP allowlist and a second hygiene surface. Frankfurter first; fawazahmed0 as documented fallback. |
| **Frankfurter** | exchangerate-api.com open endpoint | Also keyless, but Frankfurter is open-source/self-hostable (a real resilience lever) and ECB-sourced; prefer it. |
| **In-house fetch broker** | `ky` / `ofetch` / `axios` | Don't. Native `fetch` is already the transport; the existing `src/host/` backoff + token-bucket cover retry/limit. An HTTP client adds bundle weight and a recognizable network/SDK fingerprint for zero functional gain. |
| **`zod/mini`** | full `zod` | Use full zod only if richer error messages / method-chaining DX in *non-shipped* code (tests, dev tooling) is wanted. Ship `zod/mini` in the hot path. |
| **`zod/mini`** | `valibot` | Choose valibot only if you are standardizing the whole codebase on it; the ~0.5 KB gzip advantage is immaterial here and a single new ecosystem dep is the worse trade. |

---

## What NOT to Use / NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Any application server / proxy / BFF for data fetching** | Directly violates the client-only, zero-infra constraint and the "never proxy the key" rule. The chosen APIs are CORS-`*`, so no proxy is needed anyway. | Direct browser fetch via the first-party broker to allowlisted, CORS-enabled origins. |
| **A generic CORS proxy** (corsproxy.io, allorigins, etc.) | Re-opens the egress hole the CSP exists to close, adds a third-party MITM on app data, and is a hygiene/availability liability. | Pick APIs that already send `access-control-allow-origin: *` (Open-Meteo, Frankfurter — both verified). |
| **Any auth SDK / OAuth / accounts library** (Auth0, Clerk, Firebase Auth, etc.) | Out of scope by project boundary — the only credential is the user's own Anthropic key in `localStorage`. Real accounts contradict the local-first, no-server model. | Nothing. There is no user identity to manage. |
| **Un-shadowing `fetch` in the handler `new Function` scope** | Hands arbitrary generated code direct network egress to every allowlisted origin while the API key sits in `localStorage` — exfil risk; makes the CSP allowlist meaningless. | Inject a narrow, parameterized first-party **data broker** (named methods, no raw-URL passthrough). |
| **An API key-bearing weather/FX provider** | A second secret to store/inject, and either an embedded key (leaks in devtools → exfil) or another BYOK prompt (UX + the key could ride along in a Network request, a hygiene leak). | Keyless providers only. |
| **Full `zod` in the shipped bundle** | ~12-15 KB gzip when `zod/mini` does the same job at ~1.9 KB; the bundle is already heavy with Babel — don't add avoidable weight. | `import * as z from "zod/mini"`. |
| **Streaming the data fetches via SSE / WebSocket** | No benefit for slow-changing weather/FX; adds a Network-tab surface and complexity; WebSocket origins would need CSP `connect-src` widening. | Plain cached GET requests. |
| **`@swc`/`esbuild-wasm` or any second transpiler "while we're at it"** | Out of milestone scope; the transpile path is settled (Babel v7 classic). | Leave the transpile seam untouched this milestone. |

---

## Stack Patterns by Variant

**If Frankfurter's ~30-currency fiat set is too narrow (crypto/metals requested):**
- Add `@fawazahmed0/currency-api` via jsDelivr CDN as a fallback the broker tries when the requested currency isn't in Frankfurter's set.
- Because it's keyless + CORS `*` and covers 200+ currencies — but it costs one more CSP `connect-src` entry, so add it only on demonstrated need.

**If the live weather/FX APIs become flaky or rate-limited under real load:**
- Frankfurter is open-source and self-hostable — but self-hosting reintroduces infra, which contradicts zero-infra. Prefer client-side caching (short TTL in IndexedDB) and graceful degrade-to-fallback (the v1.0 behavior) over standing up a server.
- Because the client-only constraint outranks data freshness; a stale-but-cached rate beats breaking the no-server boundary.

**If reducer-contract validation needs to also drive widget/handler record typing (Feature D overlap):**
- Define the zod schemas once in a shared `schema` module and derive both the runtime validators (B) and the TS types (`z.infer`) for `WidgetRecord` / `HandlerRecord` (D).
- Because one source of truth keeps the persisted-record shape, the produced-contract validation, and the static types in lockstep — and it's free once zod is in.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `zod@4.4.3` (`zod/mini`) | TypeScript `^6` (project), Vite `^8` | Zod 4 requires TS 5.5+; the project's TS 6 is fine. `zod/mini` `./mini` subpath export confirmed present in 4.4.3. |
| `zod/mini` | the existing self-heal loop (`src/execution/`, RESIL-04) | Format `z` issues into the same string-feedback channel the Babel compiler error uses. No runtime conflict with `new Function` (zod runs in host scope, not the injected scope). |
| Open-Meteo / Frankfurter origins | CSP `connect-src` (`index.html`) + `src/csp.test.ts` | Both must list the new origins or CI's CSP pin test fails. CORS `access-control-allow-origin: *` verified live 2026-06-25, so no preflight/credential issues. |
| New data broker | `idb@8` (response cache) + `src/host/` resilience | Reuse existing IndexedDB wrapper + backoff/token-bucket; no new transport dep. |
| `idb@8` schema bump (Feature C/D fields) | existing `apps`/`widgets`/`handlers` stores | Increment DB version; add `displayName`/`prompt`/`widgetDeps`/`createdAt` in `onupgradeneeded`. Backward-compatible (new optional fields). |

---

## Sources

- **Live `curl` of `api.open-meteo.com/v1/forecast` and `geocoding-api.open-meteo.com/v1/search`** (2026-06-25) — `HTTP 200`, `access-control-allow-origin: *`, no key required, returns `current.temperature_2m` + `weather_code` — **HIGH** (empirical)
- **Live `curl` of `api.frankfurter.dev/v1/latest` and `/v1/currencies`** (2026-06-25) — `HTTP 200`, `access-control-allow-origin: *`, `{amount,base,date,rates}` shape, no key — **HIGH** (empirical)
- **Live `curl` of `cdn.jsdelivr.net/npm/@fawazahmed0/currency-api`** (2026-06-25) — `HTTP 200`, `access-control-allow-origin: *`, keyless — **HIGH** (empirical)
- **npm registry** (live 2026-06-25) — `zod@4.4.3` (with `./mini` export confirmed), `valibot@1.4.1`, `arktype@2.2.1` — **HIGH**
- open-meteo.com/en/docs — keyless for non-commercial, forecast + geocoding endpoints — **HIGH**
- frankfurter.dev — ECB / 84 central banks, no key, no quotas, open-source/self-hostable — **HIGH**
- zod.dev/packages/mini + zod.dev/v4 — `zod/mini` functional/tree-shakeable API, ~1.9 KB gzip — **HIGH**
- builder.io/blog/valibot-bundle-size + souvenirlist/pockit zod-vs-valibot comparisons (2026) — zod full ~12-15 KB vs zod-mini ~1.9 KB vs valibot ~1.2-1.4 KB gzip — **MEDIUM-HIGH** (cross-confirmed across multiple comparison articles)
- Project `index.html` line 15 + `src/csp.test.ts` — current `connect-src 'self' https://api.anthropic.com` pin (the integration/edit point for Feature A) — **HIGH** (read from repo)

---
*Stack research for: client-only generative app marketplace — v1.1 additive features*
*Researched: 2026-06-25*
