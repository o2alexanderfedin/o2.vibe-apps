# Pitfalls Research

**Domain:** Browser-based, client-side generative-UI app marketplace (runtime-compiled LLM React via `@babel/standalone` + `new Function()`, IndexedDB cache, direct browser calls to Claude Haiku with the user's own key, mechanic invisible in devtools)
**Researched:** 2026-06-24
**Confidence:** HIGH (key time-sensitive claims — CORS header, multiple-React-instance trap, `createRoot` double-call, error-boundary async gap, Safari ITP eviction — verified against current sources; remainder HIGH from architecture analysis)

> This file enumerates failure modes **specific to this architecture**. Generic web advice is omitted. The seven question domains map to the seven Critical Pitfalls below; the supporting tables expand the full surface. The phase names referenced (P0 Shell, P1 Loop, P2 Composition, P3 Modification, P4 Resilience, P5 Handlers, "cross-cutting Hygiene") follow the Vertical-MVP framing in PROJECT.md.

---

## Critical Pitfalls

### Pitfall 1: Untrusted LLM code escapes the `new Function()` scope

**What goes wrong:**
Generated code reaches `window`, `document`, `localStorage`, `fetch`, the marketplace shell, or the parent app's React state — exfiltrating the API key, reading other apps' data, rewriting the storefront, or persisting XSS. `new Function()` does **not** create a sandbox: its body runs in the global lexical scope, so any free identifier the author didn't shadow (`window`, `document`, `globalThis`, `localStorage`, `fetch`, `import`, `eval`, `parent`, `top`) resolves to the real global. Passing `React` + `useWidget` as named params constrains *only* those names; it does nothing to block the globals.

**Why it happens:**
The blueprint's mental model ("only React + useWidget injected → no globals leak") is half-true. Named parameters add bindings; they don't remove ambient ones. Developers conflate "I didn't pass `window`" with "`window` is unreachable." It isn't.

**How to avoid:**
- **Shadow the dangerous globals as parameters set to `undefined`** so they resolve to `undefined` inside the function body. Prepend a fixed denylist to the `argNames` array — `window, document, globalThis, self, parent, top, localStorage, sessionStorage, indexedDB, fetch, XMLHttpRequest, WebSocket, eval, Function, importScripts, postMessage, location, navigator, cookie` — with matching `undefined` values. This is cheap and catches the casual case (a generated app calling `localStorage.getItem`). Note it does **not** stop `(0,eval)`, `constructor.constructor`, or `import()` — those are reachable via `[].constructor.constructor("return window")()`. Treat the denylist as defense-in-depth, not a boundary.
- **Run a fast static reject** on `transpiledJS` before instantiation: refuse code containing `import(`, `require(`, `.constructor`, `eval`, `fetch(`, `XMLHttpRequest`, `localStorage`, `document.cookie`, `<script`, `dangerouslySetInnerHTML`, `srcdoc`. Feed a rejection back into the self-heal loop ("uses a disallowed API; rewrite using only React") so it self-corrects rather than hard-failing.
- **Architect for the iframe upgrade from day one.** The only real boundary is an `<iframe sandbox="allow-scripts">` (cross-origin, no `allow-same-origin`) with `postMessage` for shell↔app comms. PROJECT.md defers this to "production hardening," which is fine — but the v1 mount/instantiate boundary (`execution/mount.ts`, `execution/instantiate.ts`) must be a single seam so the iframe swap is one module, not a refactor. If app/widget code touches the shell's React tree directly, the iframe path becomes impossible without a rewrite. **This is the single most consequential architecture decision for later security.**

**Warning signs:**
- A generated app "happens to" read `localStorage.theme` directly and it works → globals are reachable.
- Any code path where generated source is concatenated into a string that later hits `innerHTML`, `insertAdjacentHTML`, `document.write`, or a `<style>`/`<script>` injection.
- `useWidget` or the shell exposing the app's `setState`, `db`, or `apiKey` accessor on any object the generated code receives.

**Phase to address:**
P1 Loop (denylist shadowing + static reject ship with the first `instantiate`). The iframe **seam** is designed in P1; the iframe **swap** is a tracked production-hardening item (post-MVP). Verification: a red-team widget that tries `window`, `[].constructor.constructor`, and `localStorage` is part of P1's test suite.

---

### Pitfall 2: The user's Anthropic API key leaks from the browser

**What goes wrong:**
The key in `localStorage` is read by any script on the origin (a compromised dependency, a generated app that reached `localStorage`, a browser extension), appears in a logged request, or is shipped to a third party. Anthropic itself flags browser key usage as "a nasty anti-pattern: anyone with access to that site can steal your API key." The header that unlocks this is literally named `anthropic-dangerous-direct-browser-access`.

**Why it happens:**
Client-only zero-infra is a deliberate product choice (PROJECT.md, Out of Scope: no proxy), so the key *must* live in the browser. The risk is then about not making it worse: logging it, exposing it to generated code, or sending it anywhere but `api.anthropic.com`.

**How to avoid:**
- **Required header, exact spelling.** Every `/v1/messages` call must send `anthropic-dangerous-direct-browser-access: true` alongside `x-api-key`, `anthropic-version`, `content-type`. Without it the request fails CORS preflight / returns an auth error. (Verified current.)
- **Single egress chokepoint.** All `fetch` to Anthropic goes through one module. Assert `url.origin === "https://api.anthropic.com"` at that chokepoint so a generated handler can never redirect a call elsewhere. No other code constructs Anthropic requests.
- **Never log the key, never put it in an error, never serialize it.** No `console.log(headers)`, no `JSON.stringify(requestConfig)` in any error path, no Sentry/analytics that captures request headers. The key must never appear in a thrown `Error.message`.
- **Keep generated code away from `localStorage`.** Pitfall 1's denylist shadows `localStorage`; this is also a *key-protection* control, not just a sandbox control — without it, any generated app can read `marketplace.apiKey`.
- **Be honest about residual risk in the UI.** The real surface is: (a) malicious browser extension reading `localStorage`, (b) supply-chain-compromised npm dependency, (c) the user's own machine. None is solvable client-side. Surface a one-line, neutral note when the key is configured ("Your key is stored only in this browser and sent only to Anthropic") and recommend a scoped/limited key. Do **not** claim the key is "secure."

**Warning signs:**
- Any error handler that includes the request object or headers.
- A 401 that is logged with the offending header attached.
- A generated handler (Layer 6) that constructs its own `fetch` — handlers must run mock/local logic only and never get network access.
- Bundle analyzer shows an analytics/telemetry SDK that auto-captures fetch headers.

**Phase to address:**
P0 Shell (key storage + config UI + the single egress chokepoint + the no-log rule land with the very first model call). The CORS header is part of the first `callHaiku`. Verification: grep the build output for any path that stringifies headers; a test asserts the key never appears in any thrown error or `console` call.

---

### Pitfall 3: `@babel/standalone` footguns — eager-load blocking, multiple React instances, JSX-runtime mismatch, storing functions

**What goes wrong:**
Four distinct traps:
1. **Bundle/load blocking.** `@babel/standalone` is ~2–3 MB unminified (~450 KB+ on the wire even gzipped/from CDN). If it loads lazily, the first cache miss stalls on the download; if it's bundled naively, it bloats the main bundle and can break tree-shaking.
2. **Multiple React instances → "Invalid hook call."** This is the #1 killer for this exact pattern (verified). If the transpiled code resolves its own copy of React (e.g., Babel output references a `react` import that maps to a second bundled/CDN copy, or the host and the `new Function` scope disagree on which React object owns the hooks dispatcher), every `useState` throws "Invalid hook call. Hooks can only be called inside the body of a function component." Two React copies each track their own internal dispatcher; a component from one calling a hook from the other fails.
3. **JSX runtime mismatch.** Babel's `react` preset defaults to the **automatic** runtime in current versions, which emits `import { jsx } from "react/jsx-runtime"` — an *import* the `new Function()` scope can't resolve. The blueprint's `instantiate` only provides `React`, expecting **classic** runtime (`React.createElement`). Mismatch → `jsx is not defined` or an unresolved import at instantiate time.
4. **Storing compiled functions.** Functions aren't structured-cloneable; putting a function into IndexedDB throws `DataCloneError`. The blueprint correctly stores the *string* — but a "convenience" refactor that caches the live component in IndexedDB will silently regress this.

**Why it happens:**
Babel-standalone "just works" in a script tag, so teams under-think module resolution and runtime config. The automatic JSX runtime became the preset default, so the classic-runtime assumption in hand-written `instantiate` code is now wrong-by-default.

**How to avoid:**
- **Eager-load Babel at app init** (PROJECT.md already mandates this) — but load it **off the critical path of the shell paint**: kick the load during idle right after first paint, so the storefront renders instantly and Babel is warm before the first open. Show a one-time neutral "Opening…" if a miss races the Babel load.
- **One React, injected as a singleton.** The host app's `React` (and `ReactDOM`) is the *only* React. Transpile with the **classic runtime explicitly** so output is `React.createElement` and `React` is the injected param:
  ```
  Babel.transform(src, { presets: [["react", { runtime: "classic" }]], filename: "c.jsx" })
  ```
  Never let generated code `import React` and never bundle/CDN a second React. The `argNames` array passes the host's `React` object by reference.
- **Strip/neutralize any import statements** in generated output before instantiation (the prompt says "no imports," but the model will sometimes emit `import React from "react"`). Remove leading `import`/`export` lines except the default-export convention the `instantiate` shim expects; convert `export default` handling via the `module.exports` shim already in the blueprint.
- **Never store functions; store `transpiledJS` strings** (already specified — protect it with a serialization test that asserts what's written to IndexedDB is a string).

**Warning signs:**
- "Invalid hook call" on the *first* generated app that uses `useState` → two Reacts or runtime mismatch.
- `jsx is not defined` / `_jsx is not defined` at instantiate → automatic runtime leaked through.
- First cache miss takes several seconds before any spinner → Babel loaded lazily on the critical path.
- `DataCloneError` writing to IndexedDB → something tried to persist a function.

**Phase to address:**
P1 Loop owns all four (this is the heart of the compile→instantiate step). The classic-runtime config and single-React injection must be locked in the first working render. Verification: a generated app using `useState`/`useEffect` renders without a hook error; `transpile.ts` has a unit test asserting classic-runtime output (`React.createElement` present, no `jsx-runtime` import).

---

### Pitfall 4: IndexedDB traps — async assumptions, versioning, cache-key instability, quota/eviction, private mode

**What goes wrong:**
- **Sync assumptions:** treating `db.get` as synchronous or racing the DB open → reads return `undefined` and trigger needless (paid) regeneration.
- **Versioning/migration:** shipping a schema change without bumping `version` and handling `onupgradeneeded` → `VersionError` or missing object stores on existing users; a half-applied migration corrupts the registry.
- **Cache-key instability:** the blueprint key uses `btoa(...).replace(/[^a-z0-9]/gi,"").slice(0,64)`. `btoa` **throws on non-Latin1 characters** (any emoji/CJK in a prompt → `InvalidCharacterError`), the strip-and-slice loses entropy and can **collide** (two different prompts → same 64-char prefix → wrong cached app served), and it's reversible-ish (the type slug/prompt is partly readable — a hygiene leak, see Pitfall 5). Worse: if prompt normalization isn't applied *before* hashing, "Weather " and "weather" produce different keys → cache misses → cost + latency.
- **Quota/eviction:** Safari grants ~1 GB and **evicts IndexedDB after 7 days of no interaction under ITP** (verified); Chrome evicts under storage pressure for non-persisted origins. A user returns after a week to an empty registry and pays to regenerate everything.
- **Private mode:** Safari private browsing grants effectively **zero** quota — the first write throws (verified). If the app assumes IndexedDB always works, the whole loop dies in private mode.

**Why it happens:**
IndexedDB's async, versioned, quota-governed model is easy to treat like a synchronous key-value store, especially behind a thin `idb` wrapper. Eviction and private-mode are invisible in normal dev (Chrome non-private, lots of quota).

**How to avoid:**
- **`await` everything; gate all reads behind a single resolved `dbReady` promise.** No registry call runs before open completes.
- **Stable, opaque, collision-resistant keys.** Hash with `crypto.subtle.digest("SHA-256", utf8Bytes(normalizedInput))` → hex (the blueprint's own `cacheKey` comment says `sha256(...)` — implement that, not `btoa`). This is Unicode-safe, fixed-length, collision-resistant, **and** opaque (no readable type/prompt → satisfies Pitfall 5). **Normalize the prompt before hashing**: lowercase, trim, collapse internal whitespace, NFC-normalize — and define this once, used identically for write and read.
- **Detect storage availability at startup with a probe write**; on failure (private mode / disabled), degrade to the in-memory `Map` (blueprint already specifies this fallback) and continue — never crash the loop.
- **Request persistence:** call `navigator.storage.persist()` once at init to reduce eviction risk; call `navigator.storage.estimate()` and, when near quota, evict least-recently-used entries (the schema has `useCount`/`updatedAt` for exactly this).
- **Plan migrations now:** centralize schema version + `onupgradeneeded` in `db/index.ts`; treat the registry as a *cache* (safe to rebuild) not a *source of truth*, so a migration can legitimately drop-and-recreate stores rather than risk corruption.

**Warning signs:**
- Cache hit rate near zero despite repeated identical opens → key instability or normalization skew.
- `InvalidCharacterError` from `btoa` the first time a prompt contains an emoji.
- Works in normal Chrome, dies in Safari/private → quota/eviction unhandled.
- Regeneration (and cost) spikes for returning users → silent eviction.

**Phase to address:**
P0 Shell owns DB init, version/migration scaffolding, probe-detection, and the in-memory fallback. P1 Loop owns the hashed/normalized cache key (it's part of the resolve step). Verification: identical prompt → identical key test; emoji/CJK prompt doesn't throw; private-mode session still renders via the in-memory fallback.

---

### Pitfall 5: The devtools-hygiene illusion leaks (full vector enumeration)

**What goes wrong:**
A single devtools-visible artifact reveals that apps are produced on demand, breaking the entire product premise. The literal token **"synthesize/synthesized/synthesis"** (and any "AI / generate / fake / mock / LLM / prompt" language) appears in a place F12 can reach. Because **source maps expose original symbol names and comments**, even internal code names leak if a sourcemap ships.

**Why it happens:**
Hygiene is treated as a UI-copy concern, but the leak surface is the entire toolchain: bundler output, sourcemaps, network frames, storage inspectors, the DOM, and the styles tab. Internal naming conventions ("synthesizeWidget") feel safe because they're "internal" — until a sourcemap or an un-minified prod build exposes them.

**How to avoid — every vector, with the rule:**

| # | Devtools-visible vector | What leaks it | Prevention rule |
|---|---|---|---|
| 1 | **JS symbol names** (functions, classes, vars) | Minified prod build keeps top-level/exported names; sourcemaps restore *all* names | Forbid the banned lexicon in *all* identifiers. Prefer neutral verbs: `resolve`, `open`, `load`, `build`. Avoid `synthesize*`, `generate*`, `fake*`, `mock*`, `llm*`, `prompt*` as identifiers in shipped code. |
| 2 | **Source comments** | Sourcemaps expose original comments verbatim | Write comments as if the user reads them: `// resolve from registry or build on demand`. Banned token in **zero** comments. |
| 3 | **Source maps themselves** | A shipped `.map` re-exposes #1 and #2 entirely | **Do not ship sourcemaps to production** (or upload-and-strip). This is the master switch behind #1/#2. If maps must exist for ops, host them privately, never reference them from the prod bundle. |
| 4 | **Console logs** | Any `console.*` call | Logging **off by default**; gated behind `localStorage.debug`. Even gated logs use neutral copy: `[Marketplace] Opening weather`. Never "synthesizing", "generating fake app". |
| 5 | **Network request body → `api.anthropic.com`** | The generation prompt is the request body; the system/user prompt text is fully visible in the Network tab | The prompt copy itself must be neutral product language ("Generate a React component for a weather app"). **The fact that a call to `api.anthropic.com` exists is itself a partial tell** — accept it (the user supplied the key, so they know Anthropic is involved) but ensure the prompt never says "fake", "pretend", "as if the app already exists", or describes the illusion. |
| 6 | **Network request headers** | `x-api-key`, custom headers visible | No custom header names that reveal the mechanic; standard Anthropic headers only. (And never the key in a *logged* header — Pitfall 2.) |
| 7 | **IndexedDB store names** | Storage tab lists DB + store names | `apps`, `widgets`, `handlers`, DB `MarketplaceRegistry` — all neutral, already specified. |
| 8 | **IndexedDB key names** | Storage tab shows every key | Keys are **opaque SHA-256 hex** (Pitfall 4) — never embed the type slug or prompt in a readable key. The `btoa` scheme partially leaks the slug → another reason to drop it. |
| 9 | **IndexedDB record values** | The stored record is fully inspectable: `sourceJSX`, `prompt`, `type`, `displayName` | The record *content* is the hardest leak: `prompt` and `sourceJSX` are stored in plain text and visible. **Decide deliberately:** either (a) accept that stored JSX looks like ordinary app source (fine — apps *are* React), and ensure the stored `prompt` field contains neutral product copy, not "synthesize a fake…"; or (b) omit/encode the `prompt` field. At minimum, the `prompt` value must never contain the banned lexicon. |
| 10 | **localStorage keys & values** | Storage tab | `marketplace.theme`, `marketplace.apiKey` — neutral, already specified. No `debug`/`synthesize` flags with revealing names. |
| 11 | **CSS class names** | Elements/Styles tab | Structural names only: `.app-shell`, `.widget-frame`. Never `.synthesized-app`, `.generated-widget`, `.ai-*`. |
| 12 | **HTML attributes / `data-*`** | DOM inspector | No `data-synthesized`, `data-generated`, `data-ai`, `data-source="llm"`. Use neutral `data-app-id` (opaque hash) if needed. |
| 13 | **Error messages (UI + console)** | Both surfaces | "This app couldn't load. Try again." Never "generation failed", "synthesis error", "model returned invalid JSX". |
| 14 | **React DevTools component names** | React DevTools shows component `displayName`/function names | Wrapper components (`AppShell`, `WidgetShell`, `ErrorBoundary`) are neutral; the *generated* component's name comes from the model — strip/normalize it (mount as a neutral `displayName`) so a model emitting `function FakeWeatherApp()` doesn't surface in the tree. |
| 15 | **Performance/Network timing of a "miss"** | A first-open that takes ~1–3s then renders is a soft tell | Mitigate with instant neutral loading copy ("Opening…") and aggressive caching so misses are rare; this is a *soft* signal, not a hard leak — accept it. |

**Enforcement (the key to not regressing):**
Add a **CI lint rule / pre-commit grep** that fails the build if the banned lexicon (`synthesize|synthesized|synthesis|fake|mock(?!ery)|\bAI\b|llm|"generate` as a *user-facing string*) appears in: source identifiers, comments, JSX string literals, CSS files, and the prompt-template strings. Internal-only words like `generate`/`resolve` are allowed *as identifiers* per the blueprint's naming table, but **must never reach a user-facing string, a `data-*`, a CSS class, or a shipped sourcemap**. The lint rule is the only scalable defense against a one-line regression breaking the illusion.

**Warning signs:**
- A prod build with a `.map` file referenced → every internal name is one click from exposure.
- Any `console.log` left in a shipped path.
- A generated component appearing in React DevTools under a revealing name.
- An IndexedDB record whose `prompt` field reads like "synthesize a fake weather app".

**Phase to address:**
**Cross-cutting (Hygiene), enforced from P0 and re-checked every phase.** The CI lint rule ships in P0 and gates every subsequent merge. The sourcemap-strip decision is a P0 build-config item. Verification: CI grep passes on the whole repo + bundle output; a manual F12 audit (all 15 vectors) is a release gate for every milestone.

---

### Pitfall 6: Generation unreliability — prose/fences, non-compiling JSX, self-heal loops, 429s, cost blowups

**What goes wrong:**
- **Prose/markdown fences:** the model wraps code in ` ```jsx ` or adds "Here's your component:" despite "ONLY the JSX." The blueprint's `cleanJSX` regex strips fenced lines but **not** leading prose, trailing explanations, or fences with language tags inside the body → Babel chokes on prose.
- **Non-compiling JSX:** unbalanced braces, TypeScript syntax in a JSX file, `import` statements, multiple components without a default export.
- **Infinite / wasteful self-heal:** the loop re-calls Haiku up to 3× *per generation*; if the model can't fix it, that's 3 paid calls for a guaranteed failure. Nested resolution (an app that declares widgets, each of which can self-heal) multiplies: 1 app × 3 + N widgets × 3 calls on a bad batch → cost + latency spike. A self-heal that feeds back the *runtime* error instead of the *Babel* error wastes attempts (Babel errors are actionable; runtime errors often aren't).
- **429 rate limits:** Haiku has per-minute token/request limits; pre-warming several widgets in parallel on one app open can trip 429 immediately. No backoff → cascade of failures.
- **Cost blowups:** every cache miss is a paid call on the *user's* key; a self-heal storm, a poor cache-hit rate (Pitfall 4 key instability), or a tweak-happy user can run up real cost silently.

**Why it happens:**
LLM output is non-deterministic; "respond with ONLY code" is a request, not a guarantee. The self-heal and pre-warm features multiply call volume, and cost is invisible because it's the user's key (no server-side meter).

**How to avoid:**
- **Robust extraction, not just fence-stripping.** Extract the largest balanced code region: prefer the content of the first fenced block if present; else strip known prose preambles; then validate it *parses* before counting it as a candidate. Reject obvious non-code early (saves a Babel round-trip).
- **Cap and budget the self-heal loop.** Keep ≤3 attempts (blueprint), feed back the **Babel** error only (blueprint Note 9), and **stop early** if two consecutive errors are identical (the model is stuck — further calls waste money). On final failure, render the neutral error placeholder, do **not** retry on its own.
- **Serialize/limit pre-warm concurrency.** Resolve declared widgets with a small concurrency cap (e.g., 2) and a shared backoff, so one app open can't fire 6 parallel Haiku calls and self-trigger a 429.
- **429 handling: exponential backoff with jitter, honor `retry-after`.** The blueprint says "exponential backoff, 3 retries"; implement it reading the `retry-after` header, with jitter, shared across concurrent calls (a token-bucket/queue in the single egress chokepoint from Pitfall 2).
- **Cost guardrails:** track call count per session; soft-cap (e.g., warn the user neutrally after N generations in a short window — "a lot is loading right now"); cache aggressively (Pitfall 4) so repeat opens are free; keep `max_tokens` tight (blueprint already sets 1500/1000/800).

**Warning signs:**
- Babel errors that quote prose ("Here's the component") → extraction too naive.
- Self-heal always exhausting 3 attempts → feedback isn't helping (wrong error fed back, or model can't do the task).
- Bursts of 429 on app open → uncapped parallel pre-warm.
- A user reports unexpectedly high Anthropic spend → no cost guardrail / poor cache hit rate.

**Phase to address:**
P1 Loop owns extraction + Babel-error feedback + the basic self-heal cap. P4 Resilience owns 429 backoff/jitter, the early-stop heuristic, pre-warm concurrency limits, and cost guardrails. Verification: a fixture of "dirty" model outputs (fenced, prose-prefixed, TS-laden) all extract+compile or fail gracefully; a simulated 429 backs off and recovers; identical-error self-heal stops at 2.

---

### Pitfall 7: React mounting traps — double `createRoot`, cleanup leaks, error boundaries miss async errors

**What goes wrong:**
- **Double `createRoot` on a container:** calling `ReactDOM.createRoot()` twice on the same DOM node warns ("You are calling createRoot() on a container that has already been passed to createRoot()") and **orphans** the first root — leaking it and double-rendering (verified). In this app, *every* tweak/clone/remove and every re-resolve re-mounts an app or widget into a shell container; without root tracking, re-rendering an app you already opened double-roots its container.
- **Unmount/cleanup leaks:** removing an app/widget (the `remove` intent) without `root.unmount()` leaks the React tree, its effects, timers, and listeners; over a session of opens/removes/tweaks the page accumulates dead trees → memory growth and ghost effects firing.
- **Error boundaries don't catch async / event-handler errors:** React error boundaries catch errors thrown **during render, in lifecycle, and in constructors** — **not** errors in event handlers, `setTimeout`, promises, or async effects (verified). Generated code is full of `onClick`, `fetch`-like async, and timers; a throw there escapes the boundary, the boundary's retry UI never shows, and the error bubbles to the window — potentially with a revealing message (Pitfall 5).

**Why it happens:**
The blueprint's `mount()` creates a fresh root every call and the caller is told to "store this for later unmount" — but the resolve/tweak/clone loop re-enters `mount` for the *same* container constantly, and it's easy to forget to unmount on `remove`. The error-boundary async gap is a well-known React limitation that surprises teams expecting boundaries to be a catch-all.

**How to avoid:**
- **One root per container, tracked in a `Map<containerId, Root>`** (blueprint Note 4). Before mounting: if a root exists for that container, call `existingRoot.render(newTree)` to update, or `existingRoot.unmount()` then create fresh — **never** a second `createRoot` on a live container. Tweak/clone/replace-in-place must go through this map.
- **Always `root.unmount()` on remove**, and delete the map entry. Wrap removal so it can't be skipped (e.g., a `closeApp(id)` that unmounts + deletes + clears any in-memory caches for that id).
- **Backstop the async error gap:** (a) generated event handlers can't be wrapped automatically, so add a global `window.onerror` / `unhandledrejection` handler that shows the same neutral "couldn't load / try again" UI and **never** prints a revealing message; (b) in React 19/18.3 use the `createRoot(container, { onUncaughtError, onCaughtError })` options to route uncaught errors to neutral handling; (c) keep each widget in its own `ErrorBoundary` (blueprint Note 11) so a render-phase throw is contained to a placeholder and the parent app survives.
- **StrictMode double-invoke awareness:** in dev, StrictMode double-mounts effects; generated apps with non-idempotent effects (e.g., a counter incremented in `useEffect`) will look buggy. Either don't wrap generated trees in StrictMode, or document that generated-code effects must be idempotent.

**Warning signs:**
- "createRoot() on a container that has already been passed to createRoot()" in console → re-mount without root tracking.
- Memory climbing across a session of open/remove cycles → missing `unmount()`.
- An app's button throws and the whole page shows a raw React error overlay (or a revealing message) instead of the neutral retry → async error escaped the boundary.
- Double-counting / doubled network calls on mount → StrictMode double-invoke on non-idempotent generated effects.

**Phase to address:**
P1 Loop owns the root map + per-widget error boundary + the global async backstop (these are part of mount). P3 Modification owns correct unmount-on-remove and in-place replace-via-root.render (tweak/clone/remove live here). Verification: open→remove→open the same app type repeatedly with no createRoot warning and flat memory; a generated `onClick` that throws shows the neutral retry, not a raw overlay.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `new Function()` instead of sandboxed iframe (v1) | Ships the loop fast; no postMessage plumbing | Real code-exec/key-exfil exposure; iframe retrofit is a rewrite if the mount seam isn't isolated | Acceptable for v1 **only if** mount/instantiate is a single swappable seam + denylist + static reject are in place (Pitfall 1) |
| `btoa`-based cache key (blueprint sample) | One line, no async | Throws on Unicode, collides on slice, partially readable (hygiene leak) | **Never** — replace with SHA-256 hex before first real use |
| Sourcemaps shipped to prod for "easier debugging" | Faster prod debugging | Exposes every internal name/comment → breaks the illusion | **Never** in prod; private-host or strip |
| Logs on by default during build-out | Easy debugging | One forgotten log breaks hygiene; users see internals | Acceptable behind `localStorage.debug` gate only; default off (Pitfall 5) |
| Storing `prompt`/`sourceJSX` verbatim in IndexedDB | Enables re-gen, matches schema | The `prompt` field is fully inspectable | Acceptable **if** the prompt copy is neutral; otherwise omit/encode (Pitfall 5 #9) |
| Skipping `navigator.storage.persist()` | Less startup code | Silent eviction → returning users pay to regenerate | Acceptable for earliest demo; add before any real usage (Pitfall 4) |
| Uncapped self-heal + parallel pre-warm | Best-case fastest resolution | 429 storms + cost blowups on the user's key | **Never** ship uncapped; cap + backoff in P4 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `api.anthropic.com` (browser fetch) | Omitting `anthropic-dangerous-direct-browser-access: true` → CORS/auth failure | Send it on every call, plus `x-api-key`, `anthropic-version`, `content-type` (verified) |
| `api.anthropic.com` | Logging/serializing the request (key in `x-api-key`) | Single egress chokepoint; never stringify headers/config; origin-assert the URL |
| `@babel/standalone` | Automatic JSX runtime emits `react/jsx-runtime` import the `new Function` scope can't resolve | Force `{ runtime: "classic" }`; inject the host's single `React` (Pitfall 3) |
| `@babel/standalone` | Lazy-loading on the critical path of the first miss | Eager idle-load at init; warm before first open (Pitfall 3) |
| React / `react-dom` | A second React copy (bundle or CDN) → "Invalid hook call" | Exactly one React, injected by reference into every generated scope (Pitfall 3) |
| IndexedDB | Treating it as sync / racing the open; no `onupgradeneeded` plan | `await` + `dbReady` gate; centralized version + migration; treat as rebuildable cache (Pitfall 4) |
| IndexedDB | Assuming it's always available | Probe-write at startup; fall back to in-memory Map in private/zero-quota mode (Pitfall 4) |
| Anthropic rate limits | Firing N parallel pre-warm calls per app open | Concurrency cap + shared token-bucket + `retry-after`-honoring backoff (Pitfall 6) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Babel on the critical path | First miss stalls seconds before any UI | Eager idle-load + warm before first open | First-ever cache miss / cold load |
| Widget waterfall | App renders, then widgets pop in one-by-one with lag | Pre-warm declared `@widget` deps before mount (blueprint Note 5), capped concurrency | Any app with ≥2 widgets on a cold registry |
| Re-compiling on every load | Jank/CPU on each open of a cached app | Store `transpiledJS`; session in-memory `transpiledCache` Map; compile once (blueprint Note 10) | Repeated opens within a session |
| Low cache-hit rate | Cost + latency spike; regen storms | Stable SHA-256 key + prompt normalization (Pitfall 4) | As prompt variety / user count grows |
| Unbounded registry growth | IndexedDB near quota → `QuotaExceededError`, eviction | `storage.estimate()` + LRU eviction via `useCount`/`updatedAt` | Heavy users over weeks; Safari ~1 GB cap |
| Many live roots / leaked trees | Memory climbs across open/remove session | Root map + `unmount()` on remove (Pitfall 7) | Long sessions with many tweak/clone/remove cycles |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Assuming named params = sandbox | Generated code reaches `window`/`localStorage`/`fetch`; key exfil; XSS persistence | Shadow globals as `undefined` params + static reject + iframe seam (Pitfall 1) |
| Generated code reaching `localStorage` | Reads the user's API key | Globals denylist includes `localStorage`; handlers get no network/storage (Pitfall 2) |
| Any `innerHTML`/`dangerouslySetInnerHTML` path for generated markup | XSS in the host origin | Render only through React vDOM; static-reject `dangerouslySetInnerHTML`/`<script>`/`srcdoc` (Pitfall 1) |
| Logging requests/headers/errors with the key | Key leaks to console/telemetry | No-log rule at the egress chokepoint; key never in `Error.message` (Pitfall 2) |
| Generated handler making its own network call | Data exfil / SSRF-by-proxy via user's browser; second egress for the key | Handlers run mock/local logic only; no `fetch` in handler scope (Pitfall 1/2) |
| Trusting model output structurally | Prompt-injected code, disallowed APIs slip through | Static reject + feed rejection into self-heal; treat all output as hostile (Pitfall 1/6) |
| Claiming the key is "secure" in the browser | False assurance; user blames product on extension/supply-chain theft | Honest neutral copy; recommend a scoped/limited key (Pitfall 2) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Revealing loading/error copy | Breaks the "apps just exist" illusion | "Opening…", "This app couldn't load. Try again." — never "Generating…/Synthesis failed" (Pitfall 5) |
| First-open latency with no feedback | Feels broken/slow | Instant neutral placeholder + skeletons; aggressive caching so misses are rare (Pitfall 6) |
| A broken widget crashing the whole app | User loses the entire app over one widget | Per-widget `ErrorBoundary` → placeholder; app keeps rendering (blueprint Note 11) |
| Silent high cost on the user's key | Surprise Anthropic bill, loss of trust | Cost guardrail + neutral "a lot is loading" soft-cap; cache hard (Pitfall 6) |
| No key configured → hard failure | Dead storefront, confusion | Inline neutral prompt to add a key; storefront still browsable (blueprint Error Handling) |
| Private-mode total failure | App is blank for privacy-conscious users | Detect + in-memory fallback so it still works, just without persistence (Pitfall 4) |

## "Looks Done But Isn't" Checklist

- [ ] **`new Function()` scope:** Often missing global shadowing + static reject — verify a widget calling `window`/`localStorage`/`[].constructor.constructor` is blocked or rejected.
- [ ] **Babel config:** Often missing explicit `runtime: "classic"` — verify generated `useState`/`useEffect` works with no "Invalid hook call" and no `jsx-runtime` import in output.
- [ ] **Single React:** Often two copies — verify `npm ls react` shows one and the injected `React` is the host's object.
- [ ] **Cache key:** Often still `btoa` — verify SHA-256 hex, Unicode-safe, identical prompt → identical key, no slice collisions.
- [ ] **IndexedDB availability:** Often assumed present — verify private-mode/zero-quota session still renders via in-memory fallback.
- [ ] **Eviction:** Often ignored — verify `navigator.storage.persist()` called and LRU eviction path exists.
- [ ] **Devtools hygiene:** Often only UI copy is checked — verify the CI lexicon grep covers identifiers, comments, CSS, `data-*`, prompt strings, **and** that no sourcemap ships to prod; run the 15-vector F12 audit.
- [ ] **Root management:** Often a fresh `createRoot` per re-render — verify a root `Map` and `unmount()` on remove (no createRoot warning, flat memory across open/remove cycles).
- [ ] **Error coverage:** Often only render errors handled — verify a throwing `onClick` in generated code shows the neutral retry (not a raw overlay) via the global async backstop.
- [ ] **CORS header:** Often forgotten until first 401 — verify `anthropic-dangerous-direct-browser-access: true` is sent.
- [ ] **Self-heal:** Often uncapped or feeds runtime error — verify ≤3 attempts, Babel error fed back, identical-error early stop.
- [ ] **Key safety:** Often a stray log — grep all shipped code/build output: key never logged, never in an error, never sent off-origin.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Two React instances / hook errors | MEDIUM | Force single React via injection + classic runtime; remove the second copy; re-test all generated hooks |
| `btoa` key already in production | MEDIUM | Switch to SHA-256; treat registry as cache → drop-and-rebuild stores on the migration (no data to preserve) |
| Hygiene leak discovered (e.g., shipped sourcemap) | LOW–MEDIUM | Strip/relocate maps; run lexicon grep; rotate any revealing names; re-audit 15 vectors |
| Key leaked via log/telemetry | HIGH | Remove the log path; advise the user to rotate their Anthropic key immediately; add the no-log test |
| createRoot double-mount in prod | LOW | Introduce root `Map`; route re-renders to `root.render`; add `unmount()` on remove |
| 429 storm / cost blowup | LOW–MEDIUM | Add backoff+jitter+`retry-after`, cap pre-warm concurrency, add cost guardrail, improve cache-hit rate |
| Generated code reached a global | MEDIUM | Add the shadowing denylist + static reject; ship the iframe seam swap if exposure was severe |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Untrusted code escapes `new Function()` | P1 Loop (seam + denylist + static reject); iframe swap post-MVP | Red-team widget (`window`/`localStorage`/`constructor.constructor`) is blocked/rejected |
| 2. API key leak | P0 Shell (egress chokepoint, CORS header, no-log) | Key absent from all logs/errors/build output; origin-asserted egress |
| 3. Babel footguns (load, dual React, JSX runtime, fn storage) | P1 Loop | `useState` app renders, classic-runtime output asserted, one React, only strings persisted |
| 4. IndexedDB traps (async, migration, key, quota, private) | P0 Shell (DB/migration/probe/fallback) + P1 Loop (hashed key) | Identical prompt → identical key; private-mode renders; emoji prompt doesn't throw |
| 5. Devtools-hygiene leak (15 vectors) | Cross-cutting (Hygiene), from P0, every-phase gate | CI lexicon grep passes repo+bundle; no prod sourcemap; manual 15-vector F12 audit |
| 6. Generation unreliability (prose, compile, self-heal, 429, cost) | P1 Loop (extract + Babel feedback) + P4 Resilience (backoff, caps, cost) | Dirty-output fixtures compile/fail-gracefully; simulated 429 recovers; identical-error stop |
| 7. React mounting traps (double root, leaks, async errors) | P1 Loop (root map, boundary, async backstop) + P3 Modification (unmount/replace) | Open/remove cycles: no createRoot warning, flat memory; throwing onClick → neutral retry |

## Sources

- Simon Willison — *Claude's API now supports CORS requests* (the undocumented `anthropic-dangerous-direct-browser-access: true` header; Anthropic's "nasty anti-pattern" warning about browser keys): https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/ — HIGH
- `anthropic-sdk-typescript` PR #504 (browser usage / `dangerouslyAllowBrowser`): https://github.com/anthropics/anthropic-sdk-typescript/pull/504 — HIGH
- React docs — *Invalid Hook Call Warning* / multiple copies of React: https://react.dev/warnings/invalid-hook-call-warning and facebook/react#13991 (hooks + multiple React instances): https://github.com/facebook/react/issues/13991 — HIGH
- iws.io — *Invalid hook call: resolving multiple React instances* (directly applies to transpiled/`new Function` code sharing one React): https://iws.io/2022/invalid-hook-multiple-react-instances — MEDIUM
- React docs — `createRoot` (double-call warning; `onCaughtError`/`onUncaughtError` root options; error boundaries don't catch event-handler/async errors): https://react.dev/reference/react-dom/client/createRoot — HIGH
- MDN — *Storage quotas and eviction criteria* (`navigator.storage.persist()` / `estimate()`, `QuotaExceededError`): https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria — HIGH
- WebKit blog — *Updates to Storage Policy* (Safari ITP 7-day IndexedDB eviction; private-mode ~zero quota): https://webkit.org/blog/14403/updates-to-storage-policy/ — HIGH
- Babel — `@babel/preset-react` runtime option (`automatic` is the current default; classic emits `React.createElement`): https://babeljs.io/docs/babel-preset-react — HIGH (training + corroborated)
- Project blueprint: `docs/vibeappstore.md` (Error Handling, Devtools Hygiene, Security Considerations, Key Implementation Notes) and `.planning/PROJECT.md` — HIGH (authoritative project context)

---
*Pitfalls research for: client-side generative-UI app marketplace (runtime-compiled LLM React, browser-key Anthropic calls, devtools-invisible mechanic)*
*Researched: 2026-06-24*
