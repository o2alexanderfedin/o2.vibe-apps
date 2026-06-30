---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Trusted Desktop
status: executing
stopped_at: Phases 19 & 20 complete + merged (20 verified PASSED); ready for Phase 21 planning.
last_updated: "2026-06-29T00:00:00.000Z"
last_activity: 2026-06-29 -- Phase 20 merged complete; STATE reconciled by /gsd-progress
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 9
  completed_plans: 9
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-26 after v2.0)

**Core value:** A user opens an app from the storefront and it renders and works — instantly on a cache hit, seamlessly produced on a cache miss — and nothing visible ever reveals that the app was made on demand.
**Current focus:** v3.0 Trusted Desktop — roadmap created. Next: `/gsd-plan-phase 19` to plan Window Chrome & Menu Relocation.

## Current Position

Phase: 21 (not started) — Phases 19 & 20 COMPLETE + merged
Plan: —
Status: executing
Last activity: 2026-06-29 -- Phase 20 merged complete (verified PASSED); next: plan Phase 21 Desktop Persistence

> Note: Phase 20 was executed, verified (20-VERIFICATION.md status: passed), and merged,
> but its per-plan SUMMARY.md files were never written. The work is real and complete;
> only the summary bookkeeping is missing. Treat Phase 20 as done.

### v3.0 Phase Map

| Phase | Name | Requirements | Hard ordering constraint |
|-------|------|--------------|--------------------------|
| 19 | Window Chrome & Menu Relocation | CHROME-01, CHROME-02, CHROME-03, CHROME-04 | Dependency root — must precede all SANDBOX work (CHROME-01 is the hard prerequisite for iframe isolation) |
| 20 | Opaque-Origin Frame Isolation | SANDBOX-01, SANDBOX-02, SANDBOX-03, SANDBOX-04, SANDBOX-05, SANDBOX-06, HYGIENE-07 | Requires Phase 19 gate confirmed (⋮ in titlebar, MOD-01..04 green from titlebar) |
| 21 | Desktop Persistence | PERSIST-01, PERSIST-02, PERSIST-03 | Requires Phase 19 (WindowFrame structure); independent of Phase 20 at data-model level — can begin after Phase 19 |
| 22 | Theme Editor & Custom Themes | THEME-06, THEME-07, THEME-08, THEME-09, THEME-10 | Requires Phase 19 (MenuBar + VibeThemeProvider at correct state); independent of Phases 20/21 at data-model level |

### v3.0 Requirement Coverage

All 19 v3.0 requirements mapped — 19/19 (100%):

| Requirement | Phase |
|-------------|-------|
| CHROME-01 | Phase 19 |
| CHROME-02 | Phase 19 |
| CHROME-03 | Phase 19 |
| CHROME-04 | Phase 19 |
| SANDBOX-01 | Phase 20 |
| SANDBOX-02 | Phase 20 |
| SANDBOX-03 | Phase 20 |
| SANDBOX-04 | Phase 20 |
| SANDBOX-05 | Phase 20 |
| SANDBOX-06 | Phase 20 |
| PERSIST-01 | Phase 21 |
| PERSIST-02 | Phase 21 |
| PERSIST-03 | Phase 21 |
| THEME-06 | Phase 22 |
| THEME-07 | Phase 22 |
| THEME-08 | Phase 22 |
| THEME-09 | Phase 22 |
| THEME-10 | Phase 22 |
| HYGIENE-07 | Phase 20 (anchored here; re-applied as acceptance criterion in phases 21 and 22) |

### Prior milestones — all DONE (archived)

**v2.0 Vibe OS** — Phases 14–18 COMPLETE

- Phase 14 Theme Foundation (THEME-01..05) — merged, tagged v2.0
- Phase 15 Window Manager (WIN-01..05) — merged
- Phase 16 Desktop Shell (WIN-06/07/08, PERF-01) — merged
- Phase 17 Search / Launcher Panel (CREATE-01..03) — merged
- Phase 18 Theme-Aware Generation (TGEN-01..03, HYGIENE-06) — merged

**v1.1 Real & Robust** — Phases 9–13 DONE (archived)
**v1.0 MVP** — Phases 1–8 DONE (archived)

## Performance Metrics

**Velocity:**

- Total plans completed (v2.0): 5 (14-01, 14-02, 14-03, 14-04, 14-05)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 14 | 5/5 | — | — |

| Plan | Duration | Tasks | Files | Completed |
|------|----------|-------|-------|-----------|
| 14-03 | ~13min | 2 (TDD) | 6 | 2026-06-26 |
| 14-04 | ~6min | 1 (atomic) | 1 | 2026-06-26 |
| 14-05 | ~5min | 2 (TDD) | 4 | 2026-06-26 |

**Recent Trend:**

- Last 5 plans: 14-01, 14-02, 14-03, 14-04, 14-05
- Trend: v2.0 milestone COMPLETE (5 phases, 21/21 requirements, 727 tests green)

