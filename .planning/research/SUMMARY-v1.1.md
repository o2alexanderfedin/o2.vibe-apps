# Project Research Summary

**Project:** Vibe App Store — Milestone v1.1 "Real & Robust"
**Domain:** Client-only, browser-only generative app marketplace — four additive features on a shipped v1.0
**Researched:** 2026-06-25
**Confidence:** HIGH

> **Scope.** This summary synthesizes the four v1.1 research files (STACK-v1.1, FEATURES, ARCHITECTURE, PITFALLS-v1.1) into roadmap-ready decisions. It covers ONLY the four NEW capabilities — **A.** sanctioned network-data path · **B.** reliability hardening of produced reducers · **C.** richer storefront · **D.** activate widget composition — layered on the settled v1.0 stack (Vite 8, React 19.2, `@babel/standalone` v7 classic, `idb` 8, Haiku via browser fetch). The hard non-negotiable across every feature: **nothing the user or devtools sees may reveal the on-demand mechanic** (the banned token family is never written into any visible surface, including comments).

## Executive Summary

v1.1 turns a working-but-faking marketplace into a "real & robust" one without adding infrastructure. The single highest-judgment piece is the **sanctioned network-data path (Feature A)**: today's handler scope shadows `fetch`, so the Weather and Currency apps fabricate fallback data. The research converges hard on one design — a **host-brokered, allowlisted `fetchData(sourceId, params)`** injected into the handler/delegated scope as a bound closure (the same proven pattern as `runHandler`). The HOST builds the URL from a curated manifest and fetches against a finite set of **keyless, CORS-`*` public read APIs (Open-Meteo + Frankfurter, both verified live)**; raw `fetch` stays shadowed in generated scope, the Anthropic key never enters app scope, and CSP `connect-src` widens to an **explicit, enumerable origin set — never `*`**. This converts "arbitrary egress" into "three inert keyless GET sinks," which is the only thing that prevents the key-exfiltration trap.

The stack delta is deliberately tiny: **one new runtime dependency, `zod@^4` used via the `zod/mini` subpath (~1.9 KB gzip)**, for validating produced state and the actionSpec contract; **zero new deps for the data path** (the APIs are keyless HTTP, so the "install" is a CSP edit, not a package). Everything else is in-house host code, schema/type changes, and config edits. There is an explicit DO-NOT-ADD list: no application server/proxy/BFF, no generic CORS proxy, no auth/OAuth SDK, no key-bearing data providers, and no full `zod` in the shipped bundle.

