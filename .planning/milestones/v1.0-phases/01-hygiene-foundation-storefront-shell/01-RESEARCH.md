# Phase 1: Hygiene Foundation & Storefront Shell - Research

**Researched:** 2026-06-24
**Domain:** Vite + React 19 + TypeScript-strict client-only SPA; storefront shell, opaque SHA-256 keying, IndexedDB init with probe+fallback, gated logging, CSP, theme system, and a CI lexicon gate — all foundational hygiene baked in before any model call.
**Confidence:** HIGH

> NOTE ON LANGUAGE: This document obeys the project lexicon rule. It never uses the banned tokens (`synthesize*`, user-facing `generate*`, `\bAI\b`, `llm`, `fake`, `mock`) in any recommended identifier, comment, CSS class, or copy. Where a test library happens to be named with a banned-adjacent word (none here), it is noted. The word "produce / on-demand / resolve / build / open" is used throughout as neutral product language.

---

## Summary

Phase 1 is a Walking Skeleton: it stands up the entire Vite + React 19.2 + TypeScript-strict SPA scaffold plus every cross-cutting hygiene, key-handling, and security control, and it makes **no** Anthropic call and produces **no** code. The upstream context (`01-CONTEXT.md` with 47 locked decisions, `01-UI-SPEC.md`, and the four `research/*.md` files) is unusually complete and was independently verified against npm and official docs on 2026-06-24. This research **confirms those decisions are technically sound and current**, then fills the gaps the planner will hit — almost all of which are in the **test layer**, because three of the five required test files exercise browser APIs that jsdom does not implement faithfully.

The single highest-value finding for the planner: **`crypto.subtle.digest` throws a `TypeError` inside Vitest's jsdom environment** (vitest issue #5365, closed as not-planned — the jsdom key-shim breaks `ArrayBuffer` identity). The fix is to run `cacheKey.test.ts` under the **Node environment** via a per-file `// @vitest-environment node` pragma, where `globalThis.crypto.subtle.digest(Uint8Array)` works correctly (verified live in this session — 64-hex output, deterministic, normalization-stable, emoji-safe). Parallel gaps: jsdom has **no IndexedDB** (needs `fake-indexeddb/auto`), **no `navigator.storage`** (the D-22 fire-and-forget `persist()` call must be guard-coded `typeof navigator.storage?.persist === "function"`), and **no `window.matchMedia`** (theme tests must stub it). None of these change the locked decisions — they are test-setup tasks the plan must include as Wave 0.

Version drift since the context was authored: the live floor versions are now **Vite 8.1.0**, **Vitest 4.1.9**, **TypeScript 6.0.3**, **jsdom 29.1.1**, **@vitejs/plugin-react 6.0.3**, **lucide-react 1.21.0**. All satisfy the CONTEXT.md floors (`Vite 6+`, `TS 5.7+`). Two require planner attention: **Vitest 4** dropped auto-install of the DOM environment (jsdom must be an explicit devDep) and **requires Vite ≥ 6 / Node ≥ 20** (we have Vite 8.1.0 + Node 23.11.0 — satisfied). The `@babel/standalone` choice (D-03) installs the runtime dep now but is **not exercised in Phase 1** (no transpile happens); pin `^7.26` per D-03 to keep the classic-runtime default that Phase 2 depends on.

**Primary recommendation:** Build the scaffold exactly as CONTEXT.md specifies. Add one Wave 0 task that creates the Vitest config + a shared `src/test/setup.ts` (matchMedia stub + `fake-indexeddb/auto` + jest-dom matchers) and routes `cacheKey.test.ts` to the Node environment. Everything else is direct execution of the 47 locked decisions.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Project Scaffold**
- **D-01:** Vite 6+ SPA (not Next.js or any SSR framework). Entry: `index.html` + `src/main.tsx`. Plugin: `@vitejs/plugin-react`. TypeScript strict mode (`strict: true` in tsconfig).
- **D-02:** React 19.2.x + react-dom 19.2.x version-locked to each other. `@types/react@^19` + `@types/react-dom@^19`.
- **D-03:** `idb@8` for IndexedDB. `@babel/standalone@^7.26` installed as a runtime dep (not dev-only) so it's available for Phase 2 eager-load.
- **D-04:** `build.sourcemap: false` in `vite.config.ts` production config — this is the master switch for the devtools-illusion; it MUST NOT be toggled on in CI.
- **D-05:** Test framework: Vitest with `@vitest/ui` and `jsdom` environment. Tests live in `src/**/*.test.ts(x)`. All Phase 1 tests must pass before the phase is verified complete.

**Source Tree Structure**
- **D-06:** Source tree follows the module boundaries from research:
  ```
  src/
    host/
      modelClient.ts       ← single Anthropic egress stub (Phase 1: header assembly only)
    registry/
      cacheKey.ts          ← SHA-256 opaque key derivation
      registry.ts          ← IndexedDB + in-memory fallback (Phase 1: init + probe)
      db.ts                ← idb schema + open (apps/widgets/handlers stores)
    ui/
      Marketplace.tsx      ← storefront grid
      AppBar.tsx           ← API-key config + theme toggle
      KeyDialog.tsx        ← set/change/clear key flow
      ThemeProvider.tsx    ← CSS variable injection
    lib/
      logger.ts            ← gated logger (off by default, localStorage.debug gate)
      storage.ts           ← localStorage key constants (neutral names)
    App.tsx
    main.tsx
  ```
- **D-07:** CSS via plain CSS (or CSS Modules if scoped classes are needed). No CSS-in-JS. Class names must be structurally neutral (`.app-shell`, `.storefront-grid`, `.widget-frame`) — never `.generated-widget`, `.ai-*`, `.synthesize-*`.

**Storefront Grid (SHELL-01)**
- **D-08:** Storefront renders a responsive CSS grid of app-type cards. Each card shows: a neutral icon (SVG or emoji), a display name, a short description. Cards are fixed-width with consistent spacing. No sorting, no filtering, no search in Phase 1 — just a static grid.
- **D-09:** The app types shown are defined by a static `APP_REGISTRY` constant (array of `{ id: string; displayName: string; description: string; icon: string }`). Phase 1 ships 6–8 representative app types. The IDs are lowercase-kebab, neutral.
- **D-10:** Clicking a card in Phase 1 does nothing meaningful yet (a stub handler or a "Coming soon" neutral message is acceptable). SHELL-02 is owned by Phase 1 only as a stub. The click handler MUST NOT log "generate" or any banned token.

**API Key UX (SHELL-03)**
- **D-11:** Key is stored in `localStorage` under the neutral key `marketplace.apiKey`. Value is the raw Anthropic API key string. No encryption in Phase 1. UI neutrally frames this as "Activate your platform" / "Connect your account", never "Enter your AI key".
- **D-12:** Key config UI accessible from the AppBar (neutral label "Account"/"Settings"). Dialog with three flows — Set (`type="password"` input), Change ("Account connected" + Change), Clear ("Disconnect"/"Remove" clears `marketplace.apiKey`).
- **D-13:** API key is NEVER logged (not even in the gated logger), NEVER put in a thrown Error.message, NEVER sent anywhere except `api.anthropic.com` in Phase 3+.
- **D-14:** On save, key validated for basic format (starts with `sk-ant-`, non-empty) with an inline neutral error if invalid. No server-side validation in Phase 1.

**Theme System (SHELL-04)**
- **D-15:** Theme stored in `localStorage` under `marketplace.theme`. Values: `"light"` | `"dark"` | `"system"`. Default: `"system"`.
- **D-16:** Theme applied via `data-theme` on `:root`/`<html>`. CSS variables on `:root[data-theme="light"]` and `:root[data-theme="dark"]`. `"system"` reads `prefers-color-scheme` via `window.matchMedia` with a change listener.
- **D-17:** Required CSS variable names (exact): `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary`, `--color-background-primary`, `--color-background-secondary`, `--color-background-tertiary`, `--color-border-secondary`, `--color-border-tertiary`, `--color-accent-primary`.
- **D-18:** ThemeProvider wraps the app, applies initial theme on mount; a blocking `<script>` in `index.html` sets `data-theme` from localStorage before React hydrates (FOUC prevention).
- **D-19:** Theme toggle in AppBar cycles light → dark → system. Toggle icon neutral (sun/moon/auto).

