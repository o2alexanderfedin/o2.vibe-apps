---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Phase 7 (Storage & Cost Guardrails) completed
last_updated: "2026-06-24T00:00:00.000Z"
last_activity: 2026-06-24 -- Phase 7 (Storage & Cost Guardrails) completed
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 5
  completed_plans: 4
  percent: 88
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-24)

**Core value:** A user opens an app from the storefront and it renders and works — instantly on a cache hit, seamlessly produced on a cache miss — and nothing visible ever reveals that the app was made on demand.
**Current focus:** Phase 08 — Backend-Style Handlers (next)

## Current Position

Phase: 07 (Storage & Cost Guardrails) — COMPLETE
Status: Phases 1–7 complete. Phase 7 bounded runaway produce-cost (RESIL-05) and
storage pressure (RESIL-06) with neutral messaging.

RESIL-05 — Cost guardrail: `createProduceGate` (`src/host/produceGate.ts`) is a
sliding-window soft cap (N=10 produce misses per 5-min window; named constants
`DEFAULT_PRODUCE_CAP`/`DEFAULT_PRODUCE_WINDOW_MS`, overridable). It keeps a list of
recent produce timestamps, prunes those outside the window on each `tryAcquire()`,
and either records `now` (under cap) or throws the neutral `ProduceThrottledError`
("You're opening a lot of apps quickly — give it a moment."). It is injected via
`Services.produceGate` and called in the loader IMMEDIATELY before the
`produceComponent` model call — i.e. only on a cache MISS. Cache hits (tier 1/2/3)
never reach it, so browsing already-opened apps is never throttled, and the window
slides so the cap recovers automatically. The `Clock` is injected (real wall clock
in prod, `createStubClock` in tests) so window/recovery is verified INSTANTLY.
Marketplace catches `ProduceThrottledError` and renders the softer "give it a
moment" copy in the SAME neutral failed-open region (storefront stays browsable).

RESIL-06 — Storage pressure: records now carry `useCount`/`updatedAt` (LRU
bookkeeping). DB bumped to schema v2 (`REGISTRY_DB_VERSION`); the upgrade is purely
ADDITIVE and the registry/LRU layer defaults the two fields to 0 on read, so v1
data keeps working. Cache hits bump `useCount` + refresh `updatedAt` (loader
`touchRecord`); writes set `useCount:0`/`updatedAt:now`. `evictUnderPressure`
(`src/registry/storagePressure.ts`) runs before every produce write: when the
injected `estimate()` reports usage/quota over a 0.9 threshold
(`DEFAULT_EVICTION_THRESHOLD`), it evicts least-recently-used entries (oldest
`updatedAt`, tie-broken by lowest `useCount`) across apps/widgets/handlers until
back under threshold (or nothing left). Storage access goes through an injectable
`StoragePressureSeam` (`src/host/storageEstimate.ts`): `navigatorStorageSeam`
guards `navigator.storage.persist`/`estimate` (degrade to false/null, never throw);
init's persist request now routes through it. `Registry` gained `keys(store)`
enumeration for victim listing. The in-memory fallback path is intact (keys() works
there too). Tests inject a stub `estimate()` + in-memory registry — NO real
IndexedDB/navigator.storage in unit scope.

tsc 0 errors, build OK (no .map in dist), 295/295 tests pass (253 baseline + 42 new:
8 produce-gate unit, 10 LRU unit, 12 storage-seam guard, 7 loader DI, 3 UI RTL, plus
registry/injection additions), hygiene gate green.
Last activity: 2026-06-24 -- Phase 7 (Storage & Cost Guardrails) completed on branch
feature/phase-7-storage-cost-guardrails

Progress: [█████████░] 88% (7 of 8 phases)

## Performance Metrics

**Velocity:**

- Total plans completed: 1
- Average duration: 7 min
- Total execution time: 0.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 | 1/4 | 7 min | 7 min |

**Recent Trend:**

- Last 5 plans: 7 min
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Vertical-MVP structure — each phase ships an end-to-end working slice; core value is met at Phase 3 (cache-miss generation).
- [Roadmap]: Devtools hygiene (HYGIENE-01..05) and CSP/source-maps-off (SEC-04) are owned by Phase 1 but enforced as cross-cutting acceptance constraints on every later phase.
- [Roadmap]: Static loop (Phase 2) precedes live generation (Phase 3) to de-risk `new Function` + classic-Babel + `createRoot` before adding model nondeterminism.
- [Plan 01-01]: @babel/standalone@^7.26 pinned as runtime dep (not devDep); v7 keeps classic-runtime default that Phase 2 depends on.
- [Plan 01-01]: jsdom is explicit devDep required by Vitest 4 (dropped auto-install); set as environment:jsdom in vite.config.ts test block.
- [Plan 01-01]: navigator.storage.persist() guarded with typeof check — jsdom lacks navigator.storage; guard required for tests.
- [Plan 01-01]: sourcemap:false in vite.config.ts is the master devtools-hygiene switch; must never be toggled true in CI.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- [Phase 4 — RESOLVED]: Static widgets only (declared via `@widget`); no dynamic/undeclared widgets. `useWidget` is fully synchronous (a pure `Map.get`). Decided + implemented in Phase 4.
- [Phase 7 — RESOLVED]: The cost soft-cap hooks the PRODUCE PATH (loader, immediately before `produceComponent`), not the transport wrapper. Rationale: the requirement caps cache MISSES specifically, and a single hook at the produce call sidesteps having to distinguish app vs widget vs tweak traffic inside the shared `createResilientTransport`. The injected `Clock` (`createStubClock`) drove the window/recovery tests with zero real waits as planned.
- [Phase 7 — RESOLVED]: Threshold decided — N=10 produce misses per 5-minute sliding window (named, configurable constants in `src/host/produceGate.ts`).
- [Phase 8]: Confirm the exact allowed-globals denylist for handler scope; it may differ from the app/widget denylist (handlers need local compute, no network/storage). The `handlers` store now carries the same `useCount`/`updatedAt` LRU fields as apps/widgets (`WidgetRecord`/`HandlerRecord` extend `LruMeta`), and `evictUnderPressure` already sweeps the `handlers` store — so produced handlers participate in LRU eviction for free. A new `runHandler(intent,input)` resolve-or-produce path should reuse `Services.produceGate.tryAcquire()` (the cost cap) and set `useCount:0`/`updatedAt:Date.now()` on write to stay consistent with the apps path.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Security | `<iframe sandbox>` isolation of generated code (HARD-01) — v1 mount seam designed to swap to it | Deferred to v2 | Requirements |
| Polish | Implicit "popular on the platform" storefront row from `useCount` (POP-01) | Deferred to v2 | Requirements |

## Session Continuity

Last session: 2026-06-24T22:39:41Z
Stopped at: Plan 01-01 completed (Scaffold + Walking Skeleton)
Resume file: .planning/phases/01-hygiene-foundation-storefront-shell/01-02-PLAN.md
