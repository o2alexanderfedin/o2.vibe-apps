# Architecture Research: v3.0 Trusted Desktop Integration

**Domain:** Client-only generative app marketplace — iframe sandbox isolation + desktop persistence + theme editor
**Researched:** 2026-06-26
**Confidence:** HIGH (based on direct source inspection of all named files + prior CONSULT-sandboxing-execution.md)

---

## System Overview

### Current State (v2.0)

```
App.tsx
  ServicesProvider (IoC — transport / registry / keyStore / gate / settings)
    VibeThemeProvider (localStorage + IDB settings; applyVibeTheme → :root CSS vars)
      DesktopShell (owns WindowManagerProvider + DesktopShellInner)
        WindowManagerProvider (windows: WindowEntry[])
          MenuBar | Dock | SearchLauncherPanel | KeyDialog
          .desktop (N × WindowFrame)
            WindowFrame (chrome: drag, traffic lights, z-index)
              WindowBody [memoized on instanceId+title+Component]
                AppShell (⋮ contextual prompt — MOD-01)    ← HOST-OWNED TODAY
                  ErrorBoundary
                    <Component /> ← new Function scope, IN-TREE

IDB: MarketplaceRegistry v3  apps | widgets | handlers | settings
Execution seam: src/execution/instantiate.ts → new Function(module,exports,React,useWidget,runHandler,require)
Mount: in-tree React child (NOT separate createRoot — see v2.0 architecture decision)
```

### Target State (v3.0)

```
App.tsx
  ServicesProvider
    VibeThemeProvider
      DesktopShell
        WindowManagerProvider
          MenuBar | Dock | SearchLauncherPanel | KeyDialog
          .desktop (N × WindowFrame [MODIFIED])
            WindowFrame titlebar: [traffic lights] [icon] [title] [⋮ button] [max] ← ⋮ MOVED HERE
              <iframe sandbox="allow-scripts"> ← NEW: opaque-origin frame
                [in-frame bootstrap]
                  React (same version, loaded in-frame)
                  ErrorBoundary
                  <Component /> ← new Function scope INSIDE frame

IDB: MarketplaceRegistry v3 (unchanged schema) + new persistence writes:
  settings["windowLayout"] = WindowLayoutRecord[]
  settings["openSet"]      = string[] (appTypes)

New:  src/execution/iframe-mount.ts  (swappable alongside mount.ts)
New:  src/ui/SandboxFrame.tsx        (the <iframe> element + postMessage bridge)
Mod:  src/ui/WindowFrame.tsx         (⋮ button relocated to titlebar; body = SandboxFrame)
Mod:  src/ui/AppShell.tsx            (⋮ removed; becomes body-only content wrapper or deleted)
Mod:  src/registry/settingsStore.ts  (add windowLayout / openSet persistence)
New:  src/ui/ThemeEditor.tsx         (custom theme editor panel)
New:  src/ui/CustomThemeManager.ts   (CRUD for user themes in IDB settings)
Mod:  src/ui/VibeThemeProvider.tsx   (extend VIBE_THEMES with user themes from IDB)
Mod:  index.html FOUC script         (load user themes from localStorage on first paint)
```

---

## The iframe Boundary — What Lives Where

This is the architectural centerpiece. The boundary is the `<iframe sandbox="allow-scripts">` tag rendered by `SandboxFrame`. No `allow-same-origin` — opaque origin, no access to parent's localStorage/cookies/DOM.

### Parent Side (host — always)

| Concern | Where | Why |
|---------|-------|-----|
| Anthropic API key | `localStorage` + `keyStore` service | Never crosses boundary |
| Registry (IDB) | `src/registry/` | IDB is same-origin; frame can't see it |
| Component resolution | `resolveComponent()` in loader.ts | Runs before frame creation |
| Transpiled JS string | Transferred to frame via srcdoc/postMessage | String only, not a Function |
| dataBroker allowlist enforcement | parent-side `postMessage` handler | Frame asks; parent fetches; parent replies |
| produceGate / transport / resilience | `src/host/` | Never enter frame |
| `⋮` contextual prompt UI | WindowFrame titlebar (relocated) | Must be host-owned for opaque frame |
| Theme source-of-truth | `VibeThemeProvider` / `document.documentElement` | Frame CSS vars pushed via postMessage |
| Window chrome: drag, traffic lights, z | `WindowFrame` | Pure host React |
| Dock, MenuBar, SearchLauncherPanel | `DesktopShell` children | Pure host React |
| `onModify` callback routing | `DesktopShell.handleModify` | Frame sends instruction up; parent routes |
| `onClose` / `onMinimize` | `WindowFrame` traffic lights | Pure host events |

### Frame Side (untrusted generated code — contained)

| Concern | Where | Why |
|---------|-------|-----|
| React instance | Loaded in-frame from CDN or srcdoc embed | Cannot share parent React (hook rules) |
| `<Component />` | Instantiated via `new Function` inside frame | Untrusted code runs here |
| `useWidget` shim | In-frame runtime, bridges to parent via postMessage | Widget data is safe values |
| `runHandler` shim | In-frame runtime, sends postMessage to parent | Parent enforces allowlist |
| CSS custom properties | Set on frame's `document.documentElement` after theme push | Vars don't cross iframe boundary |
| `fetchData` calls | Shimmed to postMessage; parent fetches on allowlist | Key never enters frame |
| Resize reporting | `ResizeObserver` inside frame, postMessages height | Parent adjusts frame element height |
| Error reporting | `window.onerror` + `unhandledrejection` inside frame | postMessages error up to parent ErrorBoundary |

