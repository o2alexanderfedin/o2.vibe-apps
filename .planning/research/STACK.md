# Stack Research

**Domain:** Browser-based, client-side generative-UI app marketplace (LLM-produced React compiled and run at runtime, no application backend)
**Researched:** 2026-06-24
**Confidence:** HIGH (all versions and the Anthropic browser-direct path verified against official npm registry and platform.claude.com docs; in-browser transpiler tradeoffs verified against project sources)

---

## TL;DR — what changes vs the blueprint

| Blueprint says | Verdict | Action |
|---|---|---|
| `claude-haiku-4-5-20251001` via direct browser fetch | ✅ **Confirmed correct** — still the current Haiku model id (alias `claude-haiku-4-5`) as of Jun 2026 | Keep. Use the dated id for cache-key stability. |
| Headers: `x-api-key` + `anthropic-version` | ⚠️ **Incomplete** — browser calls also REQUIRE `anthropic-dangerous-direct-browser-access: true` or CORS is rejected | Add the browser header (see §Anthropic). |
| `@babel/standalone`, `presets: ["react"]` | ⚠️ **Risky default** — `@babel/standalone` is now **v8** and Babel 8 flips the React preset default to the **automatic** runtime, which emits `_jsx(...)` + a runtime import instead of `React.createElement`. Your `new Function()` scope only injects `React`, so automatic-runtime output will throw on instantiate. | **Pin `presets: [["react", { runtime: "classic" }]]`** OR pin `@babel/standalone@^7`. Classic runtime is non-negotiable for this architecture. |
| "Babel ~450KB download" | ⚠️ **Understated** — the full UMD bundle is closer to **~3MB raw / ~1.5MB min / ~400-500KB gzip over the wire**. The 450KB figure is roughly the gzipped transfer, not the parsed size. | Plan for the parse cost; consider Sucrase (see Alternatives). |
| `idb` "optional" | ✅ **Recommend making it non-optional** — v8, tiny (~1KB gzip), removes a large class of raw-IndexedDB transaction bugs | Use `idb@8`. |
| `anthropic` SDK "optional" | ✅ **Recommend NOT using it** for the hot path — raw `fetch` is leaner, has zero devtools-visible SDK fingerprint, and avoids bundling. | Use raw `fetch`. |

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **React** | `19.2.x` (current `19.2.7`) | Renders apps + widgets; supplies hooks to generated code | The injected dependency for every generated component. React 19 is current, stable, and supports many independent `createRoot` roots on one page — exactly the per-app/per-widget mount model here. **One single React instance** must be shared into every `new Function` scope (see Architecture note). |
| **react-dom** | `19.2.x` (current `19.2.7`) | `createRoot().render()` per app/widget container | Must be **version-locked to `react`**. `createRoot` is the React 18+/19 root API; one root per container, tracked in a `Map<id, Root>` for `unmount()`. |
| **@babel/standalone** | Pin **`^7.26`** (or `8.0.2` *with explicit `runtime: "classic"`*) | In-browser JSX → JS transpile on cache miss | The mature, battle-tested in-browser JSX compiler with a UMD global (`Babel.transform`) loadable from a CDN with no build step. **The critical config is the runtime mode** (see What NOT To Use + Pitfalls). Loaded eagerly at init so the first cache miss doesn't block on the download. |
| **TypeScript** | `5.7+` (current `6.0.3`) | Host-app type safety (NOT used on generated code) | The host shell, registry, intent resolver, and execution engine should be strictly typed. Generated code is an opaque string — never typecheck it. Use `strict: true`. (TS 6 is current; `5.7+` is a safe floor if you want maximum ecosystem compatibility.) |
| **idb** | `8.0.3` | Promise-based typed wrapper over IndexedDB | Raw IndexedDB is event-callback hell (`onsuccess`/`onupgradeneeded`/transaction-autoclose footguns). `idb` is ~1KB gzip, gives `await db.get(store, key)` ergonomics and a typed `DBSchema`, and is by Jake Archibald (the IndexedDB spec co-author). Removes an entire pitfall category. |

