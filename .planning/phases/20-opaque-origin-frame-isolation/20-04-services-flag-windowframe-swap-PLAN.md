---
phase: 20-opaque-origin-frame-isolation
plan: 04
type: tdd
wave: 3
depends_on: [20-01, 20-02, 20-03]
files_modified:
  - src/services/services.ts
  - src/services/testServices.ts
  - src/ui/WindowFrame.tsx
  - src/ui/WindowFrame.test.tsx
  - src/ui/VibeThemeProvider.tsx
  - src/ui/VibeThemeProvider.test.tsx
  - src/ui/DesktopShell.tsx
autonomous: true
requirements: [SANDBOX-02, SANDBOX-04]
must_haves:
  truths:
    - "frameMode is a typed Services field: 'iframe' in production (createServices), 'in-tree' in tests (createTestServices default)"
    - "When frameMode === 'in-tree' WindowFrame renders the existing WindowBody (all 761 tests stay green)"
    - "When frameMode === 'iframe' WindowFrame renders SandboxFrame with the transpiledJS string and current theme vars"
    - "VibeThemeProvider.setTheme calls broadcastTheme(vars) so every open frame re-skins on a theme switch"
    - "The frame's RUN_HANDLER/FETCH_DATA/MODIFY are brokered parent-side (key + services never enter the frame)"
  artifacts:
    - path: "src/services/services.ts"
      provides: "frameMode field on the Services interface + createServices default 'iframe'"
      contains: "frameMode"
    - path: "src/ui/WindowFrame.tsx"
      provides: "frameMode-gated swap of WindowBody <-> SandboxFrame, parent-side RPC handler wiring"
      contains: "frameMode"
  key_links:
    - from: "src/ui/VibeThemeProvider.tsx setTheme"
      to: "src/execution/frameMount.ts broadcastTheme"
      via: "broadcastTheme(VIBE_THEMES[name]) inside the setTheme callback"
      pattern: "broadcastTheme"
    - from: "src/ui/WindowFrame.tsx"
      to: "src/ui/SandboxFrame.tsx"
      via: "frameMode === 'iframe' ? <SandboxFrame .../> : <WindowBody .../>"
      pattern: "SandboxFrame"
    - from: "src/ui/DesktopShell.tsx"
      to: "src/execution/loader.ts getTranspiledJS"
      via: "resolve the transpiledJS string for the frame body keyed by the app's cacheKey"
      pattern: "getTranspiledJS"
---

<objective>
Wire the frame path into the live render tree behind the injected `frameMode` flag. Add `frameMode: "iframe" | "in-tree"` to the `Services` interface (production "iframe", tests "in-tree"), swap `WindowBody` for `SandboxFrame` in `WindowFrame` when `frameMode === "iframe"`, broker the frame's RPC calls parent-side (so the key + services never enter the frame, SANDBOX-02), and extend `VibeThemeProvider.setTheme` to `broadcastTheme(vars)` (SANDBOX-04 live theme push). The in-tree default keeps all 761 existing RTL/JSDOM tests green without a real browser.

Purpose: SANDBOX-02 (the boundary is now real and the key stays parent-side because the frame only gets `transpiledJS` + theme vars and reaches the host solely through the validated RPC) and SANDBOX-04 (theme switches reach every live frame). This is the integration wave: the primitives from Plans 01-03 become the actual app-body render path.

Output: `frameMode` on Services + test default; `WindowFrame` conditional swap + parent-side handler wiring; `VibeThemeProvider` broadcast; `DesktopShell` supplying `transpiledJS` + the brokered handlers to the iframe path.
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
<!-- Extracted from the codebase + Plans 01-03. Use directly. -->

From src/services/services.ts (the interface + createServices default to extend — mirror the JSDoc style of existing fields):
```typescript
export interface Services { transport; registry; getApiKey; produceGate; storage; fetchDataBroker?; settingsStore; }
export function createServices(): Services { return { /* ... */ settingsStore: realSettingsStore }; }
```

