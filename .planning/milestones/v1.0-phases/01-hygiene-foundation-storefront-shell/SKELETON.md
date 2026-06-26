# Walking Skeleton — Vibe App Store

**Phase:** 1
**Generated:** 2026-06-24

## Capability Proven End-to-End

> One sentence: the smallest user-visible capability that exercises the full stack.

A visitor loads the running SPA, sees the marketplace storefront render, and the app silently performs a real IndexedDB probe write/read at startup (falling back to an in-memory `Map` when storage is unavailable) — proving the build → render → storage stack works end-to-end before any model is involved.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Vite 8 SPA + React 19.2 + TypeScript strict (no SSR/Next) | D-01/D-02. Client-only zero-infra model; precise sourcemap control is required for the devtools-hygiene illusion (`build.sourcemap: false`, D-04). |
| Host JSX runtime | `@vitejs/plugin-react` automatic runtime (`jsx: "react-jsx"`) | D-47. Distinct from the classic-runtime Babel path that Phase 2 uses for produced code — the two compile paths must never be conflated. |
| Data layer | Single IndexedDB database `MarketplaceRegistry` v1 with stores `apps`/`widgets`/`handlers` via `idb@8`, in-memory `Map` fallback | D-20..D-23. One DB, neutral store names. Probe-write detects private-mode/zero-quota and degrades behind an identical async interface so callers never branch on availability. |
| Cache keying | SHA-256 hex over NFC→lower→trim→collapse-whitespace, via `crypto.subtle.digest` | D-24..D-27. Opaque, Unicode-safe, collision-resistant. No `btoa`, no readable type-slug prefix on the output. |
| Config storage | `localStorage` keys `marketplace.apiKey` and `marketplace.theme` (plain text, by deliberate v1 decision) | D-11/D-15. Encryption-at-rest deferred (circular-secret problem). Key is the sole stored credential. |
| Network egress | Single chokepoint `src/host/modelClient.ts` (Phase 1: header assembly stub, no fetch) | D-34..D-37. Isolating the only outbound edge makes every network-hygiene rule a one-file invariant. |
| Logging | Single gated logger `src/lib/logger.ts`; off unless `localStorage.debug` truthy at load; `[Marketplace]` prefix; neutral copy | D-29..D-33. No direct `console.*` anywhere else. |
| Security boundary | CSP `<meta>` in `index.html`: `connect-src 'self' https://api.anthropic.com` + `sourcemap:false` | D-43/SEC-04. `connect-src` is the key-exfiltration containment; `'unsafe-eval'` reserved for the Phase-2 compile path. |
| Styling | Plain CSS in `src/index.css` with 9 locked CSS variables on `:root[data-theme=…]` | D-07/D-17. No CSS-in-JS, no component library. Structurally neutral class names only. |
| Icons | `lucide-react` (tree-shakeable, neutral SVG names) | Claude's discretion (CONTEXT); exact icons named in UI-SPEC §1. |
| Test runner | Vitest 4 (jsdom default; per-file `node` env for crypto) + `fake-indexeddb` + matchMedia stub | D-05 + RESEARCH Pitfalls 1-4. Three jsdom gaps (crypto.subtle, IndexedDB, matchMedia) handled in Wave 0 test infra. |
| Directory layout | `src/{host,registry,ui,lib}` + `src/test/setup.ts` + co-located `*.test.ts(x)` | D-06 verbatim. Module-boundary axis: UI surface ▸ registry/storage ▸ host egress. |

## Stack Touched in Phase 1

- [x] Project scaffold (Vite + React 19 + TS strict, ESLint optional, Vitest test runner)
- [x] Routing — single-screen SPA (storefront + modal dialog); no router needed (RESEARCH A4)
- [x] Database — real IndexedDB probe **write** + **delete** at startup, plus `get`/`put`/`delete` round-trip exercised by `registry.test.ts` (happy path via `fake-indexeddb` + forced `Map`-fallback path)
- [x] UI — interactive storefront grid (`<button>` cards) + theme toggle + Account/KeyDialog flow wired to `localStorage`
- [x] Deployment — documented local full-stack run: `npm run dev` (dev server) and `npm run build && npm run preview` (production-config verify, sourcemaps off)

## Out of Scope (Deferred to Later Slices)

> Anything that is *not* in the skeleton. Be explicit — this list prevents future phases from re-litigating Phase 1's minimalism.

- Any Anthropic API call / generation / produce loop (Phase 3) — `modelClient.ts` is a header-assembly stub only.
- Any code compilation / transpile / `@babel/standalone` invocation (Phase 2) — the dep is installed (D-03) but never called.
- Any rendering of produced app/widget code, `new Function()` instantiation, or React-root management for produced content (Phase 2).
- Full record shapes for `AppRecord`/`WidgetRecord`/`HandlerRecord` — Phase 1 defines the DB schema/stores only (D-21).
- The real card-click resolve→render loop — Phase 1 ships a "Opening…" stub affordance only (D-10, SHELL-02 stub).
- Key encryption at rest, `navigator.storage.estimate()` + LRU eviction (Phase 7), `<iframe sandbox>` mount seam (Phase 2), real auth/accounts (out of scope v1).
- `onUncaughtError` root option (Phase 2) and the global async backstop (Phase 6).

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2:** A user opens a seeded app and it compiles → instantiates → renders interactively (static loop, model risk removed).
- **Phase 3:** A user opens an app that has never existed; it is produced on demand, cached, and rendered (core value).
- **Phase 4:** Apps render isolated sub-widgets via transitive pre-warm + synchronous `useWidget`.
- **Phase 5:** The shared `⋮` prompt lets users remove/clone/tweak apps and widgets in place.
- **Phase 6:** Missing/invalid key, rate limits, and uncaught async errors degrade gracefully with neutral copy.
- **Phase 7:** Storage pressure + eviction + cost guardrails are bounded with neutral messaging.
- **Phase 8:** Apps/widgets transparently resolve or produce cached backend-style data handlers.
