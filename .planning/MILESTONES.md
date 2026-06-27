# Milestones

## v2.0 Vibe OS (Shipped: 2026-06-26)

**Phases completed:** 5 phases (14–18), 21 plans

**Key accomplishments:**

- **Theme Foundation (THEME-01..05):** Four named themes (Aurora / Aero / Aqua / Noir) expressed as CSS custom properties on `document.documentElement` — live switchable with no reload or remount, FOUC-safe via a synchronous `localStorage` read in `index.html` before React mounts, persisted in a new IDB `settings` store (DB v3, additive migration), and a backward-compat `:root` alias bridge keeps pre-v2.0 cached apps rendering correctly. `VibeThemeProvider` nested inside the existing `ThemeProvider` — purely additive; 552 prior tests unaffected.
- **Window Manager (WIN-01..05):** Apps open as independently draggable glass windows with a macOS-style titlebar (traffic-light close/minimize + app icon + title), z-order/focus/minimize/restore/close lifecycle via `useWindowManager`, and real-time viewport-clamped drag via `setPointerCapture` + rAF imperative `transform` writes. Windows render in-tree as memoized `WindowBody` subtrees (not detached `createRoot` roots — that approach hung tests). `appBodyCount()` baseline invariant confirms no root leaks on close.
- **Desktop Shell (WIN-06..08, PERF-01):** The flat storefront is replaced by the Vibe OS desktop — animated themed wallpaper (4 blob layers with `vibeFloat` keyframe), a bottom dock showing running-indicator dots per open app plus a magnifier launcher icon (hover-scale), and a top menu bar (OS wordmark + active-app name + live clock). `@media (prefers-reduced-motion: reduce)` disables blob animation; minimized windows are `display:none` (no compositor layer). Theme re-skin acceptance: aurora→noir switches both `--wall` and `--text` on `documentElement` matching the VIBE_THEMES contract — viewed and confirmed by screenshots.
- **Search / Launcher Panel (CREATE-01..03):** A dock-launched `SearchLauncherPanel` replaced the flat storefront grid — text input + action button + pre-installed app chips + resolve→produce→window flow. `slugFromText` canonicalizes user descriptions to stable cache keys; `handleDescribe` in `DesktopShell` routes through `registryKey("app", slug, text)` → `useWindowManager.open()`. Cache-hit test proves 1 transport call across 2 same-text describes. `MinimalLauncher` deleted (0 references in `src/`). Focus-not-stolen: panel focuses close button, not input.
- **Theme-Aware Generation (TGEN-01..03, HYGIENE-06):** All five produce-prompt branches (`buildPrompt`, `buildLengthPrompt`, `buildRepairPrompt`) mandate the CSS-var contract (`var(--accentA/--accentB/--text/--glass/--glass2/--bord/--hi)`). `colorCheck` post-transpile detects saturated/branded hardcoded colors (incl. 4-digit `#rgba` shorthand, allowing grayscale + neutral-alpha shadows) and feeds violations into the existing self-heal loop (≤3 retries; literal embedded in error to avoid early-stop collapse). `sanitizeDisplayName` wired in `useWindowManager.open()` — "AI Weather" → "Weather". CI hygiene gate explicitly covers all new v2.0 surfaces.

**Test growth:** 552 (v1.1) → **727** green. tsc 0; build clean (no source maps); hygiene + CSP gates green throughout. Zero new npm dependencies — all windowing, drag, and theming hand-rolled on React 19 + idb.

**Archive:** [v2.0-ROADMAP.md](./milestones/v2.0-ROADMAP.md) · [v2.0-REQUIREMENTS.md](./milestones/v2.0-REQUIREMENTS.md) · [v2.0-MILESTONE-AUDIT.md](./milestones/v2.0-MILESTONE-AUDIT.md)

---

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