From src/services/testServices.ts (the override interface + default to extend):
```typescript
export interface TestServicesOverrides { transport?; registry?; apiKey?; produceGate?; storage?; fetchDataBroker?; settingsStore?; }
export function createTestServices(overrides = {}): Services { return { /* ... */ settingsStore: overrides.settingsStore ?? createRecordingSettingsStore() }; }
```

From src/ui/WindowFrame.tsx (the WindowBody + the body div to gate; the props the frame needs):
```tsx
const { /* read frameMode here via useServices() */ } = ...;
// body div (lines 316-324):
<div className="window-chrome__body" onPointerDown={onFocus}>
  <WindowBody instanceId={instanceId} title={title} Component={Component} onClose={onClose} />
</div>
```

From src/ui/SandboxFrame.tsx (Plan 03 — the props to pass when frameMode === "iframe"):
```tsx
interface SandboxFrameProps { instanceId; title; transpiledJS; themeVars; onClose; onModify?; onRunHandler?; onFetchData?; }
```

From src/ui/VibeThemeProvider.tsx (setTheme to extend; VIBE_THEMES holds the 12-var maps keyed by name):
```typescript
export const VIBE_THEMES: Record<VibeThemeName, Record<string, string>>; // the 12 vars per theme
const setTheme = useCallback((name) => { setThemeState(name); localStorage.setItem(...); void settingsStore.write(name); }, [settingsStore]);
```

From src/services/ServicesProvider.tsx (the consumer hook — no shape change needed):
```typescript
export function useServices(): Services { /* throws outside provider */ }
```

From src/execution/handler.ts (the parent-side handler the iframe RUN_HANDLER brokers to):
```typescript
export async function runHandler(intent: string, input: unknown, services: Services): Promise<{ data?: unknown; error?: string }>;
```

From src/execution/loader.ts (Plan 02 — fetch the compiled string for the frame body):
```typescript
export function getTranspiledJS(cacheKey: string): string | undefined;
```

From src/ui/DesktopShell.tsx (where Component is resolved + where the cacheKey is known; handleModify routes modify):
```typescript
const Component = await resolveComponent(instanceId, appType, intent.cacheKey, services, ...);
storeComponent(instanceId, Component);
const handleModify = useCallback(async (instanceId, instruction) => { /* remove/clone/tweak */ }, ...);
```
</interfaces>

<wiring_decisions>
<!-- How the frame body gets its string + how the key stays out -->
- The iframe body needs `transpiledJS` as a string, not a `Component`. Source it via `getTranspiledJS(cacheKey)` AFTER `resolveComponent` populates the cache (resolveComponent already writes the transpiled string into transpiledCache on every non-live tier). Capture the cacheKey alongside the resolved Component in DesktopShell and store the transpiled string per instance (parallel to the components map), so WindowFrame can pass it to SandboxFrame.
- Parent-side RPC brokering (SANDBOX-02 — the key/services NEVER cross): onRunHandler = `(intent, input) => runHandler(intent, input, services)`; onFetchData = `(sourceId, params) => services.fetchDataBroker?.fetch(sourceId, params) ?? Promise.resolve({ error: "Data not available." })` (the dataBroker allowlist is enforced INSIDE the broker, parent-side); onModify = `(instruction) => handleModify(instanceId, instruction)`. These mirror the in-tree `boundRunHandler`/`boundFetchData` closures from loader.ts/handler.ts so the SAME generated code behaves identically in-frame.
- The theme vars passed to SandboxFrame come from VIBE_THEMES[currentTheme] (read via useVibeTheme()), so the frame's first paint is theme-correct; subsequent switches arrive via THEME_PUSH (broadcastTheme).
</wiring_decisions>
</context>

<tasks>