**Key invariant — architecturally guaranteed, not aspirational:** The Anthropic API key path is `localStorage → keyStore service → transport → api.anthropic.com`. None of these cross the iframe boundary. The frame receives only: (a) a transpiled JS string, (b) serialized prop/input values, (c) serialized handler results. The key is never serialized into any of those.

---

## The Prerequisite: `⋮` Relocation to Titlebar (Phase 1 of build order)

### Why This Must Come First

`AppShell` currently renders the `⋮` button inside the app body subtree. Once the body is an opaque `<iframe>`, the parent cannot reach into the frame's DOM to position a button. The contextual prompt must move to the host-owned titlebar BEFORE the iframe work begins.

### What Changes

**`src/ui/WindowFrame.tsx` (MODIFIED):**
- Add `⋮` (`MoreVertical`) button to the titlebar `window-chrome__titlebar` div, right-aligned
- Add `promptOpen: boolean` state to `WindowFrame` (or lift to `WindowBody`)
- Render `<ContextualPrompt>` directly from `WindowFrame` when `promptOpen` is true, positioned relative to the titlebar
- `onModify` prop stays; `ContextualPrompt.onApply` still calls it
- The `hideClose` pattern already suppresses AppShell's inner close; no new prop needed

**`src/ui/AppShell.tsx` (MODIFIED or RETIRED):**
- Remove the `⋮` button and `ContextualPrompt` from `AppShell`
- `AppShell` reduces to: `role="region"` wrapper + title display + `app-shell__content` div
- If AppShell becomes trivially thin after this removal, it can be inlined into `WindowBody` and deleted
- Phase 1 output test: `⋮` appears in the titlebar, clicks open the prompt, `handleModify` fires correctly

### AppShell Fate

AppShell currently provides `role="region" aria-label={displayName}` — important for accessibility. After `⋮` removal it's a thin `<div>` with a class and aria attributes. Options:
- **Keep as semantic wrapper** (recommended): rename to `AppRegion` and keep it as the aria region boundary inside the frame. The in-frame runtime sets this up for the component.
- **Inline into WindowBody**: simpler but loses the semantic separation that AppShell currently provides across the codebase.

---

## The postMessage RPC Contract

### Message Direction Convention

- `FRAME→PARENT`: frame sends a request or report; parent is the broker/authority
- `PARENT→FRAME`: parent pushes state (theme vars, component source) or responds to a frame request

### Correlation ID Pattern

Every request/response pair uses a `correlationId: string` (e.g. `crypto.randomUUID()`). The frame holds a `Map<correlationId, { resolve, reject }>` of pending promises. The parent echoes the `correlationId` in its response. This avoids race conditions with overlapping handler calls.

### Origin and Source Validation

**Parent-side listener:**
```typescript
window.addEventListener("message", (ev) => {
  // 1. Source must be a known SandboxFrame's contentWindow
  if (!knownFrames.has(ev.source as Window)) return;
  // 2. Origin must be "null" (opaque-origin iframe has origin "null")
  if (ev.origin !== "null") return;
  // 3. Message must have expected shape (type + correlationId)
  handleFrameMessage(ev.data, frameId);
});
```

**Frame-side listener:**
```typescript
window.addEventListener("message", (ev) => {
  // 1. Source must be parent
  if (ev.source !== window.parent) return;
  // 2. Origin must match known parent origin (not "null") OR
  //    accept "*" only for theme-push (no sensitive data in theme vars)
  handleParentMessage(ev.data);
});
```

### Message Kinds

#### Bootstrap (PARENT→FRAME, one-shot at frame load)

```typescript
{
  type: "VIBE_BOOTSTRAP",
  transpiledJS: string,       // compiled component string
  themeVars: Record<string, string>,  // current theme's 12 CSS vars
  widgetMap: Record<string, string>,  // appType → transpiledJS for pre-warmed widgets
  instanceId: string,
}
```

The frame executes `transpiledJS` via `new Function`, sets theme vars on its own `:root`, and renders.

#### runHandler (FRAME→PARENT request / PARENT→FRAME response)

```typescript
// Request
{ type: "RUN_HANDLER", correlationId: string, intent: string, input: unknown }

// Response
{ type: "RUN_HANDLER_RESULT", correlationId: string, data?: unknown, error?: string }
```

Parent calls `runHandler(intent, input, services)` — the same services-bound function already in `loader.ts`. Allowlist: the parent's `runHandler` already enforces `dataBroker` allowlist (Open-Meteo, Frankfurter). No new allowlist logic needed; the existing handler gate applies transparently.

#### fetchData (FRAME→PARENT request / PARENT→FRAME response)

```typescript
// Request
{ type: "FETCH_DATA", correlationId: string, sourceId: string, params: Record<string, string> }

// Response
{ type: "FETCH_DATA_RESULT", correlationId: string, data?: unknown, error?: string }
```

Parent checks `sourceId` against the dataBroker allowlist before fetching. If `sourceId` is not on the allowlist, parent responds immediately with `{ error: "Data source not available." }` — no network call made. The frame never knows about the allowlist or the underlying URLs.

#### onModify (FRAME→PARENT, no response needed)

```typescript
{ type: "MODIFY_REQUEST", instruction: string }
```

