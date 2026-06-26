---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Real & Robust
status: planning
last_updated: "2026-06-26T03:47:16.069Z"
last_activity: 2026-06-26
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-24)

**Core value:** A user opens an app from the storefront and it renders and works — instantly on a cache hit, seamlessly produced on a cache miss — and nothing visible ever reveals that the app was made on demand.
**Current focus:** v1.0 MVP shipped + archived (2026-06-26). Planning the next milestone — candidate scope in ROADMAP.md (sanctioned network-data path, widget/handler activation, deferred safety HARD-01/SEC, POP-01). Run `/gsd-new-milestone`.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-26 — Milestone v1.1 started

## Prior Position (Phase 7)

Phase: 07 (Storage & Cost Guardrails) — COMPLETE
Status: Phase 7 bounded runaway produce-cost (RESIL-05) and storage pressure
(RESIL-06) with neutral messaging.

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
- [Phase 8 — RESOLVED]: Handler denylist decided and implemented as `DENIED_GLOBALS = [fetch, XMLHttpRequest, localStorage, sessionStorage, indexedDB, window, document]`, shadowed to `undefined` in the handler's `new Function` parameter list, plus a hostile `require` (throws) and no key in scope. It is intentionally a TARGETED denylist (handlers need local compute) — NOT the full app/widget lockdown, and NOT general sandboxing (HARD-01 iframe deferred to v2). `runHandler` reuses `Services.produceGate.tryAcquire()` on a produce miss and writes `useCount:0`/`updatedAt:Date.now()`, consistent with the apps path; produced handlers participate in `evictUnderPressure` (which already sweeps `handlers`) for free.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260625-q08 | Fix G1 cacheKey contract (fold kind+prompt) + reconcile blueprint doc | 2026-06-25 | 0f9a7d4 | [260625-q08-cachekey-contract-doc-reconcile](./quick/260625-q08-cachekey-contract-doc-reconcile/) |

Last activity: 2026-06-25 — Completed quick task 260625-q08: G1 cacheKey contract fix (`registryKey` folds kind+prompt) + blueprint-doc reconcile. 378 tests, tsc 0, build clean.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Security | `<iframe sandbox>` isolation of generated code (HARD-01) — v1 mount seam designed to swap to it | Deferred to v2 | Requirements |
| Polish | Implicit "popular on the platform" storefront row from `useCount` (POP-01) | Deferred to v2 | Requirements |
| Verification (UAT) | Phase 01 human-UAT — F12 devtools sweep confirming no authored surface narrates the on-demand mechanic | Acknowledged non-blocking | v1.0 close |
| Verification (UAT) | Phase 01 human-UAT — theme-persist-across-reload re-confirm (partially verified live) | Acknowledged non-blocking | v1.0 close |

## Session Continuity

Last session: 2026-06-26T01:12:38.436Z
Stopped at: context exhaustion at 75% (2026-06-26)
MERGED to develop** (merge 1a274b6, pushed; feature branch + worktree deleted). Unseeded
apps now produce BEHAVIOR-FREE "delegated" modules (markup-only view + state SSOT +
actionSpec) mounted through the permanent DelegatedShell, with per-action behavior
produced on demand via runHandler and cached (event-delegation). Handlers are TypeScript
with a require-purity guard; extractCode fixed for modules; produced views must inline-style
their layout (no Tailwind/stylesheet) and fit their app type. Seeds stay monolithic; a
graceful fallback mounts non-module payloads as monoliths. tsc 0, 368 tests, build clean
(no source maps), hygiene green. Validated live in the browser (Calculator computes + caches;
Budget renders type-appropriate + polished). See memory: [[delegated-on-demand-architecture]],
[[verify-ui-visually]]. Known limits: network-dependent apps can't fetch in the sandboxed
handler scope; generated reducers can have state-machine quirks.
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
