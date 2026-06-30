# Phase 20: Opaque-Origin Frame Isolation (HARD-01) — Context

**Gathered:** 2026-06-27
**Status:** Ready for planning
**Mode:** Autonomous — enriched from v3.0 research SUMMARY.md + TWO Google AI Mode consults (security/RPC attack-surface, and the srcdoc rendering mechanics).

<domain>
## Phase Boundary

Convert each app body from a `new Function` in-tree render into a **genuinely isolated `<iframe sandbox="allow-scripts">`** with an **opaque origin**. The compiled component runs inside the frame with the frame's own React copy; all data/handler/modify calls are brokered to the parent via a typed `postMessage` RPC. **The Anthropic API key never enters the frame.** Theme CSS vars are pushed into each frame. The existing **727→761 test suite stays green** via an in-tree fallback mode; a Playwright test proves the real frame round-trip.

Requirements: **SANDBOX-01, SANDBOX-02, SANDBOX-03, SANDBOX-04, SANDBOX-05, SANDBOX-06, HYGIENE-07.**

This is the flagship, highest-risk phase. Phase 19 already moved the `⋮` contextual menu into host-owned titlebar chrome, so nothing host-controlled lives inside the body that becomes the frame.
</domain>

<decisions>
## Implementation Decisions

### The boundary (what crosses, what never does)
- **Stays in the parent (host):** the API key + keyStore, registry, `resolveComponent`/`transpile`/`producer`, `dataBroker` + its allowlist enforcement, `produceGate`, `useWindowManager`, ALL chrome (MenuBar/Dock/WindowFrame titlebar/ContextualPrompt), `VibeThemeProvider` as the theme source-of-truth.
- **Moves into the frame:** the compiled component string (instantiated by `new Function` inside the frame with the frame's own React), a thin in-frame runtime (RPC stubs for `useWidget`/`runHandler`/`fetchData`, a `ResizeObserver`, `window.onerror`).
- **NEVER crosses the boundary:** the API key; any `Function` object (`DataCloneError` — structured clone forbids it); compiled `ComponentType` instances; the `services` graph; IDB handles.

### srcdoc + inlined React (SANDBOX-01)
- Use **`srcdoc`** (NOT `blob:`/`data:`): srcdoc inherits the parent CSP (no `csp.test.ts` hash churn, no new `frame-src`), needs no `URL.createObjectURL` cleanup. `data:` is same-origin (defeats isolation).
- React 19 has **no UMD** — inline the **CJS production files** (`react.production.js` ~17KB + `react-dom-client.production.js` ~536KB) into the srcdoc as IIFEs assigning `window.React`/`window.ReactDOM`. Store the srcdoc template as a **module-level constant** built once and reused per frame instance. (Pull the bytes from `node_modules` at build time, or a one-time embed script — planner decides; keep it dep-free.)
- `sandbox="allow-scripts"` **ONLY** — NEVER add `allow-same-origin` (a frame with both can `frameElement.removeAttribute('sandbox')` and read the parent's `localStorage`/key). Do NOT add `allow-modals` (keeps `alert/confirm` suppressed). **CI test asserts the mounted `sandbox` attribute never contains `allow-same-origin`.**

### In-frame rendering mechanics (from the rendering consult)
- The srcdoc carries a `#root` div + a bootstrap script that: provides a CJS shim (`require('react')→window.React`, `require('react-dom')/('react-dom/client')→window.ReactDOM`, `module`/`exports`), executes the transpiled string via `new Function('require','module','exports','React','useWidget','runHandler', code)` (mirror the host `instantiate.ts` scope so the SAME generated code runs either side), then `createRoot(#root).render(createElement(Component))`.
- **Auto-height:** a `ResizeObserver` on `#root` posts `{type:'FRAME_RESIZE', height}` to the parent, which sets the iframe height. **Infinite-resize guard:** `#root{height:max-content}` + `body{overflow:hidden}`; avoid `100vh`/absolute layout tricks.
- **Handshake:** the frame posts `FRAME_READY` on load; the parent then sends `VIBE_BOOTSTRAP { transpiledJS, themeVars }`. (More robust than relying on iframe `onLoad` timing.)

### Key never in the frame (SANDBOX-02)
- The srcdoc builder is **type-enforced**: `buildSrcdoc(transpiledJS: string, themeVars: Record<string,string>, parentOrigin: string)` — **no other parameters accepted** (so the `services`/key can't be passed by accident). CI test asserts `iframeEl.getAttribute('srcdoc')` does not match `/sk-ant/`. Browser (Playwright) test asserts reading `localStorage` from inside the frame throws `SecurityError`.

### postMessage RPC (SANDBOX-03) — hardened per the SECURITY consult
- Frame→parent messages validated by **BOTH** `event.origin === "null"` (opaque origin is literally the string `"null"`) **AND** `event.source === thisFrame.contentWindow`. Drop anything else (gated-logger note, no throw). Correlation IDs via `crypto.randomUUID()`; pending-callback map namespaced by `[frameId, correlationId]`.
- Parent→frame messages use `targetOrigin: "*"` (opaque frames can't be addressed by `"null"`); audit that NO parent→frame payload contains key-adjacent data. Frame→parent uses the injected real `parentOrigin`.
- **RPC dispatch is a hardcoded allowlist MAP** (`Record<RpcMethod, fn>`), never dynamic `table[msg.method]()` over user strings — so the frame can't invoke `toString`/internal methods. Unknown method → drop.
- **Prototype-pollution defense (NEW, from consult — not in SUMMARY):** parse/handle every inbound frame payload via `Object.create(null)`; **never deep-merge** raw frame payloads into parent objects; validate each message + its args/result against a **rigid zod/mini schema** (we already depend on zod/mini — reuse it for the RPC envelope). Regression test: a forged `{__proto__:{polluted:true}}` payload must leave `({}).polluted === undefined`.
- **In-frame CSP `<meta>` (NEW, from consult):** add `<meta http-equiv="Content-Security-Policy">` inside the srcdoc with `connect-src 'none'` (the frame never needs network — the parent brokers all data). Allow only what the inlined React + `new Function` need (`script-src 'unsafe-inline' 'unsafe-eval'`, `style-src 'unsafe-inline'`). This hard-blocks the frame from exfiltrating anything it renders, belt-and-suspenders over the inherited parent CSP. **Verify it doesn't block the inlined React / `new Function` before committing.**
- Method set: `FRAME_READY`, `VIBE_BOOTSTRAP`, `RUN_HANDLER`(+result), `FETCH_DATA`(+result, **dataBroker allowlist enforced parent-side**), `MODIFY_REQUEST`, `THEME_PUSH`, `FRAME_RESIZE`, `FRAME_ERROR`.

### Theme into the frame (SANDBOX-04)
- CSS vars do NOT cross the iframe boundary. Bake the 12 theme vars into the srcdoc `<style>` at construction; on every `VibeThemeProvider.setTheme()` call, `broadcastTheme(vars)` posts `{type:'THEME_PUSH', vars}` to ALL registered frame `contentWindow`s, which set them on the frame's own `documentElement`. A `frameMount.ts` keeps `Map<instanceId, HTMLIFrameElement>` (register on mount / unregister on unmount).

### In-tree fallback + Playwright (SANDBOX-05)
- Add a **mode flag via `ServicesProvider`** (`Services` interface, services.ts:32): `frameMode: "iframe" | "in-tree"`. Tests default to `"in-tree"` → the existing in-tree `WindowBody`/instantiate path runs, so **all 761 RTL/JSDOM tests stay green without a real browser**. Production defaults to `"iframe"`.
- Add a `getTranspiledJS(cacheKey)` accessor to `loader.ts` (the `transpiledCache` at line 112 already holds `transpiledJS`; expose it read-only) so `SandboxFrame` gets the string without re-resolving.
- **Playwright as a devDependency** (allowed exception to zero-dep — runtime bundle untouched). One integration test proves: (a) the frame renders, (b) theme vars apply inside the frame, (c) `localStorage` read inside the frame throws `SecurityError`, (d) a forged `postMessage` from an unknown source is dropped.

### Unresponsive frame (SANDBOX-06)
- A frame in an infinite loop **cannot** be `terminate()`d (no Worker). Document as a known limitation. Mitigation: a periodic **ping** (`postMessage` ping → expect pong); on N missed pongs, show an **unresponsive-app overlay with a force-close** button (closes/replaces the frame). The desktop stays usable because only that frame's thread is stuck (separate browsing context).

### HYGIENE-07
- Extend the lexicon gate (`hygiene.test.ts`) to scan the NEW surfaces: `frameBridge.ts`, `SandboxFrame.tsx`, `frameMount.ts`, the **srcdoc template constant**, `postMessage` payload field names, new IDB keys. The words **"iframe"/"sandbox"/"isolation"** must not appear in any UI-visible copy or error message (internal code identifiers/comments are fine per the existing gate scope — keep them out of user strings). Re-apply the gate as a constraint in Phases 21/22.
</decisions>

<code_context>
## Existing Code Insights (scouted)
- `src/execution/loader.ts:112` — `transpiledCache = new Map<string, CachedApp>()`; `CachedApp` holds `transpiledJS`. Add `export function getTranspiledJS(cacheKey): string | undefined`.
- `src/execution/instantiate.ts` — host instantiation: a SINGLE shared React injected into every `new Function` scope (`sharedReact`), plus `useWidget`/`runHandler`. The FRAME mirrors this scope but with ITS OWN React (separate document → separate React copy is correct here, unlike the host's single-instance rule).
- `src/services/services.ts:32` — `interface Services`: the injection point for `frameMode`. `createServices()` (prod) defaults `"iframe"`; `testServices.ts` defaults `"in-tree"`.
- `src/ui/WindowFrame.tsx` — body is `window-chrome__body` → memoized `WindowBody` → AppShell(content-only after P19) → ErrorBoundary → Component. Swap `WindowBody` for `SandboxFrame` when `frameMode==="iframe"`; keep `WindowBody` for `"in-tree"`.
- `src/ui/VibeThemeProvider.tsx` — `setTheme` applies vars to `document.documentElement`; extend to also call `broadcastTheme(vars)`.
- `src/data/dataBroker.ts` — `fetchData(sourceId, params)` with the keyless allowlist; the parent-side `FETCH_DATA` handler calls THIS (allowlist stays parent-enforced).
- `index.html` FOUC script + `src/csp.test.ts` SHA-256 invariant — only touch if the srcdoc constant or CSP changes; if so, same-commit hash update.

## New files (from SUMMARY.md, adjust as planner sees fit)
- `src/execution/frameBridge.ts` — typed `RpcEnvelope`, zod schemas, `Object.create(null)` parsing, correlation-ID map, `sendToFrame()`/`callParent()`, the allowlist dispatch map.
- `src/execution/frameMount.ts` — `Map<instanceId, HTMLIFrameElement>`, `registerFrame`/`unregisterFrame`/`broadcastTheme`, the srcdoc template constant (inlined React + bootstrap + in-frame CSP meta).
- `src/ui/SandboxFrame.tsx` — the `<iframe sandbox="allow-scripts" srcdoc=...>` React component; handshake; height; error overlay; ping/force-close (SANDBOX-06).
</code_context>

<specifics>
## Acceptance gates (from ROADMAP success criteria)
1. App renders inside a sandboxed frame, fully interactive, theme-correct on first paint, visually identical to pre-Phase-20.
2. `localStorage` read inside the frame throws `SecurityError` (Playwright); CI asserts `sandbox` never contains `allow-same-origin`.
3. CI asserts srcdoc has no `/sk-ant/`; a forged `postMessage` from an unknown source is dropped (Playwright). **Plus:** a `__proto__` payload does not pollute parent prototypes.
4. A theme switch re-skins all open frames live (Playwright: two apps, one switch, both frames' `:root` update).
5. All 761 prior RTL/JSDOM tests pass on the in-tree fallback path (no real browser).
6. An unresponsive app triggers the overlay + force-close; the rest of the desktop stays usable.
</specifics>

<deferred>
## Deferred / accepted limitations
- True infinite-loop termination (needs a Worker / disposable separate domain) — out of scope; SANDBOX-06 contains it (overlay), does not solve it.
- Per-frame Babel sharing optimization — only if first-frame latency measurably hurts; the srcdoc template is built once at module load.
</deferred>

<consult_log>
## Google AI Mode consults (browser automation) folded into the decisions above
1. **Security/attack-surface** — surfaced two gaps NOT in SUMMARY: (a) prototype-pollution via RPC payloads → `Object.create(null)` + rigid schema validation + no deep-merge; (b) RPC method spoofing → hardcoded allowlist map, not dynamic dispatch. Plus the stronger control: in-frame CSP `<meta>` with `connect-src 'none'`.
2. **Rendering mechanics** — concrete srcdoc pattern: CJS `require` shim → `new Function` → `createRoot().render()`; `ResizeObserver`→height postMessage; infinite-resize guard (`#root{height:max-content}` + `body{overflow:hidden}`); READY/onLoad handshake before posting the bundle.
</consult_log>
