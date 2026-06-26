---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Real & Robust
status: executing
stopped_at: Autonomous run — Phase 9 complete (merged 7dd8b43, pushed). Proceeding to Phase 10.
last_updated: "2026-06-26T10:25:00.000Z"
last_activity: 2026-06-26 -- Phase 09 merged to develop (passed 9/9, UAT closed)
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-26)

**Core value:** A user opens an app from the storefront and it renders and works — instantly on a cache hit, seamlessly produced on a cache miss — and nothing visible ever reveals that the app was made on demand.
**Current focus:** v1.1 "Real & Robust" roadmapped (Phases 9–13). Next: plan Phase 9 (Richer Storefront) with `/gsd-plan-phase 9`. The dependency-driven build order is C → D-typing/key-audit → B → A → D-activation, with two hard constraints: RELY (Phase 11) before DATA (Phase 12), and WIDGET typing (Phase 10) before WIDGET activation (Phase 13).

## Current Position

Phase: 10 (Widget Schema & Key Correctness) — READY TO PLAN
Plan: —
Status: Phase 9 complete (merged 7dd8b43); planning Phase 10 next
Last activity: 2026-06-26 -- Phase 09 merged to develop (passed 9/9, visual UAT closed)

Progress: [██░░░░░░░░] 20% (1 of 5 v1.1 phases)

### Phase 9 — DONE (merged 7dd8b43)
STORE-01/02 shipped: AppRecord persists displayName/prompt/createdAt (additive, DB v2 unchanged, read-tolerant); storefront cards show real names; "Your most-opened" popular row (rankPopular: useCount↓→updatedAt↓→cacheKey↑; cold-start hidden; truthful local-only copy). prompt stores user-intent only (hygiene-safe). 393 tests, tsc 0, build clean, hygiene green, code-review resolved, browser UAT 9/9.

### v1.1 Phase Map

| Phase | Name | Requirements | Notes |
|-------|------|--------------|-------|
| 9 | Richer Storefront | STORE-01, STORE-02 | Independent, cheapest visible win; builds the additive-schema muscle |
| 10 | Widget Schema & Key Correctness | WIDGET-07, WIDGET-08 | Gate for activation; must precede Phase 13 (hard) |
| 11 | Reliability Hardening | RELY-01, RELY-02, RELY-03 | Validate-and-keep-prior at merge; must precede Phase 12 (hard) |
| 12 | Sanctioned Network-Data Path | DATA-01..04 | Highest judgment; host-brokered allowlist, key never in app scope |
| 13 | Activate Widget Composition | WIDGET-06 | Highest regression risk; touches delegated render path — do last |

## Prior Position (Milestone v1.0 — SHIPPED 2026-06-26)

v1.0 MVP shipped and archived: 8 phases, 42/42 active requirements satisfied, 378 tests
green, released `v0.1.0`, validated live in-browser. Post-v1.0 the **delegated thin-shell**
pivot landed (now the default for unseeded apps — behavior-free module + per-action
handlers produced on demand and cached) and quick task **260625-q08** closed gap G1 (the
`registryKey` cache-key contract that folds kind+prompt for the shipped surface).

Known limits carried into v1.1 (the v1.1 work addresses these):

- Network-dependent apps (Weather/Currency) can't `fetch` in the sandboxed handler scope →
  Phase 12.

- Produced delegated reducers can have state-machine quirks → Phase 11.
- The bare `SHA-256(type)` collision risk is latent until widgets activate → Phases 10 + 13.

## Performance Metrics

**Velocity:**

