---
phase: 20-opaque-origin-frame-isolation
plan: 02
type: tdd
wave: 1
depends_on: []
files_modified:
  - src/execution/loader.ts
  - src/execution/loader.test.ts
  - src/execution/frameMount.ts
  - src/execution/frameMount.test.ts
  - scripts/embed-react-cjs.mjs
  - src/execution/reactEmbed.generated.ts
autonomous: true
requirements: [SANDBOX-01, SANDBOX-04]
must_haves:
  truths:
    - "getTranspiledJS(cacheKey) returns the cached transpiled string on a hit and undefined on a miss"
    - "buildSrcdoc accepts ONLY (transpiledJS, themeVars, parentOrigin) and its output never contains the key pattern /sk-ant/"
    - "The srcdoc carries an in-frame CSP <meta> with connect-src 'none' and the 12 theme vars baked into a <style>"
    - "broadcastTheme posts THEME_PUSH to every registered frame contentWindow with targetOrigin '*'"
    - "registerFrame/unregisterFrame add/remove a frame from the Map; unregister of an absent id is a no-op"
  artifacts:
    - path: "src/execution/loader.ts"
      provides: "getTranspiledJS(cacheKey) read-only accessor into the session transpiledCache"
      contains: "export function getTranspiledJS"
    - path: "src/execution/frameMount.ts"
      provides: "Map<instanceId,HTMLIFrameElement> registry, register/unregister/broadcastTheme, buildSrcdoc type-enforced builder, SRCDOC built-once constant"
      contains: "buildSrcdoc"
    - path: "src/execution/reactEmbed.generated.ts"
      provides: "Inlined React + ReactDOM + scheduler CJS production strings for the srcdoc (built once at module load)"
      contains: "REACT_EMBED"
  key_links:
    - from: "src/execution/loader.ts getTranspiledJS"
      to: "transpiledCache (existing line 112 Map)"
      via: "transpiledCache.get(cacheKey)?.transpiledJS"
      pattern: "transpiledCache.get"
    - from: "src/execution/frameMount.ts broadcastTheme"
      to: "registered frame contentWindow.postMessage"
      via: "el.contentWindow?.postMessage({ type: 'THEME_PUSH', payload: { vars } }, '*')"
      pattern: "postMessage"
---

<objective>
Build the frame-mount infrastructure: the `getTranspiledJS` loader accessor (so a frame gets the compiled string without re-resolving), the inlined-React CJS embed (React 19 has no UMD), and `frameMount.ts` — the `Map<instanceId, HTMLIFrameElement>` registry plus the type-enforced `buildSrcdoc` builder that produces the opaque-origin frame document with baked-in theme vars and an in-frame CSP. Pure unit-testable in JSDOM (the srcdoc is a string; no real frame execution needed here).

Purpose: SANDBOX-01 (srcdoc isolation) and SANDBOX-04 (theme broadcast plumbing). The type-enforced `buildSrcdoc(transpiledJS, themeVars, parentOrigin)` signature is the structural guarantee that the API key can never enter the frame — no `services`/key parameter is accepted. The Wave-2 `SandboxFrame` component consumes `SRCDOC`/`buildSrcdoc` + `registerFrame`/`unregisterFrame`; the Wave-3 `VibeThemeProvider` consumes `broadcastTheme`.

Output: `getTranspiledJS` added to `loader.ts`; `scripts/embed-react-cjs.mjs` + generated `reactEmbed.generated.ts`; `frameMount.ts` with the registry, `broadcastTheme`, and `buildSrcdoc` + the module-level `SRCDOC` constant pieces.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md
@.planning/phases/20-opaque-origin-frame-isolation/20-PATTERNS.md

<interfaces>
<!-- Extracted from the codebase. Use directly — no exploration needed. -->

From src/execution/loader.ts (the cache + the existing test-only export pattern to MIRROR for the new accessor):
```typescript
interface CachedApp { source: string; transpiledJS: string; mode: AppMode; }
const transpiledCache = new Map<string, CachedApp>();   // line 112
// existing read-only/maintenance export style (lines 385-388):
export function _clearCachesForTesting(): void { liveComponents.clear(); transpiledCache.clear(); }
```

From src/execution/mount.ts (the Map<instanceId, ref> + register/unregister lifecycle to MIRROR):
```typescript
const roots = new Map<string, Root>();
export function unmountApp(instanceId: string): void {
  const root = roots.get(instanceId);
  if (root) { root.unmount(); roots.delete(instanceId); }   // safe-delete: no-op if absent
}
```