The risk profile is dominated by five traps, all preventable by construction: (1) **CSP key-exfiltration** — solved by the broker + finite allowlist, never widen to wildcard; (2) **CORS/keyless-only** — only browser-verified keyless CORS origins may be allowlisted; (3) **widget-activation scope regression** — `instantiateDelegated` injects NO `useWidget`, so naively activating composition in the delegated path throws, and the dormant widget machinery goes live on real model output for the first time (the project's top regression frustration); (4) **the reliability paradox** — over-constraining the prompt or over-strict validation makes a small model fail MORE often, so validate-and-keep-prior at the merge step beats prose constraints, and self-heal stays compile-error-only (no runtime-error round-trips that burn the cost cap); (5) **storefront honesty** — `useCount` is a local-only signal that cannot truthfully claim "popular on the platform." The dependency-driven build order is **C → D-typing/key-audit → B → A → D-widget-activation**, with two hard constraints: **B before A** (the merge step must validate before it starts merging live network-derived state) and **D-typing before D-activation** (activation must land on real typed records).

## Key Findings

### Recommended Stack

The v1.1 surface adds exactly **one runtime dependency** and a CSP config edit. The data path needs no library because the chosen APIs are keyless HTTP endpoints reached through ~150 LOC of first-party host code (a manifest + a broker that reuses the existing `src/host/` backoff/token-bucket primitives). Validation uses `zod/mini` — the same validation engine as full zod at ~7× smaller, negligible next to Babel's ~400-500 KB — and the same schemas double as the source of truth for Feature D's `WidgetRecord`/`HandlerRecord` typing (`z.infer`). See [STACK-v1.1.md](./STACK-v1.1.md).

**Core technologies (NEW for v1.1):**
- **`zod@^4` via `zod/mini`** (`import * as z from "zod/mini"`, ~1.9 KB gzip): runtime validation of produced reducer-state shape + actionSpec; turns silent drift into structured, model-readable diagnostics. The ONLY new npm dependency.
- **Open-Meteo** (`api.open-meteo.com` + `geocoding-api.open-meteo.com`): real weather data — keyless, CORS-`*` verified live. NO npm dep.
- **Frankfurter** (`api.frankfurter.dev`): real FX rates (ECB / 84 central banks) — keyless, CORS-`*` verified live. NO npm dep.
- **In-house fetch broker** (~50-100 LOC, native `fetch`): timeout via `AbortController`, retry/limit reusing existing `src/host/` primitives, IndexedDB short-TTL response cache. NO HTTP client library.

**DO-NOT-ADD (explicit):** any application server / proxy / BFF · any generic CORS proxy (corsproxy.io, allorigins) · any auth/OAuth/accounts SDK · any API-key-bearing weather/FX provider (OpenWeatherMap etc.) · full `zod` in the shipped hot path · a second transpiler. Each would either break the client-only / zero-infra / never-proxy-the-key constraints or re-open the exfiltration surface.

**The CSP edit (the real "install" for Feature A):**
```
connect-src 'self' https://api.anthropic.com
  -> 'self' https://api.anthropic.com https://api.open-meteo.com https://geocoding-api.open-meteo.com https://api.frankfurter.dev
```
`src/csp.test.ts` must be updated in the same change to pin the exact origin set (no wildcard, no `https:`/`http:` token) or CI fails by design.

### Expected Features

Track A is the keystone; B is the trust backbone; C is cheap visible depth; D is "activate, don't build." See [FEATURES.md](./FEATURES.md).

**Must have (table stakes / v1.1 launch — all P1):**
- **A4 — Sanctioned network-data path** (Weather via Open-Meteo, Currency via Frankfurter): the keystone — without it the network apps stay fake.
- **A1/A2/A3 — Loading / error+retry / empty states** for fetched data: a data app without these reads as broken (retry re-runs the fetch, never re-produces the app).
- **A5 — Client-side data cache + TTL** (weather ~10 min, FX ~daily): rate-limit friendliness + instant re-open.
- **B3 — Guarded reducer / unknown-action no-op** (never throw, never hang): the floor under all reliability.
- **B1/B2 — Correct increments + no stuck states**: the most basic trust signals.
- **C1 + G5 — Persist `displayName`/`prompt`** for faithful re-produce and stable identity: prerequisite for storefront depth.
- **C3 + POP-01 — Popularity row from `useCount`**: cheap, high-visibility depth (honest local copy only).
- **D1 + G3 + G1-followups — Composed app renders its declared widgets** with correct cache keys + real schemas.
- **D2 — Keep widget failure isolation true** under real composition (WIDGET-05 must remain true).

**Should have (differentiators, add after validation — P2):**
- **A8 — Stale-while-revalidate** (instant warm open, silent background refresh) and **A9 — offline last-known-good** labeling.
- **A6 — Manual refresh** control.
- **B5 — Invisible behavior self-heal** (silent re-produce of a corrected handler) — only if metrics justify the produce cost.
- **C4 — Richer card metadata** (description, composition badge); **D3 — per-widget contextual tweak** as a coherent path.

**Defer (v2+ / P3):**
- **HARD-01 — iframe sandbox isolation** (the correct end-state for running now-network-capable code, but deferred per MVP-first).
- **Multi-level widget composition (depth > 1)** — only after single-level proves stable and bounded.
- **G2 — Unified Intent contract** — internal refactor, defer unless it blocks the above.

**Anti-features (would break hard constraints):** arbitrary user-typed URLs / "connect any API" (defeats CSP) · a visible "generating/refreshing-via-AI" indicator (hygiene leak) · real-time/websocket polling for slow-changing data · global/cross-user "trending" leaderboard (no server; `useCount` is local-only) · fake ratings/reviews/download counts · deeply-nested recursive widget trees · surfacing widget/handler internals in the UI · streaming produced behavior into the running app.

### Architecture Approach

v1.1 extends a real, mapped substrate; the work is integration at known seams, not greenfield. The execution engine resolves through a 3-tier cache (live -> session -> registry -> produce), instantiates by mode (`"app"` monolithic vs `"delegated"` thin-shell), and runs generated code in a `new Function` scope that is containment-by-convention. The **IoC `Services` bundle is the only place a new capability (`fetchData`) is wired**, which preserves the offline-test invariant. See [ARCHITECTURE.md](./ARCHITECTURE.md).

**Major components (touch points for v1.1):**
1. **`dataBroker.fetchData` + `dataSources` manifest** (NEW, `src/host/`) — the single external-read egress chokepoint (mirrors `modelClient` as the single Anthropic egress); host builds the URL from a template, generated code supplies only `sourceId` + params, key never enters the path.
2. **`stateContract.validateTransition`** (NEW, `src/execution/`) — pure validation of returned state against `module.initialState` (the SSOT shape) at the `DelegatedShell` merge step; merge only known keys with matching types, keep-prior otherwise.
3. **Registry + `Marketplace`** (MODIFY) — additive `AppRecord` fields (`displayName`/`prompt`/`createdAt`), a `topByUseCount` query, and a "Popular" row above the grid.
4. **`db.ts` record types + `instantiateDelegated`** (MODIFY) — real `WidgetRecord`/`HandlerRecord` schemas (data already matches; types lag), and a `useWidget` accessor + pre-warm wired into the delegated `view` scope (the load-bearing risk in D).

### Critical Pitfalls

Top traps from [PITFALLS-v1.1.md](./PITFALLS-v1.1.md), all preventable by construction:

1. **CSP key-exfiltration (Pitfall 1, Feature A)** — widening `connect-src` to let apps fetch turns the policy into an exfiltration highway for the Anthropic key in `localStorage`. **Avoid:** never un-shadow `fetch`, never widen to `*`/`https:`; route all egress through the host broker; widen CSP only to the enumerable keyless origins the broker itself calls; `csp.test.ts` pins the exact set and bans wildcard.
2. **CORS / keyless-only (Pitfalls 2 & 3, Feature A)** — a familiar API that needs a key or isn't CORS-open passes a curl/Node test and is broken for every browser user (the failure hides behind the neutral `{error}`); a key-bearing source reintroduces a second exfiltratable secret. **Avoid:** allowlist ONLY browser-verified keyless CORS-`*` origins; record the CORS check next to each entry; the broker strips any auth the model emits and there is no key-storage path at all.
3. **Widget-activation scope regression (Pitfalls 4 & 5, Feature D)** — `instantiateDelegated` injects NO `useWidget` (only the monolithic `instantiate` does), so a delegated `view` calling it throws; activating composition also runs the dormant pre-warm/instantiate/isolate path on real model output for the first time, and a dropped-`prompt` cache-key read serves the wrong artifact. **Avoid:** decide the composing scope explicitly and extend `instantiateDelegated` to inject a pre-warmed widget map; audit every key derivation for symmetric `registryKey(kind,type,prompt)` (never the bare `cacheKey` primitive); add an end-to-end `// @widget` test and run the full suite for zero regressions.
4. **The reliability paradox (Pitfall 6, Feature B)** — "make it more reliable" naively means "constrain harder / validate stricter," but a small model has a complexity budget (over-constrain -> MORE fallbacks) and a strict validator has a false-positive budget (reject working apps). **Avoid:** validate the RETURNED state shape at the merge step and keep-prior on mismatch (zero round-trips, invisible); reserve self-heal for COMPILE errors only (runtime-error self-heal is less actionable and burns the produce-gate cost cap); the success metric is "correct more often AND produce-success not lower."
5. **Storefront honesty (Pitfalls 7 & 8, Feature C)** — `useCount` is per-browser and overloaded (LRU touches count machinery, not user opens), so "popular on the platform" is a lie; pre-G5 records and normalized-vs-raw prompt cause blank/duplicate titles and re-produce drift. **Avoid:** honest copy ("Recently opened" / "Your most-used"), scope the count to app opens, hide the row on cold start; store the RAW prompt for re-produce (normalize only for the key), fall back to the type slug for pre-migration records, name tweak variants distinctly.

## Implications for Roadmap

Based on combined research, the suggested phase structure follows the dependency-aware order **C -> D-typing/key-audit -> B -> A -> D-widget-activation**. The only hard ordering constraints are **B before A** (validate before merging live data) and **D-typing before D-activation**; the rest minimizes merge-conflict churn on `delegated.tsx`/`producer.ts` and front-loads the cheap, visible win.

### Phase 1: Richer Storefront (Feature C)
**Rationale:** No dependencies, lowest risk, immediately visible; establishes the additive-schema-change muscle. `useCount` already persists, so the popular row is nearly free.
**Delivers:** Persisted `displayName`/`prompt`/`createdAt` on `AppRecord`; `topByUseCount` query; a "Popular"/"Recently opened" row above the grid.
**Addresses:** C1, C2, C3 (POP-01), G5.
**Avoids:** Pitfall 7 (honest local copy, app-open-scoped count, cold-start hide) and Pitfall 8 (raw prompt stored, pre-G5 records render, tweak variants named distinctly).

### Phase 2: Schema & Key Hardening (Feature D, typing + cache-key audit)
**Rationale:** Foundation gate for D and a guardrail for everything that reads the widget/handler stores; must precede widget activation so it lands on typed records. Pure typing/tests, de-risks later phases.
**Delivers:** Real `WidgetRecord`/`HandlerRecord` schemas replacing the `Record<string,unknown>` stubs (derived from the `zod/mini` schemas); cache-key collision audit + tests (app `chart` != widget `chart`; baseline != tweak; read/write symmetric; no `cacheKey(` in a registry path).
**Uses:** `zod/mini` (`z.infer` for the record types).
**Implements:** `db.ts` record typing; `registryKey` call-site audit (the primitive is already correct — do NOT rewrite it).
**Avoids:** Pitfall 4 (cache-key collisions).

### Phase 3: Reliability Hardening (Feature B)
**Rationale:** Depends on nothing new and MUST precede the network path so live-data transitions are validated by an already-trusted merge step.
**Delivers:** NEW `stateContract.validateTransition(initialState, next)` (pure, offline-testable); wired into the `DelegatedShell` merge step to merge only known keys and keep-prior on mismatch. Optionally ONE self-heal retry, gated behind the produce-gate, only if real-Haiku fixtures show frequent recoverable drift.
**Uses:** `zod/mini` (the schema; `module.initialState` is the de-facto schema).
**Avoids:** Pitfall 6 (validate-and-keep-prior over prose constraints; no runtime-error self-heal; measure produce-success doesn't drop).

### Phase 4: Sanctioned Network-Data Path (Feature A) — the hard one
**Rationale:** Highest-judgment piece, built last on a validated base (Phase 3's trusted merge prevents live data from drifting state; Phase 2's typed records back the handlers).
**Delivers:** NEW `dataSources` manifest + `dataBroker.fetchData(sourceId, params)`; `Services.fetchData` wired (test-injectable); `fetchData` injected into the handler/delegated scope as a bound closure with `fetch`/`XMLHttpRequest` kept shadowed; CSP widened to the explicit keyless allowlist (+ `csp.test.ts` updated); producer prompts taught the `fetchData` global with enumerated sourceIds and a NO-OP rule; a mount `load` action for initial data via the existing merge step. Broker carries its own throttle + short-TTL cache.
**Addresses:** A4 (keystone), A1/A2/A3, A5, A7.
**Avoids:** Pitfall 1 (host-brokered, finite allowlist, never `*`, key never in scope), Pitfall 2 (keyless CORS-verified origins only), Pitfall 3 (no key-storage; strip auth), Pitfall 9 (broker throttle + TTL cache), Pitfall 10 (hygiene gate over new files, neutral error copy).

### Phase 5: Activate Widgets in Delegated Views (Feature D, activation)
**Rationale:** Depends on D's typing (Phase 2) and benefits from a stable producer prompt (Phases 3-4 already edited prompts). Last because it touches the delegated render path Phases 3-4 also evolve — sequencing it after avoids churn/merge conflicts on `delegated.tsx`.
**Delivers:** `prewarmWidgets` + a `useWidget` accessor wired into the delegated `view` scope; the delegated prompt updated to permit `// @widget`; a code-enforced widget cap + transitive-depth bound; an end-to-end `// @widget`-declaring app test through the chosen scope.
**Addresses:** D1, D3, D4; keeps D2 true.
**Avoids:** Pitfall 5 (explicit scope decision; extend `instantiateDelegated`; full-suite regression gate) and Pitfall 11 (code-enforced cap, cycle guard + concurrency cap hold on a deeper tree).

### Phase Ordering Rationale

- **B before A is a hard constraint:** the network path starts merging live, network-derived state into the delegated SSOT; that merge must already be validated (Phase 3) before live data flows through it (Phase 4), or drift corrupts state silently.
- **D-typing before D-activation is a hard constraint:** activated widgets must read typed `WidgetRecord`/`HandlerRecord` and go through audited symmetric cache keys; activating onto stubbed types + an unaudited key path is how the wrong cached artifact gets served.
- **C first** because it is independent, the cheapest, and the most visible — a quick win that builds the additive-schema muscle the later phases reuse.
- **A before D-activation** is a soft constraint (both touch `delegated.tsx`/`producer.ts`); serializing them and compounding the prompt edits avoids merge churn.

### Research Flags

Phases likely needing deeper research / a focused design pass during planning:
- **Phase 4 (Network-data path):** the highest-judgment phase. The broker design, the manifest shape, the param-validation/URL-build contract, the broker throttle, and the mount-`load`-action pattern warrant a focused design pass — though the core decision (host-brokered allowlist) is already settled and verified.
- **Phase 5 (Widget activation):** the highest-regression-risk phase. The "which scope composes widgets" decision and extending `instantiateDelegated` to inject a pre-warmed widget map need an explicit design step + an end-to-end test plan before touching the load-bearing runtime.

Phases with standard / already-settled patterns (skip a research-phase):
- **Phase 1 (Storefront):** additive `idb` schema fields + a sort + a row; fully settled.
- **Phase 2 (Schema/key typing):** pure type tightening + an audit; `registryKey` is already correct.
- **Phase 3 (Reliability):** the merge-step validate-and-keep-prior pattern is well-defined; `initialState` is the schema.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Data-API CORS verified empirically via live `curl` (2026-06-25); `zod@4.4.3` `./mini` export and bundle sizes verified live via npm registry + cross-confirmed comparisons. |
| Features | HIGH | Data-state/SWR, FSM/guarded-reducer, and discovery-row patterns are well-established and cross-sourced; constraints applied directly from PROJECT.md and the existing code. |
| Architecture | HIGH | Every integration point cites a real file read from the repo; the two keyless data endpoints verified live; the broker pattern reuses the proven `runHandler` bound-closure mechanism. |
| Pitfalls | HIGH | Security/CSP and CORS pitfalls verified against live `csp.test.ts`/`handler.ts`/`instantiate.ts` and CSP-exfiltration literature; cache-key/widget/reliability pitfalls read directly from source. MEDIUM only where a failure mode depends on runtime model output. |

**Overall confidence:** HIGH

### Gaps to Address

- **Live CORS holds in the real browser (not jsdom):** the keyless-CORS verification was via `curl`; jsdom can't prove browser CORS. Add a documented manual browser smoke-check per allowlisted source during Phase 4, and an integration test that parses a real-shape response.
- **Frankfurter currency coverage (~30 fiat):** if crypto/metals or >30 currencies are requested, the documented fallback is `@fawazahmed0/currency-api` (CDN, keyless, CORS) — but it costs one more CSP `connect-src` entry, so add only on demonstrated need.
- **Reliability self-heal (hook 3) necessity:** whether one runtime self-heal retry is worth the produce cost depends on real-Haiku fixture drift rates; ship merge-step validate-and-keep-prior (hook 1) first and measure before adding any round-trip.
- **Widget-composing scope decision:** the delegated-path `useWidget` injection is the load-bearing unknown; resolve it explicitly in Phase 5 planning with the end-to-end test before touching `instantiateDelegated`.

## Sources

### Primary (HIGH confidence)
- Live `curl` of `api.open-meteo.com` + `geocoding-api.open-meteo.com` (2026-06-25) — HTTP 200, `access-control-allow-origin: *`, keyless.
- Live `curl` of `api.frankfurter.dev/v1/latest` + `/v1/currencies` (2026-06-25) — HTTP 200, CORS-`*`, keyless, ECB-sourced.
- npm registry (live 2026-06-25) — `zod@4.4.3` (`./mini` export confirmed), `valibot@1.4.1`, `arktype@2.2.1`.
- Existing repo code (read 2026-06-25) — `src/execution/{loader.ts,delegated.tsx,handler.ts,instantiate.ts,producer.ts,widgetParse.ts,widgetPrewarm.ts}`, `src/registry/{db.ts,cacheKey.ts,registry.ts}`, `src/services/services.ts`, `src/host/modelClient.ts`, `src/data/appRegistry.ts`, `src/ui/Marketplace.tsx`, `index.html` + `src/csp.test.ts`, `.planning/PROJECT.md`.
- zod.dev/packages/mini + zod.dev/v4 — `zod/mini` functional/tree-shakeable API, ~1.9 KB gzip.
- open-meteo.com/en/docs + frankfurter.dev — keyless, CORS, endpoint shapes.
- CSP exfiltration literature — centralcsp.com `connect-src`, HackTricks/Cobalt CSP-bypass ("any wildcard leads to data exfiltration").
- react.dev — `useOptimistic`, `createRoot` multi-root model.

### Secondary (MEDIUM confidence)
- builder.io + souvenirlist/pockit zod-vs-valibot bundle comparisons (2026) — full zod ~12-15 KB vs zod-mini ~1.9 KB vs valibot ~1.2-1.4 KB gzip (cross-confirmed).
- LogRocket / newline / DEV — loading/error/empty-state + stale-while-revalidate React patterns.
- BLT / murtazaweb — finite-state-machine guards, optimistic-UI rollback patterns.
- Moburst / App Radar — discovery/popularity-row norms.
- Micro-frontend error-boundary write-ups (Medium/DevXtalks, Habsi Tech) — per-widget failure isolation.

### Tertiary (LOW confidence)
- `@fawazahmed0/currency-api` as a documented fallback — keyless+CORS verified via curl, but unused unless Frankfurter's coverage proves insufficient; revalidate before adopting.

### Detailed research files
- [STACK-v1.1.md](./STACK-v1.1.md) · [FEATURES.md](./FEATURES.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [PITFALLS-v1.1.md](./PITFALLS-v1.1.md)

---
*Research completed: 2026-06-25*
*Ready for roadmap: yes*
