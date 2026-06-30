---
gsd_state_version: 1.0
milestone: v3.1
milestone_name: Polish & Hardening
status: executing
stopped_at: Roadmap written; ready for Phase 23 planning.
last_updated: "2026-06-30T17:43:47.257Z"
last_activity: 2026-06-30 -- Phase 25 execution started
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 3
  completed_plans: 2
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-30 after v3.0)

**Core value:** A user opens an app from the storefront and it renders and works — instantly on a cache hit, seamlessly produced on a cache miss — and nothing visible ever reveals that the app was made on demand.
**Current focus:** Phase 25 — Real-Browser Smoke Suite

## Current Position

Phase: 25 (Real-Browser Smoke Suite) — EXECUTING
Plan: 1 of 1
Status: Executing Phase 25
Last activity: 2026-06-30 -- Phase 25 execution started

### v3.1 Phase Map

| Phase | Name | Requirements | Dependencies |
|-------|------|--------------|--------------|
| 23 | Live Frame Re-Skin | RESKIN-01 | Phase 22 (THEME_PUSH infrastructure) |
| 24 | Launcher CSS Polish | POLISH-01 | Phase 14 (CSS-var contract); independent of 23 and 25 |
| 25 | Real-Browser Smoke Suite | SMOKE-01, SMOKE-02, SMOKE-03 | Phase 23 (SMOKE-03 verifies RESKIN-01 in a real browser) |

### v3.1 Requirement Coverage

All 5 v3.1 requirements mapped — 5/5 (100%):

| Requirement | Phase |
|-------------|-------|
| RESKIN-01 | Phase 23 |
| POLISH-01 | Phase 24 |
| SMOKE-01 | Phase 25 |
| SMOKE-02 | Phase 25 |
| SMOKE-03 | Phase 25 |

### Prior milestones — all DONE (archived)

**v3.0 Trusted Desktop** — Phases 19–22 COMPLETE (shipped 2026-06-30)

- Phase 19 Window Chrome & Menu Relocation (CHROME-01..04) — merged
- Phase 20 Opaque-Origin Frame Isolation (SANDBOX-01..06, HYGIENE-07) — merged
- Phase 21 Desktop Persistence (PERSIST-01..03) — merged
- Phase 22 Theme Editor & Custom Themes (THEME-06..10) — merged

**v2.0 Vibe OS** — Phases 14–18 COMPLETE
**v1.1 Real & Robust** — Phases 9–13 DONE (archived)
**v1.0 MVP** — Phases 1–8 DONE (archived)

## Performance Metrics

**Velocity:**

