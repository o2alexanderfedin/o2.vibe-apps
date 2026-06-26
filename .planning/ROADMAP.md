# Roadmap: Vibe App Store

## Milestones

- ✅ **v1.0 MVP** — Phases 1–8 (shipped 2026-06-26) — full detail archived in [milestones/v1.0-ROADMAP.md](./milestones/v1.0-ROADMAP.md)
- 📋 **Next milestone** — to be roadmapped via `/gsd-new-milestone` (candidate scope below)

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

### 📋 Next Milestone (planned — run `/gsd-new-milestone`)

Candidate scope, drawn from [BLUEPRINT-DELTA.md](./BLUEPRINT-DELTA.md) §2 plus the
v2-deferred items:

- **Sanctioned network-data path** so network-dependent apps (Weather, Currency)
  work — today they can't `fetch` in the sandboxed handler scope.
- **Activate + type the dormant widget/handler schemas** (G3) — the widget
  composition path is built but unused by delegated apps.
- **Unified `Intent`** (operation/kind/contextBundle) (G2); **persist
  `displayName`/`prompt`** for a richer storefront + faithful re-produce (G5).
- **Deferred safety:** HARD-01 `<iframe sandbox>` isolation of generated code;
  SEC-01/02/03 general sandboxing.
- **POP-01** "popular on the platform" storefront row from `useCount`;
  **reducer-reliability hardening** for delegated apps.

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Hygiene Foundation & Storefront Shell | v1.0 | 4/4 | Complete | 2026-06-24 |
| 2. Static Open-One-App Loop | v1.0 | ✓ | Complete | 2026-06-24 |
| 3. Cache-Miss Generation (Core Value) | v1.0 | ✓ | Complete | 2026-06-24 |
| 4. Widget Composition | v1.0 | 1/1 | Complete | 2026-06-24 |
| 5. Contextual Modification | v1.0 | 1/1 | Complete | 2026-06-24 |
| 6. API Error Degradation | v1.0 | 1/1 | Complete | 2026-06-24 |
| 7. Storage & Cost Guardrails | v1.0 | 1/1 | Complete | 2026-06-24 |
| 8. Backend-Style Handlers | v1.0 | 1/1 | Complete | 2026-06-24 |

**v1.0 MVP shipped 2026-06-26 — 8 phases, 42/42 active requirements satisfied, 378 tests green.**