### Host Build Tooling

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| **Vite** | `6+` (current `8.1.0`) | Dev server + production bundler for the **host** marketplace shell | Fast HMR, native ESM dev, Rollup production builds. The host app has a normal build step; only *generated* code is no-build. **Devtools-hygiene note:** ship production with `build.sourcemap: false` (source maps expose comments — the blueprint's hard rule) and minify so internal symbol names (`synthesize*`) are mangled out of the served bundle. |
| **@vitejs/plugin-react** | `6.0.x` (current `6.0.3`) | JSX/Fast-Refresh for the host app's own components | This compiles *host* `.tsx`, not generated code. Two separate compile paths: Vite (build-time, host) and Babel-standalone (runtime, generated). Don't conflate them. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Sucrase** | `3.35.1` | Faster alternative in-browser JSX transpiler | **Strong alternative to Babel-standalone** (see Alternatives). ~20× faster transform, far smaller bundle. Use if Babel's bundle/parse cost hurts cache-miss latency. Caveat: needs a browser-compatible build (ships ESM; `sucrase-browser` fork exists) and you must set `jsxRuntime: "classic"`. |
| **@anthropic-ai/sdk** | `0.106.0` | Typed Anthropic client | **Do NOT use in the hot path.** Only consider for a typed `Message` type import during dev. Raw `fetch` is preferred (smaller, no SDK fingerprint, full header control). The SDK *does* support browser via `dangerouslyAllowBrowser: true`, but it bundles weight and an identifiable surface. |

---

## Anthropic Browser-Direct Path — VERIFIED

**This is the single most safety-critical integration. Confirmed against `platform.claude.com/docs`.**

### Model
- **Model id:** `claude-haiku-4-5-20251001` (alias: `claude-haiku-4-5`) — **CONFIRMED current** as of Jun 2026. ✅ The blueprint's id is correct.
  - Use the **dated id** (`...-20251001`), not the alias, so behavior is pinned and cache keys stay stable across SDK/alias changes.
  - Context window 200K tokens; max output 64K tokens. (The blueprint's `max_tokens` of 1500/1000/800 is well within limits — fine.)
  - Note: the model lineup advanced (Opus 4.8, Sonnet 4.6, Fable 5 are now current top-tier), but **Haiku 4.5 is still the current cheapest/fastest Haiku** — no migration needed. Pricing $1/$5 per MTok in/out.

### Required headers (browser fetch to `https://api.anthropic.com/v1/messages`)
```
content-type: application/json
x-api-key: <user key from localStorage>
anthropic-version: 2023-06-01
anthropic-dangerous-direct-browser-access: true    ← REQUIRED for browser/CORS
```
- `anthropic-version: 2023-06-01` is the **current** version value (stable, date-pinned API contract). ✅
- **`anthropic-dangerous-direct-browser-access: true` is mandatory for browser calls.** Without it the API returns a CORS error: *"CORS requests must set 'anthropic-dangerous-direct-browser-access' header"*. The blueprint omits this header — **add it.** (Confirmed: feature shipped Aug 2024; the header opts the request into CORS support. Sending the header does NOT change the request body, so it is **safe vs devtools hygiene** — it reveals "this app talks to Anthropic from the browser," which is already visible from the request URL, and does NOT reveal the on-demand-generation mechanic.)

### Request body shape
```json
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 1500,
  "system": "<generation system prompt>",
  "messages": [{ "role": "user", "content": "<prompt>" }]
}
```
- `model`, `max_tokens`, `messages` are **required**. `system` and `stream` are optional.

### Response shape
```json
{
  "id": "msg_...",
  "role": "assistant",
  "model": "claude-haiku-4-5-20251001",
  "content": [{ "type": "text", "text": "<generated JSX>" }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": N, "output_tokens": M }
}
```
- Read `response.content[0].text` for the JSX. **Guard for `stop_reason === "max_tokens"`** (truncated code → transpile fails → feeds the self-heal loop).

### Streaming vs non-streaming — RECOMMENDATION: non-streaming
- **Use non-streaming** (`stream` omitted) for code generation. The output is a single code blob that must be **complete before transpile**; streaming buys nothing because you can't compile partial JSX, and it adds SSE-parsing complexity. Haiku 4.5 is the fastest model, so a 800-1500 token completion returns quickly.
- If you later want a "typing" progress affordance in the loading UI, streaming SSE is available (`event: content_block_delta` → `delta.text_delta`), but treat it as cosmetic, not functional. **Devtools-hygiene caution:** a visible stream of React source in the Network tab is a bigger leak surface than one opaque POST — another reason to stay non-streaming.

---

## In-Browser Transpiler Decision — Babel vs Sucrase

**This architecture depends on the transpiler emitting `React.createElement` (classic runtime), because the only symbol injected into the `new Function()` scope is `React`.** Automatic-runtime output (`import { jsx as _jsx } from "react/jsx-runtime"`) will throw `_jsxRuntime is not defined` on instantiate. Both transpilers must be configured for **classic** mode.

| Criterion | @babel/standalone (RECOMMENDED for v1) | Sucrase (upgrade path) |
|---|---|---|
| Current version | `8.0.2` (pin `^7.26` to keep classic-default, OR set runtime explicitly on 8) | `3.35.1` |
| Bundle / parse cost | **Heavy:** ~3MB raw UMD / ~400-500KB gzip transfer / large parse-on-load | **Light:** ~1/10th the size; ~20× faster transform |
| Browser global / loading | UMD global `Babel` from CDN — zero config, the proven path | Ships ESM; use `transform(code, { transforms: ["jsx"], jsxRuntime: "classic" })`. Needs an ESM import or the `sucrase-browser` fork |
| Error quality (feeds self-heal loop) | **Excellent** — precise line/column/"unexpected token". Your self-heal loop appends the *Babel* error; Babel's are highly actionable | Good but terser; Sucrase is a trimmed Babel-parser fork, fewer semantic diagnostics |
| Maturity for this exact use | The de-facto standard for runtime JSX in browsers (CodeSandbox/Babel REPL/LiveCodes heritage) | Proven, but tuned for dev build speed more than runtime-in-browser |
| Risk | Babel 8 default-runtime trap (mitigated by explicit config) | Must verify a browser build + classic runtime; smaller community for this niche |

**Recommendation:**
- **v1: `@babel/standalone` with `presets: [["react", { runtime: "classic" }]]`.** Its superior error messages directly improve the self-heal loop's success rate (the resilience budget that protects the core loop). Eager-load it at init.
- **Optimization milestone: evaluate Sucrase** if Babel's download/parse measurably hurts first-cache-miss latency. Sucrase's size/speed win is large; the only blockers are the browser-build packaging and slightly weaker error diagnostics. Keep the transpiler behind the existing `generation/transpile.ts` seam so it's swappable.
- **Do NOT** use esbuild-wasm or @swc/wasm-web for v1: both are WASM-heavy (esbuild-wasm `0.28.1`, @swc/wasm-web `1.15.43`), add a WASM-init step, and are overkill for single-component JSX transforms. They make sense only at large transform volume, which this isn't.

---

## Running Untrusted Generated Code — Safety Path

### v1: constrained `new Function()` scope (matches blueprint, with hardening)
- **Strict scope hygiene:** the generated code is run as `new Function("module","exports","React","useWidget", transpiledJS)(...)`. Only those names are in scope. `window`, `document`, `fetch`, `localStorage` are **not passed in** — but they remain reachable as ambient globals because `new Function` bodies run in global scope, NOT a true sandbox.
- **Therefore `new Function` is containment-by-convention, not security.** A malicious/hallucinated component CAN reach `window`, read `localStorage` (including the API key), or call `fetch`. The threat model that makes this acceptable for v1: **the code comes from the user's own Anthropic key generating UI for the same user** — it's not third-party-attacker code. Document this explicitly.
- **Hardening you should still do in v1:**
  - Render only through React's vDOM; never `innerHTML` / `dangerouslySetInnerHTML` in host code (blueprint already says this).
  - Wrap every app and every widget in an `ErrorBoundary` so a throw can't take down the shell.
  - Do NOT expose the API-key store or the raw `db` handle anywhere reachable from the global scope a `new Function` body sees. (You can't fully prevent `window.localStorage` access, but don't add your own globals.)
  - Run the host with a **Content-Security-Policy** that forbids `connect-src` to anything except `api.anthropic.com` and self — this blocks generated code from exfiltrating the key to a third-party origin even if it reads it. **CSP is your strongest v1 lever** and is currently absent from the blueprint. Note `'unsafe-eval'` is required in `script-src` for both `new Function` and Babel — scope it tightly and rely on `connect-src` to contain exfiltration.

### Upgrade path: `<iframe sandbox>` isolation (production hardening, out of v1 scope)
- Move generated apps into `<iframe sandbox="allow-scripts">` (omit `allow-same-origin` so the frame gets an opaque origin with NO access to the parent's `localStorage`, cookies, or DOM). The API key never enters the iframe.
- Communication via `postMessage`: the parent shell brokers all data/handler calls; the generated app inside the frame can't see the key or the registry.
- Cost: you must ship React + the component into the frame (srcdoc or blob URL), and theming via CSS variables needs to be re-injected per frame. This is why it's a later milestone, not v1 — but it is the **correct** end state and the only way to safely run code you don't trust.
- Keep the execution engine (`execution/instantiate.ts`, `mount.ts`) behind an interface so swapping `new Function` → iframe is a contained change.

---

## Installation

```bash
# Core (host app + injected runtime deps)
npm install react@^19.2 react-dom@^19.2 idb@^8

# In-browser transpiler — pin to v7 to keep classic-runtime default,
# OR install v8 and set runtime:"classic" explicitly in code.
npm install @babel/standalone@^7.26
#   (alternative / optimization)  npm install sucrase@^3.35

# Dev dependencies (host build + types)
npm install -D vite@^6 @vitejs/plugin-react@^6 typescript@^5.7 \
  @types/react@^19 @types/react-dom@^19 @types/babel__standalone

# Optional, dev-only: typed Anthropic Message shapes (NOT shipped in hot path)
npm install -D @anthropic-ai/sdk@^0.106
```
> `@babel/standalone` is also commonly loaded from a CDN UMD `<script>` (cdnjs/unpkg) instead of bundled, to keep it out of the host bundle and lazy-controllable. Either works; if bundling, ensure Vite doesn't tree-shake away the dynamic transform usage.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@babel/standalone` (classic runtime) | **Sucrase** | When Babel's ~400KB+ download / parse cost measurably hurts first-cache-miss latency. Sucrase is ~20× faster + far smaller. Adopt after v1, behind the transpile seam. |
| `@babel/standalone` | **esbuild-wasm / @swc/wasm-web** | Only at high transform volume or if you also need full TS-type-stripping at scale. Overkill (WASM init cost) for single-component JSX here. |
| Raw `fetch` to `/v1/messages` | **@anthropic-ai/sdk + `dangerouslyAllowBrowser: true`** | If you want typed responses/retries/streaming helpers and accept the bundle weight + a more identifiable network/SDK fingerprint. Conflicts mildly with devtools-hygiene goals. |
| `idb` | **Raw IndexedDB API** | Only if you must avoid every dependency. You'll re-implement transaction/upgrade plumbing and own those bugs. Not worth it. |
| Non-streaming generation | **SSE streaming** | Only for a cosmetic "generating…" progress affordance. Never for functional compilation (can't compile partial JSX). Adds a Network-tab leak surface. |
| Vite | **Next.js / CRA / Parcel** | Don't. Next.js implies a server (contradicts client-only zero-infra). CRA is deprecated. Parcel works but Vite is the current standard with better DX and source-map control for the hygiene requirement. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`@babel/standalone@8` with default presets** | Babel 8 defaults the React preset to the **automatic** JSX runtime → emits `_jsx(...)` + `import "react/jsx-runtime"`, which is **undefined inside your `new Function` scope** → every generated component throws on instantiate. | Pin `@babel/standalone@^7.26`, **or** keep v8 and write `presets: [["react", { runtime: "classic" }]]` so output uses `React.createElement` (the symbol you actually inject). |
| **Browser fetch WITHOUT `anthropic-dangerous-direct-browser-access: true`** | CORS preflight rejects the request: "CORS requests must set 'anthropic-dangerous-direct-browser-access' header." | Always send the header on browser calls. |
| **The alias `claude-haiku-4-5` for cache-keyed generation** | Aliases can repoint; output drift would silently invalidate cache-key determinism. | Use the dated id `claude-haiku-4-5-20251001`. |
| **Storing compiled `Function` objects in IndexedDB** | Functions aren't structured-clone serializable; recompilation must be controlled. (Blueprint already forbids this — reaffirmed.) | Store `transpiledJS` **string**; re-instantiate via `new Function` on load; keep a session `Map` for compile-once. |
| **Streaming for functional code generation** | You can't transpile partial JSX; adds SSE complexity + a Network-tab source-leak surface. | Non-streaming single POST. |
| **Next.js / any SSR framework** | Implies a server → breaks the deliberate client-only, zero-infra constraint and the "never proxy the key" rule. | Vite SPA. |
| **Production source maps on the host bundle** | Source maps expose comments/symbol names → directly violates the devtools-hygiene hard rule (incl. the "synthesize" token in comments). | `build.sourcemap: false` + minify in the Vite prod config. |
| **`@anthropic-ai/sdk` in the shipped hot path** | Bundle weight + an identifiable SDK surface; unneeded for one endpoint. | Raw `fetch`. |
| **`React.createElement` automatic-runtime mismatch via host's own JSX config bleeding into generated code** | The host (`@vitejs/plugin-react`) uses automatic runtime — that's fine for host code, but must NOT be the config used for the runtime transpile of generated code. | Keep the two compile paths fully separate; generated path = Babel-standalone classic. |

---

## Stack Patterns by Variant

**If first-cache-miss latency is acceptable with Babel (likely true at v1 scale):**
- Use `@babel/standalone` classic-runtime, eager-loaded.
- Because its error diagnostics maximize self-heal success and it's the zero-config proven path.

**If transpiler download/parse becomes a measured bottleneck (post-v1):**
- Swap to Sucrase (`transforms: ["jsx"], jsxRuntime: "classic"`) behind `generation/transpile.ts`.
- Because ~20× faster + far smaller; the seam makes it a contained change.

**If/when you must run genuinely untrusted (non-owner) generated code, or before any multi-user/sharing feature:**
- Move to `<iframe sandbox="allow-scripts">` + `postMessage`, key never entering the frame.
- Because `new Function` is containment-by-convention, not a security boundary.

**Always (cross-cutting, v1):**
- Ship a CSP with `connect-src 'self' https://api.anthropic.com` to contain key exfiltration; `script-src` will need `'unsafe-eval'` for `new Function`/Babel — scope tightly.
- Because it's the strongest available v1 mitigation given the `new Function` model.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `react@19.2.x` | `react-dom@19.2.x` | **Must match exactly.** Same major+minor. `createRoot` is the React 18+/19 root API used here. |
| `@types/react@^19` | `@types/react-dom@^19` | Pair with React 19. |
| `@babel/standalone@^7.26` | `presets: ["react"]` → classic by default | v7 keeps classic default → safe. |
| `@babel/standalone@8.0.2` | `presets: [["react", { runtime: "classic" }]]` | v8 needs **explicit** classic runtime, else automatic output breaks `new Function` instantiation. |
| Babel classic output (`React.createElement`) | `new Function` scope injecting `React` | This is the whole contract — the injected `React` must match what the transpiler targets. |
| `idb@8.0.3` | Modern evergreen browsers | Promise/async IndexedDB; `DBSchema` typing for `apps`/`widgets`/`handlers`. |
| `vite@6+` / `@vitejs/plugin-react@6` | `typescript@5.7+` (6.x current) | Host build path only; independent of the runtime transpile path. |
| `anthropic-version: 2023-06-01` | `claude-haiku-4-5-20251001` | Current stable API contract value; not tied to model version. |

---

## Sources

- npm registry (verified live, 2026-06-24) — current versions: `react`/`react-dom` 19.2.7, `@babel/standalone` 8.0.2, `idb` 8.0.3, `sucrase` 3.35.1, `@anthropic-ai/sdk` 0.106.0, `vite` 8.1.0, `typescript` 6.0.3, `@vitejs/plugin-react` 6.0.3, `esbuild-wasm` 0.28.1, `@swc/wasm-web` 1.15.43 — **HIGH**
- platform.claude.com/docs — Models overview (Haiku 4.5 id `claude-haiku-4-5-20251001`, alias, 200K ctx / 64K out, pricing) — **HIGH**
- platform.claude.com/docs/en/api/messages — required headers, `anthropic-version: 2023-06-01`, request/response shape, `max_tokens` required — **HIGH**
- simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access — CORS header requirement + bring-your-own-key pattern — **HIGH** (cross-confirmed by multiple GitHub CORS-error issues)
- babeljs.io v8-migration + preset-react docs — Babel 8 flips React preset default to automatic runtime; set `runtime:"classic"` to keep `React.createElement` — **HIGH**
- github.com/alangpierce/sucrase + Honeybadger Babel-vs-Sucrase comparison — ~20× faster, JSX classic via `jsxRuntime`, browser-build caveat — **MEDIUM-HIGH**
- react.dev/reference/react-dom/client/createRoot — multiple independent roots per page, one root per container — **HIGH**
- Anthropic messages-streaming docs — SSE `content_block_delta` / `text_delta` shape (relevant only if streaming adopted) — **HIGH**

---
*Stack research for: client-side generative-UI app marketplace (runtime-compiled LLM React)*
*Researched: 2026-06-24*