- Total plans completed (v3.0): 18 plans across 4 phases
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 19 | 4/4 | — | — |
| Phase 20 | 5/5 | — | — |
| Phase 21 | 4/4 | — | — |
| Phase 22 | 5/5 | — | — |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap v3.1]: 3-phase structure (23–25) derived from the 5 requirements. Phase 23 (RESKIN-01) is the dependency root for Phase 25 (SMOKE-03 verifies the re-skin fix in a real browser). Phase 24 (POLISH-01) is fully independent — CSS-only, can be planned or executed in parallel with Phase 23 if desired.
- [Roadmap v3.1]: RESKIN-01 fix is a focused, low-risk change: remove `themeVars` from the `useMemo` dependency array in `SandboxFrame` (or equivalent memoization site). `broadcastTheme(vars)` already exists from Phase 20; making it the live path requires only this dep removal. A JSDOM unit test can assert the dep array without a real browser.
- [Roadmap v3.1]: SMOKE-01/02/03 extend the existing Playwright suite from Phase 20 (plan 20-05). No new Playwright setup required; Playwright is already a devDependency. The smoke tests are purely additive to the test suite — they do not replace or modify any existing Vitest tests.
- [Roadmap v3.1]: Phase 24 POLISH-01 is CSS-only. The 12-var CSS contract is fixed; the fix applies the existing vars to the 6 partially-styled `.launcher__*` classes. No new variables, no JS changes expected.
- [Roadmap v3.1]: Zero new runtime dependencies confirmed. All three phases operate on existing infrastructure: `SandboxFrame`/`broadcastTheme` (Phase 20), `settings` store (Phase 21), FOUC script (Phase 22), existing Playwright suite (Phase 20), CSS-var contract (Phase 14).
- [Roadmap v3.0]: 4-phase structure (19–22) derived from the dependency-enforced build order independently confirmed by all four research streams. CHROME → SANDBOX → PERSIST/THEME-editor is a hard constraint, not advisory.
- [Roadmap v3.0]: HARD ordering constraint — CHROME-01 (`⋮` to titlebar) must complete and its MOD-01..04 gate must be confirmed before any iframe work begins. `createPortal` cannot cross an opaque-origin boundary without `allow-same-origin`, which must never be set.
- [Roadmap v3.0]: Schema decision SETTLED — additive keys (`"windowLayout"`, `"customTheme:<name>"`) in the existing `settings` store; no DB version bump, no migration.
- [Roadmap v3.0]: Zero new npm runtime dependencies confirmed for all four pillars. Playwright is permitted as a devDependency for SANDBOX-05 (the Playwright integration test is a new test category not in the 727-test baseline).
- [Roadmap v3.0]: HYGIENE-07 anchored to Phase 20 (the largest new devtools-visible surface: frameBridge/SandboxFrame/srcdoc). The extended lexicon gate must cover the words "iframe", "sandbox", "isolation" in addition to the existing banned token family — these words must not appear in any user-visible copy, error message, or devtools-visible surface.
- [Roadmap v3.0]: `postMessage` to opaque-origin frames must use `"*"` as targetOrigin (sending to the string `"null"` does not work — the browser blocks it). Frame-to-parent messages use the injected `parentOrigin` (real host origin).
- [Roadmap v3.0]: React 19 has no UMD builds. Inline React CJS from node_modules as IIFEs assigning `window.React` / `window.ReactDOM`. Total per-frame srcdoc string ~553KB. Store as a module-level constant built once and reused.
- [Roadmap v3.0]: FOUC for custom themes — mirror custom theme vars to `localStorage["vibe.customTheme.<name>"]` at save time; extend the FOUC script to apply custom theme on first paint. Any FOUC script change requires `csp.test.ts` SHA-256 hash recompute in the same commit (the Phase 14 invariant stays in force).
- [Roadmap v2.0]: All v1.0/v1.1/v2.0 cross-cutting constraints (HYGIENE-01..06, single Anthropic egress, sourcemaps-off, CSP allowlist, IoC/DI, additive IDB only, FOUC/CSP hash invariant) remain acceptance criteria on every v3.0 and v3.1 phase — not separate phases.

### Key Research Flags

- **Phase 23 (RESKIN-01):** Locate the exact memoization site in `SandboxFrame` (or `WindowFrame`) where `themeVars` is a dep. Confirm that `broadcastTheme(vars)` is already called on theme switch — if yes, the fix is purely additive dep removal. Verify the fix does not break the initial theme injection on frame mount (the first `THEME_PUSH` after `READY`).
- **Phase 25 (Smoke tests):** Locate the existing Phase 20 Playwright suite file. Confirm Playwright config (headless, CI mode). SMOKE-02 requires setting a custom theme in `localStorage` before load — use Playwright's `storageState` or a `page.addInitScript` to seed the state.

### Pending Todos

- Confirm location of `themeVars` dep in srcdoc memo before Phase 23 planning.
- Confirm existing Playwright suite file path before Phase 25 planning.
- Decide Phase 23 vs Phase 24 execution order (both have no hard dependency on each other; suggest Phase 23 first as it is the blocking fix for Phase 25).

### Blockers/Concerns

None at roadmap creation.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260625-q08 | Fix G1 cacheKey contract (fold kind+prompt) + reconcile blueprint doc | 2026-06-25 | 0f9a7d4 | [260625-q08-cachekey-contract-doc-reconcile](./quick/260625-q08-cachekey-contract-doc-reconcile/) |

Last activity: 2026-06-30 — v3.1 Polish & Hardening roadmap created (Phases 23–25); 5/5 requirements mapped.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Window UX | CHROME-F1: Snap to quarter (corner drag) | Deferred to v3.1+ | v3.0 Requirements |
| Window UX | CHROME-F2: Keyboard window cycle (Cmd+`) | Deferred to v3.1+ | v3.0 Requirements |
| Theme | THEME-F1: Theme export / import (JSON) | Deferred to v3.1+ | v3.0 Requirements |
| Refactor | G2 unified `Intent` contract — internal refactor, no user-facing value | Deferred beyond v3.1 | v2.0 Requirements |

## Session Continuity

Last session: 2026-06-30 — v3.1 roadmap created
Stopped at: Roadmap written; ready for Phase 23 planning.
Resume with: `/gsd-plan-phase 23` to plan Live Frame Re-Skin.

## Operator Next Steps

- Run `/gsd-plan-phase 23` to plan Phase 23 (Live Frame Re-Skin, RESKIN-01)