**IndexedDB Init + Probe + Fallback (LOOP-03)**
- **D-20:** DB name `"MarketplaceRegistry"`, version `1`, three stores `"apps"`/`"widgets"`/`"handlers"` (neutral names).
- **D-21:** DB schema typed via idb's `DBSchema` (apps/widgets/handlers; records in `db.ts`; Phase 1 defines the schema, not full record shapes).
- **D-22:** Startup sequence in `registry/registry.ts`: openDB(create stores) → probe write/delete on `apps` (`__probe__`) → `navigator.storage.persist()` fire-and-forget → on probe failure degrade to `Map` fallbacks → export `dbReady: Promise<void>` awaited by all reads/writes.
- **D-23:** In-memory fallback is `Map` objects keyed identically to IndexedDB. Registry API (`get`/`put`/`delete`) is the same async interface regardless of storage availability; callers never check the flag.

**Cache Key Derivation (LOOP-02)**
- **D-24:** `src/registry/cacheKey.ts`. Signature `async function cacheKey(input: string): Promise<string>`.
- **D-25:** Normalization (identical on write AND read): `input.normalize("NFC")` → `.toLowerCase()` → `.trim()` → `.replace(/\s+/g, " ")`.
- **D-26:** Hashing: `crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized))` → `ArrayBuffer` to lowercase hex. Always 64 hex chars, opaque, collision-resistant, Unicode-safe.
- **D-27:** NEVER `btoa`/base64. Type slug is part of the input string before hashing — NOT prepended to the hash result. Hash output has no readable prefix.
- **D-28:** Tests in `cacheKey.test.ts`: determinism; normalization equivalence (`"Weather "` = `"weather"` = `"WEATHER "`); unicode/emoji does not throw; output is 64 hex chars with no readable slug; `"weather"` ≠ `"calculator"`.

**Gated Logger (HYGIENE-04)**
- **D-29:** `src/lib/logger.ts`. No `console.log` anywhere else — all logging through this module.
- **D-30:** Gate: active only when `localStorage.getItem("debug")` is truthy at module load. Fixed for the session once evaluated (no live toggling).
- **D-31:** API `logger.info/warn/error(msg, ...data)`. Gate off → no-ops. Gate on → prefix `[Marketplace]` + call corresponding `console.*`.
- **D-32:** Neutral copy rule for messages. Allowed: `"[Marketplace] Opening weather"`, `"[Marketplace] Registry initialized"`. Banned: Synthesizing/Generating/AI/LLM language.
- **D-33:** Test: silent by default; `[Marketplace]` prefix present when gate open.

**Single Anthropic Egress Stub (HYGIENE-05, Phase 1 scope)**
- **D-34:** `src/host/modelClient.ts` is a **stub** in Phase 1 — assembles/exports headers, makes NO fetch (Phase 3 wires it).
- **D-35:** Exports `buildHeaders(apiKey)` → `{ "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }`; `ANTHROPIC_API_BASE = "https://api.anthropic.com"`; `ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"`.
- **D-36:** Module asserts (URL constructor check) any call target is `api.anthropic.com`. Stub comment in Phase 1; enforced runtime check in Phase 3.
- **D-37:** Key NEVER logged by this module; received at call time, never stored as a module-level variable.

**CI Lexicon-Grep Hygiene Gate (HYGIENE-03)**
- **D-38:** CI gate is `scripts/hygiene-check.sh` OR a Vitest test `src/hygiene.test.ts` that greps the source tree and fails (exit 1) on banned tokens.
- **D-39:** Banned tokens: `synthesize`/`synthesized`/`synthesis` (any case); `\bgenerate\b`/`\bgenerated\b`/`\bgenerating\b` as user-facing strings or `data-*` values (internal `generate` identifier allowed per exception); `\bfake\b`/`\bmock\b`; `\bAI\b` (exact word); `\bllm\b` (case-insensitive).
- **D-40:** Exception: `generate` permitted in internal non-user-facing identifiers (e.g. `generateCacheKey`). Grep targets CSS class names, `data-*` values, DOM/console-visible string literals, and comments.
- **D-41:** Gate runs as part of `npm run test` (or `npm run hygiene`), wired to pre-commit/CI. Must PASS on Phase 1 codebase.
- **D-42:** Vitest test preferred over shell script. Uses Node `fs.readFileSync` + regex to scan `src/` and relevant config files.

**CSP (SEC-04)**
- **D-43:** CSP via `<meta http-equiv="Content-Security-Policy">` in `index.html`: `default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.anthropic.com; img-src 'self' data:; font-src 'self';`. `'unsafe-eval'` required for `new Function()`/`@babel/standalone` (Phase 2+); set now. `connect-src` is the key exfiltration containment.
- **D-44:** The CSP meta tag is the only mechanism for MVP (no `_headers`/platform config). Remains as defense-in-depth if hosting added later.

**Vite Config**
- **D-45:** `vite.config.ts` build: `sourcemap: false` (MUST stay false — master switch), `minify: true`, `target: "es2020"`.
- **D-46:** Dev server: no proxy config. Dev sourcemaps fine (never shipped); only production sourcemaps forbidden.
- **D-47:** `@vitejs/plugin-react` configured with the **automatic** JSX runtime for the HOST app. Distinct from `@babel/standalone` classic runtime for generated code — the two compile paths must never be conflated.

### Claude's Discretion
- Icon system for app-type cards: any neutral SVG icon set or emoji; Lucide React is a reasonable choice (tree-shakeable, neutral names).
- Exact color values for light/dark themes: any tasteful palette; CSS variable names fixed, values free.
- Component library vs. plain CSS: plain CSS (or CSS Modules) preferred. TailwindCSS acceptable only if resulting DOM class names are structurally neutral.
- Error boundary component: a basic `<ErrorBoundary>` class component is fine for Phase 1 (needed for Phase 2). Include as a stub with neutral error copy.

### Deferred Ideas (OUT OF SCOPE)
- **Key encryption at rest** — requires a second secret (circular). Phase 1 uses plain localStorage.
- **`navigator.storage.estimate()` + LRU eviction** — Phase 7 scope. Phase 1 only calls `persist()`.
- **`<iframe sandbox>` mount seam** — designed in Phase 2. Phase 1 does not touch instantiation.
- **Implicit popularity row** — v2 (POP-01).
- **Real authentication / accounts** — out of scope for v1.
- **`onUncaughtError` root option** — Phase 2 scope. Phase 1 doesn't mount React roots for generated content.
- **Cost guardrail threshold** — Phase 7 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHELL-01 | User lands on a marketplace storefront showing a grid of available app types | `Marketplace.tsx` + static `APP_REGISTRY` (D-08, D-09); UI-SPEC §1 has the full 8-row registry with Lucide icons, card anatomy, CSS classes. Plain CSS grid `repeat(auto-fill, minmax(200px, 200px))`. No data layer needed. |
| SHELL-02 (stub) | User can open an app from the grid | Phase 1 ships a **stub** click handler showing inline "Opening…" for ~800ms then resetting (D-10, UI-SPEC §1 Active state). No resolve/render. Real loop is Phase 2. Click handler must not emit banned tokens. |
| SHELL-03 | Set / change / clear own API key, framed as activating the platform | `KeyDialog.tsx` three-flow design fully specified in UI-SPEC §3; `type="password"` input; `marketplace.apiKey` localStorage key (D-11..D-14). Format check `^sk-ant-`. Key never logged (D-13). |
| SHELL-04 | Switch theme light/dark/system, applied via CSS variables on `:root` | `ThemeProvider.tsx` + `data-theme` attribute + 9 locked CSS variables (D-15..D-19); FOUC blocking script verbatim in UI-SPEC §FOUC; `matchMedia` listener for system mode. |
| LOOP-02 | SHA-256 opaque cache keys over normalized input, identical on read/write | `cacheKey.ts` (D-24..D-28). Normalization + `crypto.subtle.digest` verified live this session: deterministic, normalization-stable, 64-hex, emoji-safe. |
| LOOP-03 | Single IndexedDB with apps/widgets/handlers, probe write + in-memory Map fallback | `registry.ts` + `db.ts` (D-20..D-23) using `idb@8` `DBSchema`. `dbReady` promise gate. Map fallback with identical async interface. |
| HYGIENE-01 | No devtools-visible surface narrates the on-demand mechanic | Cross-cutting: neutral identifiers, store names, CSS classes, copy throughout. Enforced by the hygiene test (HYGIENE-03) + sourcemaps-off (D-04). |
| HYGIENE-02 | The literal "synthesize/synthesized/synthesis" appears in no devtools-visible surface | Lexicon gate (D-38..D-42) + `build.sourcemap: false` (D-04, D-45). |
| HYGIENE-03 | CI lexicon-grep gate fails any merge introducing banned tokens | `src/hygiene.test.ts` Vitest scan (D-42); regex set in D-39; runs in `npm run test`. |
| HYGIENE-04 | Logging off by default, gated behind `localStorage.debug`, neutral copy | `lib/logger.ts` (D-29..D-33); gate read at module load; `[Marketplace]` prefix. |
| HYGIENE-05 | Browser→Anthropic request uses neutral framing; key sent only to `api.anthropic.com`, never logged/proxied | `host/modelClient.ts` stub (D-34..D-37); single egress chokepoint; origin assertion; `buildHeaders` never logs key. |
| SEC-04 | CSP restricts `connect-src` to `'self' https://api.anthropic.com` | CSP meta tag in `index.html` (D-43, D-44). |
</phase_requirements>

