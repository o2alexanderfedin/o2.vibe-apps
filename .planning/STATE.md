# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-24)

**Core value:** A user opens an app from the storefront and it renders and works — instantly on a cache hit, seamlessly produced on a cache miss — and nothing visible ever reveals that the app was made on demand.
**Current focus:** Phase 1 — Hygiene Foundation & Storefront Shell

## Current Position

Phase: 1 of 8 (Hygiene Foundation & Storefront Shell)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-06-24 — Roadmap created (8 vertical-MVP phases, 45/45 requirements mapped)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Vertical-MVP structure — each phase ships an end-to-end working slice; core value is met at Phase 3 (cache-miss generation).
- [Roadmap]: Devtools hygiene (HYGIENE-01..05) and CSP/source-maps-off (SEC-04) are owned by Phase 1 but enforced as cross-cutting acceptance constraints on every later phase.
- [Roadmap]: Static loop (Phase 2) precedes live generation (Phase 3) to de-risk `new Function` + classic-Babel + `createRoot` before adding model nondeterminism.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- [Phase 4]: Product decision needed — are dynamic (undeclared) widgets required? If yes, `useWidget` needs a skeleton-then-async fallback; if no, it stays fully synchronous.
- [Phase 7]: Concrete cost-guardrail threshold (N cache misses per time window) must be decided before shipping.
- [Phase 8]: Confirm the exact allowed-globals denylist for handler scope; it may differ from the app/widget denylist (handlers need local compute, no network/storage).

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Security | `<iframe sandbox>` isolation of generated code (HARD-01) — v1 mount seam designed to swap to it | Deferred to v2 | Requirements |
| Polish | Implicit "popular on the platform" storefront row from `useCount` (POP-01) | Deferred to v2 | Requirements |

## Session Continuity

Last session: 2026-06-24
Stopped at: ROADMAP.md and STATE.md written; REQUIREMENTS.md traceability updated (45/45 mapped).
Resume file: None