Parent calls `handleModify(instanceId, instruction)` on `DesktopShell`. The round-trip result (component swap, close, clone) is handled entirely in the parent and reflected by re-bootstrapping the frame with new `transpiledJS` or unmounting.

#### Theme push (PARENT→FRAME, broadcast on every switch)

```typescript
{ type: "THEME_PUSH", vars: Record<string, string> }
```

Frame receives this and calls `document.documentElement.style.setProperty(k, v)` for each entry. No correlationId needed — this is a one-way broadcast. The parent sends this to ALL open `SandboxFrame` contentWindows on theme switch.

#### Auto-height (FRAME→PARENT)

```typescript
{ type: "FRAME_RESIZE", height: number }
```

Frame uses `ResizeObserver` on its body element, postMessages the `scrollHeight` to the parent. Parent sets the `<iframe>` element's CSS height. This replaces any CSS `height: 100%` that would require `allow-same-origin` to work correctly.

#### Error report (FRAME→PARENT)

```typescript
{ type: "FRAME_ERROR", message: string, stack?: string }
```

Parent receives this and: (a) passes it to the `ErrorBoundary` equivalent (renders the neutral fallback), (b) feeds it to the gated logger, (c) triggers the self-heal retry loop if within the resilience budget. The error string must be sanitized before logging (no banned tokens from the generated code appearing in devtools).

### Widget Composition in the Frame

Widgets are also generated components. Before bootstrapping the parent frame, the parent resolves all declared `@widget` deps via the existing `prewarmWidgets()` pass. Each widget's `transpiledJS` is included in the `VIBE_BOOTSTRAP.widgetMap`. Inside the frame, the `useWidget` shim is NOT postMessage-based — it reads from a local map of already-instantiated widget components. Widget isolation: each widget is also `new Function`-instantiated inside the frame scope, so the same containment applies.

---

## How React + the Component String Enter the Frame

### The srcdoc Approach (Recommended)

The parent generates the iframe's `srcdoc` attribute as a self-contained HTML document. This avoids any network hit for the frame itself.

```typescript
function buildFrameSrcdoc(instanceId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: transparent; overflow: hidden; }
  :root { color-scheme: dark; }
</style>
</head>
<body>
<div id="root"></div>
<script src="https://unpkg.com/react@19/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@19/umd/react-dom.production.min.js"></script>
<script>
// In-frame runtime: listens for VIBE_BOOTSTRAP, instantiates component,
// sets theme vars, renders via createRoot. Shims useWidget / runHandler /
// fetchData as postMessage bridges. Reports errors and resize.
(function() {
  var root = null;

  function setThemeVars(vars) {
    var docRoot = document.documentElement;
    for (var k in vars) { docRoot.style.setProperty(k, vars[k]); }
  }

  function makeRunHandlerShim() {
    return function runHandler(intent, input) {
      return new Promise(function(resolve) {
        var id = Math.random().toString(36).slice(2);
        window.__pendingRpc = window.__pendingRpc || {};
        window.__pendingRpc[id] = resolve;
        window.parent.postMessage({ type: "RUN_HANDLER", correlationId: id, intent: intent, input: input }, "*");
      });
    };
  }

  function instantiateComponent(js, useWidget, runHandler) {
    var mod = { exports: {} };
    var fn = new Function("module", "exports", "React", "useWidget", "runHandler", "require", js);
    fn(mod, mod.exports, window.React, useWidget, runHandler, function(s) {
      if (s === "react" || s === "react-dom") return window.React;
      throw new Error("Module not available: " + s);
    });
    return mod.exports["default"] || mod.exports["App"];
  }

  window.addEventListener("error", function(e) {
    window.parent.postMessage({ type: "FRAME_ERROR", message: e.message, stack: e.error && e.error.stack }, "*");
  });

  window.addEventListener("message", function(ev) {
    if (ev.source !== window.parent) return;
    var msg = ev.data;

    if (msg.type === "VIBE_BOOTSTRAP") {
      setThemeVars(msg.themeVars);
      var widgetInstances = {};
      for (var wType in msg.widgetMap) {
        try { widgetInstances[wType] = instantiateComponent(msg.widgetMap[wType], function() { return null; }, makeRunHandlerShim()); } catch(e) {}
      }
      var useWidget = function(type) { return widgetInstances[type] || null; };
      var Component = instantiateComponent(msg.transpiledJS, useWidget, makeRunHandlerShim());
      var container = document.getElementById("root");
      root = ReactDOM.createRoot(container);
      root.render(React.createElement(Component));
      // Height reporting
      var ro = new ResizeObserver(function(entries) {
        window.parent.postMessage({ type: "FRAME_RESIZE", height: document.body.scrollHeight }, "*");
      });
      ro.observe(document.body);
    }

    if (msg.type === "THEME_PUSH") { setThemeVars(msg.vars); }

    if (msg.type === "RUN_HANDLER_RESULT" || msg.type === "FETCH_DATA_RESULT") {
      var pending = (window.__pendingRpc || {})[msg.correlationId];
      if (pending) { delete window.__pendingRpc[msg.correlationId]; pending({ data: msg.data, error: msg.error }); }
    }
  });
})();
</script>
</body>
</html>`;
}
```

**Why srcdoc over blob URL:** srcdoc avoids a `URL.createObjectURL` cleanup responsibility and works with the `sandbox` attribute without needing `allow-scripts` on the same origin. The content is inlined — zero extra network hits.

**CDN caveat:** The React UMD scripts require the CDN to be reachable. The CSP `script-src` must include the CDN host (e.g. `unpkg.com`). Alternatively, the parent can embed the React UMD build inline in the srcdoc — eliminates the CDN dependency at the cost of a larger srcdoc string (~50KB min). The inline approach is strongly preferred for production to maintain network independence.

**Devtools hygiene:** The srcdoc content is not a separate file with sourcemaps. The inline frame runtime script is minified and uses no banned tokens. The `new Function` instantiation inside the frame is invisible to the parent page's devtools Sources panel — it appears only if the user inspects the frame's inner devtools.

### The new Function Path Inside the Frame

The in-frame `instantiateComponent` uses the same pattern as `src/execution/instantiate.ts` — `new Function("module","exports","React","useWidget","runHandler","require", transpiledJS)`. The difference: `React` here is `window.React` from the UMD globals loaded in the frame (not the parent's React singleton). This is correct — hook-call rules require a single React per rendering tree, and the frame has its own tree.

---

## Theme CSS Vars Across the Boundary

CSS custom properties set on the parent's `document.documentElement` do NOT cross the `<iframe>` boundary. The frame has its own `document`, its own `:root`. Two mechanisms work together:

### Initial Injection (Bootstrap)

The `VIBE_BOOTSTRAP` message includes `themeVars: Record<string, string>` — the current theme's 12 CSS variable entries from `VIBE_THEMES[currentTheme]`. The frame applies them immediately to its own `:root` before rendering the component. Generated apps that reference `var(--accentA)` etc. see the correct values from first paint.

### Live Updates (Theme Push)

When the user switches themes in `MenuBar`, `VibeThemeProvider.setTheme(name)` is called. In addition to its current behavior (set vars on parent `:root`, write localStorage, write IDB), it must now broadcast `{ type: "THEME_PUSH", vars: VIBE_THEMES[name] }` to every live frame. `DesktopShell` or `SandboxFrame` maintains a `Map<instanceId, HTMLIFrameElement>` to reach each frame's `contentWindow`.

```typescript
// In DesktopShell or a ThemeBroadcaster effect:
useEffect(() => {
  const unsubscribe = onThemeChange((vars) => {
    for (const frame of liveFrames.values()) {
      frame.contentWindow?.postMessage({ type: "THEME_PUSH", vars }, "*");
    }
  });
  return unsubscribe;
}, []);
```

The theme push sends to `"*"` (not a specific origin) because the frame's origin is `"null"` (opaque). Sending to `"null"` does not work — `postMessage` to the null origin is blocked. The `"*"` target is safe here because the theme vars contain only CSS property values (no secrets, no key material).

---

## The Execution Seam — Swappability

The key architectural invariant is that `new Function` vs iframe is a **contained swap** behind the existing seam.

### Current Seam (v2.0)

```
WindowFrame.tsx → renders WindowBody → renders <Component /> in-tree
  Component produced by: instantiate.ts (new Function) via loader.ts
