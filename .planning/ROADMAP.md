# Roadmap: Vibe App Store

## Milestones

- ✅ **v1.0 MVP** — Phases 1–8 (shipped 2026-06-26) — full detail archived in [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Real & Robust** — Phases 9–13 (in progress) — turn the working-but-shallow marketplace into a real, robust one

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–8) — SHIPPED 2026-06-26</summary>

- [x] Phase 1: Hygiene Foundation & Storefront Shell (4/4 plans) — completed 2026-06-24
- [x] Phase 2: Static Open-One-App Loop — completed 2026-06-24
- [x] Phase 3: Cache-Miss Generation (Core Value) — completed 2026-06-24
- [x] Phase 4: Widget Composition (1/1) — completed 2026-06-24
- [x] Phase 5: Contextual Modification (1/1) — completed 2026-06-24
- [x] Phase 6: API Error Degradation (1/1) — completed 2026-06-24
- [x] Phase 7: Storage & Cost Guardrails (1/1) — completed 2026-06-24
- [x] Phase 8: Backend-Style Handlers (1/1) — completed 2026-06-24

Full phase detail, success criteria, and requirement mapping are archived in
[milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md). Post-v1.0 work landed
outside the milestone: the **v1.1 delegated thin-shell** pivot (now the default for
unseeded apps) and quick task **260625-q08** (the `registryKey` cache-key contract,
gap G1). See [BLUEPRINT-DELTA.md](./BLUEPRINT-DELTA.md).

</details>

### 🚧 v1.1 Real & Robust (Phases 9–13)

- [ ] **Phase 9: Richer Storefront** — Apps carry a real name and re-produce faithfully; a popular row surfaces the most-opened apps with honest local copy.
- [x] **Phase 10: Widget Schema & Key Correctness** — Real typed widget/handler records and every cache-key call site folds kind+prompt, so activated widgets can't collide with apps on a shared type slug.
- [x] **Phase 11: Reliability Hardening** — Produced delegated behavior is correct more often: invalid state is rejected and prior state kept, unknown actions are no-ops, no extra model round-trips. (completed 2026-06-26)
- [ ] **Phase 12: Sanctioned Network-Data Path** — Weather and Currency apps fetch real data through a host-brokered, allowlisted, keyless egress; the API key never enters app scope.
- [ ] **Phase 13: Activate Widget Composition** — Delegated apps can declare and render `@widget` sub-widgets, each isolated, with a bounded composition depth.

## Phase Details

### Phase 9: Richer Storefront
**Goal**: A user sees apps by their real name, re-opens them faithfully produced, and can spot the apps they use most via a "popular" row with truthful local copy.
**Depends on**: Phase 8 (v1.0 complete; reuses the additive-schema muscle and the `useCount` field already persisted for LRU)
**Requirements**: STORE-01, STORE-02
**Success Criteria** (what must be TRUE):
  1. A user sees each storefront card labeled with the app's real `displayName` (not a raw type slug), and pre-existing records that lack the new fields still render without a blank title.
  2. After a user re-opens an app, it re-produces faithfully because the original producing `prompt` and `createdAt` are persisted on the app record (raw prompt stored; tweak variants named distinctly).
  3. A user sees a "popular" row of the most-opened apps, ranked by the existing `useCount` with a deterministic tie-break, that is hidden on cold start and labeled with truthful copy (no false "popular across the platform" claim for a local-only signal).
  4. Existing apps and tests keep working — the schema change is additive (read-tolerant of old records), `tsc` is clean, the build emits no source maps, and the hygiene gate stays green.
**Plans**: 3 plans
Plans:
- [x] 09-01-PLAN.md — Schema + loader: extend AppRecord with displayName/prompt/createdAt; wire into loader write sites; extract rankPopular utility
- [x] 09-02-PLAN.md — Tests: v1-record compat for Phase 9 fields + rankPopular determinism tests
- [x] 09-03-PLAN.md — UI: popular row in Marketplace.tsx + displayName fallback chain + visual verification checkpoint