From src/execution/instantiate.ts (the in-frame scope must MIRROR this require-shim + new Function param list so the SAME generated code runs either side):
```typescript
function requireShim(specifier: string): unknown {
  if (specifier === "react" || specifier === "react-dom") return sharedReact;
  throw new Error(`Component requested an unavailable module "${specifier}".`);
}
const fn = new Function("module", "exports", "React", "useWidget", "runHandler", "require", transpiledJS);
fn(mod, mod.exports, sharedReact, useWidget, runHandler, requireShim);
// App is read from mod.exports.default ?? mod.exports.App, with a second-pass return-App fallback.
```

From src/ui/VibeThemeProvider.tsx (the 12 theme var NAMES — bake EXACTLY these into the srcdoc <style> and accept EXACTLY these in THEME_PUSH):
```
--text, --wall, --b1, --b2, --b3, --b4, --glass, --glass2, --bord, --hi, --accentA, --accentB
```
</interfaces>

<react_cjs_embed_facts>
<!-- Verified against node_modules at plan time. The embed must resolve this require graph. -->
- node_modules/react/cjs/react.production.js (17KB) — NO requires (leaf).
- node_modules/scheduler/cjs/scheduler.production.js — NO requires (leaf).
- node_modules/react-dom/cjs/react-dom.production.js — requires "react".
- node_modules/react-dom/cjs/react-dom-client.production.js (536KB) — requires "scheduler", "react", "react-dom".
- Embed order in the srcdoc IIFE shim chain: scheduler -> react -> react-dom -> react-dom-client.
- Each module body runs as `new Function("module","exports","require", body)` with a require-shim resolving "scheduler"/"react"/"react-dom" to the already-built module.exports; finally assign window.React = react.exports and window.ReactDOM = reactDomClient.exports (createRoot lives on react-dom-client).
- Files carry "use strict" and `require(...)` calls — they are CJS, NOT UMD; the shim is mandatory.
- No `process.env` references in react.production.js (confirmed 0 occurrences) — no NODE_ENV shim needed for react; if react-dom-client references process.env, define `var process={env:{NODE_ENV:"production"}}` in the bootstrap scope.
</react_cjs_embed_facts>

<csp_facts>
<!-- The host index.html CSP (srcdoc inherits parent CSP; the in-frame <meta> tightens further). -->
Parent CSP: default-src 'self'; script-src 'self' 'unsafe-eval' 'sha256-...'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.anthropic.com ...
In-frame <meta> to emit inside the srcdoc (tighter — belt-and-suspenders): 
  default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'self' data:
(unsafe-eval is REQUIRED for new Function; unsafe-inline for the bootstrap <script> and baked <style>; connect-src 'none' hard-blocks frame exfiltration — the parent brokers all data. VERIFY the inlined React + new Function still run under this meta before committing.)
</csp_facts>
</context>

<tasks>

