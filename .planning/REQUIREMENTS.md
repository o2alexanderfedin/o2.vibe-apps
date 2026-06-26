# Requirements: Vibe App Store — Milestone v1.1 "Real & Robust"

**Defined:** 2026-06-26
**Milestone goal:** Turn the working-but-shallow v1.0 marketplace into a real, robust one — apps that need live data actually get it, produced behavior is correct more often, the storefront has depth, and widget composition becomes a first-class path.

Requirements continue the v1.0 REQ-ID families. v1.0 requirements (SHELL/LOOP/GEN/WIDGET-01..05/MOD/RESIL/HANDLER/HYGIENE/SEC) are **Validated** — see `milestones/v1.0-REQUIREMENTS.md`. All v1.0 cross-cutting constraints (HYGIENE-01..05 devtools illusion, the single Anthropic egress, sourcemaps-off, IoC/DI, TDD) remain in force on every requirement below.

---

## v1.1 Requirements

### DATA — Sanctioned network-data path

> Network apps (Weather, Currency) fetch **real** data through a host-brokered, allowlisted path. Raw `fetch` stays banned in generated scope. (Research: `ARCHITECTURE.md`, `PITFALLS-v1.1.md`.)
>
> **Scope note (user direction, 2026-06-26):** v1.1 does **not** gate on Anthropic-key-exfiltration hardening — the user owns the key-handling story and will apply separate ideas *after* this milestone. Keep the host-brokered keyless allowlist (it's required for CORS and keeps the path simple + hygiene-safe), but Phase 12 should treat the allowlist as a **feature/CORS necessity, not a security gate** — do not gold-plate key-exfil defenses or block on that threat model.

- [ ] **DATA-01**: A host-brokered `fetchData(sourceId, params)` is injected into the handler/delegated scope (a bound closure, like `runHandler`); generated code calls it instead of `fetch`, and the **host** — not generated code — builds the request URL from a curated source manifest. Raw `fetch`/`XMLHttpRequest` stay shadowed to `undefined` in the generated scope.
- [ ] **DATA-02**: Data sources are a curated allowlist of **keyless, CORS-open, read-only** origins (Open-Meteo + Open-Meteo geocoding + Frankfurter); CSP `connect-src` is widened to exactly those origins (never `*`), enforced and asserted in `csp.test.ts`. A `sourceId` not on the allowlist is rejected by the broker.
- [ ] **DATA-03**: The Weather app shows real current conditions for a location and the Currency app shows real FX rates, each with neutral **loading / empty / error** states that are data-framed (never mechanic-framed).
- [ ] **DATA-04**: Fetched data is TTL-cached client-side (e.g. weather ~10 min, FX ~daily) and rate-limit-friendly; any fetch failure maps to a neutral `{ error }` / fallback without revealing the mechanic and without ever exposing the API key.

### RELY — Reliability hardening

> Produced delegated behavior is correct more often: invalid state is rejected, unknown actions are no-ops, and validation never burns extra model round-trips. (Research: `FEATURES.md` guarded-reducer floor, `ARCHITECTURE.md` validate-at-merge.)

- [ ] **RELY-01**: Produced delegated state is validated at the `DelegatedShell` merge step against the module's `initialState` shape; a mis-shaped or invalid result is rejected and the **prior state is kept** — never a blank or stuck app.
- [ ] **RELY-02**: An action with no produced handler, or an unknown/unhandled action, is a **no-op** — it never throws and never hangs the app.
- [ ] **RELY-03**: Shape validation uses a single lightweight schema layer (`zod/mini`) derived from `initialState`; validation failures are silent to the user (no mechanic-revealing copy) and trigger **no extra model round-trips** (compile-error self-heal only, per the shipped RESIL-04 budget).

### STORE — Richer storefront

> Persist the metadata a real storefront needs, and surface usage. (Research: `FEATURES.md` popular-row deep-dive; G5 + POP-01.)

- [ ] **STORE-01**: An app record persists `displayName`, the producing `prompt`, and `createdAt`, so an app re-produces faithfully and the storefront shows a real name — **read-tolerant** of pre-existing records that lack these fields (additive, no breaking DB change).
- [ ] **STORE-02**: The storefront shows a "popular" row of the most-opened apps ranked by the existing `useCount` (app-open-scoped, deterministic tie-break, seeded cold-start) with **truthful copy** (no false "popular across the platform" claim for a local-only signal).

### WIDGET — Activate widget composition (continues WIDGET-01..05)

> The composition machinery is built-but-dormant. Activate it safely and close the cache-key correctness gap. (Research: `ARCHITECTURE.md` "activate, don't build"; `PITFALLS-v1.1.md` widget-scope regression.)

- [ ] **WIDGET-06**: A delegated app can declare and render `@widget` sub-widgets — `useWidget` is wired into the delegated `view` scope (closing the gap that `instantiateDelegated` injects no `useWidget`), each widget isolated by its existing shell + error boundary, with a sane composition-depth cap.
- [ ] **WIDGET-07**: The `widgets` and `handlers` registry records have real typed schemas (replacing the `Record<string, unknown>` placeholders), consistent with the typed `apps` record shape.
- [ ] **WIDGET-08**: Every cache-key call site uses the structured `registryKey(kind, type, prompt)` (no bare `cacheKey()` that drops `kind`/`prompt`), proven by tests, so an activated widget can never collide with an app of the same type slug.

---

## Future Requirements (deferred beyond v1.1)

- **G2 — Unified `Intent` contract** (collapse `routeModification` into one `Intent`) — internal refactor, no user-facing value; defer unless it blocks v1.1.
- **HARD-01 — `<iframe sandbox>` isolation** + **SEC-01/02/03** general sandboxing — security still deferred per MVP-first. The host-brokered data path (DATA-*) is designed to sit behind the same seam so the iframe move stays a contained change later.
- **POP-01 extensions** — cross-session/cross-device popularity would need a backend (out of the client-only model).

## Out of Scope (explicit exclusions, with reasoning)

- **Any application server / BFF / CORS proxy** — breaks the client-only, zero-infra model. The data path is host-brokered *in the browser*, not server-proxied.
- **Key-bearing / non-CORS data providers** — only keyless, CORS-open, read-only sources are allowlisted; an app supplying its own third-party API key is rejected (key-leak surface).
- **Un-shadowing raw `fetch` in generated scope** — the broker (not a relaxed policy) is the boundary; raw `fetch`/XHR stay denied.
- **Runtime-error self-heal round-trips** — only compile errors feed the self-heal loop (runtime self-heal burns the produce-cost cap for little gain).
- **Recursive/unbounded widget trees** — composition depth is capped.
- **Mechanic-revealing data UI** — loading/error copy is data-framed; no "refreshing via model", no exposed action specs, no streamed source (HYGIENE-01..05 still binding).

## Traceability

| REQ-ID | Phase | Status |
|--------|----------------------------------------|---------|
| STORE-01 | Phase 9 — Richer Storefront | Pending |
| STORE-02 | Phase 9 — Richer Storefront | Pending |
| WIDGET-07 | Phase 10 — Widget Schema & Key Correctness | Pending |
| WIDGET-08 | Phase 10 — Widget Schema & Key Correctness | Pending |
| RELY-01 | Phase 11 — Reliability Hardening | Pending |
| RELY-02 | Phase 11 — Reliability Hardening | Pending |
| RELY-03 | Phase 11 — Reliability Hardening | Pending |
| DATA-01 | Phase 12 — Sanctioned Network-Data Path | Pending |
| DATA-02 | Phase 12 — Sanctioned Network-Data Path | Pending |
| DATA-03 | Phase 12 — Sanctioned Network-Data Path | Pending |
| DATA-04 | Phase 12 — Sanctioned Network-Data Path | Pending |
| WIDGET-06 | Phase 13 — Activate Widget Composition | Pending |

**Coverage:** 12/12 v1.1 requirements mapped to exactly one phase. No orphans, no duplicates.