### Phase 10: Widget Schema & Key Correctness
**Goal**: The widget and handler registry records have real types, and every cache-key derivation folds kind+prompt, so an activated widget can never be served the wrong cached artifact or collide with an app of the same type slug.
**Depends on**: Phase 9
**Requirements**: WIDGET-07, WIDGET-08
**Success Criteria** (what must be TRUE):
  1. The `widgets` and `handlers` registry records expose real typed schemas (replacing the `Record<string, unknown>` placeholders), consistent with the typed `apps` record shape, and `tsc` stays clean.
  2. A widget of type `chart` and an app of type `chart` resolve to distinct cache keys (kind is folded in), proven by a test, so they can never collide on the shared slug.
  3. A baseline app and its tweak variant resolve to distinct cache keys (prompt is folded in), and read and write use the same structured `registryKey(kind, type, prompt)` symmetrically — no bare `cacheKey()` survives in any registry path, proven by tests.
  4. The full suite stays green with no regression, the hygiene gate passes, and the build emits no source maps.
**Plans**: 2 plans
Plans:
**Wave 1**
- [x] 10-01-PLAN.md — Schema + LRU parity: replace WidgetRecord/HandlerRecord placeholders with explicit interfaces extending LruMeta; add useCount/updatedAt to widget write sites in widgetPrewarm.ts; verify tsc clean

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 10-02-PLAN.md — Test migration + audit: migrate loader.test.ts + loaderGuardrails.test.ts from bare cacheKey(type) to registryKey("app", type); add WIDGET-08 collision-distinctness audit describe block to cacheKey.test.ts

### Phase 11: Reliability Hardening
**Goal**: Produced delegated apps behave correctly more often — a mis-shaped result never blanks or sticks the app, unknown actions do nothing harmful, and none of this costs extra model round-trips.
**Depends on**: Phase 10
**Requirements**: RELY-01, RELY-02, RELY-03
**Success Criteria** (what must be TRUE):
  1. When a produced action returns a mis-shaped or invalid result, the app keeps its prior visible state — a user never sees a blank or stuck app from a bad transition.
  2. When a user triggers an action that has no produced handler or is otherwise unknown/unhandled, the app does nothing (a silent no-op) — it never throws and never hangs.
  3. The user never sees mechanic-revealing copy from a validation failure, and validation failures trigger no extra model round-trips (compile-error self-heal only, per the shipped RESIL-04 budget).
  4. Produce-success is not lower than before — the validation hardens correctness without making the small model fail more often — verified offline against real captured-Haiku fixtures.
**Plans**: 2 plans
Plans:
**Wave 1**
- [x] 11-01-PLAN.md — zod dep + stateSchema helper + wire validation into the merge step in delegated.tsx (RELY-01, RELY-03)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 11-02-PLAN.md — Full test suite: keep-prior / extra-keys / valid-partial / no-op paths / zero-round-trip (RELY-01, RELY-02, RELY-03 test coverage)

### Phase 12: Sanctioned Network-Data Path
**Goal**: A user opening the Weather app sees real current conditions and the Currency app shows real FX rates, fetched through a host-brokered allowlisted path — and nothing the user or devtools sees reveals the mechanic or exposes the API key.
**Depends on**: Phase 11 (the merge step must already validate produced state before live network-derived data flows through it — hard ordering constraint)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. A user opens the Weather app and sees real current conditions for a location, and opens the Currency app and sees real FX rates — each fetched via a host-built request from a curated source manifest, with generated code supplying only a `sourceId` and params (raw `fetch`/`XMLHttpRequest` stay shadowed to `undefined` in app scope).
  2. Each data app shows neutral, data-framed loading / empty / error states (never mechanic-framed); a retry re-runs the fetch rather than re-producing the app, and any fetch failure maps to a neutral fallback that never reveals the mechanic or exposes the API key.
  3. Re-opening a data app is instant and rate-limit-friendly because fetched data is TTL-cached client-side (weather ~10 min, FX ~daily).
  4. Egress is contained: `connect-src` is widened to exactly the finite keyless, CORS-open, read-only origins the broker calls (never `*`), asserted in `csp.test.ts`; a `sourceId` not on the allowlist is rejected by the broker; the API key is never sent anywhere but `api.anthropic.com`.
**Plans**: 5 plans

