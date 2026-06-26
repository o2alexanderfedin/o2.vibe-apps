# Milestones

## v1.0 MVP (Shipped: 2026-06-26)

**Phases completed:** 8 phases, 4 plans, 9 tasks

**Key accomplishments:**

- Vite 8 + React 19.2 + TypeScript strict SPA scaffold with IndexedDB probe+Map fallback registry, gated [Marketplace] logger, CSP meta tag, FOUC blocking theme script, and sourcemaps-off production build — all 16 tests green
- The full interactive storefront slice — light/dark/system ThemeProvider (data-theme + matchMedia), an 8-card Marketplace grid with the SHELL-02 Opening… stub, an AppBar (wordmark + Account + 3-way theme toggle), and a three-flow KeyDialog with sk-ant- validation — wired into App.tsx over the Walking Skeleton; 22/22 tests green, tsc clean, production build emits no sourcemaps.
- Opaque SHA-256 cache-key derivation over normalized input (LOOP-02) and the single Anthropic egress header stub with a proven key-never-leaks guarantee (HYGIENE-05) — both written test-first (RED→GREEN), 12 tests green, tsc clean.
- Vitest static gate (`src/hygiene.test.ts`) that walks `src/

---