<task type="tdd" tdd="true">
  <name>Task 1: RED+GREEN — frameMode on Services (prod 'iframe', tests 'in-tree') + VibeThemeProvider broadcastTheme</name>
  <read_first>
    - src/services/services.ts lines 32-60, 101-116 (interface + createServices return)
    - src/services/testServices.ts lines 105-138 (TestServicesOverrides + createTestServices return)
    - src/ui/VibeThemeProvider.tsx lines 40-101 (VIBE_THEMES), lines 145-163 (setTheme callback to extend)
    - src/execution/frameMount.ts (Plan 02 — broadcastTheme export)
    - .planning/phases/20-opaque-origin-frame-isolation/20-PATTERNS.md lines 312-345 (services.ts frameMode field), 348-382 (testServices default), 452-489 (VibeThemeProvider broadcast)
    - .planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md line 50 (frameMode flag: tests default in-tree, prod default iframe)
  </read_first>
  <behavior>
    - Test: `createServices().frameMode === "iframe"` (production default).
    - Test: `createTestServices().frameMode === "in-tree"` (test default keeps 761 tests on the existing render path).
    - Test: `createTestServices({ frameMode: "iframe" }).frameMode === "iframe"` (override honored).
    - Test (BROADCAST): rendering `VibeThemeProvider` and calling `setTheme("noir")` invokes `broadcastTheme` exactly once with `VIBE_THEMES.noir` (spy on broadcastTheme); the existing setTheme behaviors (state update, localStorage write, settingsStore.write) are unchanged.
    - Test: `setTheme` to the same vars still applies host vars on `document.documentElement` (existing behavior preserved — broadcast is additive, not a replacement).
  </behavior>
  <action>
    Add `frameMode: "iframe" | "in-tree"` to the `Services` interface in `src/services/services.ts` (place after `settingsStore`, mirror the JSDoc style; cite SANDBOX-05) and return `frameMode: "iframe"` in `createServices()`. Add `frameMode?: "iframe" | "in-tree"` to `TestServicesOverrides` and `frameMode: overrides.frameMode ?? "in-tree"` to `createTestServices()` in `src/services/testServices.ts`. In `src/ui/VibeThemeProvider.tsx`, import `broadcastTheme` from `../execution/frameMount` and add `broadcastTheme(VIBE_THEMES[name])` as the last side-effect inside the `setTheme` useCallback (fire-and-forget, after `settingsStore.write`, OUTSIDE the state updater — mirror the existing best-effort side-effect ordering). Do not change `applyVibeTheme` or the provider's host-side var application. No banned tokens.
  </action>
  <verify>
    <automated>npx vitest run src/services/services.test.ts src/services/testServices.test.ts src/ui/VibeThemeProvider.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `src/services/services.ts` contains `frameMode` on the interface and `frameMode: "iframe"` in createServices (source assertions).
    - `src/services/testServices.ts` contains `frameMode?: "iframe" | "in-tree"` and `overrides.frameMode ?? "in-tree"` (source assertions).
    - `src/ui/VibeThemeProvider.tsx` contains `broadcastTheme(VIBE_THEMES[name])` and imports broadcastTheme from frameMount (source assertions).
    - The broadcast test proves setTheme("noir") calls broadcastTheme once with VIBE_THEMES.noir; the prior VibeThemeProvider tests stay green.
    - `npx vitest run` on the named files exits 0.
  </acceptance_criteria>
  <done>frameMode is a typed Services field (prod iframe / test in-tree), and every theme switch broadcasts the new vars to all live frames, with all existing theme behavior preserved.</done>
</task>

