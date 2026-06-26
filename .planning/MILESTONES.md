# Milestones

## v1.1 Real & Robust (Shipped: 2026-06-26)

**Phases completed:** 5 phases (9–13), 13 plans

**Key accomplishments:**

- **Richer storefront (STORE-01/02):** app records persist `displayName`/`prompt`/`createdAt` additively (DB v2 unchanged, read-tolerant); storefront cards show real names; a "Your most-opened" popular row ranked by `useCount` (deterministic tie-break, cold-start hidden, truthful local-only copy). The producing `prompt` stores the user's intent only — never the model system-prompt — so IndexedDB stays hygiene-safe. Verified with a live browser UAT.
- **Widget schema & key correctness (WIDGET-07/08):** `WidgetRecord`/`HandlerRecord` became explicit interfaces (replacing `Record<string,unknown>`); every identity site derives via `registryKey(kind,type,prompt?)`, proven by a collision-distinctness audit (an app and a widget with the same type slug can never collide).
- **Reliability hardening (RELY-01/02/03):** a lenient `zod/mini` schema derived from `initialState` gates the `DelegatedShell` merge — a wrong-typed known field is rejected and prior state kept; extra keys and partial updates are tolerated (the reliability paradox); unknown actions are no-ops; failures are silent with zero extra model round-trips.
- **Sanctioned network-data path (DATA-01..04):** a host-brokered `fetchData(sourceId,params)` injected into the handler scope builds URLs from a curated keyless-CORS allowlist (Open-Meteo geocode+forecast, Frankfurter); raw `fetch`/XHR/WebSocket stay shadowed; CSP `connect-src` widened to exactly those origins (never `*`); in-memory TTL cache. Seeded Weather + Currency apps show **real data** — verified by a live browser CORS smoke. Two integration bugs the unit suite missed were caught by the smoke and fixed with regression tests.
- **Activate widget composition (WIDGET-06):** `useWidget` wired into the delegated `view` scope (the dormant machinery's missing seam); delegated apps can declare and render `@widget` sub-widgets, each isolated by its WidgetShell + ErrorBoundary, with a `MAX_WIDGET_DEPTH` composition cap. Backward-compatible: no-widget apps mount unchanged.

**Test growth:** 378 (v1.0) → **552** green. tsc 0; build clean (no source maps); hygiene + CSP gates green throughout.

**Archive:** [v1.1-ROADMAP.md](./milestones/v1.1-ROADMAP.md) · [v1.1-REQUIREMENTS.md](./milestones/v1.1-REQUIREMENTS.md) · [v1.1-MILESTONE-AUDIT.md](./milestones/v1.1-MILESTONE-AUDIT.md)

---

## v1.0 MVP (Shipped: 2026-06-26)

**Phases completed:** 8 phases, 4 plans, 9 tasks

**Key accomplishments:**

- Vite 8 + React 19.2 + TypeScript strict SPA scaffold with IndexedDB probe+Map fallback registry, gated [Marketplace] logger, CSP meta tag, FOUC blocking theme script, and sourcemaps-off production build — all 16 tests green
- The full interactive storefront slice — light/dark/system ThemeProvider (data-theme + matchMedia), an 8-card Marketplace grid with the SHELL-02 Opening… stub, an AppBar (wordmark + Account + 3-way theme toggle), and a three-flow KeyDialog with sk-ant- validation — wired into App.tsx over the Walking Skeleton; 22/22 tests green, tsc clean, production build emits no sourcemaps.
- Opaque SHA-256 cache-key derivation over normalized input (LOOP-02) and the single Anthropic egress header stub with a proven key-never-leaks guarantee (HYGIENE-05) — both written test-first (RED→GREEN), 12 tests green, tsc clean.
- Vitest static gate (`src/hygiene.test.ts`) that walks `src/

---