<task type="tdd" tdd="true">
  <name>Task 1: RED+GREEN — getTranspiledJS accessor on loader.ts</name>
  <read_first>
    - src/execution/loader.ts lines 90-112 (the live/transpiled cache shapes) and lines 378-389 (the existing read-only/test-only export style to mirror)
    - src/execution/loader.test.ts (the existing loader test harness — how it seeds the cache via resolveComponent + _clearCachesForTesting)
    - .planning/phases/20-opaque-origin-frame-isolation/20-PATTERNS.md lines 284-308 (the exact getTranspiledJS accessor shape)
    - .planning/STATE.md lines 135-138 (the pending todo: confirm loader transpiled-string accessor)
  </read_first>
  <behavior>
    - Test: after `resolveComponent` populates the cache for a seeded app, `getTranspiledJS(thatCacheKey)` returns a non-empty string equal to the cached `transpiledJS`.
    - Test: `getTranspiledJS("no-such-key")` returns `undefined`.
    - Test: after `_clearCachesForTesting()`, `getTranspiledJS(previouslyCachedKey)` returns `undefined` (read-only accessor reflects cache clears; it never mutates the cache).
  </behavior>
  <action>
    Add `export function getTranspiledJS(cacheKey: string): string | undefined { return transpiledCache.get(cacheKey)?.transpiledJS; }` to `src/execution/loader.ts`, placed near the other read-only/maintenance exports (after `_clearCachesForTesting`, ~line 388). Add a neutral JSDoc per 20-PATTERNS.md (no mechanism words). Do NOT change `resolveComponent`, the cache shape, or any tier logic — this is a pure read-only accessor over the existing `transpiledCache`.
  </action>
  <verify>
    <automated>npx vitest run src/execution/loader.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/execution/loader.ts` contains `export function getTranspiledJS` and `transpiledCache.get(cacheKey)?.transpiledJS` (source assertions).
    - The new loader tests prove hit returns the string, miss returns undefined, and clearing the cache yields undefined.
    - `npx vitest run src/execution/loader.test.ts` exits 0 with the prior loader tests still green.
  </acceptance_criteria>
  <done>The read-only `getTranspiledJS` accessor exists, is proven for hit/miss/clear, and the existing loader tests are unchanged-green.</done>
</task>

<task type="auto">
  <name>Task 2: Inlined React CJS embed — build script + generated constant</name>
  <read_first>
    - The `<react_cjs_embed_facts>` block above (the exact require graph + embed order + shim contract)
    - src/execution/instantiate.ts lines 68-119 (the require-shim + new Function param contract the in-frame bootstrap must mirror)
    - vite.config.ts (build.sourcemap false / minify true / target es2020 — the embed must not break the host build)
  </read_first>
  <action>
    Create `scripts/embed-react-cjs.mjs`: a one-time/dev Node script that reads the four production CJS files (`react/cjs/react.production.js`, `scheduler/cjs/scheduler.production.js`, `react-dom/cjs/react-dom.production.js`, `react-dom/cjs/react-dom-client.production.js`) from node_modules, JSON.stringify-escapes each body, and writes `src/execution/reactEmbed.generated.ts` exporting `export const REACT_EMBED = { scheduler: "...", react: "...", reactDom: "...", reactDomClient: "..." } as const;` plus a short generated-file header comment (neutral, mechanism-free; this file is large but is authored-source-equivalent so it WILL be hygiene-scanned in Plan 05 — keep zero banned tokens). Run the script to produce `reactEmbed.generated.ts`. The generated module is imported by `frameMount.ts` so the bytes ship in the bundle (the frame needs React at runtime; there is no network fetch). Do NOT inline the dev builds. Keep the script idempotent (re-runnable) and add a `"embed:react"` npm script entry to package.json invoking it. The script is dev-only tooling; only the generated `.ts` constant ships.
  </action>
  <verify>
    <automated>node scripts/embed-react-cjs.mjs && node -e "const m=require('node:fs').readFileSync('src/execution/reactEmbed.generated.ts','utf8'); if(!/REACT_EMBED/.test(m)||!/react-dom-client/i.test(m)){process.exit(1)} console.log('embed-ok', m.length)"</automated>
  </verify>
  <acceptance_criteria>
    - `scripts/embed-react-cjs.mjs` exists and runs to exit 0.
    - `src/execution/reactEmbed.generated.ts` exists, exports `REACT_EMBED`, and contains all four embedded bodies (scheduler, react, react-dom, react-dom-client).
    - The generated file length is > 500000 chars (the ~553KB embed is present, not a stub).
    - `npx tsc --noEmit` exits 0 (the generated `as const` constant typechecks).
  </acceptance_criteria>
  <done>The React/ReactDOM/scheduler production CJS is embedded as a generated TS constant, regenerable via `node scripts/embed-react-cjs.mjs`, and typechecks.</done>
</task>

<task type="tdd" tdd="true">
  <name>Task 3: RED+GREEN — frameMount.ts: registry, broadcastTheme, and type-enforced buildSrcdoc</name>
  <read_first>
    - src/execution/mount.ts lines 19-82 (the Map register/unregister/safe-delete lifecycle to mirror)
    - src/execution/reactEmbed.generated.ts (the REACT_EMBED constant from Task 2 — consumed in the srcdoc bootstrap)
    - src/execution/instantiate.ts lines 68-119 (the in-frame new Function scope + require-shim the bootstrap must mirror so the SAME generated code runs in-frame)
    - src/ui/VibeThemeProvider.tsx lines 40-101 (the 12 theme var names baked into the <style>)
    - .planning/phases/20-opaque-origin-frame-isolation/20-PATTERNS.md lines 112-169 (frameMount Map shape, broadcastTheme shape, SRCDOC_TEMPLATE built-once constant)
    - .planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md lines 25-44 (srcdoc + inlined React + in-frame rendering mechanics + in-frame CSP + key-never-crosses)
    - The `<csp_facts>` block above (the exact in-frame CSP meta to emit)
  </read_first>
  <behavior>
    - Test: `buildSrcdoc(transpiledJS, themeVars, parentOrigin)` returns a string containing `<iframe`-free document HTML with `<meta http-equiv="Content-Security-Policy"` whose content includes `connect-src 'none'` and `script-src 'unsafe-inline' 'unsafe-eval'`.
    - Test: the returned srcdoc contains a `<style>` block setting all 12 theme vars from `themeVars` on `:root` (assert at least `--text` and `--glass2` appear with their passed values).
    - Test (KEY NEVER CROSSES): `buildSrcdoc("const App=()=>null;", {"--text":"#fff"}, "https://host.test")` output does NOT match `/sk-ant/` even when called — and the function signature accepts exactly 3 params (a 4th arg is rejected at the type level; assert via a tsc-checked test or by reading `buildSrcdoc.length === 3`).
    - Test: the srcdoc embeds `parentOrigin` as the frame->parent postMessage target (assert the passed `parentOrigin` string appears in the bootstrap script, used for `parent.postMessage(env, PARENT_ORIGIN)`).
    - Test: `registerFrame("a", el)` then `broadcastTheme({"--text":"#000"})` calls `el.contentWindow.postMessage` once with an envelope `{ type: "THEME_PUSH", payload: { vars } }` and targetOrigin `"*"`.
    - Test: `registerFrame("a", elA)` + `registerFrame("b", elB)`, then `broadcastTheme(vars)` posts to BOTH; after `unregisterFrame("a")`, broadcast posts only to elB.
    - Test: `unregisterFrame("never-registered")` is a no-op (no throw).
    - Test: the `SRCDOC_HEAD` / template constant that carries the ~553KB React embed is built once at module load (assert two `buildSrcdoc` calls reuse the same embedded-React substring, i.e. the embed is referenced, not rebuilt — assert the REACT_EMBED.react substring is present in output).
  </behavior>
  <action>
    Create `src/execution/frameMount.ts`. Mirror `mount.ts`: module-level `const frameRefs = new Map<string, HTMLIFrameElement>()`; `export function registerFrame(instanceId, el)`, `export function unregisterFrame(instanceId)` (safe-delete), `export function broadcastTheme(vars: Record<string,string>)` iterating `frameRefs` and calling `el.contentWindow?.postMessage({ type: "THEME_PUSH", payload: { vars } }, "*")` (mirror 20-PATTERNS.md broadcastTheme; wrap each post in try/catch -> gated logger so one dead frame never breaks the loop). Build the srcdoc as `export function buildSrcdoc(transpiledJS: string, themeVars: Record<string, string>, parentOrigin: string): string` — EXACTLY three params, no `services`/key param (SANDBOX-02 structural guarantee). Compose the document: `<head>` with the in-frame CSP `<meta>` from `<csp_facts>`, a `<style>` injecting the 12 themeVars onto `:root` plus the infinite-resize guard (`#root{height:max-content} body{overflow:hidden;margin:0}`), then a bootstrap `<script>` that (1) defines a `process` shim if needed, (2) builds scheduler/react/react-dom/react-dom-client from `REACT_EMBED` via a CJS require-shim chain assigning `window.React`/`window.ReactDOM`, (3) defines the in-frame RPC stubs (`useWidget`, `runHandler`, `fetchData`) that postMessage to `parent` with `parentOrigin` and await correlated results, (4) listens for `VIBE_BOOTSTRAP` -> runs `new Function("module","exports","React","useWidget","runHandler","require", transpiledJS)` mirroring instantiate.ts, then `ReactDOM.createRoot(#root).render(React.createElement(App))`, (5) installs a `ResizeObserver` on `#root` posting `FRAME_RESIZE`, a `window.onerror` posting `FRAME_ERROR`, and a `FRAME_PING`->`FRAME_PONG` responder, and posts `FRAME_READY` on load. Hoist the heavy, app-independent prefix (CSP meta + React embed + bootstrap skeleton) into a module-level constant so it is concatenated, not rebuilt, per `buildSrcdoc` call. The `transpiledJS` and `themeVars` are injected via safe escaping (JSON.stringify for the JS string passed through postMessage at bootstrap time is preferable to literal interpolation — but since VIBE_BOOTSTRAP delivers transpiledJS over postMessage in SandboxFrame, buildSrcdoc may bake ONLY themeVars + parentOrigin into the document and receive transpiledJS at runtime; choose the postMessage-delivery approach so transpiledJS is NOT string-concatenated into the srcdoc — this also keeps the srcdoc app-independent and built-once). If transpiledJS is delivered via postMessage, `buildSrcdoc`'s `transpiledJS` param is still part of the signature for the in-tree/test path; document the chosen delivery in a neutral comment. No banned tokens anywhere in the file or the srcdoc strings (HYGIENE-07).
  </action>
  <verify>
    <automated>npx vitest run src/execution/frameMount.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/execution/frameMount.ts` contains `export function buildSrcdoc(transpiledJS: string, themeVars: Record<string, string>, parentOrigin: string)` — exactly three params (source assertion); `buildSrcdoc.length === 3` asserted in test.
    - The srcdoc string contains `connect-src 'none'` and `<meta http-equiv="Content-Security-Policy"` (source/behavior assertion).
    - `buildSrcdoc(...)` output does NOT match `/sk-ant/` (behavior assertion).
    - `broadcastTheme` posts `{ type: "THEME_PUSH", payload: { vars } }` with targetOrigin `"*"` to every registered frame (behavior assertion).
    - `unregisterFrame` of an absent id is a no-op; broadcast skips unregistered frames (behavior assertion).
    - `npx vitest run src/execution/frameMount.test.ts` exits 0.
  </acceptance_criteria>
  <done>frameMount.ts provides the frame registry, theme broadcast, and the type-enforced 3-param `buildSrcdoc` (no-key, in-frame CSP, baked theme vars, built-once React embed), all proven by tests including the no-`/sk-ant/` assertion.</done>
</task>

<task type="auto">
  <name>Task 4: Full-suite green + tsc clean</name>
  <read_first>
    - src/execution/frameMount.ts (the completed module)
    - src/execution/loader.ts (the added accessor)
  </read_first>
  <action>
    Run the full suite + typechecker. `frameMount.ts` and `getTranspiledJS` are not yet imported by production render code (consumed in Wave 2/3), so the prior 761 tests stay green; the new loader/frameMount tests add to the count. Fix any tsc error from the embed `as const` or the DOM-typed `HTMLIFrameElement`/`Window` references without weakening the 3-param `buildSrcdoc` signature.
  </action>
  <verify>
    <automated>npx vitest run && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run` exits 0; prior 761 tests green plus the new loader + frameMount tests.
    - `npx tsc --noEmit` exits 0.
  </acceptance_criteria>
  <done>Full suite green, tsc clean, render path unchanged (prior test count preserved).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| host srcdoc builder -> frame document | The srcdoc string is the entire frame document; anything baked in is readable via devtools inside the frame |