<task type="tdd" tdd="true">
  <name>Task 2: RED+GREEN — WindowFrame frameMode-gated swap (WindowBody <-> SandboxFrame) with in-tree default green</name>
  <read_first>
    - src/ui/WindowFrame.tsx (full file — the WindowBody memo, the body div lines 316-324, the props interface)
    - src/ui/WindowFrame.test.tsx (the existing WindowFrame tests — they must stay green on the in-tree default)
    - src/ui/SandboxFrame.tsx (Plan 03 — the props to pass)
    - src/services/ServicesProvider.tsx lines 28-38 (useServices hook)
    - .planning/phases/20-opaque-origin-frame-isolation/20-PATTERNS.md lines 405-448 (the WindowFrame swap pattern)
  </read_first>
  <behavior>
    - Test (IN-TREE DEFAULT): rendering `<WindowFrame ... />` under a `ServicesProvider` whose services have `frameMode: "in-tree"` (the createTestServices default) renders the existing `WindowBody` (the AppShell + ErrorBoundary + Component path) — assert the app content renders in-tree and NO `<iframe>` appears. All existing WindowFrame tests must pass unchanged.
    - Test (IFRAME MODE): rendering `<WindowFrame ... transpiledJS="const App=()=>null;" themeVars={...} />` under `frameMode: "iframe"` renders a `<SandboxFrame>` (assert an `<iframe sandbox="allow-scripts">` appears and the in-tree WindowBody/AppShell does NOT).
    - Test (NO TRANSPILED YET): in iframe mode when `transpiledJS` is absent/empty (still resolving), WindowFrame renders the neutral "Preparing…" placeholder (same as the in-tree null-Component path), NOT a broken empty frame.
    - Test: the titlebar chrome (traffic lights, title, ⋮ menu) renders identically in BOTH modes — the swap is body-only (the frame body, never the chrome).
  </behavior>
  <action>
    In `src/ui/WindowFrame.tsx`: import `useServices` from `../services/ServicesProvider` and `SandboxFrame` from `./SandboxFrame`; read `const { frameMode } = useServices()`. Extend `WindowFrameProps` with optional `transpiledJS?: string` and `themeVars?: Record<string, string>`, plus optional `onRunHandler?`/`onFetchData?` brokers (passed through to SandboxFrame). In the `window-chrome__body` div, render: `frameMode === "iframe" && transpiledJS ? <SandboxFrame instanceId={instanceId} title={title} transpiledJS={transpiledJS} themeVars={themeVars ?? {}} onClose={onClose} onModify={onModify} onRunHandler={onRunHandler} onFetchData={onFetchData} /> : <WindowBody instanceId={instanceId} title={title} Component={Component} onClose={onClose} />`. When `frameMode === "iframe"` but `transpiledJS` is falsy, fall through to the WindowBody path with `Component={null}` so the existing "Preparing…" placeholder shows (do NOT render an empty frame). Keep the titlebar/⋮/ContextualPrompt code untouched (host-owned chrome, Phase 19 — never inside the frame). No banned tokens; the only `sandbox`/iframe usage is the internal `SandboxFrame` import/JSX, which is allowed per HYGIENE-07.
  </action>
  <verify>
    <automated>npx vitest run src/ui/WindowFrame.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `src/ui/WindowFrame.tsx` contains `const { frameMode } = useServices()` and `frameMode === "iframe"` (source assertions).
    - In-tree mode renders WindowBody/AppShell and no `<iframe>`; iframe mode renders `<SandboxFrame>`/`<iframe sandbox="allow-scripts">` and no in-tree WindowBody (behavior assertions).
    - The "Preparing…" placeholder shows in iframe mode when transpiledJS is absent (behavior assertion).
    - The titlebar chrome renders identically in both modes (behavior assertion).
    - All prior `WindowFrame.test.tsx` tests pass unchanged; `npx vitest run src/ui/WindowFrame.test.tsx` exits 0.
  </acceptance_criteria>
  <done>WindowFrame swaps the body between WindowBody (in-tree) and SandboxFrame (iframe) on the injected frameMode, with the in-tree default keeping every existing WindowFrame test green and the chrome untouched.</done>
</task>

