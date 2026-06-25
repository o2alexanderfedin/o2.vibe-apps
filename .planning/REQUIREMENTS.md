# Requirements: Vibe App Store

**Defined:** 2026-06-24
**Core Value:** A user opens an app from the storefront and it renders and works — instantly on a cache hit, seamlessly produced on a cache miss — and nothing visible ever reveals that the app was made on demand.

## v1 Requirements

Requirements for the initial release. Scope = the blueprint MVP checklist plus the load-bearing corrections surfaced by research. Each maps to a roadmap phase (Vertical-MVP slices). Categories follow the architecture's component boundaries.

### Shell & Onboarding (SHELL)

- [ ] **SHELL-01**: User lands on a marketplace storefront that shows a grid of available app types
- [ ] **SHELL-02**: User can open an app from the storefront grid
- [ ] **SHELL-03**: User can set, change, and clear their own Anthropic API key from the UI, stored locally and framed as activating the platform (never as "paste your AI key")
- [ ] **SHELL-04**: User can switch theme between light, dark, and system, applied via CSS variables on `:root` so every app looks native to the platform
- [ ] **SHELL-05**: An opened app renders inside an app shell that shows the app's name and a contextual `⋮` menu

### Resolve → Cache → Render Loop (LOOP)

- [ ] **LOOP-01**: Opening or interacting with an app produces a structured intent (operation, kind, type, contextBundle, cacheKey)
- [ ] **LOOP-02**: Cache keys are derived with SHA-256 over a normalized input (lowercase, trim, collapse whitespace, NFC), applied identically on read and write, and are opaque (no readable type slug or prompt text)
- [ ] **LOOP-03**: A single IndexedDB database with `apps`, `widgets`, and `handlers` object stores is initialized at startup, with a probe write and an in-memory `Map` fallback when storage is unavailable
- [ ] **LOOP-04**: On a cache hit, the app renders immediately from the registry with no model call (three-tier resolve: live-component Map → transpiled-string Map → IndexedDB)
- [ ] **LOOP-05**: Generated source is compiled exactly once; **both** the original TypeScript/TSX source **and** the Babel-transpiled JS are persisted in the registry (Babel uses `preset-typescript` + `preset-react` classic runtime), and the transpiled JS is never recompiled from storage twice within a session (session-scoped in-memory transpiled cache)
- [ ] **LOOP-06**: The compiler is pinned to the classic JSX runtime (`presets: [["react", { runtime: "classic" }]]`) so output uses `React.createElement` and resolves against the injected `React` (verified by a test asserting no `react/jsx-runtime` import is emitted)
- [ ] **LOOP-07**: Generated code is instantiated in a `new Function()` scope that receives only an explicit named parameter list (a single shared `React` instance, plus `useWidget` for apps) and never `window`, `document`, or other globals
- [ ] **LOOP-08**: Each app/widget container gets exactly one React root (created once, re-rendered on update, unmounted on removal), tracked in a roots map keyed by instance id

### On-Demand Generation (GEN)

- [ ] **GEN-01**: On a cache miss, the platform calls Claude Haiku (`claude-haiku-4-5-20251001`) via a single browser `fetch` to `api.anthropic.com/v1/messages` using the user's key, with the `anthropic-dangerous-direct-browser-access: true`, `x-api-key`, and `anthropic-version` headers
- [ ] **GEN-02**: Model output is robustly extracted to compilable JSX (strips prose/markdown fences; tolerates preamble) before compilation
- [ ] **GEN-03**: A failed compile triggers a bounded self-heal retry (≤3 attempts) that feeds the **compiler** error back into the next prompt, with early-stop on identical consecutive errors
- [ ] **GEN-04**: A successfully produced app/widget is stored (`sourceJSX` + `transpiledJS`, neutral metadata) and then rendered, so the next open is an instant cache hit
- [ ] **GEN-05**: During a cache-miss produce, the user sees a neutral skeleton/loading state ("Opening…", "Just a moment…") that mirrors the app shape — never "Generating…" or any AI language

### Widget Composition (WIDGET)

- [x] **WIDGET-01**: An app can declare widget dependencies (`// @widget <type>`); the parser extracts them before mount
- [x] **WIDGET-02**: Declared widgets are pre-warmed (resolved from cache or produced) transitively before the app mounts, with a cycle guard and a concurrency cap (≤2) to avoid request storms
- [x] **WIDGET-03**: `useWidget(type)` returns the resolved widget component synchronously at render time (a pure `Map.get`, never triggering async work during render)
- [x] **WIDGET-04**: Each widget renders inside its own widget shell with an independent `⋮` menu, so a widget can be modified without touching its parent app
- [x] **WIDGET-05**: A widget that fails to load or throws shows a placeholder without crashing its parent app (per-widget error boundary)

### Contextual Modification (MOD)

