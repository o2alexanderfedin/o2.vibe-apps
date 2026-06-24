# Phase 1: Hygiene Foundation & Storefront Shell - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the non-negotiable foundation: a real marketplace storefront that users land on, the platform activation UX (API key set/change/clear), a theme toggle (light/dark/system), and every hygiene + security control that is cheaper to bake in now than retrofit later. No model is called in this phase. No data is stored yet beyond localStorage config. The output is a Vite + React 19 + TypeScript strict SPA that builds cleanly, passes typechecking, and ships with source maps off, a working CSP, a CI lexicon-grep gate, opaque SHA-256 cache keys, IndexedDB initialized with probe+fallback, a gated logger, and a single Anthropic egress stub.

**Owns:** SHELL-01, SHELL-02 (stub), SHELL-03, SHELL-04, LOOP-02, LOOP-03, HYGIENE-01..05, SEC-04

**Does NOT do:** Any Anthropic API call, any generation, any code compilation, any rendering of app/widget code.

</domain>

<decisions>
## Implementation Decisions

### Project Scaffold

- **D-01:** Vite 6+ SPA (not Next.js or any SSR framework). Entry: `index.html` + `src/main.tsx`. Plugin: `@vitejs/plugin-react`. TypeScript strict mode (`strict: true` in tsconfig).
- **D-02:** React 19.2.x + react-dom 19.2.x version-locked to each other. `@types/react@^19` + `@types/react-dom@^19`.
- **D-03:** `idb@8` for IndexedDB. `@babel/standalone@^7.26` installed as a runtime dep (not dev-only) so it's available for Phase 2 eager-load.
- **D-04:** `build.sourcemap: false` in `vite.config.ts` production config — this is the master switch for the devtools-illusion; it MUST NOT be toggled on in CI.
- **D-05:** Test framework: Vitest with `@vitest/ui` and `jsdom` environment. Tests live in `src/**/*.test.ts(x)`. All Phase 1 tests must pass before the phase is verified complete.

### Source Tree Structure

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

### Storefront Grid (SHELL-01)

- **D-08:** Storefront renders a responsive CSS grid of app-type cards. Each card shows: a neutral icon (SVG or emoji), a display name, a short description. Cards are fixed-width with consistent spacing. No sorting, no filtering, no search in Phase 1 — just a static grid.
- **D-09:** The app types shown are defined by a static `APP_REGISTRY` constant (array of `{ id: string; displayName: string; description: string; icon: string }`). Phase 1 ships 6–8 representative app types (e.g., "Weather", "Calculator", "Notes", "Timer", "Currency", "Recipe", "Calendar", "Budget"). The IDs are lowercase-kebab, neutral (e.g., `"weather"`, `"calculator"` — never `"ai-weather"`, `"generated-calculator"`).
- **D-10:** Clicking a card in Phase 1 does nothing meaningful yet (a stub handler or a "Coming soon" neutral message is acceptable). SHELL-02 (open an app) is owned by Phase 1 only as a stub; the real loop is Phase 2. The click handler MUST NOT log "generate" or any banned token.

### API Key UX (SHELL-03)

- **D-11:** Key is stored in `localStorage` under the neutral key `marketplace.apiKey`. The value is the raw Anthropic API key string. No encryption in Phase 1 (localStorage encryption would require a second secret — circular). The UI neutrally frames this as "Activate your platform" or "Connect your account", never "Enter your AI key" or "Paste your Anthropic API key".
- **D-12:** The key config UI is accessible from the AppBar (a small icon/button, neutral label like "Account" or "Settings"). Opens a dialog/modal with three flows:
  - **Set:** If no key is stored, prompt with neutral copy ("To open apps, connect your account"). Input is type="password" to mask the key in the DOM (prevents casual shoulder-surf and prevents devtools Elements tab from showing raw key in a text value).
  - **Change:** If a key is stored, show "Account connected" and a "Change" action that replaces the value.
  - **Clear:** A "Disconnect" or "Remove" action that clears `localStorage.getItem('marketplace.apiKey')`.
- **D-13:** API key is NEVER logged (not even in the gated logger), NEVER put in a thrown Error.message, NEVER sent anywhere except `api.anthropic.com` in Phase 3+.
- **D-14:** On save, the key is validated for basic format (starts with `sk-ant-`, non-empty) with an inline, neutral error message if invalid. No server-side validation in Phase 1.

### Theme System (SHELL-04)