<task type="tdd" tdd="true">
  <name>Task 3: RED+GREEN — DesktopShell supplies transpiledJS + parent-side RPC brokers to the iframe path</name>
  <read_first>
    - src/ui/DesktopShell.tsx lines 260-340 (handleOpen: resolveComponent + storeComponent), 357-419 (handleDescribe), 430-500 (handleModify), 660-714 (the WindowFrame render with its props)
    - src/execution/loader.ts (Plan 02 — getTranspiledJS), lines 231-300 (resolveComponent + intent.cacheKey)
    - src/execution/handler.ts lines 285-316 (runHandler signature + the boundFetchData closure shape to mirror)
    - src/services/services.ts (frameMode + fetchDataBroker on Services)
    - .planning/phases/20-opaque-origin-frame-isolation/20-CONTEXT.md lines 21-24, 38-44 (boundary: key/services stay parent; FETCH_DATA dataBroker allowlist enforced parent-side)
  </read_first>
  <behavior>
    - Test (IN-TREE UNCHANGED): the existing DesktopShell open/describe/modify integration tests (run under the createTestServices in-tree default) pass unchanged — no iframe appears, the resolved Component renders in-tree.
    - Test (IFRAME TRANSPILED SUPPLY): with services overridden to `frameMode: "iframe"`, after opening a seeded app the WindowFrame receives a non-empty `transpiledJS` prop (sourced via getTranspiledJS(cacheKey)) so a SandboxFrame renders (assert an `<iframe sandbox="allow-scripts">` appears in the desktop after open).
    - Test (PARENT-SIDE BROKER): the `onRunHandler` passed to WindowFrame, when called, routes to `runHandler(intent, input, services)` (assert via a spy/stub services.transport or a canned fetchDataBroker that the broker — not the frame — performs the work); the frame never receives services or the key.
    - Test (MODIFY ROUTES): the `onModify` passed to the frame path calls the same `handleModify(instanceId, instruction)` the in-tree ⋮ uses (remove/clone/tweak behavior identical).
  </behavior>
  <action>
    In `src/ui/DesktopShell.tsx`: capture the transpiled string for each opened instance. In `handleOpen` and `handleDescribe`, after `resolveComponent(...)` populates the cache, call `getTranspiledJS(cacheKey)` and store it in a per-instance map (a `transpiledByInstance` state/ref parallel to `components`), keyed by instanceId — set it in the SAME guarded block as `storeComponent` (respecting the mid-produce-close guard). In `handleModify`'s tweak branch, refresh the stored transpiled string for the instance after the re-resolve. At the `WindowFrame` render site (lines ~660-714), pass: `transpiledJS={transpiledByInstance.get(entry.instanceId)}`, `themeVars={VIBE_THEMES[currentTheme]}` (read currentTheme via useVibeTheme()), `onRunHandler={(intent, input) => runHandler(intent, input, services)}`, `onFetchData={(sourceId, params) => services.fetchDataBroker?.fetch(sourceId, params) ?? Promise.resolve({ error: "Data not available." })}` (these closures keep services/key parent-side — the frame only ever gets the two strings + the broker results). The `onModify` prop already routes to handleModify — leave it. Gate all new work so the in-tree path (frameMode "in-tree") is byte-identical: only the new props are added; WindowFrame ignores transpiledJS in in-tree mode. Import `runHandler` from `../execution/handler`, `getTranspiledJS` from `../execution/loader`, `VIBE_THEMES`/`useVibeTheme` from `./VibeThemeProvider`. No banned tokens.
  </action>
  <verify>
    <automated>npx vitest run src/ui/DesktopShell.test.tsx src/ui/WindowFrame.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `src/ui/DesktopShell.tsx` contains `getTranspiledJS` and a per-instance transpiled map, and passes `transpiledJS`/`onRunHandler`/`onFetchData` to WindowFrame (source assertions).
    - In-tree DesktopShell integration tests pass unchanged (behavior assertion — no iframe, in-tree render).
    - In iframe-mode tests a SandboxFrame `<iframe sandbox="allow-scripts">` renders after opening an app, and onRunHandler routes to the parent-side `runHandler(...)` (behavior assertions).
    - onModify routes to handleModify identically in both modes (behavior assertion).
    - `npx vitest run` on the named files exits 0.
  </acceptance_criteria>
  <done>DesktopShell supplies the iframe body its transpiled string + parent-side RPC brokers (key/services never crossing), with the in-tree path unchanged and all existing integration tests green.</done>
