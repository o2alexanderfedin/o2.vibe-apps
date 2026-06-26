# Phase 1: Hygiene Foundation & Storefront Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 1-Hygiene Foundation & Storefront Shell
**Mode:** --auto (fully autonomous — no interactive prompts)
**Areas discussed:** Project scaffold, Source tree, Storefront grid, API key UX, Theme system, IndexedDB init, Cache key derivation, Gated logger, Anthropic egress stub, CI hygiene gate, CSP, Vite config

---

## Project Scaffold

| Option | Description | Selected |
|--------|-------------|----------|
| Vite SPA | Pure client-side, fast HMR, `build.sourcemap: false` control | ✓ |
| Next.js | SSR — contradicts client-only zero-infra constraint | |
| CRA | Deprecated | |

**Auto-selected:** Vite SPA — required by PROJECT.md constraint "zero-infra, client-only".
**Notes:** React 19.2.x + react-dom 19.2.x version-locked. TypeScript strict. Vitest for tests.

---

## Source Tree Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Module-boundary tree (host/registry/ui/lib) | Matches research architecture; creates Phase 2+ integration seams | ✓ |
| Flat src/ structure | Simpler but doesn't create isolation needed for egress chokepoint | |

**Auto-selected:** Module-boundary tree from ARCHITECTURE.md.
**Notes:** `host/modelClient.ts` is the single egress chokepoint. `registry/` is the three-tier cache. `ui/` is storefront shell. `lib/` is logger + storage constants.

---

## Storefront Grid (SHELL-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Static APP_REGISTRY constant (6–8 types) | Simple, no data fetching, neutral IDs | ✓ |
| Dynamic from IndexedDB | Overkill for Phase 1; DB just initialized | |

**Auto-selected:** Static APP_REGISTRY constant — Phase 1 is hygiene foundation, not dynamic data.
**Notes:** 6–8 neutral app types. Clicking cards is a stub in Phase 1; real loop is Phase 2.

---

## API Key UX (SHELL-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Neutral "Activate" framing with password input | Hides key in DOM, neutral product language | ✓ |
| Raw "Paste your AI key" flow | Reveals mechanic, fails HYGIENE-01 | |

**Auto-selected:** Neutral activation framing. Storage key: `marketplace.apiKey`. Input type=password.
**Notes:** Three flows: Set (if no key), Change, Clear/Disconnect. Basic format validation only.

---

## Theme System (SHELL-04)

| Option | Description | Selected |
|--------|-------------|----------|
| data-theme attribute + CSS variables | Standard, works for generated apps inheriting variables | ✓ |
| CSS-in-JS theming | Bundle weight, devtools fingerprint risk | |
| prefers-color-scheme only (no override) | No manual toggle — fails SHELL-04 | |

**Auto-selected:** `data-theme` on `:root` with 9 CSS variables. Storage key: `marketplace.theme`.
**Notes:** Blocking `<script>` in `index.html` prevents FOUC. System mode uses `matchMedia`.

---

## IndexedDB Init + Probe + Fallback (LOOP-03)

| Option | Description | Selected |
|--------|-------------|----------|
| idb@8 + probe write + in-memory Map fallback | Matches research spec; handles Safari private mode | ✓ |
| Raw IndexedDB API | Transaction/upgrade bugs; no benefit | |
| Skip init in Phase 1 | Violates LOOP-03 ownership | |

**Auto-selected:** idb@8 with probe write. DB: `MarketplaceRegistry`, version 1. Three stores: `apps`/`widgets`/`handlers`.
**Notes:** `dbReady: Promise<void>` exported. `navigator.storage.persist()` called at init. In-memory Map fallback for all three stores.

---

## Cache Key Derivation (LOOP-02)

| Option | Description | Selected |
|--------|-------------|----------|
| SHA-256 hex via crypto.subtle | Opaque, Unicode-safe, collision-resistant, no readable prefix | ✓ |
| btoa + slice | Throws on Unicode, collides, partial hygiene leak — NEVER acceptable | |

**Auto-selected:** SHA-256 hex with NFC + lowercase + trim + collapse-whitespace normalization.
**Notes:** Normalization applied identically on read and write. Test suite mandated.

---

## Gated Logger (HYGIENE-04)

| Option | Description | Selected |
|--------|-------------|----------|
| `localStorage.debug` gate, off by default | Neutral, no devtools noise in production | ✓ |
| Always-on debug logs | Fails HYGIENE-04 | |
| No logging at all | Makes Phase 3+ debugging impossible | |

**Auto-selected:** `localStorage.debug` gate. All console.* calls via `src/lib/logger.ts` only.
**Notes:** `[Marketplace]` prefix. Neutral copy only. Key never logged.

---

## Anthropic Egress Stub (HYGIENE-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Header-assembly stub in host/modelClient.ts | Creates single egress chokepoint; Phase 3 wires fetch | ✓ |
| Skip until Phase 3 | Module would be missing; Phase 2 needs the seam to exist | |

**Auto-selected:** Stub exports `buildHeaders(apiKey)` and constants. No fetch call yet.
**Notes:** All four required Anthropic headers. Model ID: `claude-haiku-4-5-20251001`. Origin assertion comment.

---

## CI Lexicon-Grep Gate (HYGIENE-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest test (hygiene.test.ts) | Cross-platform, runs with `npm test`, maintainable | ✓ |
| Shell script only | Platform-dependent, separate from test suite | |

**Auto-selected:** Vitest test scanning `src/` for banned tokens.
**Notes:** Banned: synthesize/synthesized/synthesis, \bAI\b, \bllm\b, fake/mock in identifiers, banned tokens in comments/CSS/data-*. Exception: `generate` as private identifier (not user-facing string).

---

## CSP (SEC-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Meta tag in index.html | Works for static SPA, no server required | ✓ |
| HTTP header via server config | Needs a server — contradicts client-only architecture | |

**Auto-selected:** Meta CSP. `connect-src 'self' https://api.anthropic.com`. `script-src 'self' 'unsafe-eval'` (required for new Function + Babel).
**Notes:** `'unsafe-eval'` is necessary and intentional. CSP is the strongest v1 key-exfiltration mitigation.

---

## Vite Config

| Option | Description | Selected |
|--------|-------------|----------|
| sourcemap: false in production build | Master devtools-hygiene switch | ✓ |
| sourcemap: true | Exposes all internal names/comments — breaks illusion | |

**Auto-selected:** `build.sourcemap: false`, `minify: true`, `target: "es2020"`.
**Notes:** Dev sourcemaps are fine (never shipped). Host app uses automatic JSX runtime via @vitejs/plugin-react; generated code uses classic via @babel/standalone — two separate compile paths, never conflated.

---

## Claude's Discretion

- Icon system for app cards (Lucide React or emoji acceptable)
- Color values for light/dark themes (CSS variable names are fixed, values flexible)
- Component library vs plain CSS (plain CSS / CSS Modules preferred)
- Error boundary component (basic class component stub)

## Deferred Ideas

- Key encryption at rest → deferred (circular key problem)
- LRU eviction → Phase 7 scope
- `<iframe sandbox>` mount seam design → Phase 2 scope
- `onUncaughtError` root option → Phase 2 scope
- Popularity row → v2 (POP-01)
- Cost guardrail threshold → Phase 7 scope