```

### v3.0 Seam

```
WindowFrame.tsx → renders SandboxFrame (NEW)
  SandboxFrame: creates <iframe srcdoc=...>, sends VIBE_BOOTSTRAP
  iframe runtime: new Function inside frame

Swappable: SandboxFrame implements the same interface as WindowBody —
  props: { instanceId, title, transpiledJS, onModify, themeVars, widgetMap }
  Can be replaced with WindowBody (in-tree) for tests or fallback.
```

### New File: `src/execution/iframe-mount.ts`

```typescript
// Parallel to mount.ts (createRoot lifecycle) — iframe lifecycle.
// Tracks HTMLIFrameElement refs by instanceId for theme broadcast.
const frames = new Map<string, HTMLIFrameElement>();

export function registerFrame(instanceId: string, el: HTMLIFrameElement): void {
  frames.set(instanceId, el);
}

export function unregisterFrame(instanceId: string): void {
  frames.delete(instanceId);
}

export function broadcastTheme(vars: Record<string, string>): void {
  for (const frame of frames.values()) {
    frame.contentWindow?.postMessage({ type: "THEME_PUSH", vars }, "*");
  }
}

export function frameCount(): number { return frames.size; }
```

The existing `src/execution/mount.ts` (`mountApp` / `unmountApp` / `roots` Map) can be **retired** for production window rendering but kept for tests that render the in-tree path. The `SandboxFrame` component takes responsibility for the frame lifecycle the way `WindowFrame`'s `useEffect` hook formerly called `mountApp`.

---

## Desktop Persistence

### What Gets Persisted

```typescript
// IDB settings store — new keys alongside "activetheme"
interface WindowLayoutRecord {
  instanceId: string;
  appType: string;
  displayName: string;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  userPrompt?: string;   // for describe-path windows (slug + original text)
  cacheKey?: string;     // pre-computed so restore skips registryKey()
}