*Updated after each plan completion*
| Phase 15 P03 | ~12 minutes | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap v3.0]: 4-phase structure (19–22) derived from the dependency-enforced build order independently confirmed by all four research streams. CHROME → SANDBOX → PERSIST/THEME-editor is a hard constraint, not advisory.
- [Roadmap v3.0]: HARD ordering constraint — CHROME-01 (`⋮` to titlebar) must complete and its MOD-01..04 gate must be confirmed before any iframe work begins. `createPortal` cannot cross an opaque-origin boundary without `allow-same-origin`, which must never be set.
- [Roadmap v3.0]: HARD ordering constraint — Phase 20 (iframe isolation) requires Phase 19; Phases 21 and 22 require Phase 19 but are independent of Phase 20 at the data-model level and can be developed in parallel with or immediately after Phase 20.
- [Roadmap v3.0]: Schema decision SETTLED — additive keys (`"windowLayout"`, `"customTheme:<name>"`) in the existing `settings` store; no DB version bump, no migration. A dedicated `windows` store (DB v4) is the fallback only if querying needs grow beyond a flat key-value lookup, which v3.0 does not require.
- [Roadmap v3.0]: Zero new npm runtime dependencies confirmed for all four pillars. Playwright is permitted as a devDependency for SANDBOX-05 (the Playwright integration test is a new test category not in the 727-test baseline).
- [Roadmap v3.0]: HYGIENE-07 anchored to Phase 20 (the largest new devtools-visible surface: frameBridge/SandboxFrame/srcdoc). The extended lexicon gate must cover the words "iframe", "sandbox", "isolation" in addition to the existing banned token family — these words must not appear in any user-visible copy, error message, or devtools-visible surface.
- [Roadmap v3.0]: `postMessage` to opaque-origin frames must use `"*"` as targetOrigin (sending to the string `"null"` does not work — the browser blocks it). Frame-to-parent messages use the injected `parentOrigin` (real host origin).
- [Roadmap v3.0]: React 19 has no UMD builds. Inline React CJS from node_modules as IIFEs assigning `window.React` / `window.ReactDOM`. Total per-frame srcdoc string ~553KB. Store as a module-level constant built once and reused.
- [Roadmap v3.0]: FOUC for custom themes — mirror custom theme vars to `localStorage["vibe.customTheme.<name>"]` at save time; extend the FOUC script to apply custom theme on first paint. Any FOUC script change requires `csp.test.ts` SHA-256 hash recompute in the same commit (the Phase 14 invariant stays in force).
- [Roadmap v2.0]: All v1.0/v1.1/v2.0 cross-cutting constraints (HYGIENE-01..06, single Anthropic egress, sourcemaps-off, CSP allowlist, IoC/DI, additive IDB only, FOUC/CSP hash invariant) remain acceptance criteria on every v3.0 phase — not separate phases.

### Key Research Flags

- **Phase 20 (HARD-01):** Highest-risk phase. All seven critical iframe pitfalls concentrate here (allow-same-origin trap, key leak, missing source check, CSS-vars-don't-cross, portal-needs-host-chrome, postMessage targetOrigin "null" trap, React 19 no UMD). Security review at the gate is recommended. The full iframe round-trip (READY → MOUNT → render → FRAME_RESIZE → THEME_PUSH) cannot be tested in JSDOM — at least one Playwright integration test is required.
- **Phase 22 (Theme Editor):** Alpha-color input UX for `--glass` / `--glass2` — `<input type="color">` returns only `#rrggbb` hex; decide on dual range+color or text-field pattern during Phase 22 planning.
- **Phases 19, 21:** Standard patterns — lighter research need; Phase 19 has the MOD-01..04 gate that unlocks Phase 20.

### Pending Todos

- Decide Playwright test infrastructure at start of Phase 20 planning (Playwright vs alternative browser-native approach; devDependency addition).
- Confirm `loader.ts` transpiled-string accessor interface before Phase 20 planning (`getTranspiledJS(cacheKey)` accessor into session-tier `transpiledCache`).
- Decide alpha-color input UX pattern for `--glass` / `--glass2` before Phase 22 planning.

### Blockers/Concerns

None at roadmap creation.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260625-q08 | Fix G1 cacheKey contract (fold kind+prompt) + reconcile blueprint doc | 2026-06-25 | 0f9a7d4 | [260625-q08-cachekey-contract-doc-reconcile](./quick/260625-q08-cachekey-contract-doc-reconcile/) |

Last activity: 2026-06-26 — v3.0 Trusted Desktop roadmap created (Phases 19–22); 19/19 requirements mapped.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Window UX | CHROME-F1: Snap to quarter (corner drag) | Deferred to v3.1 | v3.0 Requirements |
| Window UX | CHROME-F2: Keyboard window cycle (Cmd+`) | Deferred to v3.1 | v3.0 Requirements |
| Theme | THEME-F1: Theme export / import (JSON) | Deferred to v3.1 | v3.0 Requirements |
| Refactor | G2 unified `Intent` contract — internal refactor, no user-facing value | Deferred beyond v3.0 | v2.0 Requirements |

## Session Continuity

Last session: 2026-06-26 — v3.0 roadmap created
Stopped at: Roadmap written; ready for Phase 19 planning.
Resume with: `/gsd-plan-phase 19` to plan Window Chrome & Menu Relocation.