- Total plans completed (v1.1): 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 09 | 0/TBD | — | — |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap v1.1]: Phase order follows the research dependency-driven build order — C (storefront) → D-typing/key-audit → B (reliability) → A (network data) → D-activation. Mapped to Phases 9 → 10 → 11 → 12 → 13.
- [Roadmap v1.1]: HARD ordering constraint — RELY (Phase 11) must precede DATA (Phase 12) so the merge step already validates produced state before live network-derived data flows through it.
- [Roadmap v1.1]: HARD ordering constraint — WIDGET typing/key-audit (Phase 10) must precede WIDGET activation (Phase 13) so activated widgets land on real typed records + audited symmetric cache keys.
- [Roadmap v1.1]: Phase 13 (widget activation) sequenced after Phase 12 (soft constraint) because both touch the delegated render path (`delegated.tsx`/`producer.ts`); serializing avoids merge churn and compounds the prompt edits.
- [Roadmap v1.1]: All v1.0 cross-cutting constraints (HYGIENE-01..05, single Anthropic egress, sourcemaps-off, IoC/DI, TDD with real captured-Haiku fixtures) are acceptance constraints on every v1.1 phase — not separate phases.
- [Roadmap v1.0]: Devtools hygiene (HYGIENE-01..05) and CSP/source-maps-off (SEC-04) enforced as cross-cutting acceptance constraints on every phase.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- [Phase 12 — RESEARCH FLAG]: The network-data path is the highest-judgment phase. The broker design, the manifest shape, the param-validation/URL-build contract, the broker throttle, and the mount-`load`-action pattern warrant a focused design pass during planning — though the core decision (host-brokered keyless allowlist: Open-Meteo + geocoding + Frankfurter) is already settled and CORS-verified live.
- [Phase 12 — GAP]: Live keyless-CORS holds only verified via `curl`, not the real browser. Add a documented manual browser smoke-check per allowlisted source during Phase 12, plus an integration test parsing a real-shape response.
- [Phase 13 — RESEARCH FLAG / regression risk]: Highest regression risk. The "which scope composes widgets" decision and extending the delegated instantiation to inject a pre-warmed `useWidget` map need an explicit design step + an end-to-end `@widget` test plan before touching the load-bearing runtime. The dormant widget pre-warm/instantiate/isolate path goes live on real model output for the first time.
- [Phase 11 — CONCERN]: Reliability paradox — over-constraining the prompt or over-strict validation makes the small model fail MORE often. Ship merge-step validate-and-keep-prior first and measure produce-success against real-Haiku fixtures before adding any runtime self-heal round-trip.

### Resolved (v1.0)

- [Phase 4 — RESOLVED]: Static widgets only (declared via `@widget`); `useWidget` is fully synchronous (a pure `Map.get`).
- [Phase 7 — RESOLVED]: Cost soft-cap hooks the produce path (loader, immediately before `produceComponent`); N=10 produce misses per 5-minute sliding window.
- [Phase 8 — RESOLVED]: Handler denylist = `[fetch, XMLHttpRequest, localStorage, sessionStorage, indexedDB, window, document]` shadowed to `undefined`, plus a hostile `require`. A targeted denylist (handlers need local compute), NOT general sandboxing (HARD-01 iframe deferred). This is the seam Phase 12's `fetchData` broker plugs into.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260625-q08 | Fix G1 cacheKey contract (fold kind+prompt) + reconcile blueprint doc | 2026-06-25 | 0f9a7d4 | [260625-q08-cachekey-contract-doc-reconcile](./quick/260625-q08-cachekey-contract-doc-reconcile/) |

Last activity: 2026-06-26 — v1.1 roadmap created (Phases 9–13).

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Security | `<iframe sandbox>` isolation of generated code (HARD-01) + SEC-01/02/03 — the DATA-* broker sits behind the same seam so the iframe move stays contained | Deferred beyond v1.1 | Requirements |
| Refactor | G2 unified `Intent` contract — internal refactor, no user-facing value | Deferred (unless it blocks v1.1) | Requirements |
| Polish | POP-01 cross-session/cross-device popularity — would need a backend | Deferred (out of client-only model) | Requirements |
| Verification (UAT) | Phase 01 human-UAT — F12 devtools sweep + theme-persist re-confirm | Acknowledged non-blocking | v1.0 close |

## Session Continuity

Last session: 2026-06-26
Stopped at: Session resumed via /gsd-resume-work — clean checkpoint confirmed (develop synced with origin, no incomplete plans/handoff). Proceeding to plan Phase 9 (Richer Storefront).
Resume file: None

## Operator Next Steps

- Plan the first v1.1 phase: `/gsd-plan-phase 9` (Richer Storefront — STORE-01, STORE-02).