| theme broadcast -> frame contentWindow | `broadcastTheme` posts to every registered frame; a payload leak here would cross into untrusted scope |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-06 | Information Disclosure | API key baked into srcdoc | mitigate | `buildSrcdoc(transpiledJS, themeVars, parentOrigin)` accepts no `services`/key param (type-enforced, `.length === 3`); output asserted to not match `/sk-ant/` |
| T-20-07 | Elevation of Privilege | frame reaching network to exfiltrate | mitigate | in-frame CSP `<meta>` `connect-src 'none'`; the parent brokers all data (FETCH_DATA dataBroker allowlist, Plan 03/04) |
| T-20-08 | Information Disclosure | theme broadcast payload carrying non-theme data | mitigate | `broadcastTheme(vars)` posts only `{ type:"THEME_PUSH", payload:{ vars } }`; vars are the 12 CSS strings, audited to carry no key-adjacent data |
| T-20-09 | Tampering | resize loop / layout exploit | mitigate | `#root{height:max-content}` + `body{overflow:hidden}` infinite-resize guard baked into the srcdoc style |
</threat_model>

<verification>
- `src/execution/loader.ts` contains `export function getTranspiledJS` over `transpiledCache.get(...)?.transpiledJS`.
- `src/execution/reactEmbed.generated.ts` exists (>500KB) exporting `REACT_EMBED` with all four CJS bodies.
- `src/execution/frameMount.ts` exports `registerFrame`/`unregisterFrame`/`broadcastTheme`/`buildSrcdoc`; `buildSrcdoc.length === 3`; output has `connect-src 'none'`, no `/sk-ant/`.
- `npx vitest run` and `npx tsc --noEmit` both exit 0.
</verification>

<success_criteria>
- A frame can receive its compiled string via `getTranspiledJS` (no re-resolve).
- React/ReactDOM/scheduler are embedded once for the srcdoc (React 19 has no UMD).
- `buildSrcdoc` is structurally key-proof (3 params, no `/sk-ant/`), carries the in-frame CSP `connect-src 'none'`, and bakes the 12 theme vars.
- `broadcastTheme` reaches every live frame with `"*"` targetOrigin; the registry register/unregister lifecycle is safe.
- Full suite + tsc green; render path unchanged.
</success_criteria>

<output>
After completion, create `.planning/phases/20-opaque-origin-frame-isolation/20-02-SUMMARY.md`.
</output>