- **D-15:** Theme is stored in `localStorage` under the neutral key `marketplace.theme`. Values: `"light"` | `"dark"` | `"system"`. Default: `"system"`.
- **D-16:** Theme is applied by setting a `data-theme` attribute on `:root` (or `<html>`). CSS variables are defined on `:root[data-theme="light"]` and `:root[data-theme="dark"]`. `"system"` mode reads `prefers-color-scheme` via `window.matchMedia` and applies the matching theme, with a listener for changes.
- **D-17:** Required CSS variable names (exact — these must be consistent for Phase 2+ generated apps to inherit):
  ```css
  --color-text-primary
  --color-text-secondary
  --color-text-tertiary
  --color-background-primary
  --color-background-secondary
  --color-background-tertiary
  --color-border-secondary
  --color-border-tertiary
  --color-accent-primary         /* for CTAs / active states */
  ```
- **D-18:** ThemeProvider wraps the app and handles initial theme application on mount (before first paint if possible — use a blocking `<script>` in `index.html` to set `data-theme` from localStorage before React hydrates, to prevent flash of wrong theme).
- **D-19:** Theme toggle in AppBar cycles light → dark → system (or shows a 3-way picker). The toggle icon is neutral (sun/moon/auto — no "AI theme" language).

### IndexedDB Init + Probe + Fallback (LOOP-03)