- [ ] **MOD-01**: A shared contextual prompt popover (used by both app and widget shells) accepts free-form natural-language instructions and names the target being modified
- [ ] **MOD-02**: Prompt routing resolves remove/close and clone/duplicate client-side with no model call; everything else is treated as a tweak
- [ ] **MOD-03**: A tweak derives a new cache key, resolves it (cache or produce), and replaces the target in place by re-rendering the existing root (no surfaced version history)
- [ ] **MOD-04**: Remove unmounts the target's root and detaches it; clone creates a new instance from the stored record under a new instance id with no model call

### Resilience & Graceful Degradation (RESIL)

- [ ] **RESIL-01**: Every app and every widget is wrapped in an error boundary that catches render errors and offers a neutral retry without taking down the rest of the page
- [ ] **RESIL-02**: A global async backstop (`window.onerror` + `unhandledrejection` + React root `onUncaughtError`) routes uncaught async/event-handler errors to neutral handling so no revealing message ever surfaces
- [ ] **RESIL-03**: A missing or invalid API key (401) degrades to an inline key-reconfiguration prompt, with neutral copy and no crash
- [ ] **RESIL-04**: Rate limiting (429) is handled with exponential backoff + jitter honoring `retry-after`, shared via a token bucket at the single egress point, then a neutral user-visible error if exhausted
- [ ] **RESIL-05**: A cost guardrail soft-caps produce calls after a configured threshold of cache misses per time window, surfaced with neutral messaging
- [ ] **RESIL-06**: Storage pressure is handled by `navigator.storage.persist()` at init plus LRU eviction (by `useCount`/`updatedAt`) before quota is exceeded

### Backend-Style Handlers (HANDLER)

- [ ] **HANDLER-01**: Apps and widgets can request a data operation through a single `runHandler(intent, input)` helper that transparently resolves a cached handler or produces one on first need, then executes it and returns `{ data?, error? }`
- [ ] **HANDLER-02**: Produced handlers are cached in the `handlers` store and reused on subsequent calls
- [ ] **HANDLER-03**: Handler code executes in a constrained scope with no network (`fetch`) and no storage/key access — local/mock data operations only

### Devtools Hygiene — "Apps Just Exist" (HYGIENE, cross-cutting NFR)

These are acceptance criteria attached to every other requirement's definition of done, enforced from the first phase.

- [ ] **HYGIENE-01**: No devtools-visible surface (JS symbol names, IndexedDB store/key names, console logs, network payloads, source comments, CSS class names, HTML attributes, error copy, localStorage keys) narrates that apps are produced on demand
- [ ] **HYGIENE-02**: The literal token "synthesize / synthesized / synthesis" appears in **no** devtools-visible surface, including source comments (production source maps are disabled, `build.sourcemap: false`)
- [ ] **HYGIENE-03**: A CI lexicon-grep gate fails any merge that introduces banned/mechanic-revealing tokens (e.g. `synthesize`, `generate`, `fake`, `mock`, `\bAI\b`, `llm`) in identifiers, comments, CSS, `data-*`, or visible strings
- [ ] **HYGIENE-04**: Production logging is off by default, gated behind `localStorage.debug`, and uses only neutral product language when enabled
- [ ] **HYGIENE-05**: The browser→Anthropic request body uses neutral, product-framed language and the API key is sent only to `api.anthropic.com`, never logged, never proxied, and is the only credential stored

### Security (SEC)

- [ ] **SEC-01**: Generated code runs only in the constrained `new Function()` scope (no `eval`, no global pollution); dangerous globals (`window`, `document`, `localStorage`, `fetch`, `XMLHttpRequest`, `eval`, `Function`, …) are shadowed to `undefined` in the parameter list, behind a single swappable mount seam
- [ ] **SEC-02**: Rendering goes through React's virtual DOM; raw `innerHTML` is never used for generated content
- [ ] **SEC-03**: A static-reject pass screens `transpiledJS` for disallowed constructs before instantiation
- [ ] **SEC-04**: A Content-Security-Policy restricts `connect-src` to `'self' https://api.anthropic.com` to contain key exfiltration

## v2 Requirements

Acknowledged but deferred — not in the current roadmap.

### Hardening & Polish

- **HARD-01**: `<iframe sandbox="allow-scripts">` isolation of generated code with `postMessage` brokering (the production security end-state; the v1 mount seam is designed to swap to it as one module)
- **POP-01**: Implicit "popular on the platform" storefront row derived from `useCount`

## Out of Scope

Explicitly excluded. Documented to prevent scope creep. Anti-features carry a warning because a contributor would reflexively add them.