Plans:
**Wave 1** *(independent — run in parallel)*
- [x] 12-01-PLAN.md — Data infrastructure: sourceManifest.ts (3-entry curated allowlist) + ttlCache.ts (Clock-DI in-memory cache) + dataBroker.ts (host-side fetch with manifest URL build, param filter, TTL cache, rate-limit wrap, neutral errors)
- [x] 12-02-PLAN.md — CSP + assertions: widen index.html connect-src to 4 allowlisted origins; add connectSrcDirective helper + 5-case DATA-02 describe block to csp.test.ts

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 12-03-PLAN.md — Services wiring + handler scope: add fetchDataBroker? to Services; wire real broker in createServices(); add cannedBroker/unusedBroker to testServices.ts; inject fetchData before input in handler constrained scope
- [x] 12-04-PLAN.md — Seeded Weather + Currency apps: delegated module seeds (initialState/view/actionSpec) + seeded handler sources (weatherHandlers.ts, currencyHandlers.ts) + seeded-handler short-circuit in resolveHandlerJS

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 12-05-PLAN.md — Full test suite: broker unit tests (TTL hit/miss, allowlist rejection, param injection guard, non-2xx, network throw) + handler integration tests (weather/currency seeded handlers with real-shape API fixtures, no-broker fallback, fetch bypass proof)

### Phase 13: Activate Widget Composition
**Goal**: A delegated app can declare and render `@widget` sub-widgets as a first-class path — each widget isolated in its own shell, a failing widget never crashing its parent, and the composition depth bounded.
**Depends on**: Phase 12 (lands on Phase 10's typed records + audited keys — hard ordering constraint; sequenced after Phase 12 to avoid churn on the shared delegated render path)
**Requirements**: WIDGET-06
**Success Criteria** (what must be TRUE):
  1. A user opens a delegated app that declares `@widget` sub-widgets and sees those widgets render in place — `useWidget` is wired into the delegated `view` scope (closing the gap that the delegated instantiation injected no `useWidget`).
  2. A failing or slow widget shows a placeholder without crashing its parent app, and renders inside its own shell with its own contextual menu (WIDGET-05 stays true under real composition).
  3. Composition is bounded — a code-enforced widget cap and transitive-depth bound prevent runaway or recursive widget trees.
  4. An end-to-end `@widget`-declaring delegated app passes through the chosen scope, the full suite stays green with zero regression, the hygiene gate passes, and the build emits no source maps.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
v1.1 phases execute in numeric order: 9 → 10 → 11 → 12 → 13

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Hygiene Foundation & Storefront Shell | v1.0 | 4/4 | Complete | 2026-06-24 |
| 2. Static Open-One-App Loop | v1.0 | ✓ | Complete | 2026-06-24 |
| 3. Cache-Miss Generation (Core Value) | v1.0 | ✓ | Complete | 2026-06-24 |
| 4. Widget Composition | v1.0 | 1/1 | Complete | 2026-06-24 |
| 5. Contextual Modification | v1.0 | 1/1 | Complete | 2026-06-24 |
| 6. API Error Degradation | v1.0 | 1/1 | Complete | 2026-06-24 |
| 7. Storage & Cost Guardrails | v1.0 | 1/1 | Complete | 2026-06-24 |
| 8. Backend-Style Handlers | v1.0 | 1/1 | Complete | 2026-06-24 |
| 9. Richer Storefront | v1.1 | 0/3 | Planned | - |
| 10. Widget Schema & Key Correctness | v1.1 | 0/2 | Planned | - |
| 11. Reliability Hardening | v1.1 | 2/2 | Complete   | 2026-06-26 |
| 12. Sanctioned Network-Data Path | v1.1 | 2/5 | In Progress|  |
| 13. Activate Widget Composition | v1.1 | 0/TBD | Not started | - |

**v1.0 MVP shipped 2026-06-26 — 8 phases, 42/42 active requirements satisfied, 378 tests green.**

---

### v1.1 cross-cutting acceptance constraints (binding on every phase 9–13)

Carried forward from v1.0 — these are acceptance constraints, not separate phases:

- **HYGIENE-01..05** — no devtools-visible surface narrates the on-demand mechanic; the banned token family appears in no source surface (incl. comments); the CI lexicon gate (`hygiene.test.ts`) stays green across `src/**` + `index.html`.
- **Single Anthropic egress** — the API key is sent only to `api.anthropic.com`, never logged, never proxied; new network egress (Phase 12) goes through the host data-broker chokepoint, not raw `fetch` in generated scope.
- **Sourcemaps off** — production ships `build.sourcemap: false`; neutral naming for stores/keys/logs/CSS.
- **IoC / DI** — new capabilities (e.g. `fetchData`) are wired through the injected `Services` bundle so the open→render flow stays testable offline.
- **TDD with real captured-Haiku fixtures** — RED→GREEN, full suite runs offline with no live network; `tsc` 0 errors and a clean build on every phase exit.