// settings["windowLayout"] = WindowLayoutRecord[]
// settings["openSet"]      = string[]  (instanceId order — z-restoration order)
```

The `WindowEntry` shape in `useWindowManager.tsx` maps directly — `id`, `instanceId`, `appType`, `title`, `icon`, `x`, `y`, `z`, `minimized` all serialize cleanly. The `Component` field is NOT persisted (per existing storage discipline — no compiled Functions in IDB). On restore, `Component` starts as `null` (showing the "Preparing…" placeholder) and is re-resolved via the existing three-tier path.

### Where the Write Lives

`DesktopShellInner` already owns `windows` (via `useWindowManager`) and `positions` (via `setPositions`). A `useEffect` that debounces writes on every meaningful state change is the simplest path:

```typescript
useEffect(() => {
  const layout = windowManager.windows.map(w => {
    const pos = positions.get(w.instanceId) ?? { x: w.x, y: w.y };
    return { ...w, ...pos } satisfies WindowLayoutRecord;
  });
  void debouncedWriteLayout(layout, settingsStore);
}, [windowManager.windows, positions]);
```

Debounce: 300ms trailing — drag commits fire frequently; we don't want an IDB write per pixel.

### Restore Path on Boot

`DesktopShellInner` reads the layout from `settingsStore` in a `useEffect` on mount (once). For each saved window:
1. Mint the window entry via `windowManager.open(appType, meta)` — gives a frame immediately
2. Restore geometry by injecting into `positions` state
3. Call `resolveComponent(instanceId, appType, cacheKey, services, userPrompt)` — tier-3 IDB hit for anything previously opened
4. `storeComponent(instanceId, Component)` when resolved

Z-order restoration: sort `WindowLayoutRecord[]` by `z` ascending before restoring, mint windows in that order. The `useWindowManager.open()` monotonically increments `zTop`, so insertion order recovers relative z-ordering.

### IDB Schema Impact

The `settings` store already exists (DB v3). The new writes use the existing key-value pattern:
```typescript
await settingsStore.write("windowLayout", layoutArray);
await settingsStore.write("openSet", instanceIds);
```
No DB version bump needed if `settingsStore` already uses an open-ended key-value pattern. Confirm in `src/registry/settingsStore.ts` — if it currently stores only `"activetheme"` with a typed write method, add a generic `writeRaw(key: string, value: unknown)` overload or extend the typed interface.

---

## Theme Editor / Custom Themes

### Where Custom Themes Live

Custom themes are stored in IDB `settings["customThemes"]` as:
```typescript
interface CustomThemeRecord {
  id: string;          // user-chosen name, slugified (e.g. "my-midnight")
  displayName: string; // user-readable (e.g. "My Midnight")
  vars: Record<string, string>;  // same 12-var contract as VIBE_THEMES entries
}
```

### How They Extend VIBE_THEMES

`VibeThemeProvider` loads custom themes from IDB on mount alongside the built-in four. It merges them into the runtime theme registry:

```typescript
const allThemes = { ...VIBE_THEMES, ...customThemesFromIDB };
```

The `VibeThemeName` type widens to `string` for runtime use (the built-in union stays for static typing). `ThemeSelector` / `MenuBar` theme pills render from the merged `allThemes` keys.

### FOUC Script Extension

The FOUC script in `index.html` currently reads `localStorage["vibe.activetheme"]` and maps it to the inline `VIBE_THEMES` block. Custom themes cannot be in the FOUC script (they aren't known at build time). Strategy:

1. When a custom theme is saved, write its vars to `localStorage["vibe.customThemes"]` (JSON-serialized array)
2. The FOUC script reads both `localStorage["vibe.activetheme"]` and `localStorage["vibe.customThemes"]`
3. If the active theme is found in the built-in block → apply it (fast path, current behavior)
4. If the active theme is found in customThemes JSON → parse and apply (slightly slower but still sync)
5. Default fallback → `"aurora"`

The FOUC script changes require a new CSP hash computation and `csp.test.ts` update — same pattern as the v2.0 FOUC change.

### The :root Alias Bridge

The existing `:root { --color-surface: var(--glass); ... }` alias bridge in `index.css` is unchanged. Custom themes must define the same 12 vars as built-in themes; the `ThemeEditor` UI enforces this by showing exactly those 12 color pickers/inputs.

### New Components

**`src/ui/ThemeEditor.tsx`** — modal/panel with 12 color inputs (one per CSS var), a name field, and Save/Cancel. Opens from a "+" control in the MenuBar theme section or a standalone panel. On save, writes to IDB via `CustomThemeManager` and updates localStorage for FOUC coverage.

**`src/ui/CustomThemeManager.ts`** — `listCustomThemes()`, `saveCustomTheme(record)`, `deleteCustomTheme(id)` — thin wrapper over `settingsStore` with the `"customThemes"` key.

**`src/ui/VibeThemeProvider.tsx` (MODIFIED)** — `useEffect` on mount calls `listCustomThemes()` and merges results into the local theme registry. Subscribes to theme-switch events to re-broadcast to frames (for custom themes).

---

## Component Inventory — New vs Modified

### New Files

| File | Type | Responsibility |
|------|------|----------------|
| `src/ui/SandboxFrame.tsx` | React component | Renders `<iframe sandbox="allow-scripts">`, generates srcdoc, sends `VIBE_BOOTSTRAP`, handles all incoming postMessage (RUN_HANDLER, FETCH_DATA, FRAME_ERROR, FRAME_RESIZE, MODIFY_REQUEST), manages frame lifecycle (register/unregister in iframe-mount.ts) |
| `src/execution/iframe-mount.ts` | Module | `Map<instanceId, HTMLIFrameElement>` for theme broadcast; `broadcastTheme()`, `registerFrame()`, `unregisterFrame()`, `frameCount()` |
| `src/ui/ThemeEditor.tsx` | React component | 12-var custom theme editor UI; opens from MenuBar; calls `CustomThemeManager.saveCustomTheme()` on submit |
| `src/ui/CustomThemeManager.ts` | Module | CRUD wrapper for `settings["customThemes"]`; `listCustomThemes()`, `saveCustomTheme()`, `deleteCustomTheme()` |

### Modified Files

| File | Change | Impact |
|------|--------|--------|
| `src/ui/WindowFrame.tsx` | Add `⋮` button + `ContextualPrompt` to titlebar; replace `WindowBody` content with `SandboxFrame`; keep all chrome props unchanged | Prerequisite for iframe isolation |
| `src/ui/AppShell.tsx` | Remove `⋮` button and `ContextualPrompt`; retain `role="region"` wrapper (or retire if inlined into SandboxFrame's in-frame runtime) | Enables chrome relocation |
| `src/ui/VibeThemeProvider.tsx` | Load custom themes from IDB on mount; merge into theme registry; call `broadcastTheme()` on theme switch | Theme editor + iframe theme push |
| `src/registry/settingsStore.ts` | Add `writeRaw(key, value)` / `readRaw(key)` for `"windowLayout"` and `"customThemes"` keys, OR add typed methods | Persistence |
| `src/ui/DesktopShellInner` (in `DesktopShell.tsx`) | Add persistence `useEffect` (debounced layout write); add boot restore path | Desktop persistence |
| `index.html` FOUC script | Extend to read `localStorage["vibe.customThemes"]` as fallback for active custom theme; recompute CSP hash | Custom themes FOUC |
| `src/csp.test.ts` | Update SHA-256 hash after FOUC script changes | CI gate |
| `src/ui/MenuBar.tsx` | Add theme editor trigger ("+" next to theme pills) and render custom theme pills | Theme editor entry point |

### Files Unchanged / Untouched

| File | Why Unchanged |
|------|---------------|
| `src/execution/loader.ts` | Resolution pipeline unchanged — `resolveComponent` still returns a `ComponentType` from `transpiledJS`; the frame receives the string, not the component |
| `src/execution/instantiate.ts` | `new Function` logic is DUPLICATED into the in-frame srcdoc runtime (intentional — the frame can't import host modules); the host-side `instantiate.ts` can still be used for tests and the in-tree fallback path |
| `src/execution/transpile.ts` | Unchanged — Babel still runs in the parent; the compiled string is what crosses the boundary |
| `src/execution/producer.ts` | Unchanged — production is entirely parent-side |
| `src/registry/` (db, cacheKey, registry, storagePressure) | All unchanged — IDB stays parent-side |
| `src/host/` (resilience, modelClient) | Unchanged — all host-side |
| `src/services/services.ts` | Unchanged — services never enter frame |
| `src/ui/useWindowManager.tsx` | Unchanged — `WindowEntry` shape needs no new fields for the iframe swap |
| `src/ui/Dock.tsx` | Unchanged |
| `src/ui/SearchLauncherPanel.tsx` | Unchanged |
| `src/data/dataBroker.ts` | Unchanged — parent enforces allowlist on `FETCH_DATA` messages |

---

## Data Flow — Window Open with iframe

```
User: "Open Weather" (Dock → SearchLauncherPanel → handleOpen)
  ↓