| Feature | Reason |
|---------|--------|
| Server-side application backend / database | Architecture is client-only; "handlers" run in-browser on mock/local data. No server to build or operate. |
| Proxying the Anthropic API through our own server | Breaks the client-only zero-infra model and creates key-handling liability; key goes browser → `api.anthropic.com` only. |
| Real authentication / accounts / billing / subscriptions | No backend to host auth; the subscription is narrative only — the API key is the sole activation gate. |
| Multi-user sync / publish / share generated apps | Registry is local IndexedDB per browser; cloud sharing needs infra and risks exposing the mechanic. |
| ⚠️ Visible prompt box / "Generate" button / model picker | Destroys the core illusion — apps must *exist*, not be summoned. The `⋮` tweak is the only NL surface. |
| ⚠️ Visible "AI is thinking / generating…" progress or streaming code | Names/reveals the mechanic. Use neutral skeleton + "Opening…" and render only the finished component. |
| ⚠️ Generation/version history, attempt log, "regenerate" button | Exposes that output is produced and non-deterministic. Self-heal retries are invisible; tweaks silently replace. |
| ⚠️ Ratings / reviews / comments / creator monetization | Implies human authors and a backend; there are none — every app is produced on demand. |
| ⚠️ Recompiling from storage on every load / storing compiled functions | Functions aren't serializable; recompiling twice per session kills the "instant" feel. Store the transpiled string. |
| Anthropic SDK / streaming in the generation hot path | Adds bundle weight and devtools fingerprint; partial JSX cannot be compiled. Use raw non-streaming `fetch`. |

## Traceability

Each v1 requirement maps to exactly one owning phase. Cross-cutting HYGIENE/SEC requirements are *owned* by their foundation phase for traceability even though they are *enforced* on every phase from Phase 1 forward.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SHELL-01 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| SHELL-02 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| SHELL-03 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| SHELL-04 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| LOOP-02 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| LOOP-03 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| HYGIENE-01 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| HYGIENE-02 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| HYGIENE-03 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| HYGIENE-04 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| HYGIENE-05 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| SEC-04 | Phase 1 — Hygiene Foundation & Storefront Shell | Pending |
| LOOP-01 | Phase 2 — Static Open-One-App Loop | Pending |
| LOOP-04 | Phase 2 — Static Open-One-App Loop | Pending |
| LOOP-05 | Phase 2 — Static Open-One-App Loop | Pending |
| LOOP-06 | Phase 2 — Static Open-One-App Loop | Pending |
| LOOP-07 | Phase 2 — Static Open-One-App Loop | Pending |
| LOOP-08 | Phase 2 — Static Open-One-App Loop | Pending |
| SHELL-05 | Phase 2 — Static Open-One-App Loop | Pending |
| SEC-01 | Phase 2 — Static Open-One-App Loop | Pending |
| SEC-02 | Phase 2 — Static Open-One-App Loop | Pending |
| SEC-03 | Phase 2 — Static Open-One-App Loop | Pending |
| GEN-01 | Phase 3 — Cache-Miss Generation (Core Value) | Pending |
| GEN-02 | Phase 3 — Cache-Miss Generation (Core Value) | Pending |
| GEN-03 | Phase 3 — Cache-Miss Generation (Core Value) | Pending |
| GEN-04 | Phase 3 — Cache-Miss Generation (Core Value) | Pending |
| GEN-05 | Phase 3 — Cache-Miss Generation (Core Value) | Pending |
| WIDGET-01 | Phase 4 — Widget Composition | Complete |
| WIDGET-02 | Phase 4 — Widget Composition | Complete |
| WIDGET-03 | Phase 4 — Widget Composition | Complete |
| WIDGET-04 | Phase 4 — Widget Composition | Complete |
| WIDGET-05 | Phase 4 — Widget Composition | Complete |
| MOD-01 | Phase 5 — Contextual Modification | Pending |
| MOD-02 | Phase 5 — Contextual Modification | Pending |
| MOD-03 | Phase 5 — Contextual Modification | Pending |
| MOD-04 | Phase 5 — Contextual Modification | Pending |
| RESIL-01 | Phase 6 — API Error Degradation | Pending |
| RESIL-02 | Phase 6 — API Error Degradation | Pending |
| RESIL-03 | Phase 6 — API Error Degradation | Pending |
| RESIL-04 | Phase 6 — API Error Degradation | Pending |
| RESIL-05 | Phase 7 — Storage & Cost Guardrails | Pending |
| RESIL-06 | Phase 7 — Storage & Cost Guardrails | Pending |
| HANDLER-01 | Phase 8 — Backend-Style Handlers | Pending |
| HANDLER-02 | Phase 8 — Backend-Style Handlers | Pending |
| HANDLER-03 | Phase 8 — Backend-Style Handlers | Pending |

**Coverage:**
- v1 requirements: 45 total — SHELL 5, LOOP 8, GEN 5, WIDGET 5, MOD 4, RESIL 6, HANDLER 3, HYGIENE 5, SEC 4
- Mapped to phases: 45 ✓ (no orphans, no duplicates)
- Unmapped: 0 ✓
- Per-phase counts: Phase 1 = 12, Phase 2 = 10, Phase 3 = 5, Phase 4 = 5, Phase 5 = 4, Phase 6 = 4, Phase 7 = 2, Phase 8 = 3 (total 45)

---
*Requirements defined: 2026-06-24*
*Last updated: 2026-06-24 after roadmap creation (traceability populated, 45/45 mapped)*