- **D-20:** DB name: `"MarketplaceRegistry"`. Version: `1`. Three object stores: `"apps"`, `"widgets"`, `"handlers"` — all neutral names, no "generated" prefix.
- **D-21:** DB schema (typed via idb's `DBSchema` interface):
  ```ts
  interface RegistrySchema extends DBSchema {
    apps: { key: string; value: AppRecord };
    widgets: { key: string; value: WidgetRecord };
    handlers: { key: string; value: HandlerRecord };
  }
  // Records defined in src/registry/db.ts; Phase 1 defines the schema, not the full record shape
  ```
- **D-22:** Startup sequence in `registry/registry.ts`:
  1. `openDB("MarketplaceRegistry", 1, { upgrade })` — creates all three stores if missing.
  2. **Probe write:** attempt `db.put("apps", probeRecord, "__probe__")` then `db.delete("apps", "__probe__")`. If it throws, set `storageAvailable = false`.
  3. Call `navigator.storage.persist()` (fire-and-forget, no await needed for correctness).
  4. If `storageAvailable === false`: degrade to `Map<string, AppRecord>` in-memory fallbacks for each store.
  5. Export a `dbReady: Promise<void>` that resolves after init completes. All registry reads/writes must await this before accessing the DB.
- **D-23:** The in-memory fallback is `Map` objects keyed by the same string keys as IndexedDB. The registry API (`get`, `put`, `delete`) is the same async interface regardless of whether storage is available — callers never check the flag directly.

### Cache Key Derivation (LOOP-02)

- **D-24:** Cache key function lives in `src/registry/cacheKey.ts`. Signature: `async function cacheKey(input: string): Promise<string>`.
- **D-25:** Normalization (applied before hashing — identical on write AND read):
  1. NFC normalize: `input.normalize("NFC")`
  2. Lowercase: `.toLowerCase()`
  3. Trim: `.trim()`
  4. Collapse internal whitespace: `.replace(/\s+/g, " ")`
- **D-26:** Hashing: `crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized))` → convert `ArrayBuffer` to lowercase hex string. Result is always 64 hex chars, opaque, collision-resistant, Unicode-safe.
- **D-27:** The function is NEVER called with btoa or any base64 encoding. The type slug (e.g., "weather") is part of the input string before hashing — it is NOT prepended to the hash result. The hash output has no readable prefix.
- **D-28:** Tests required (in `src/registry/cacheKey.test.ts`):
  - Identical input → identical key (determinism)
  - Normalization: `"Weather "` vs `"weather"` vs `"WEATHER "` all produce the same key
  - Unicode/emoji input does not throw
  - Output is 64 hex chars, no readable type slug visible
  - `"weather"` and `"calculator"` produce different keys (no collision on minimal difference)

### Gated Logger (HYGIENE-04)

- **D-29:** Logger lives in `src/lib/logger.ts`. No `console.log` calls anywhere else in the codebase — all logging goes through this module.
- **D-30:** Gate: logging is active only when `localStorage.getItem("debug")` is set to any truthy value at module load time. Once evaluated, the gate is fixed for the session (no live toggling).
- **D-31:** Logger API: `logger.info(msg, ...data)`, `logger.warn(msg, ...data)`, `logger.error(msg, ...data)`. When gate is off, all methods are no-ops. When gate is on, all methods prefix with `[Marketplace]` and call the corresponding `console.*`.
- **D-32:** Neutral copy rule: logger messages MUST use neutral product language. Allowed: `"[Marketplace] Opening weather"`, `"[Marketplace] Registry initialized"`. Banned: `"Synthesizing"`, `"Generating"`, `"AI model called"`, `"LLM response received"`.
- **D-33:** Test: logger is silent by default (no `localStorage.debug` set) — verify no `console.*` calls fire; verify `[Marketplace]` prefix is present when gate is open.

### Single Anthropic Egress Stub (HYGIENE-05, Phase 1 scope)

- **D-34:** `src/host/modelClient.ts` is created in Phase 1 as a **stub** — it assembles and exports the correct headers but does NOT make any fetch call yet (Phase 3 wires it up).
- **D-35:** The module exports:
  ```ts
  function buildHeaders(apiKey: string): Record<string, string>
  // Returns: { "content-type": "application/json", "x-api-key": apiKey,
  //            "anthropic-version": "2023-06-01",
  //            "anthropic-dangerous-direct-browser-access": "true" }
  
  const ANTHROPIC_API_BASE = "https://api.anthropic.com";
  const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
  ```
- **D-36:** The module asserts (via a URL constructor check) that any call target is `api.anthropic.com`. This assertion is a stub comment in Phase 1 and becomes an enforced runtime check in Phase 3.
- **D-37:** The API key is NEVER logged by this module. The `buildHeaders` function receives the key at call time from the caller — it never stores it as a module-level variable.

### CI Lexicon-Grep Hygiene Gate (HYGIENE-03)

- **D-38:** The CI gate is a shell script `scripts/hygiene-check.sh` (or a Vitest test in `src/hygiene.test.ts`) that greps the source tree and fails with exit code 1 if banned tokens are found.
- **D-39:** Banned tokens (in source identifiers, comments, CSS, `data-*` attributes, string literals, prompt template strings):
  - `synthesize` / `synthesized` / `synthesis` (any case)
  - `\bgenerate\b` / `\bgenerated\b` / `\bgenerating\b` — as user-facing strings or `data-*` values (internal identifier `generate` is allowed in certain non-user-facing identifiers per research — see exception below)
  - `\bfake\b` / `\bmock\b` (as identifiers or user-facing strings)
  - `\bAI\b` (exact word, any case — matches "AI" but not "air" or "maintain")
  - `\bllm\b` (case-insensitive)
- **D-40:** Exception: the word `generate` is permitted in internal (non-user-facing) identifier names (e.g., `generateCacheKey` in a private function). The grep checks specifically for it in: CSS class names, `data-*` attribute values, string literals that would appear in the DOM or console (user-facing copy), and comments (since source maps expose comments).
- **D-41:** The gate runs as part of `npm run test` (or a separate `npm run hygiene`) and is wired into the repo's pre-commit hook or CI pipeline. It must PASS on the Phase 1 codebase before Phase 1 is considered complete.
- **D-42:** Implementation: Vitest test is preferred over a shell script (easier to maintain, runs on all platforms). The test uses Node.js `fs.readFileSync` + regex to scan `src/` and relevant config files.

### CSP (SEC-04)

- **D-43:** CSP is delivered via `<meta http-equiv="Content-Security-Policy">` in `index.html` (since the app is a static SPA with no server to set headers). The CSP string:
  ```
  default-src 'self';
  script-src 'self' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://api.anthropic.com;
  img-src 'self' data:;
  font-src 'self';
  ```
  - `'unsafe-eval'` in `script-src` is required for `new Function()` and `@babel/standalone` (Phase 2+). Include it now so Phase 1 sets the correct final CSP.
  - `connect-src` restricts to `'self'` and `https://api.anthropic.com` only — this is the key exfiltration containment.
- **D-44:** The CSP meta tag is the only mechanism (no `_headers` file, no Netlify/Vercel config needed for MVP). If a hosting platform is added later, the meta tag remains as a defense-in-depth fallback.

### Vite Config

- **D-45:** `vite.config.ts`:
  ```ts
  build: {
    sourcemap: false,        // MUST remain false — master devtools-hygiene switch
    minify: true,            // mangle internal names
    target: "es2020",        // safe floor for crypto.subtle, IndexedDB, modern JS
  }
  ```
- **D-46:** Dev server: no special proxy config needed (all Anthropic calls go direct from browser). Dev sourcemaps are fine (they are never shipped); only production sourcemaps are forbidden.
- **D-47:** `@vitejs/plugin-react` is configured with the **automatic** JSX runtime for the HOST app (Vite's normal mode). This is distinct from `@babel/standalone` which MUST use classic runtime for generated code — the two compile paths must never be conflated.

### Claude's Discretion

- Icon system for app type cards: any neutral SVG icon set or emoji is acceptable; Lucide React is a reasonable choice (tree-shakeable, neutral names).
- Exact color values for light/dark themes: any tasteful palette is acceptable; the CSS variable names are fixed, the values are Claude's discretion.
- Component library vs. plain CSS: plain CSS (or CSS Modules) preferred to avoid bundle weight and devtools fingerprint from a component library. TailwindCSS is acceptable only if the resulting class names in the DOM are structurally neutral (they are).
- Error boundary component: a basic `<ErrorBoundary>` class component is fine for Phase 1 (it's needed for Phase 2's compilation work). Include it as a stub with neutral error copy.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Foundation
- `.planning/PROJECT.md` — Core value statement, constraints, key decisions table
- `.planning/REQUIREMENTS.md` — v1 requirements; Phase 1 owns: SHELL-01..04, LOOP-02..03, HYGIENE-01..05, SEC-04
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, dependencies

### Research (HIGH confidence — all verified 2026-06-24)
- `.planning/research/SUMMARY.md` — Executive summary; key findings; build-order rationale
- `.planning/research/STACK.md` — Exact versions, Anthropic headers, Babel runtime trap, recommended stack
- `.planning/research/PITFALLS.md` — 7 critical pitfalls; 15 devtools-leak vectors; IndexedDB traps; Babel footguns
- `.planning/research/ARCHITECTURE.md` — Six-layer pipeline; module boundaries; state locations

### Blueprint
- `docs/vibeappstore.md` — Full system blueprint (layers, schemas, prompt templates, file/module structure, MVP checklist)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — this is a greenfield project. Phase 1 creates the entire codebase from scratch.

### Established Patterns
- None yet — Phase 1 establishes all patterns. Downstream phases must follow the patterns Phase 1 creates.

### Integration Points
- `src/host/modelClient.ts` — Phase 2/3 wire up the actual fetch call here. Phase 1 creates the stub.
- `src/registry/cacheKey.ts` — Phase 2/3 call this to derive keys before any DB read/write.
- `src/registry/registry.ts` — Phase 2+ use `registry.get/put/delete` API (must await `dbReady` first).
- `src/lib/logger.ts` — All phases must import this module for any logging; never call `console.*` directly.
- `src/ui/ThemeProvider.tsx` — Phase 2+ generated apps inherit CSS variables from `:root`. Don't break variable names.

</code_context>

<specifics>
## Specific Ideas

- **Neutral "Opening…" language established in Phase 1**: The storefront card click handler in Phase 1 should already use neutral loading copy ("Opening…", "Just a moment…") even though the loop isn't wired yet. This sets the tone for Phase 2+.
- **Blocking script in index.html for theme**: A small inline `<script>` before `</head>` reads `localStorage.getItem("marketplace.theme")` and sets `document.documentElement.setAttribute("data-theme", ...)` synchronously, preventing FOUC (flash of unstyled/wrong-theme content).
- **`APP_REGISTRY` constant ships with 6–8 neutral app types**: Weather, Calculator, Notes, Timer, Currency Converter, Recipe Finder, Calendar, Budget Tracker. These IDs form the initial set of cache key inputs in Phase 2.
- **Test coverage for Phase 1 (all must pass)**:
  1. `cacheKey.test.ts` — determinism, normalization, opacity, unicode safety, no collision
  2. `registry.test.ts` — IndexedDB init with probe, in-memory fallback on storage failure
  3. `logger.test.ts` — silence by default, `[Marketplace]` prefix when debug gate open
  4. `theme.test.ts` — theme switching applies correct CSS variables to `:root`
  5. `hygiene.test.ts` (or `hygiene-check.sh`) — lexicon grep gate passes on Phase 1 source

</specifics>

<deferred>
## Deferred Ideas

- **Key encryption at rest** — Would require a second secret (circular) or WebCrypto key derived from a user passphrase. Deferred; Phase 1 uses plain localStorage. Tracked concern.
- **`navigator.storage.estimate()` + LRU eviction** — Phase 7 scope (Storage & Cost Guardrails). Phase 1 only calls `persist()`.
- **`<iframe sandbox>` mount seam** — Architecture concern noted in research; the seam is designed in Phase 2 (execution engine). Phase 1 does not touch instantiation.
- **Implicit popularity row** — Deferred to v2 (POP-01).
- **Real authentication / accounts** — Out of scope for v1.
- **`onUncaughtError` root option** — Phase 2 scope (goes with the `createRoot` call). Phase 1 doesn't mount any React roots for generated content.
- **Cost guardrail threshold (N cache misses per window)** — Phase 7 scope. Concrete number TBD before Phase 7.

None of these belong in Phase 1.

</deferred>

---

*Phase: 1-Hygiene Foundation & Storefront Shell*
*Context gathered: 2026-06-24*
