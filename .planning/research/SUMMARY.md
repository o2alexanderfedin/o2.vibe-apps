# Project Research Summary

**Project:** Vibe App Store
**Domain:** Client-side generative-UI app marketplace (browser-only, BYOK, runtime-compiled React)
**Researched:** 2026-06-24
**Confidence:** HIGH

## Executive Summary

The Vibe App Store is a novel product that inverts the standard generative-UI pattern: instead of exposing an AI prompt surface, it hides the generation mechanic entirely so that apps appear to simply "exist" on the platform. React components are produced on demand by Claude Haiku via direct browser fetch using the user's own API key, compiled in-browser with `@babel/standalone`, instantiated via `new Function()`, and cached in IndexedDB. The result is a marketplace where clicking an app opens it instantly on a cache hit or seamlessly on a cache miss — with nothing in devtools narrating that the app was manufactured. There is no comparable shipped product combining all three constraints (generative UI + marketplace framing + hard "no visible AI" rule), so this research draws from adjacent products (v0, Claude Artifacts, websim) and verified technical foundations.

The recommended approach is a layered pipeline — Intent Resolver → Registry (IndexedDB + in-memory caches) → Generation (Haiku fetch + Babel transpile) → Execution (new Function + ReactDOM) — built as a series of vertical slices where each slice delivers an end-to-end working capability rather than a horizontal layer. The critical cross-cutting constraint is that classic JSX runtime (`runtime: "classic"`) must be pinned in Babel so the transpiler emits `React.createElement`, which resolves to the host-injected `React` argument in the `new Function` scope. Automatic runtime (Babel 8 default) emits an unresolvable `import`, breaking every generated component. Three other load-bearing invariants: the `anthropic-dangerous-direct-browser-access: true` header is mandatory for browser CORS; cache keys must use SHA-256 rather than `btoa` (Unicode-safe, collision-resistant, opaque); and source maps must never ship to production (they are the master switch that exposes every internal symbol and comment).

The principal risks are: (1) the "no visible AI" illusion breaking via any of 15 enumerated devtools vectors — enforced by CI lint from Slice 0, not audited retrospectively; (2) `new Function` is not a sandbox — global-shadowing denylist and static rejection are v1 mitigations, with `<iframe sandbox>` as the deferred production end-state behind a single swappable seam designed in Slice 1; (3) error boundaries do not catch async/event-handler throws — a global `window.onerror` + React 19 `onUncaughtError` backstop is required to prevent revealing messages from reaching the user. These risks are well-understood and have concrete mitigations; none blocks v1 if the mitigations are applied in the right slice.

---

## Key Findings

### Recommended Stack

See `.planning/research/STACK.md` for full detail. The host app is a Vite 6+ SPA with React 19 and TypeScript 5.7+. Generated code relies on the same React instance (injected by reference, never re-imported) and on `@babel/standalone` for in-browser JSX-to-JS transpilation. IndexedDB is managed via `idb@8`. All Anthropic calls use raw `fetch` (not the SDK) to minimize bundle weight and devtools fingerprint.

**Core technologies:**