DesktopShellInner.handleOpen("weather", "Weather")
  → windowManager.open("weather", { title:"Weather", icon:"weather" })
      → new WindowEntry: id="win-N", instanceId="weather-N", Component=null
      → WindowFrame renders: chrome visible, SandboxFrame renders placeholder
  ↓
resolveComponent("weather-N", "weather", cacheKey, services)
  → [tier-1/2/3 hit or produce] → returns transpiledJS string (from loader.ts)
  → Component = instantiate(transpiledJS, ...) is NOT called in parent for iframe path
    OR: transpiledJS is fetched from registry; Component is kept as string
  ↓
storeTranspiledJS("weather-N", transpiledJS)  ← new parallel to storeComponent
  → DesktopShell sends to SandboxFrame via a prop or event
  ↓
SandboxFrame receives transpiledJS prop, current themeVars
  → frame.contentWindow.postMessage({ type:"VIBE_BOOTSTRAP", transpiledJS, themeVars, widgetMap })
  → frame: new Function → Component → createRoot → render
  ↓
Frame → postMessage({ type:"FRAME_RESIZE", height:400 })
  → SandboxFrame sets iframe height
  → Window shows rendered app
```

### Note on In-Tree Fallback for Tests

Tests that render `DesktopShell` need to work without a real `<iframe>`. A `SandboxFrameMode` prop or environment flag (`"in-tree" | "iframe"`) lets test environments use the original `WindowBody` in-tree path. The flag is injected via `ServicesProvider` (follows existing IoC pattern) or as a context value. Tests keep running on the in-tree path; CI never needs a headless browser capable of sandboxed iframe postMessage.

---

## Build Order with Hard Ordering Constraints

### Constraints

- **[C1] `⋮` relocation before iframe** — once the body is an opaque frame, parent cannot position a button inside it
- **[C2] SandboxFrame before production iframe** — iframe-mount.ts needed for theme broadcast wiring
- **[C3] settingsStore.writeRaw before persistence** — persistence writes need the generic key-value store method
- **[C4] FOUC script for custom themes after ThemeEditor** — FOUC script can only be extended once the custom theme shape is final
- **[C5] csp.test.ts hash update in same commit as FOUC script change** — CI gate
- **[C6] VibeThemeProvider custom-theme merge before ThemeEditor UI** — editor calls save; provider must be ready to reload

### Recommended Phase Order

**Phase 1 — Chrome Relocation (prerequisite): `⋮` → titlebar**

Files touched:
- `src/ui/WindowFrame.tsx`: add `promptOpen` state, add `⋮` button to titlebar, add `ContextualPrompt` render in titlebar
- `src/ui/AppShell.tsx`: remove `⋮` button and `ContextualPrompt`; retain `role="region"` wrapper

Gate: existing MOD-01 through MOD-04 tests still pass with the prompt trigger now in the titlebar. `⋮` no longer inside `.app-shell__header`. Visual: confirm `⋮` appears in titlebar, prompt popover positioned correctly relative to titlebar.

**Phase 2 — iframe Sandbox Isolation (HARD-01, centerpiece)**

Files touched:
- `src/execution/iframe-mount.ts`: new file — frame registry, `broadcastTheme`, `registerFrame`, `unregisterFrame`
- `src/ui/SandboxFrame.tsx`: new file — `<iframe>`, srcdoc generation (with inline React UMD + in-frame runtime), `VIBE_BOOTSTRAP` send, postMessage handler for RUN_HANDLER/FETCH_DATA/MODIFY_REQUEST/FRAME_ERROR/FRAME_RESIZE
- `src/ui/WindowFrame.tsx`: replace `WindowBody` render with `<SandboxFrame ...>`, pass `transpiledJS` + `themeVars` + `widgetMap` instead of `Component`
- `src/ui/DesktopShell.tsx`: change `components` state from `Map<instanceId, ComponentType>` to `Map<instanceId, string>` (transpiledJS) — OR keep ComponentType for the in-tree test fallback and add a parallel `transpiledStrings` map for the iframe path
- `src/ui/VibeThemeProvider.tsx`: on `setTheme`, call `broadcastTheme(vars)` from `iframe-mount.ts`

Gate:
- Security invariant: key never in frame (proven by postMessage spy test)
- Origin checks: parent listener rejects messages not from known frames
- Theme push: switch theme → all open frames receive `THEME_PUSH` → vars apply
- runHandler: frame calls → parent delegates → dataBroker allowlist enforced
- FRAME_ERROR: propagates to parent, neutral fallback renders
- Test mode: `SandboxFrameMode="in-tree"` via ServicesProvider keeps existing test suite green

**Phase 3 — Desktop Persistence**

Files touched:
- `src/registry/settingsStore.ts`: add `writeRaw(key: string, value: unknown)` + `readRaw(key: string): Promise<unknown>`
- `src/ui/DesktopShell.tsx`: add debounced `useEffect` writing `"windowLayout"` on `windows` / `positions` change; add mount-time restore that reads layout and calls `windowManager.open()` + `resolveComponent()` per saved entry

Gate: close app → reload page → app re-opens at saved position with re-resolved component. Theme persists (already works via v2.0). Geometry + z-order restored correctly across ≥2 windows.

**Phase 4 — Theme Editor / Custom Themes**

Files touched:
- `src/ui/CustomThemeManager.ts`: new — `listCustomThemes()`, `saveCustomTheme()`, `deleteCustomTheme()`
- `src/ui/ThemeEditor.tsx`: new — 12-var editor panel, opened from MenuBar
- `src/ui/VibeThemeProvider.tsx`: merge custom themes from IDB into runtime registry on mount; re-read on theme editor save
- `src/ui/MenuBar.tsx`: "+" trigger for ThemeEditor; render custom theme pills
- `index.html` FOUC script: extend to read `localStorage["vibe.customThemes"]` for active custom theme fallback
- `src/csp.test.ts`: recompute SHA-256 hash

Gate: create custom theme → it appears in MenuBar → selecting it re-skins desktop + all open frames → theme persists across reload. FOUC script applies custom theme on first paint if it was the active one. Existing 4 built-in themes unaffected. Hygiene: no banned tokens in ThemeEditor copy.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: `allow-same-origin` + `allow-scripts` on the Same Origin

**What people do:** Add both sandbox flags to get the component's local state APIs.
**Why wrong:** The frame can programmatically remove its own `sandbox` attribute, escaping all isolation. CONSULT-sandboxing-execution.md explicitly flags this.
**Do this instead:** Only `sandbox="allow-scripts"` — opaque origin. All state that needs the API key stays in the parent; the frame gets only values.

### Anti-Pattern 2: Passing the API Key into the Frame

**What people do:** Include the key in `VIBE_BOOTSTRAP` to let the frame call Anthropic directly.
**Why wrong:** Breaks the architecturally-guaranteed key invariant. The frame is untrusted generated code.
**Do this instead:** `runHandler` postMessage bridge — parent calls the handler (which has access to services), returns result value only.

### Anti-Pattern 3: Persisting `ComponentType` Functions to IDB

**What people do:** Try to serialize the React component for faster restore.
**Why wrong:** Functions are not structured-clone serializable. This is the existing storage discipline (LOOP-06/07).
**Do this instead:** Persist `transpiledJS` string (already in IDB `apps` store per cacheKey). Restore re-instantiates in the frame via `new Function` — same as the live production path.

### Anti-Pattern 4: Triggering a Full Re-Bootstrap on Theme Switch

**What people do:** Update `themeVars` prop on `SandboxFrame` → triggers `srcdoc` regeneration → frame reload → component state loss.
**Why wrong:** Destroys running component state (notes content, timer state, form values).
**Do this instead:** `THEME_PUSH` postMessage — frame applies vars to its own `:root` without a reload. `srcdoc` is set once on mount; `themeVars` prop changes broadcast to the live frame, never regenerate srcdoc.

### Anti-Pattern 5: Sending postMessage to Origin `"null"`

**What people do:** Try to postMessage specifically to the opaque-origin frame: `frame.contentWindow.postMessage(msg, "null")`.
**Why wrong:** This is the string `"null"`, not the opaque origin concept. The browser blocks it.
**Do this instead:** Use `"*"` as the target origin for parent→frame messages. The frame is a sandboxed opaque origin; `"*"` is the only way to reach it. Limit to non-sensitive data (theme vars, RPC responses — never the key).

### Anti-Pattern 6: Moving `⋮` AFTER Starting the iframe Work

**What people do:** Begin iframe isolation before the chrome relocation, planning to "figure out the ⋮ later."
**Why wrong:** Once the body is an opaque frame, the parent cannot inject a button into the frame's DOM without compromising isolation. The relocation is a hard prerequisite.
**Do this instead:** Phase 1 is always chrome relocation; Phase 2 is always the iframe swap.

### Anti-Pattern 7: Sharing the Parent React Instance with the Frame

**What people do:** Try to inject `window.parent.React` into the frame via `VIBE_BOOTSTRAP` and use it inside the frame.
**Why wrong:** React hook call rules require all hooks in a render tree to use the same React instance, and that instance must be the one that owns the root. A shared instance from the parent would work only if the frame rendered into the parent's tree — defeating the isolation purpose. In the opaque frame, `window.parent` is inaccessible anyway.
**Do this instead:** Load React inside the frame (UMD from CDN or inlined in srcdoc). The frame has its own React tree, its own `createRoot`.

---

## Integration Points

### Execution Seam (Key for Swappability)

| Boundary | v2.0 Interface | v3.0 Interface | Change |
|----------|---------------|----------------|--------|
| `WindowFrame` → rendered body | `Component: ComponentType \| null` prop → renders `WindowBody` | `transpiledJS: string \| null` prop → renders `SandboxFrame` | Prop type changes; body renderer changes |
| `DesktopShell` components map | `Map<instanceId, ComponentType \| null>` | `Map<instanceId, string \| null>` (transpiledJS) | State type changes |
| `loader.ts resolveComponent` | Returns `ComponentType` | Returns `ComponentType` (unchanged) OR string extracted before the iframe path | Either: keep returning ComponentType and host serializes back to string; OR add a `resolveTranspiled()` variant that returns the string |

**Recommended:** Keep `resolveComponent` returning `ComponentType` unchanged (preserves all existing tests). In `DesktopShell.handleOpen`, after `resolveComponent` returns, do NOT call `storeComponent(instanceId, Component)` — instead, extract the `transpiledJS` string from the session-tier `transpiledCache` (already populated by `resolveComponent`) and store THAT. This keeps `loader.ts` untouched and avoids a new API surface.

Access path: `transpiledCache` is module-private in `loader.ts`. Add `export function getTranspiledJS(cacheKey: string): string | undefined` as a minimal read accessor — one new export, loader otherwise unchanged.

### dataBroker Allowlist Enforcement

The existing `src/data/dataBroker.ts` already enforces the allowlist (Open-Meteo, Frankfurter). The `SandboxFrame` postMessage handler for `FETCH_DATA`:
1. Checks `sourceId` against the allowlist (calls `dataBroker.fetchData(sourceId, params)`)
2. If rejected: replies `{ type:"FETCH_DATA_RESULT", correlationId, error:"Data source not available." }`
3. If allowed: calls `fetchData`, replies with result

This is the same enforcement point — the allowlist logic does not move or duplicate.

---

## Sources

- Direct source inspection (all named files, 2026-06-26): `src/ui/WindowFrame.tsx`, `src/ui/AppShell.tsx`, `src/ui/useWindowManager.tsx`, `src/ui/DesktopShell.tsx`, `src/ui/VibeThemeProvider.tsx`, `src/execution/instantiate.ts`, `src/execution/mount.ts`, `src/execution/loader.ts` — HIGH
- `.planning/research/ARCHITECTURE-v2.0.md` — v2.0 architecture with build order and constraint rationale — HIGH
- `.planning/research/CONSULT-sandboxing-execution.md` — iframe vs new Function tradeoffs; "allow-scripts + allow-same-origin" trap; postMessage bridge pattern — HIGH
- `.planning/PROJECT.md` — v3.0 milestone spec, HARD-01 requirement, existing constraints, key decisions — HIGH
- CSS Custom Properties MDN — properties do NOT cross iframe document boundaries; frame has own `:root` — HIGH
- Web platform: `postMessage(msg, "*")` is required for opaque-origin `sandbox` frames; `"null"` as target origin does not work — HIGH (browser spec behavior)
- CONSULT-sandboxing-execution.md: CodeSandbox/StackBlitz iframe pattern; "do NOT combine allow-scripts + allow-same-origin on the same origin" — HIGH

---

*Architecture research for: v3.0 Trusted Desktop — iframe sandbox isolation + chrome relocation + persistence + theme editor*
*Researched: 2026-06-26*