</task>

<task type="auto">
  <name>Task 4: Full-suite green + tsc clean (761 in-tree tests preserved)</name>
  <read_first>
    - src/services/services.ts, src/services/testServices.ts, src/ui/WindowFrame.tsx, src/ui/VibeThemeProvider.tsx, src/ui/DesktopShell.tsx (all modified files)
  </read_first>
  <action>
    Run the full suite + typechecker. CRITICAL INVARIANT: because tests default to `frameMode: "in-tree"`, all 761 prior RTL/JSDOM tests MUST stay green without a real browser (SANDBOX-05's in-tree fallback). If any prior test now renders an iframe, the test default is wired wrong — fix the default, not the test. Fix tsc errors from the new optional props / the VIBE_THEMES import cycle (VibeThemeProvider importing frameMount, frameMount importing nothing from VibeThemeProvider — confirm no circular import; if WindowFrame/DesktopShell importing VIBE_THEMES creates a cycle, hoist the 12-var maps to a leaf module).
  </action>
  <verify>
    <automated>npx vitest run && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run` exits 0; the prior 761 tests are green plus the new wiring tests (no prior test renders an iframe).
    - `npx tsc --noEmit` exits 0.
    - No circular-import error between VibeThemeProvider / frameMount / WindowFrame.
  </acceptance_criteria>
  <done>The full suite (761 in-tree tests + new wiring tests) is green and tsc is clean; the in-tree fallback is proven by the unchanged prior test behavior.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| host services graph -> frame | The frame must receive ONLY transpiledJS + theme vars + brokered results; the key, services, registry, and broker internals stay parent-side |
| frame RPC request -> parent broker | RUN_HANDLER/FETCH_DATA from the frame execute parent-side with the dataBroker allowlist; the frame cannot reach the network or key directly |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-15 | Information Disclosure | services/key leaking via props | mitigate | SandboxFrame receives only transpiledJS + themeVars; brokers are closures capturing services parent-side; no services prop crosses |
| T-20-16 | Elevation of Privilege | frame fetching beyond allowlist | mitigate | onFetchData -> services.fetchDataBroker enforces the manifest allowlist parent-side; frame's connect-src is 'none' (Plan 02) |
| T-20-17 | Spoofing | test environment accidentally hitting iframe path | mitigate | createTestServices defaults frameMode "in-tree"; full-suite invariant asserts no prior test renders an iframe |
| T-20-18 | Tampering | theme broadcast carrying non-theme data | mitigate | broadcastTheme(VIBE_THEMES[name]) passes only the 12 CSS-var strings; audited in Plan 02 |
</threat_model>

<verification>
- `createServices().frameMode === "iframe"`, `createTestServices().frameMode === "in-tree"`.
- WindowFrame renders WindowBody in-tree / SandboxFrame in iframe mode (body-only swap, chrome untouched).
- VibeThemeProvider.setTheme broadcasts VIBE_THEMES[name] to all frames.
- DesktopShell supplies transpiledJS + parent-side brokers; key/services never cross.
- `npx vitest run` (761 in-tree tests + new) and `npx tsc --noEmit` both exit 0.
</verification>

<success_criteria>
- The frame path is live behind the injected frameMode flag.
- The in-tree default keeps all 761 existing tests green with no real browser.
- A theme switch re-skins every open frame (broadcastTheme).
- The API key and services never enter the frame — only transpiledJS + theme vars + brokered results cross.
- Full suite + tsc green.
</success_criteria>

<output>
After completion, create `.planning/phases/20-opaque-origin-frame-isolation/20-04-SUMMARY.md`.
</output>