## Architectural Responsibility Map

This is a **client-only SPA** with no backend tier. Every capability lives in the Browser/Client tier; the only external service boundary is the (stubbed, not-yet-called) Anthropic endpoint. The "tier" axis here is the **module-boundary axis** from `research/ARCHITECTURE.md` (UI surface ▸ registry/storage ▸ host egress), which is the meaningful separation of concerns for this phase.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Storefront grid (SHELL-01) | Browser / UI surface (`ui/Marketplace.tsx`) | — | Pure presentational render of a static constant; no storage, no network. |
| Open-app stub (SHELL-02) | Browser / UI surface (`ui/Marketplace.tsx`) | — | Local component state for the "Opening…" affordance only; no resolve in Phase 1. |
| API-key set/change/clear (SHELL-03) | Browser / UI surface (`ui/KeyDialog.tsx`, `ui/AppBar.tsx`) | Browser / config storage (`lib/storage.ts` → `localStorage`) | UI owns the flow; `localStorage` owns persistence; the key is config, not registry data. |
| Theme system (SHELL-04) | Browser / UI surface (`ui/ThemeProvider.tsx`) | Browser / config storage (`localStorage` + `matchMedia`) + `index.html` blocking script | Initial paint owned by the inline script (pre-React); runtime switching owned by ThemeProvider; CSS variables on `:root` are the contract every later phase inherits. |
| Cache-key derivation (LOOP-02) | Browser / registry (`registry/cacheKey.ts`) | Web Crypto (`crypto.subtle`) | Pure async function; depends only on the platform crypto primitive. No DOM, no storage. |
| IndexedDB init + probe + fallback (LOOP-03) | Browser / storage (`registry/db.ts`, `registry/registry.ts`) | In-memory `Map` (degraded path) | Storage tier owns durability + the availability probe; the `Map` fallback keeps the same async interface so the UI never branches on availability. |
| Gated logger (HYGIENE-04) | Browser / cross-cutting lib (`lib/logger.ts`) | — | A single chokepoint so no other module calls `console.*`. |
| Anthropic egress stub (HYGIENE-05) | Browser / host boundary (`host/modelClient.ts`) | External: `api.anthropic.com` (NOT called in Phase 1) | The single outbound edge; isolating it makes every network-hygiene rule a one-file invariant. Phase 1 ships header assembly only. |
| Lexicon hygiene gate (HYGIENE-03) | Build/test tooling (`src/hygiene.test.ts`) | Filesystem scan of `src/` + config | Static analysis, not runtime; runs in the test process via Node `fs`. |
| CSP (SEC-04) | Static asset (`index.html` meta tag) | — | Delivered at document load; no server. Defense-in-depth containment of the network edge. |

**Planner sanity check:** No capability belongs in a backend/API tier — there is no server (REQUIREMENTS.md "Out of Scope"). Do **not** create tasks that assume a Node/Express layer, a build-time data fetch, or SSR. The `modelClient.ts` is the only module that names an external host, and in Phase 1 it must not perform I/O.

## Standard Stack

All versions below were verified **live against the npm registry on 2026-06-24** in this session. The CONTEXT.md floors (`Vite 6+`, `TS 5.7+`) remain satisfied; the live floors have moved up and are noted where the planner must act.

### Core

| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `react` | `19.2.7` | Host app rendering | `[VERIFIED: npm view react version → 19.2.7, modified 2026-06-23]` Matches STACK.md. Version-lock with react-dom (D-02). |
| `react-dom` | `19.2.7` | `createRoot` rendering | `[VERIFIED: npm registry]` Must match `react` exactly (D-02). |
| `typescript` | `6.0.3` | Strict host typing | `[VERIFIED: npm registry]` TS 6 is current; CONTEXT floor is `5.7+`. Use `strict: true` (D-01). |
| `vite` | `8.1.0` | Dev server + prod bundler | `[VERIFIED: npm registry]` CONTEXT floor `6+`; 8.1.0 satisfies it. Required ≥6 by Vitest 4. |
| `@vitejs/plugin-react` | `6.0.3` | Host JSX / Fast-Refresh (automatic runtime) | `[VERIFIED: npm registry]` Compiles host `.tsx` only; NOT generated code (D-47). |
| `idb` | `8.0.3` | Typed promise wrapper over IndexedDB | `[VERIFIED: npm registry]` `DBSchema` typing for apps/widgets/handlers (D-20, D-21). |
| `@babel/standalone` | pin `^7.26` | Runtime JSX transpile (Phase 2+); installed now per D-03 | `[VERIFIED: npm view @babel/standalone version → 8.0.2 is latest]` **Pin `^7.26`** (not 8.x) to keep the classic-runtime default Phase 2 needs. **Not exercised in Phase 1.** `[CITED: babeljs.io v8-migration — preset-react default flips to automatic in v8]` |

### Supporting

