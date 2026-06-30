# Requirements — v3.1 Polish & Hardening

**Milestone goal:** Close v3.0's tech debt and verification gaps — no new product surface. Internal/UX hardening of what shipped in v3.0.

**Cross-cutting constraints (binding on every requirement):** zero new runtime dependencies; the hygiene lexicon gate (banned token family + `iframe`/`sandbox`/`isolation` never in devtools-visible/user-visible surfaces) stays green; CSP allowlist + the FOUC/CSP-hash invariant stay in force; no IDB DB version bump; IoC/DI via `ServicesProvider`; production build ships 0 source maps; full existing suite stays green.

## v3.1 Requirements

### Live theme re-skin (RESKIN)

- [ ] **RESKIN-01**: Switching to any theme (built-in or custom) re-skins every open app frame **live, without reloading the iframe** — in-frame app state (scroll position, form input, component state) is preserved across the switch. The `THEME_PUSH` postMessage path is the mechanism (the frame is no longer reloaded on a theme change because the srcdoc no longer depends on `themeVars`).

### Browser-verified durability (SMOKE)

> Closes the Phase 21/22 `human_needed` gaps with automated coverage. Playwright is already a devDependency (added in Phase 20); no new runtime deps.

- [ ] **SMOKE-01**: An automated browser test proves that after a hard reload, the desktop restores all previously open windows at their saved position, geometry, z-order, and minimized state (Phase 21 round-trip, end-to-end in a real browser).
- [ ] **SMOKE-02**: An automated browser test proves that with an active **custom** theme, a hard reload applies that theme on first paint with **no Aurora flash** (FOUC-free), reading the mirrored `localStorage` vars (Phase 22 round-trip, end-to-end in a real browser).
- [ ] **SMOKE-03**: An automated browser test proves RESKIN-01 in a real browser — a theme switch re-skins an already-open frame live and the frame is **not** reloaded (in-frame state survives).

### UI polish (POLISH)

- [ ] **POLISH-01**: The SearchLauncherPanel's interior — search row, text input, open button, working indicator, and example chips (`.launcher__search`, `.launcher__input`, `.launcher__open-btn`, `.launcher__working`, `.launcher__chips`, `.launcher__chip`) — renders with the active theme's glass treatment, visually consistent with the rest of the v3.0 chrome, across all four built-in themes and custom themes.

## Future Requirements (deferred)

- **[G2] Unified `Intent` contract** — collapse the parallel `routeModification` / `Modification` path into a single `Intent { operation, kind, contextBundle }` resolver. Internal refactor; deferred to a dedicated architecture milestone.

## Out of Scope

- **Any new user-facing product surface** — v3.1 is hardening only; new capabilities (app sharing/export, workspaces, collaboration, expanded gallery) belong to a v4.0 feature milestone.
- **In-frame runtime-state *persistence across reload*** — RESKIN-01 preserves in-frame state across a *theme switch* (no reload), but persisting generated-app runtime state across a full page reload remains out of scope (generated apps have no stable serialization contract — the v3.0 decision stands).
- **New theme variables** — the 12-var contract is fixed.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RESKIN-01 | TBD | Pending |
| SMOKE-01 | TBD | Pending |
| SMOKE-02 | TBD | Pending |
| SMOKE-03 | TBD | Pending |
| POLISH-01 | TBD | Pending |

*(Phase assignments filled in by the roadmapper.)*