- **React 19.2.x + react-dom 19.2.x** — renders apps, widgets, and the shell; supplies hooks to all generated code via a single shared instance injected by reference into every `new Function` scope. Must be version-locked to each other; a second React copy triggers "Invalid hook call" on every generated component.
- **@babel/standalone pinned to `^7.26`** (or `8.x` with explicit `runtime: "classic"`) — in-browser JSX transpiler; superior error messages feed the self-heal loop. Load eagerly at init. Config: `presets: [["react", { runtime: "classic" }]]` — non-negotiable; classic runtime is what makes the `new Function` scope model work.
- **idb@8** — typed promise wrapper over IndexedDB; eliminates a large class of transaction bugs for ~1 KB gzip. Store only `transpiledJS` strings, never compiled functions.
- **Vite 6+** — host app build only; `build.sourcemap: false` in production is mandatory. Never touches generated code (two separate compile paths).
- **Raw `fetch` to `api.anthropic.com/v1/messages`** — required headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`, `anthropic-dangerous-direct-browser-access: true`. Model: `claude-haiku-4-5-20251001` (dated id preferred over alias for cache-key stability). Non-streaming only: partial JSX cannot be compiled.
- **Sucrase 3.35.x** — post-v1 upgrade path for the transpiler (~20x faster, far smaller); keep Babel behind a `generation/transpile.ts` seam so the swap is one module.

**What not to use:** `@babel/standalone@8` with default presets (automatic runtime breaks instantiation); the Anthropic SDK in the hot path; streaming for code generation; Next.js or any SSR framework; production source maps.

### Expected Features

See `.planning/research/FEATURES.md` for full detail. The distinguishing insight: every comparable product (v0, Artifacts, websim) makes the AI mechanic the headline. This product is the inverse. Competitor UX chrome (prompt boxes, "Generate" buttons, model pickers, streaming code, version history) is the exact set of anti-features.

**Must have (table stakes — v1):**

- Open-and-render loop (resolve → cache → produce → compile → render) — the product itself
- IndexedDB registry (`apps`/`widgets`/`handlers`) with stable SHA-256 cache keys and prompt normalization
- Instant re-open on cache hit (session in-memory transpiled cache; compile once per session)
- Skeleton / "Opening…" neutral loading state on cache miss (never "Generating…")
- App shell with contextual `⋮` menu as the only NL surface
- Contextual natural-language tweak, clone (client-side, no model call), remove
- Error boundary + self-heal retry (<=3, Babel compiler error fed back, not runtime error)
- API-key onboarding framed as "activation" not "paste your AI key"
- Graceful degradation: 401 → reconfigure inline; 429 → backoff + neutral error; no IndexedDB → in-memory Map fallback
- Theming (light/dark/system) via CSS variables on `:root` — generated apps must look native
- No-visible-AI hygiene applied as acceptance criterion on every feature above

**Should have (competitive — v1.x after single-app loop proven):**

- Widget composition: `@widget` dep parser, transitive pre-warm, `makeUseWidget` injection, per-widget shell + error boundary
- Transparent backend handlers (`runHandler` resolve-or-produce-then-exec)
- In-place tweak that replaces without surfacing history (the `root.render()` re-use model makes this natural)

**Defer (v2+):**

- `<iframe sandbox>` isolation — correct security end-state; design the mount seam now so the swap is one module
- Implicit popularity row from `useCount` — cheap polish; needs enough usage to populate
- Multi-user sync / sharing — needs infra and risks exposing the mechanic

**Anti-features (deliberately not built):** Visible prompt box, "Generate" / "AI is thinking" language anywhere in UI, streaming code into view, server-side anything, real accounts/auth/billing, ratings/reviews, devtools-visible diagnostic attributes or log messages.

### Architecture Approach

See `.planning/research/ARCHITECTURE.md` for full detail. A six-layer pipeline with two defining boundaries: an async/sync boundary at the top of the Execution Engine (everything inside a React render must be synchronous — no `await`) and a single network boundary (`host/modelClient.ts`) that is the only place that constructs requests to Anthropic. State lives in exactly three places: `localStorage` (config), IndexedDB (durable registry), and session in-memory Maps (roots, transpiled strings, live components).

**Major components:**

1. **`host/modelClient.ts`** — single `fetch` to `api.anthropic.com`; all mandatory headers assembled here; the only place a prompt leaves the browser; gated logger lives here. Single-egress is both a hygiene chokepoint and a security control.
2. **`registry/` (cacheKey.ts + registry.ts + caches.ts)** — opaque SHA-256 cache-key derivation; three-tier resolve (component Map → transpiledJS Map → IndexedDB → model); normalize prompt before hashing, identically on write and read.
3. **`generation/` (transpile.ts + selfHeal.ts + app.ts + widget.ts)** — Babel classic-runtime wrapper; self-heal loop (<=3, Babel error fed back, early-stop on identical consecutive errors); `@widget` dep parser; prompt assembly. Fully async; never called from render.
4. **`execution/` (instantiate.ts + mount.ts + prewarm.ts + useWidget.ts + ErrorBoundary.tsx)** — synchronous island; `new Function` scope injection with global-shadowing denylist; mounted-roots Map (create once, `root.render()` to update, `root.unmount()` to remove); transitive pre-warm before every mount; `useWidget` as a pure `Map.get`; per-shell ErrorBoundary; global async backstop via `window.onerror` + `onUncaughtError`.
5. **`intent/` (resolver.ts + classifier.ts + router.ts)** — action-to-Intent mapping; keyword routing for remove/clone (no model call) vs mutate; static type map with optional Haiku classifier fallback (cache classifier results).
6. **`ui/` (Marketplace.tsx + AppShell.tsx + WidgetShell.tsx + ContextualPrompt.tsx)** — shell rendering; the `⋮` popover is the only NL surface; AppShell owns the container `<div>` passed to `createRoot`.

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for full enumeration (7 critical pitfalls, 15 devtools-leak vectors, full recovery strategies).

1. **Classic JSX runtime not pinned** — Babel 8 defaults to automatic runtime, emitting `import { jsx } from "react/jsx-runtime"` which is unresolvable inside `new Function`. Fix: `presets: [["react", { runtime: "classic" }]]` locked in `generation/transpile.ts`; unit test asserts `React.createElement` present in output and no `jsx-runtime` import.

2. **`btoa`-based cache key** — throws on Unicode (emoji/CJK in any prompt), collides after slicing, leaks the type slug (hygiene violation). Fix: `crypto.subtle.digest("SHA-256", utf8Bytes(normalizedInput))` → hex; normalize (lowercase, trim, collapse whitespace, NFC) identically on write and read. Never acceptable; replace before first real use.

3. **Production source maps shipped** — expose every internal symbol name and comment verbatim, defeating the entire devtools hygiene effort. Fix: `build.sourcemap: false` in Vite prod config (master switch behind 14 of 15 devtools-leak vectors); CI lexicon grep (`synthesize|generate|fake|mock|\bAI\b|llm` in identifiers, comments, CSS, `data-*`, prompt strings) gates every merge from Slice 0.

4. **Error boundaries miss async/event-handler throws** — a throw in an `onClick` or async effect escapes the boundary, potentially surfacing a revealing message at `window.onerror`. Fix: global `window.addEventListener("error")` + `unhandledrejection` → neutral "couldn't load" UI; React 19 `createRoot(container, { onUncaughtError })` to route uncaught errors to neutral handling.

5. **`new Function` is not a sandbox** — named parameters add bindings; they do not remove ambient globals. Generated code can reach `window`, `localStorage` (including the API key), `fetch`. Fix: shadow dangerous globals as `undefined` in `argNames` denylist (`window, document, globalThis, localStorage, sessionStorage, indexedDB, fetch, XMLHttpRequest, eval, Function, ...`); add static-reject pass on `transpiledJS` before instantiation; architect the mount seam as a single swappable module so `<iframe sandbox>` is a one-module swap in production.

6. **`anthropic-dangerous-direct-browser-access: true` missing** — CORS preflight rejects every request without it. Include on every call in `host/modelClient.ts`. The header reveals "this app talks to Anthropic from the browser" (which the user already knows since they supplied the key) but does not narrate the on-demand mechanic.

7. **IndexedDB private-mode / Safari eviction** — Safari private mode grants ~zero quota (first write throws); Safari ITP evicts IndexedDB after 7 days of no interaction. Fix: probe write at startup; on failure degrade to in-memory Map; `navigator.storage.persist()` at init; LRU eviction using `useCount`/`updatedAt` before quota is hit.

---

## Implications for Roadmap

The build order below is the Vertical-MVP framing converged on independently by the architecture and pitfalls researchers. Each slice delivers a working, end-to-end user-visible capability. Do not flatten into horizontal "build all of layer N" phases.

**The "no-visible-AI illusion" is a cross-cutting NFR, not a phase.** It is an acceptance criterion attached to every feature's definition of done, enforced by CI lint from Slice 0 forward.

### Slice 0: Hygiene Shell (Foundation)

**Rationale:** Devtools hygiene constraints (opaque keys, neutral naming, gated logger, source-map-off build config, CORS header) are cheaper to bake in than to retrofit once data and modules exist.

**Delivers:** Marketplace shell renders; AppBar with API-key config + theme toggle; neutral CSS variables on `:root`; gated logger (off by default, `localStorage.debug` gate, neutral copy only); opaque `cacheKey()` (SHA-256, normalized input); `host/modelClient.ts` stub (header assembly including `anthropic-dangerous-direct-browser-access: true`); IndexedDB init with probe write + in-memory fallback; `navigator.storage.persist()` call; CI lexicon grep gate; `build.sourcemap: false` in Vite prod config.

**Avoids:** Key leak via log/header (Pitfall 2), IndexedDB private-mode failure (Pitfall 4), all 15 devtools hygiene vectors (Pitfall 5), btoa cache-key trap (Pitfall 4).

**Research flags:** Standard patterns — no additional research needed.

### Slice 1: Open One Static App End to End (The Loop, Minus the Model)

**Rationale:** Prove the resolve → compile → instantiate → render core with model risk removed. De-risks the novel runtime mechanics (Babel classic, `new Function` scope, `createRoot` map) before adding nondeterminism.

**Delivers:** IndexedDB `apps` store; Intent Resolver (static type map); three-tier registry resolve (component Map → transpiledJS Map → IndexedDB); Babel classic-runtime transpile; `new Function` instantiation with global-shadowing denylist + static-reject pass; mounted-roots Map (`createRoot` once, `root.render()` to update, `root.unmount()` to remove); AppShell with per-app ErrorBoundary; global async backstop (`window.onerror` + `onUncaughtError`); one seeded app's `sourceJSX` (no model call yet); `<iframe sandbox>` seam designed (not yet wired).

**Uses:** React 19, `@babel/standalone` (classic), `idb@8`.

**Avoids:** Babel footguns — classic runtime, single React, no stored functions (Pitfall 3); double `createRoot`, cleanup leaks, async error gap (Pitfall 7); untrusted code escaping `new Function` scope (Pitfall 1).

**Research flags:** Well-documented React/Babel mechanics — no additional research needed.

### Slice 2: Cache-Miss Generation (The Real On-Demand Loop)

**Rationale:** Turns the static loop of Slice 1 into the real product. Core value ("opens an app and it works, instant on hit, seamless on miss") is met at the end of this slice.

**Delivers:** Widget-less app generation via `host.modelClient`; robust JSX extraction (largest balanced code region, not just fence-stripping); self-heal loop (<=3 attempts, Babel compiler error fed back, early-stop on identical consecutive errors); store `{sourceJSX, transpiledJS}` to `apps`; skeleton/"Opening…" loading state. An app the user opens that is not seeded gets produced, compiled, cached, rendered.

**Avoids:** Generation unreliability — prose/fences, non-compiling JSX, wasteful self-heal, 429s (Pitfall 6). Feed Babel error, not runtime error.

**Research flags:** Standard Haiku generation loop patterns — no additional research needed. Confirm: neutral `prompt` copy stored in the IndexedDB record (devtools vector #9).

### Slice 3: Widget Composition + Pre-Warm + Sync `useWidget`

**Rationale:** The three hard concerns (sync `useWidget`, transitive pre-warm, per-widget isolation) are meaningless individually and must ship together. This is what separates "feels native" from "feels generated."

**Delivers:** `widgets` IndexedDB store; `@widget` dep parser; transitive `prewarm()` (recurse with cycle guard, `Promise.all` for siblings, concurrency cap <=2 to avoid 429 storms); `makeUseWidget` injection (pure `Map.get`, synchronous); WidgetShell with its own ErrorBoundary and `⋮` menu.

**Avoids:** Uncapped parallel pre-warm → 429 storms (Pitfall 6); render waterfall (pre-warm-before-mount); one bad widget crashing the parent app (Pitfall 7).

**Research flags:** Confirm whether dynamic (undeclared) widgets are needed. If yes, `useWidget` needs a skeleton-then-async fallback path; if no (all widgets statically declared), the implementation is fully sync. This is a product decision with a concrete implementation fork.

### Slice 4: Contextual Modification (Remove / Clone / Tweak)

**Rationale:** Needs live instances (Slices 1–3) and the mounted-roots Map to act on. First slice where the user shapes apps, not just opens them.

**Delivers:** ContextualPrompt popover (shared by app + widget shells); keyword router (remove/clone client-side with no model call, mutate → new cache key → resolve → `root.render(newTree)` reusing the existing root); correct `root.unmount()` on remove followed by DOM detach; clone as new instance id with same cache key (no model call).

**Avoids:** Unmount-before-DOM-detach; root reuse on tweak prevents double `createRoot` (Pitfall 7).

**Research flags:** Standard patterns — no additional research needed.

### Slice 5: Resilience + Graceful Degradation

**Rationale:** Can only harden paths that exist. Dedicated slice forces a neutral-copy hygiene review across the full error surface at once.

**Delivers:** 401 → inline API-key reconfiguration prompt; 429 → exponential backoff with jitter + `retry-after` header, shared token-bucket at the single egress chokepoint; neutral error copy audit across all 15 devtools vectors; cost guardrail (soft-cap with neutral messaging after N cache misses per time window); `navigator.storage.estimate()` + LRU eviction by `useCount`/`updatedAt`.

**Avoids:** 429 backoff, cost blowup, pre-warm concurrency (Pitfall 6); IndexedDB quota eviction (Pitfall 4).

**Research flags:** Define concrete cost-guardrail threshold (N misses per time window) before shipping this slice. No external research needed.

### Slice 6: Backend-Style Handlers (Optional Additive Layer)

**Rationale:** Fully independent of the UI loop; reuses the resolve-or-produce engine wholesale. Nothing above depends on it.

**Delivers:** `handlers` IndexedDB store; `runHandler(intent, input)` resolve-or-produce-then-exec; handler prompt template. Handlers run mock/local logic only — no `fetch` or `localStorage` in handler scope.

**Avoids:** Handlers constructing their own Anthropic requests or reaching the API key (Pitfall 2).

**Research flags:** Confirm exact allowed globals in handler scope — handlers need enough capability for local data operations (sort, filter, compute) without any network or storage access. The denylist for handlers may differ from the app/widget denylist.

### Phase Ordering Rationale

- **Hygiene scaffolding (Slice 0) before any model call or stored key** — opaque keys and the mandatory CORS header are painful to retrofit once data exists.
- **Static loop (Slice 1) before live generation (Slice 2)** — de-risks the novel `new Function` + Babel + `createRoot` mechanics before adding model nondeterminism.
- **Generation (Slice 2) before composition (Slice 3)** — widgets are produced the same way apps are; composition cannot exist until the generation engine does.
- **Composition (Slice 3) before modification (Slice 4)** — tweak/clone/remove operate on live composed instances and the roots Map; WidgetShells with `⋮` menus are delivered in Slice 3.
- **Resilience (Slice 5) after happy paths exist** — you can only harden error paths that exist.
- **Handlers (Slice 6) last** — isolated additive layer; core value is met at Slice 2.

### Research Flags

**Phases needing deeper research during planning:**

- **Slice 3 (Composition):** Confirm whether dynamic (undeclared) widgets are needed. Product decision with a concrete implementation fork in `useWidget`.
- **Slice 6 (Handlers):** Confirm exact allowed globals in handler scope. Handler denylist may differ from app/widget denylist.

**Phases with well-established patterns (skip research-phase):**

- **Slice 0:** Pure build config + CSS + key storage — standard Vite + localStorage patterns.
- **Slice 1:** React `createRoot` + Babel standalone + `new Function` — all verified against official docs in STACK.md and ARCHITECTURE.md.
- **Slice 2:** Haiku generation + self-heal loop — pattern is well-documented; Babel error feedback is the key insight, already verified.
- **Slice 4:** Contextual modification — client-side operations on a roots Map; standard React patterns.
- **Slice 5:** Error handling + backoff — standard patterns with verified `retry-after` header support.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry (2026-06-24); Anthropic headers verified against platform.claude.com/docs and simonwillison.net; Babel 8 automatic-runtime trap verified against babeljs.io migration docs |
| Features | MEDIUM-HIGH | HIGH on comparable-product landscape and illusion UX research. MEDIUM on exact table-stakes line for this specific product combination (no exact competitor); categorization reasoned from blueprint + analogous products |
| Architecture | HIGH | Runtime/React/Babel/Anthropic mechanics verified against current docs; build order and devtools-hygiene trade-offs reasoned from verified constraints |
| Pitfalls | HIGH | Key time-sensitive claims verified: CORS header (simonwillison.net + GitHub issues), multiple-React-instance trap (react.dev), `createRoot` double-call (react.dev), error-boundary async gap (react.dev), Safari ITP eviction (webkit.org blog) |

**Overall confidence:** HIGH

### Gaps to Address

- **Dynamic widget fallback scope:** Research is silent on whether the product needs widgets declared at render-time vs statically in source. This is a product decision (Slice 3 planning) with a concrete implementation fork in `useWidget`.
- **IndexedDB record hygiene — `prompt`/`sourceJSX` fields:** Both are fully inspectable in the Storage tab (devtools vector #9). Decision required before Slice 1 stores the first record. Recommendation: keep `sourceJSX` (it looks like ordinary React source); store only a neutral, product-framed version of the prompt — never raw user text that contains anything narrating the mechanic.
- **Haiku classifier fallback caching:** The Intent Resolver static type map has an optional Haiku classifier fallback for ambiguous intents. Classifier results should themselves be cached by input string to avoid repeated model calls for the same phrasing. Implied by the architecture but not explicitly designed.
- **Cost guardrail threshold:** PITFALLS.md recommends a soft-cap "after N generations in a short window" without defining N. A concrete number (e.g., 10 cache misses per 5-minute window) must be decided before Slice 5 ships.

---

## Sources

### Primary (HIGH confidence)

- npm registry (verified 2026-06-24) — current versions: React/react-dom 19.2.7, @babel/standalone 8.0.2, idb 8.0.3, sucrase 3.35.1, @anthropic-ai/sdk 0.106.0, vite 8.1.0, typescript 6.0.3
- platform.claude.com/docs — Haiku model id `claude-haiku-4-5-20251001`, context window, pricing, required headers, `anthropic-version: 2023-06-01`
- simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access — `anthropic-dangerous-direct-browser-access: true` header requirement; BYOK browser pattern; "nasty anti-pattern" key-in-browser warning
- babeljs.io/docs/babel-preset-react — Babel 8 automatic-runtime default; classic runtime config; `@babel/standalone` browser transform API
- react.dev/reference/react-dom/client/createRoot — create-once/render-to-update/unmount contract; double-call warning; `onUncaughtError` root option
- react.dev/warnings/invalid-hook-call-warning — single React instance requirement; dispatcher mismatch
- webkit.org/blog/14403/updates-to-storage-policy — Safari ITP 7-day IndexedDB eviction; private-mode zero quota
- MDN Web Docs — Storage quotas, `navigator.storage.persist()`, `navigator.storage.estimate()`, `QuotaExceededError`
- Project blueprint: `docs/vibeappstore.md`; `.planning/PROJECT.md`

### Secondary (MEDIUM-HIGH confidence)

- github.com/alangpierce/sucrase — ~20x faster JSX transform, `jsxRuntime: "classic"` config, browser-build caveat
- iws.io/2022/invalid-hook-multiple-react-instances — hooks + multiple React instances in `new Function` context
- blog.logrocket.com — skeleton screen UX: 3s skeleton perceived ≈ 1.5s spinner; neutral-motion-mirror-shape guidelines
- rilna.net/blog — BYOK onboarding UX; why raw key-paste framing is "usually fatal for consumer apps"
- aiqnahub.com — determinism-at-the-interface: caching first success vs temperature=0 non-determinism

### Tertiary (MEDIUM confidence)

- Competitor product surveys (v0, Claude Artifacts, websim, 21st.dev, Shopify) — feature landscape and anti-feature identification; no direct technical specs

---
*Research completed: 2026-06-24*
*Ready for roadmap: yes*