| Library | Version (verified) | Purpose | When to Use |
|---------|--------------------|---------|-------------|
| `@types/react` | `19.2.17` | React types | `[VERIFIED: npm registry]` Pair with React 19 (D-02). devDep. |
| `@types/react-dom` | `19.2.3` | react-dom types | `[VERIFIED: npm registry]` devDep. |
| `vitest` | `4.1.9` | Test runner | `[VERIFIED: npm registry]` **Vitest 4** — see Pitfall 1 (no auto-install of jsdom; requires Vite ≥6 / Node ≥20, both satisfied). devDep. |
| `@vitest/ui` | `4.1.9` | Test UI | `[VERIFIED: npm registry]` Match vitest version (D-05). devDep. |
| `jsdom` | `29.1.1` | DOM environment for component/theme tests | `[VERIFIED: npm registry]` Must be an explicit devDep under Vitest 4. **Does not implement IndexedDB, `navigator.storage`, or `matchMedia`** — see Pitfalls. |
| `lucide-react` | `1.21.0` | Neutral SVG icon set (Claude's discretion) | `[VERIFIED: npm registry]` UI-SPEC §1 names exact icons (Cloud, Calculator, NotebookPen, Timer, ArrowLeftRight, ChefHat, CalendarDays, Wallet) + AppBar (User, Sun, Moon, Monitor, CheckCircle2). |
| `fake-indexeddb` | `6.2.5` | IndexedDB polyfill for `registry.test.ts` | `[VERIFIED: npm registry]` Import `fake-indexeddb/auto` in test setup; jsdom has no IndexedDB. `[CITED: github.com/dumbmatter/fakeIndexedDB]` devDep. |
| `@testing-library/react` | `16.3.2` | Component render/query for theme + KeyDialog tests | `[VERIFIED: npm registry]` Optional but standard for the theme test and any KeyDialog interaction test. devDep. |
| `@testing-library/jest-dom` | `6.9.1` | DOM matchers (`toHaveAttribute`, etc.) | `[VERIFIED: npm registry]` Optional; eases theme assertions on `data-theme`. devDep. |
| `@testing-library/user-event` | `14.6.1` | User-interaction simulation for KeyDialog | `[VERIFIED: npm registry]` Optional; only if interaction tests are added beyond the 5 required. devDep. |

> Note on `@testing-library/jest-dom`: the package name contains "jest" but it is the de-facto matcher library for Vitest too (Vitest is Jest-API-compatible). The name appears only in `package.json`/imports, never in a devtools-visible surface, so it does not affect the lexicon gate. (The lexicon gate scans `src/` and project config, not `node_modules`.)

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jsdom (D-05, locked) | happy-dom | happy-dom does **not** hit the `crypto.subtle` jsdom bug and is faster, but D-05 locks jsdom. The cleaner fix is per-file Node environment for the crypto test (see Pitfall 2), keeping jsdom for DOM tests as locked. Do not swap. |
| Vitest hygiene test (D-42, preferred) | `scripts/hygiene-check.sh` | D-38 allows either; D-42 prefers Vitest (cross-platform, no shell dependency, runs in `npm run test`). Recommend the Vitest test. |
| Plain CSS (D-07) | CSS Modules / Tailwind | D-07 permits CSS Modules; Tailwind allowed only if DOM classes stay neutral. Plain CSS in `src/index.css` with the variable block from UI-SPEC is the lowest-fingerprint choice and is recommended. |
| `@babel/standalone@^7.26` (D-03) | `@babel/standalone@8.0.2` with explicit `runtime:"classic"` | Both work, but `^7.26` keeps classic as the *default* so a future careless edit can't flip it. Phase 1 does not transpile, so this is purely a Phase-2 safety pin. Follow D-03. |

**Installation:**
```bash
# Runtime deps
npm install react@^19.2 react-dom@^19.2 idb@^8 @babel/standalone@^7.26 lucide-react@^1

# Dev deps (host build + types + test)
npm install -D vite@^8 @vitejs/plugin-react@^6 typescript@^6 \
  vitest@^4 @vitest/ui@^4 jsdom@^29 fake-indexeddb@^6 \
  @types/react@^19 @types/react-dom@^19 \
  @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```

> `@babel/standalone@^7.26` is installed as a **runtime** dep (D-03) even though Phase 1 never calls it — Phase 2 eager-loads it. Do not move it to devDependencies.

## Architecture Patterns

### System Architecture Diagram

Data flow for the three live Phase 1 interactions (no network edge is exercised — the Anthropic boundary is drawn dashed because it is a stub):

```
                         ┌─────────────────────────── index.html ───────────────────────────┐
   page load ──────────► │ CSP meta tag (SEC-04)                                              │
                         │ FOUC blocking <script>: read localStorage 'marketplace.theme'      │
                         │   → set <html data-theme="light|dark"> BEFORE React mounts         │
                         └───────────────────────────────┬───────────────────────────────────┘
                                                         ▼
                                            src/main.tsx → React createRoot
                                                         ▼
                  ┌──────────────────────────────── App.tsx ────────────────────────────────┐
                  │  ThemeProvider (reads marketplace.theme, matchMedia listener for system) │
                  │   └─► applies data-theme on :root at runtime on toggle                   │
                  │                                                                            │
                  │  ┌── AppBar ──────────────┐        ┌── Marketplace (grid) ──────────────┐ │
                  │  │ theme toggle (cycle)   │        │ APP_REGISTRY[] → .app-card buttons │ │
                  │  │ Account btn → KeyDialog │        │ click → local "Opening…" stub      │ │
                  │  └──────────┬─────────────┘        └────────────────────────────────────┘ │
                  └─────────────┼──────────────────────────────────────────────────────────────┘
                                ▼
         ┌─ KeyDialog (set/change/clear) ─┐
         │ validate ^sk-ant-              │   write/read/delete
         │ type="password" input          │ ───────────────────► localStorage 'marketplace.apiKey'
         └────────────────────────────────┘                       (lib/storage.ts constants)

   ── App init (parallel, non-blocking the paint) ──────────────────────────────────────────────
   registry.ts: openDB("MarketplaceRegistry", 1) ──► probe put/delete on 'apps' (__probe__)
        │ probe ok  ─────────────────────────────► use IndexedDB ; navigator.storage?.persist()
        │ probe throws ──────────────────────────► degrade to Map<string,*> per store
        └──► resolve dbReady: Promise<void>   (all future get/put/delete await this)

   cacheKey(input): normalize(NFC→lower→trim→collapse) → crypto.subtle.digest(SHA-256) → 64-hex
        (pure; used by Phase 2+; Phase 1 ships + tests it only)

   host/modelClient.ts  buildHeaders(key) → {content-type, x-api-key, anthropic-version,
        anthropic-dangerous-direct-browser-access}      ┄┄┄┄┄► api.anthropic.com  (STUB — no fetch)

   lib/logger.ts  gate = !!localStorage.getItem('debug') @ load → info/warn/error or no-op
```

### Recommended Project Structure

This matches D-06 verbatim, with the **test-infrastructure additions** the planner must include (greenfield — none of this exists yet):

```
.
├── index.html                    # CSP meta (D-43) + FOUC script (UI-SPEC §FOUC) + #root
├── package.json
├── tsconfig.json                 # strict:true (D-01)
├── tsconfig.node.json            # for vite.config typing (standard Vite split)
├── vite.config.ts                # build.sourcemap:false, minify, target es2020 (D-45) + test config
├── src/
│   ├── main.tsx                  # createRoot(#root).render(<App/>)
│   ├── App.tsx                   # ThemeProvider > AppBar + Marketplace ; kicks registry init
│   ├── index.css                 # CSS variable block (UI-SPEC §CSS Variable Contract) + layout
│   ├── host/
│   │   └── modelClient.ts        # buildHeaders stub + constants (D-34..D-37)
│   ├── registry/
│   │   ├── cacheKey.ts           # SHA-256 opaque key (D-24..D-27)
│   │   ├── db.ts                 # idb DBSchema + openDB + upgrade (D-20, D-21)
│   │   ├── registry.ts           # init+probe+fallback, dbReady, get/put/delete (D-22, D-23)
│   │   ├── cacheKey.test.ts      # ← @vitest-environment node  (D-28)
│   │   └── registry.test.ts      # uses fake-indexeddb/auto      (specifics #2)
│   ├── ui/
│   │   ├── Marketplace.tsx       # storefront grid (SHELL-01) + APP_REGISTRY
│   │   ├── AppBar.tsx            # account btn + theme toggle (SHELL-03/04)
│   │   ├── KeyDialog.tsx         # 3-flow key UX (SHELL-03)
│   │   ├── ThemeProvider.tsx     # CSS var injection + matchMedia (SHELL-04)
│   │   ├── SkeletonCard.tsx      # stub for Phase 3 (UI-SPEC §4)
│   │   ├── ErrorBoundary.tsx     # stub class component (Claude's discretion)
│   │   └── theme.test.tsx        # data-theme application (specifics #4)
│   ├── lib/
│   │   ├── logger.ts             # gated logger (D-29..D-32)
│   │   ├── storage.ts            # localStorage key constants (neutral)
│   │   └── logger.test.ts        # silent-by-default + prefix (D-33)
│   ├── hygiene.test.ts           # lexicon gate (D-38..D-42)
│   └── test/
│       └── setup.ts              # matchMedia stub + fake-indexeddb/auto + jest-dom (Wave 0)
└── APP_REGISTRY  ─ lives in Marketplace.tsx or a small src/registry data module (neutral)
```

> `APP_REGISTRY` placement: keep it co-located in `Marketplace.tsx` or a tiny `src/data/appRegistry.ts` (neutral filename) — NOT under `registry/` which is the cache-key/IndexedDB module and would conflate "app type catalog" with "produced-asset registry." UI-SPEC §1 supplies the 8 rows verbatim.

### Pattern 1: Opaque cache key (normalize → SHA-256 → hex)

**What:** Deterministic, Unicode-safe, opaque 64-hex key from a normalized input string.
**When to use:** `cacheKey.ts` (D-24). Verified working in Node this session.
```typescript
// Source: D-25/D-26 + verified live (Node 23.11.0, this session). Web Crypto: MDN SubtleCrypto.
// neutral identifier: cacheKey (not "generate*"). No btoa anywhere.
export async function cacheKey(input: string): Promise<string> {
  const normalized = input.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
  const bytes = new TextEncoder().encode(normalized);            // Uint8Array
  const digest = await crypto.subtle.digest("SHA-256", bytes);   // ArrayBuffer
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```
> Passing the `Uint8Array` directly is correct (TS DOM lib types `digest` as `BufferSource`; `Uint8Array` satisfies it). This also sidesteps the jsdom `ArrayBuffer`-identity bug — but the test must still run under the Node environment (Pitfall 2).

### Pattern 2: idb DBSchema + openDB with upgrade

**What:** Typed three-store schema, created in a single `upgrade` callback.
**When to use:** `db.ts` (D-20, D-21).
```typescript
// Source: idb@8 README (jakearchibald/idb) — DBSchema + openDB upgrade pattern. [CITED]
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface RegistrySchema extends DBSchema {
  apps:     { key: string; value: AppRecord };
  widgets:  { key: string; value: WidgetRecord };
  handlers: { key: string; value: HandlerRecord };
}
// Phase 1 may type records minimally (e.g. `Record<string, unknown>`) — full shapes land in Phase 2.

export function openRegistry(): Promise<IDBPDatabase<RegistrySchema>> {
  return openDB<RegistrySchema>("MarketplaceRegistry", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("apps"))     db.createObjectStore("apps");
      if (!db.objectStoreNames.contains("widgets"))  db.createObjectStore("widgets");
      if (!db.objectStoreNames.contains("handlers")) db.createObjectStore("handlers");
    },
  });
}
```

### Pattern 3: Probe-write + fire-and-forget persist + Map fallback + dbReady gate

**What:** Detect storage availability at startup; degrade to an in-memory `Map` with the identical async interface; expose a `dbReady` promise everything awaits.
**When to use:** `registry.ts` (D-22, D-23).
```typescript
// Source: D-22 sequence + research/PITFALLS.md Pitfall 4. navigator.storage guarded per jsdom gap.
let storageAvailable = true;
const memApps = new Map<string, unknown>();
// (widgets/handlers maps analogous)

export const dbReady: Promise<void> = (async () => {
  try {
    const db = await openRegistry();
    await db.put("apps", { __probe: true }, "__probe__");  // probe write
    await db.delete("apps", "__probe__");                  // probe cleanup
    _db = db;
  } catch {
    storageAvailable = false;                              // private mode / zero quota
  }
  // fire-and-forget; guarded because jsdom (and some browsers) lack navigator.storage
  if (typeof navigator !== "undefined" && navigator.storage?.persist) {
    void navigator.storage.persist();
  }
})();

// Single async interface — callers never branch on storageAvailable (D-23)
export async function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  await dbReady;
  return storageAvailable ? _db!.get(store, key) : (mapFor(store).get(key) as T | undefined);
}
// put/delete analogous
```
> The `navigator.storage?.persist` guard (`typeof ... === "function"` or optional chaining) is **required** — jsdom does not implement `navigator.storage`, and the unguarded call from D-22 would throw in `registry.test.ts`. This guard does not weaken the production behavior (real browsers have it).

### Pattern 4: Gated logger (read gate once at module load)

**What:** No-op logger unless `localStorage.debug` is truthy at load; neutral `[Marketplace]` prefix.
**When to use:** `logger.ts` (D-29..D-32). Every other module imports this; no direct `console.*`.
```typescript
// Source: D-30/D-31. Gate fixed for the session (no live toggle). Neutral copy only.
const enabled = (() => {
  try { return !!localStorage.getItem("debug"); } catch { return false; }
})();
const PREFIX = "[Marketplace]";
export const logger = {
  info:  (m: string, ...d: unknown[]) => { if (enabled) console.info(PREFIX, m, ...d); },
  warn:  (m: string, ...d: unknown[]) => { if (enabled) console.warn(PREFIX, m, ...d); },
  error: (m: string, ...d: unknown[]) => { if (enabled) console.error(PREFIX, m, ...d); },
};
```
> The gate read is wrapped in try/catch because `localStorage` access can throw under strict privacy settings. The API key is never passed to this logger (D-13/D-37).

### Pattern 5: Theme application (FOUC script + runtime provider + matchMedia)

**What:** Inline script sets `data-theme` before paint; ThemeProvider re-applies on toggle and listens to `prefers-color-scheme` in system mode.
**When to use:** `index.html` (verbatim FOUC script from UI-SPEC §FOUC) + `ThemeProvider.tsx` (D-16, D-18, D-19).
```typescript
// Source: D-16/D-18 + UI-SPEC §Theme Application. matchMedia listener uses addEventListener('change').
function applyTheme(stored: "light" | "dark" | "system") {
  const dark = stored === "dark"
    || (stored === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}
// In ThemeProvider effect, when mode === "system":
//   const mq = window.matchMedia("(prefers-color-scheme: dark)");
//   mq.addEventListener("change", onChange); return () => mq.removeEventListener("change", onChange);
```

### Pattern 6: Lexicon hygiene gate as a Vitest test

**What:** Walk `src/` (+ index.html), read each file, fail if any banned token matches in a devtools-visible context.
**When to use:** `hygiene.test.ts` (D-38..D-42, preferred over shell per D-42).
```typescript
// Source: D-39/D-40 token set. Uses Node fs; excludes node_modules and *.test.* self-matches.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const BANNED: RegExp[] = [
  /synthesi[sz]/i,            // synthesize/synthesized/synthesis
  /\bfake\b/i,
  /\bmock\b/i,                // (test-framework "mock" lives in node_modules, not scanned)
  /\bAI\b/,                   // exact word, case-sensitive boundary
  /\bllm\b/i,
  // user-facing generate* — see D-40 exception: allowed only in internal identifiers.
  // Strategy: flag generate* in CSS files, *.html, and string literals / comments.
];
// Walk src/, skip node_modules, *.snap; for *.css and *.html also flag /\bgenerat(e|ed|ing)\b/i.
```
> **Planner note on the `generate` exception (D-40):** the simplest robust gate scans all of `src/` with the always-banned set, AND additionally scans `*.css`, `index.html`, and any `*.copy.ts`/string-literal context for the `generate*` family. A pragmatic Phase-1 implementation: since Phase 1 ships **no** internal `generate*` identifier (cacheKey is the key fn, not `generateCacheKey`), the gate may ban `generate*` everywhere in `src/` for Phase 1 and relax later. Document this so Phase 2 (which may introduce `generateApp` internally) knows to add the context-aware carve-out. **This is the one place the gate's precision is a judgment call — call it out in the plan.**

### Anti-Patterns to Avoid

- **`btoa`-based cache key:** throws on emoji/CJK (`InvalidCharacterError`), collides on slice, partially readable (hygiene leak). Use SHA-256 hex (D-27, Pattern 1). `[CITED: research/PITFALLS.md Pitfall 4]`
- **Running `cacheKey.test.ts` in jsdom:** `crypto.subtle.digest` throws a `TypeError` under jsdom (vitest #5365). Route the file to the Node environment. `[CITED: github.com/vitest-dev/vitest/issues/5365]`
- **Unguarded `navigator.storage.persist()`:** throws in jsdom (no `navigator.storage`). Guard it (Pattern 3).
- **Production sourcemaps:** expose comments + symbol names → breaks the illusion. `sourcemap: false` is the master switch (D-04). `[CITED: research/PITFALLS.md Pitfall 5 vector #3]`
- **Direct `console.*` calls:** every log must go through `lib/logger.ts` (D-29).
- **Conflating the two JSX runtimes:** host uses automatic (`@vitejs/plugin-react`, D-47); generated code (Phase 2) uses classic Babel. Never share config. (Not exercised in Phase 1 but the scaffold must keep them separate.)
- **Prepending the type slug to the hash output:** the slug goes *into* the hashed input, not onto the result (D-27).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | A JS hash implementation | `crypto.subtle.digest("SHA-256", …)` | Native, constant-time, Unicode-safe via `TextEncoder`; verified this session. `[VERIFIED]` |
| IndexedDB transactions/upgrades | Raw `indexedDB.open` + event callbacks | `idb@8` `openDB` + `DBSchema` | Removes the `onsuccess`/`onupgradeneeded`/transaction-autoclose footgun class. `[CITED: STACK.md]` |
| IndexedDB in tests | A hand-written IndexedDB shim | `fake-indexeddb/auto` | jsdom has no IndexedDB; this is the standard spec-compliant polyfill. `[CITED: dumbmatter/fakeIndexedDB]` |
| `matchMedia` in tests | A bespoke media-query faker | A small `vi.fn()` stub in `src/test/setup.ts` (or `vitest-matchmedia-mock`) | jsdom doesn't implement `matchMedia`; a 6-line stub covers it. `[CITED: vitest #821]` |
| Icon set | Custom SVG sprites | `lucide-react` | Tree-shakeable, neutral names, exact icons named in UI-SPEC §1. `[VERIFIED: npm]` |
| Test runner / DOM env | Custom harness | `vitest@4` + `jsdom@29` | D-05 locks this; mature, Vite-native. `[VERIFIED: npm]` |
| CSP delivery | A service worker / meta-rewriter | Static `<meta http-equiv>` in `index.html` | No server (client-only); the meta tag is the supported no-backend mechanism. `[CITED: D-43, MDN CSP]` |

**Key insight:** Every "complex" piece of Phase 1 is a thin wrapper over a native browser primitive (Web Crypto, IndexedDB, `matchMedia`, CSP). The only genuinely custom code is the **policy** around them — opacity, gating, probe-fallback, neutral naming — which is exactly what the locked decisions specify. Hand-rolling the primitives themselves is where teams introduce Unicode bugs, transaction leaks, and flaky tests.

## Common Pitfalls

### Pitfall 1: Vitest 4 environment + dependency changes

**What goes wrong:** Tests fail to start, or the DOM environment silently isn't loaded.
**Why it happens:** Vitest 4 (4.1.9, current) **stopped auto-installing the DOM environment** — `jsdom` must be an explicit devDependency, or `environment: "jsdom"` errors at startup. Vitest 4 also **requires Vite ≥ 6 and Node ≥ 20** (we have Vite 8.1.0 + Node 23.11.0 — satisfied), and replaced the `workspace` config with a `projects` array (not needed here — single project).
**How to avoid:** Install `jsdom` explicitly (already in the install block). Set the default `test.environment` in `vite.config.ts`. Do **not** create a `vitest.workspace.ts`.
**Warning signs:** "Cannot find package 'jsdom'" at test start; or `environment` errors after upgrade.
`[CITED: qaskills.sh/blog/vitest-4-migration-guide; main.vitest.dev/guide/migration]`

### Pitfall 2: `crypto.subtle.digest` throws TypeError in jsdom (affects `cacheKey.test.ts`)

**What goes wrong:** `cacheKey()` works in the app but its test throws `Failed to execute 'digest' on 'SubtleCrypto': 2nd argument is not instance of ArrayBuffer, Buffer, TypedArray, or DataView` when run under jsdom.
**Why it happens:** Vitest's jsdom environment key-shim (`jsdom-keys.ts`) replaces the global `ArrayBuffer`, so Node's WebCrypto validator no longer recognizes the `Uint8Array`'s buffer as a valid `ArrayBuffer`. The issue (vitest #5365) is **closed as not-planned** — there is no upstream fix coming.
**How to avoid (recommended):** Add `// @vitest-environment node` as the first line of `cacheKey.test.ts`. The pure function has no DOM dependency, so the Node environment is correct and `globalThis.crypto.subtle.digest(Uint8Array)` works (verified this session: 64-hex, deterministic, normalization-stable, emoji-safe). Alternative: polyfill `globalThis.crypto` in setup, but the per-file pragma is cleaner and is the documented escape hatch.
**Warning signs:** The digest TypeError only in tests; the app runs fine.
`[CITED: github.com/vitest-dev/vitest/issues/5365]` `[VERIFIED: Node 23.11.0 run this session]`

### Pitfall 3: jsdom has no IndexedDB and no `navigator.storage` (affects `registry.test.ts`)

**What goes wrong:** `registry.test.ts` throws on `openDB` (no `indexedDB` global) and on the D-22 `navigator.storage.persist()` call.
**Why it happens:** jsdom deliberately omits IndexedDB and the Storage Manager API.
**How to avoid:** (1) Import `fake-indexeddb/auto` at the top of the test or in `src/test/setup.ts` to install spec-compliant IndexedDB globals. (2) Guard the `persist()` call in production code (Pattern 3) so it no-ops when `navigator.storage` is absent. (3) To test the **fallback path**, delete/undefine `indexedDB` (or make `openDB` reject) in a test case and assert the `Map` path serves reads/writes through the same async interface.
**Warning signs:** "indexedDB is not defined"; "Cannot read properties of undefined (reading 'persist')".
`[CITED: github.com/dumbmatter/fakeIndexedDB; jsdom limitations]`

### Pitfall 4: jsdom has no `window.matchMedia` (affects `theme.test.tsx` and ThemeProvider)

**What goes wrong:** `ThemeProvider` (and the FOUC logic) call `window.matchMedia(...)`, which throws `window.matchMedia is not a function` under jsdom.
**Why it happens:** jsdom does not implement `matchMedia`.
**How to avoid:** Stub it in `src/test/setup.ts` with a `vi.fn()` returning `{ matches, media, addEventListener, removeEventListener, addListener, removeListener, dispatchEvent, onchange }`. To assert system-mode behavior, control `matches` per test (e.g., return `true` to simulate `prefers-color-scheme: dark`).
**Warning signs:** "window.matchMedia is not a function" the first time a theme test renders the provider.
`[CITED: github.com/vitest-dev/vitest/issues/821; rebeccamdeprey.com matchMedia mock]`

### Pitfall 5: CSP `'unsafe-eval'` vs. the no-`eval` security posture (apparent contradiction)

**What goes wrong:** A reviewer flags `script-src 'unsafe-eval'` as a security regression.
**Why it happens:** `'unsafe-eval'` is required for `new Function()`/`@babel/standalone` in Phase 2+, so D-43 sets it now to lock the final CSP. In Phase 1 nothing evals, so it looks gratuitous.
**How to avoid:** Document in `index.html` (neutrally) that `'unsafe-eval'` is reserved for the runtime compile path arriving in a later phase; the **real containment is `connect-src`** (key exfiltration). Do not drop `'unsafe-eval'` and re-add it later — that churns the CSP and risks an inconsistent intermediate. Keep the CSP exactly as D-43 specifies.
**Warning signs:** A PR comment proposing to tighten `script-src`; a later phase breaking because `'unsafe-eval'` was removed.
`[CITED: D-43; research/STACK.md CSP note]`

### Pitfall 6: The lexicon gate matching itself / false positives

**What goes wrong:** `hygiene.test.ts` fails on its own banned-token regex literals, or on legitimate substrings (`maintain` matching a naive `AI` pattern, `mockup` matching `mock`).
**Why it happens:** The gate file necessarily contains the banned strings as regexes; word-boundary patterns matter (`\bAI\b` not `/AI/`).
**How to avoid:** (1) Exclude the gate file itself and `node_modules` from the scan. (2) Use word boundaries: `\bAI\b` (case-sensitive so it matches "AI" but not "air"/"maintain"), `\bmock\b`, `\bfake\b`, `\bllm\b`. (3) `synthesi[sz]` is safe to match anywhere (no benign English word contains it in this codebase). (4) Decide the `generate*` precision per Pattern 6.
**Warning signs:** The gate is red on a clean tree; or green while an obvious leak exists (boundary too loose/tight).
`[CITED: D-39/D-40; research/PITFALLS.md Pitfall 5]`

### Pitfall 7: API key leaking into a log, error, or serialized object

**What goes wrong:** The raw `sk-ant-…` string ends up in a console line, an `Error.message`, or a `JSON.stringify` of headers.
**Why it happens:** Convenience logging during build-out; an error path that includes the request config.
**How to avoid:** (1) `buildHeaders` receives the key at call time, never stores it module-level (D-37). (2) Never pass the key to `logger.*`. (3) Format-validation errors (D-14) must say "Invalid access key format" — never echo the value. (4) A focused test can assert `buildHeaders`'s thrown errors (if any) and the logger never contain a `sk-ant-` substring.
**Warning signs:** Any `logger.info("headers", headers)`; any `throw new Error(\`... ${apiKey}\`)`.
`[CITED: research/PITFALLS.md Pitfall 2; D-13/D-37]`

## Code Examples

### Vite config with strict build hygiene + Vitest test block

```typescript
// vite.config.ts — Source: D-45/D-47 + Vitest 4 config (vitest.dev/config). [CITED]
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],                 // automatic JSX runtime for the HOST app (D-47)
  build: {
    sourcemap: false,                 // MASTER hygiene switch — never flip to true (D-04/D-45)
    minify: true,                     // mangle internal names out of the shipped bundle
    target: "es2020",                 // crypto.subtle, IndexedDB, modern JS floor (D-45)
  },
  test: {
    environment: "jsdom",             // default; cacheKey.test.ts overrides to node per-file
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
```

### Shared test setup (Wave 0)

```typescript
// src/test/setup.ts — Source: Pitfalls 3 & 4. [CITED]
import "fake-indexeddb/auto";                 // installs indexedDB globals for registry.test.ts
import "@testing-library/jest-dom/vitest";    // DOM matchers (optional but recommended)
import { vi } from "vitest";

// jsdom has no matchMedia — provide a controllable stub.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,                            // override per-test for system-dark scenarios
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

### tsconfig strict floor

```jsonc
// tsconfig.json — Source: D-01 (strict:true) + es2020 floor (D-45). [CITED]
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],   // DOM for crypto.subtle/IndexedDB/matchMedia types
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",                          // automatic runtime for host (matches D-47)
    "strict": true,
    "noUncheckedIndexedAccess": true,            // recommended for registry Map access safety
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### Anthropic egress stub (header assembly only — no fetch in Phase 1)

```typescript
// src/host/modelClient.ts — Source: D-35/D-36/D-37. STUB: assembles headers, does not call.
export const ANTHROPIC_API_BASE = "https://api.anthropic.com";
export const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

// Key received at call time; never stored module-level; never logged (D-37).
export function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

// Phase 3 will enforce this at runtime; Phase 1 keeps it as the single-egress assertion seam.
export function assertAnthropicTarget(url: string): void {
  // Phase 1 stub — Phase 3 throws if origin !== ANTHROPIC_API_BASE
  // const { origin } = new URL(url); if (origin !== ANTHROPIC_API_BASE) throw new Error("blocked target");
  void url;
}
```
> `anthropic-dangerous-direct-browser-access: true` is **mandatory** for browser→Anthropic CORS (verified across STACK.md, PITFALLS.md, and the Simon Willison writeup). Setting it now locks the correct header set for Phase 3. `[CITED: simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vitest auto-installs jsdom | Vitest 4 requires explicit `jsdom` devDep + Vite ≥6 / Node ≥20 | Vitest 4.0 | Add `jsdom` to devDeps (done); no `vitest.workspace.ts`. |
| Babel preset-react default = classic | Babel 8 default = automatic runtime | Babel 8.0 | Pin `@babel/standalone@^7.26` (D-03) so Phase 2's classic-runtime assumption holds by default. |
| `btoa`/base64 cache keys | `crypto.subtle.digest` SHA-256 hex | (project decision) | Unicode-safe, opaque, collision-resistant (D-26/D-27). |
| CRA / webpack host build | Vite 8 SPA | Vite is the current standard | Faster HMR, native ESM, precise sourcemap control for the hygiene rule. |
| `addListener`/`removeListener` on MediaQueryList (deprecated) | `addEventListener("change", …)` | Modern browsers | Use the EventTarget API in ThemeProvider (Pattern 5). |

**Deprecated/outdated:**
- `MediaQueryList.addListener`/`removeListener`: deprecated; use `addEventListener("change")`. The matchMedia stub keeps both for safety, but production code uses the EventTarget form.
- `@babel/standalone@8` default presets for this project: would flip to automatic runtime and break Phase 2 instantiation. Pin `^7.26`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Routing `cacheKey.test.ts` to the Node environment is acceptable (the function is pure, no DOM) | Pitfall 2 | If the team requires *all* tests in one environment, they'd instead polyfill `crypto` in setup — same outcome, different mechanism. Low risk; both work. |
| A2 | `lucide-react@1.x` (1.21.0) is a stable major and exposes the icon names in UI-SPEC §1 (Cloud, Calculator, NotebookPen, Timer, ArrowLeftRight, ChefHat, CalendarDays, Wallet, User, Sun, Moon, Monitor, CheckCircle2) | Standard Stack | If a name differs in 1.x, swap to the nearest neutral icon (Claude's discretion per CONTEXT). Verify at install with a quick import. Low risk. |
| A3 | The `generate*` lexicon carve-out (D-40) can be deferred: Phase 1 ships no internal `generate*` identifier, so the gate may ban `generate*` repo-wide for Phase 1 | Pattern 6 | If a planner introduces an internal `generate*` name in Phase 1, the gate would false-positive. Mitigated by recommending neutral names (`cacheKey`, `resolve`, `build`). |
| A4 | Phase 1 needs no router (single-screen storefront + modal dialog) | Architecture | If later navigation is wanted, a router is added in a later phase; Phase 1 is intentionally one screen (SHELL-01..04). Low risk — matches REQUIREMENTS scope. |
| A5 | `@testing-library/*` packages are optional helpers; the 5 required tests can be written with Vitest + jsdom alone, but Testing Library makes theme/KeyDialog assertions cleaner | Standard Stack | If the team wants zero extra deps, the theme test can assert `document.documentElement.getAttribute("data-theme")` with no Testing Library. Low risk; recommended for ergonomics. |

## Open Questions

1. **Where does `APP_REGISTRY` physically live, and is its `icon` field a Lucide component name (string) or an imported component?**
   - What we know: D-09 types it as `{ id; displayName; description; icon: string }`; UI-SPEC §1 maps each id to a named Lucide icon.
   - What's unclear: `icon: string` (D-09) implies a string key, but Lucide is imported as components. Recommendation: keep `icon` as a Lucide icon **component reference** in the card-render layer (a `Record<id, LucideIcon>` map in `Marketplace.tsx`), while the serializable `APP_REGISTRY` data keeps `icon` as a neutral string id if it must be data-only. Either satisfies D-09; the component-map approach is simpler and tree-shakes. **Planner decides; both are neutral.**

2. **Hygiene gate scope — does it scan `index.html` and `vite.config.ts`, or only `src/`?**
   - What we know: D-40 lists CSS, `data-*`, string literals, comments. `index.html` carries the CSP and FOUC script (both neutral by design) and the `<title>`.
   - What's unclear: whether config/HTML are in scope.
   - Recommendation: scan `src/**` + `index.html` (the only other devtools-visible authored surface). Exclude `node_modules`, `dist`, and the gate file itself. State this explicitly in the test.

3. **Does the `registry.test.ts` fallback case need to exercise a *real* probe failure, or is forcing `storageAvailable=false` sufficient?**
   - What we know: D-22 sets the flag on probe throw; D-23 requires identical interface.
   - Recommendation: test both — (a) happy path via `fake-indexeddb`, (b) fallback by making `openDB`/probe reject (e.g., stub `openRegistry` to throw) and asserting `get/put/delete` round-trip through the `Map`. This is the load-bearing LOOP-03 behavior.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vite build, Vitest 4 (needs ≥20) | ✓ | 23.11.0 | — |
| npm | Dependency install | ✓ | 10.9.2 | — |
| git | Branching/commits (phase strategy) | ✓ | 2.33.0 | — |
| Anthropic API | NOT needed in Phase 1 (no call) | n/a | — | Stub only (D-34) — no live key required to complete Phase 1 |
| Browser with Web Crypto / IndexedDB | Runtime (manual verification) | ✓ (any evergreen) | — | `Map` fallback for IndexedDB (D-22); Web Crypto is mandatory (es2020 floor) |

**Missing dependencies with no fallback:** None. Node 23.11.0 satisfies Vitest 4's ≥20 floor; Vite 8.1.0 satisfies the ≥6 floor.

**Missing dependencies with fallback:** None blocking. The Anthropic key is intentionally not required in Phase 1 (egress is a stub).

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` — this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 + jsdom 29.1.1 (`@vitest/ui` 4.1.9) |
| Config file | `vite.config.ts` `test` block — **does not exist yet (greenfield) → Wave 0** |
| Quick run command | `npx vitest run <file>` (single file, < 5s) |
| Full suite command | `npm run test` (alias for `vitest run`, includes the hygiene gate) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| LOOP-02 | Determinism, normalization equivalence, 64-hex opacity, emoji-safe, distinct keys | unit | `npx vitest run src/registry/cacheKey.test.ts` | ❌ Wave 0 (needs `// @vitest-environment node`) |
| LOOP-03 | DB init + probe write/delete; in-memory `Map` fallback with identical async interface | unit/integration | `npx vitest run src/registry/registry.test.ts` | ❌ Wave 0 (needs `fake-indexeddb/auto`) |
| HYGIENE-04 | Logger silent by default; `[Marketplace]` prefix when `localStorage.debug` set | unit | `npx vitest run src/lib/logger.test.ts` | ❌ Wave 0 |
| SHELL-04 | Theme switching applies correct `data-theme` to `:root`; system mode reads matchMedia | component | `npx vitest run src/ui/theme.test.tsx` | ❌ Wave 0 (needs matchMedia stub) |
| HYGIENE-03 / 01 / 02 | Lexicon gate passes on Phase 1 source; banned tokens absent | static-scan | `npx vitest run src/hygiene.test.ts` | ❌ Wave 0 |
| HYGIENE-05 | `buildHeaders` returns the 4 correct headers; key never appears in a log/error | unit | `npx vitest run src/host/modelClient.test.ts` | ❌ Wave 0 (recommended, beyond the 5 required) |
| SHELL-01 | Storefront renders one `.app-card` per `APP_REGISTRY` row | component | `npx vitest run src/ui/Marketplace.test.tsx` | ❌ optional (manual verification acceptable) |
| SHELL-03 | KeyDialog set/change/clear writes/reads/clears `marketplace.apiKey`; `^sk-ant-` validation | component | `npx vitest run src/ui/KeyDialog.test.tsx` | ❌ optional (manual verification acceptable) |
| SEC-04 | CSP meta tag present with correct `connect-src` | manual / static | grep `index.html` for the CSP string | manual — static asset, no runtime behavior to assert |
| SHELL-02 (stub) | Card click shows "Opening…" then resets; no banned token logged | manual | visual check + covered by hygiene gate | manual — stub affordance, low value to automate |

> The **5 required tests** (CONTEXT specifics #4) are `cacheKey`, `registry`, `logger`, `theme`, `hygiene`. The `modelClient` header test is strongly recommended (HYGIENE-05/key-safety) and cheap. Marketplace/KeyDialog component tests are optional for Phase 1 — they exercise pure-presentational behavior already pinned by the UI-SPEC; manual verification is acceptable, but a render-count test for SHELL-01 is a low-cost add.

### Sampling Rate
- **Per task commit:** `npx vitest run <the file(s) the task touched>` (fast inner loop, < 5s).
- **Per wave merge:** `npm run test` (full suite incl. hygiene gate + typecheck `tsc --noEmit`).
- **Phase gate:** Full suite green **and** `vite build` succeeds with `sourcemap: false` (verify no `.map` in `dist/`) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `vite.config.ts` `test` block — framework config (does not exist; greenfield).
- [ ] `src/test/setup.ts` — matchMedia stub + `fake-indexeddb/auto` + jest-dom matchers (shared fixtures).
- [ ] `package.json` scripts: `"test": "vitest run"`, `"test:ui": "vitest --ui"`, `"typecheck": "tsc --noEmit"`, `"build": "vite build"`, `"dev": "vite"`.
- [ ] `src/registry/cacheKey.test.ts` — covers LOOP-02; **first line `// @vitest-environment node`**.
- [ ] `src/registry/registry.test.ts` — covers LOOP-03 (happy path + forced-fallback path).
- [ ] `src/lib/logger.test.ts` — covers HYGIENE-04.
- [ ] `src/ui/theme.test.tsx` — covers SHELL-04.
- [ ] `src/hygiene.test.ts` — covers HYGIENE-01/02/03 (scans `src/**` + `index.html`).
- [ ] `src/host/modelClient.test.ts` — covers HYGIENE-05 header assembly + key-safety (recommended).
- [ ] Framework install: the `npm install -D vitest@^4 @vitest/ui@^4 jsdom@^29 fake-indexeddb@^6 …` block.

## Security Domain

> `security_enforcement` is not set to `false` in config — this section is included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No accounts/auth in v1 (REQUIREMENTS Out of Scope). The API key is an activation credential, not user auth. |
| V3 Session Management | no | No server sessions; client-only. Config lives in `localStorage`. |
| V4 Access Control | no | Single-user, single-origin, no server-enforced authz. |
| V5 Input Validation | yes | API-key format check `^sk-ant-` (D-14) with a neutral inline error; no value echoed back. No other untrusted input in Phase 1 (no model output yet). |
| V6 Cryptography | yes | `crypto.subtle.digest` SHA-256 for opaque keys (D-26) — native, never hand-rolled. Note: key derivation here is for **cache opacity**, not secret protection; the API key is stored in plaintext `localStorage` by deliberate decision (D-11, Deferred: encryption-at-rest). |
| V7 Error Handling & Logging | yes | Gated logger off by default (D-30); neutral copy (D-32); API key never logged or in `Error.message` (D-13/D-37). |
| V12 / V14 Configuration (CSP) | yes | CSP meta tag (D-43): `connect-src 'self' https://api.anthropic.com` is the key-exfiltration containment; `sourcemap:false` (D-04) prevents internal-name disclosure. |

### Known Threat Patterns for a client-only browser SPA holding a user secret

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exfiltration to a third-party host | Information Disclosure | CSP `connect-src` allowlist (`'self' https://api.anthropic.com`) (D-43/SEC-04); single egress chokepoint (D-34). |
| API key leaking via logs / errors / serialization | Information Disclosure | No-log rule; key never stored module-level; never in `Error.message` (D-13/D-37); a test asserts no `sk-ant-` substring in logger/error output (Pitfall 7). |
| Mechanic disclosure via devtools (symbol/store/CSS/comment names) | Information Disclosure | Neutral naming everywhere; lexicon gate (HYGIENE-03); `sourcemap:false` (D-04). |
| Cross-origin data injection at runtime | Tampering | CSP `default-src 'self'`; `script-src 'self' 'unsafe-eval'` (eval scoped for the future compile path only); no `innerHTML` in the shell. |
| Casual shoulder-surf / DOM-visible key | Information Disclosure | `type="password"` input masks the key in the Elements tab (D-12). |
| Storage poisoning / quota DoS | Denial of Service | Probe-write detection + `Map` fallback (D-22) keeps the app functional under zero-quota/private mode; eviction handling deferred to Phase 7. |

> **Honest residual-risk note (carry to UI copy, not a Phase-1 blocker):** plaintext `localStorage` key storage means a malicious browser extension or a supply-chain-compromised dependency could read the key. This is unsolvable client-side and is an accepted, documented v1 tradeoff (PITFALLS Pitfall 2; CONTEXT Deferred: encryption-at-rest). The product must never claim the key is "secure"; recommend a scoped key. `[CITED: research/PITFALLS.md Pitfall 2]`

## Project Constraints (from CLAUDE.md)

`/Volumes/Unitek-B/Projects/o2.vibe-apps/CLAUDE.md` is the GSD-synthesized project file (PROJECT.md + STACK.md + workflow blocks). The actionable directives for Phase 1:

- **Tech stack (constraint):** React + react-dom, `@babel/standalone` (classic runtime, eager-loaded — Phase 2), IndexedDB via `idb`, Vite SPA, no SSR/server. Phase 1 honors this (no server, stub egress).
- **Security (constraint):** generated code will run only in `new Function()` with an explicit param list (Phase 2); rendering via React vDOM, never `innerHTML`; API key in `localStorage`, sent only to `api.anthropic.com`, never logged/proxied. Phase 1 establishes the key-handling rules (D-11..D-14, D-37).
- **Devtools hygiene (HARD RULE):** nothing F12-visible may reveal the on-demand mechanic; the token "synthesize/synthesized/synthesis" must not appear in any devtools-visible surface, **including source comments**. Enforced by the lexicon gate + `sourcemap:false`.
- **Storage discipline:** never store compiled functions in IndexedDB — store strings. (Not exercised in Phase 1; schema only.)
- **Global user instruction (CLAUDE.md global):** "Always verify your work before reporting — build the project (zero errors), run the test suite (all pass), write tests for new functionality." → The Phase-1 plan's definition-of-done must include `npm run test` green + `tsc --noEmit` clean + `vite build` succeeding with no `dist/*.map`.
- **GSD workflow enforcement:** file changes go through a GSD command; the phase-branch strategy is `feature/phase-1-hygiene-foundation-storefront-shell` (config `git.phase_branch_template`).

These carry the same authority as locked decisions. No recommendation in this research contradicts them.

## Sources

### Primary (HIGH confidence)
- npm registry (live, 2026-06-24, this session) — verified versions: react/react-dom 19.2.7, vite 8.1.0, @vitejs/plugin-react 6.0.3, typescript 6.0.3, idb 8.0.3, @babel/standalone 8.0.2 (pin ^7.26), vitest/@vitest/ui 4.1.9, jsdom 29.1.1, lucide-react 1.21.0, @types/react 19.2.17, @types/react-dom 19.2.3, fake-indexeddb 6.2.5, @testing-library/react 16.3.2, @testing-library/jest-dom 6.9.1, @testing-library/user-event 14.6.1.
- Local verification run (Node 23.11.0, this session) — `crypto.subtle.digest("SHA-256", Uint8Array)` → 64-hex, deterministic, D-25 normalization equivalence holds, distinct inputs differ, emoji-safe.
- `.planning/research/STACK.md`, `PITFALLS.md`, `ARCHITECTURE.md`, `SUMMARY.md` — project research (verified 2026-06-24); Anthropic headers, classic-runtime trap, IndexedDB/devtools pitfalls.
- `.planning/phases/01-…/01-CONTEXT.md` (47 locked decisions) and `01-UI-SPEC.md` (visual/copy/CSS contract).
- vitest.dev/config, main.vitest.dev/guide/migration — Vitest 4 config + breaking changes.
- babeljs.io v8-migration / preset-react — classic-vs-automatic runtime default flip.

### Secondary (MEDIUM confidence)
- github.com/vitest-dev/vitest/issues/5365 — `crypto.subtle.digest` TypeError in jsdom (closed not-planned; Node-env workaround).
- github.com/vitest-dev/vitest/issues/821 + rebeccamdeprey.com — `window.matchMedia` stub for Vitest/jsdom.
- github.com/dumbmatter/fakeIndexedDB — `fake-indexeddb/auto` for IndexedDB in tests.
- qaskills.sh/blog/vitest-4-migration-guide — Vitest 4 dropped DOM-env auto-install; requires Vite ≥6 / Node ≥20.
- simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access — mandatory browser CORS header.

### Tertiary (LOW confidence)
- None. All load-bearing claims verified against npm, a live Node run, or official docs/issues.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified live against npm this session; matches/exceeds CONTEXT floors.
- Architecture: HIGH — client-only single-tier, fully specified by CONTEXT/ARCHITECTURE; no ambiguous tier assignments.
- Pitfalls: HIGH — the three jsdom gaps (crypto.subtle, IndexedDB, matchMedia) verified against vitest issues + a live Node run; CORS header cross-confirmed across three sources.
- Validation architecture: HIGH — greenfield, so all gaps are explicit Wave 0 items; the crypto/jsdom interaction is the one subtle trap and it is resolved.

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (30 days — stable stack; re-verify Vitest/Vite minor bumps if planning slips past this window).
