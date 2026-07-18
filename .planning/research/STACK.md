# Stack Research — v3.0 Trusted Desktop

**Domain:** Generative client-only browser app OS — security hardening + persistence + personalization
**Researched:** 2026-06-26
**Confidence:** HIGH (all four capability areas verified against MDN, browser release notes, and the live codebase)

---

## Scope

This document covers ONLY the four new capabilities introduced in v3.0. The existing stack
(Vite 8, React 19.2, @babel/standalone 7.29.7 classic-runtime, idb 8, Claude Haiku
`claude-haiku-4-5-20251001`, direct browser fetch) is validated and is NOT re-researched here.

Zero-new-dependency bias is in force. Every capability below is evaluated
"platform-native / hand-rollable vs genuine dep need." When a dep is proposed, it is
explicitly justified against this bar.

---

## Capability A: `<iframe sandbox>` Isolation (HARD-01)

### What the platform gives you — no dep required

`<iframe sandbox="allow-scripts">` is a first-class HTML primitive, available in all
evergreen browsers since 2012, baseline-widely-available. Combined with `srcdoc` (also
widely available, no IE11 concern), it gives you:

- **Opaque origin automatically.** A sandboxed frame WITHOUT `allow-same-origin` runs under
  an opaque ("null") origin regardless of whether you use `src=` or `srcdoc=`. This means:
  - `localStorage` is inaccessible inside the frame (the Anthropic key is safe)
  - `document.cookie` is empty
  - The frame's scripts cannot reach the parent DOM via `window.parent.document`
  - XHR/fetch from the frame cannot carry the parent's cookies or storage
  - CRITICAL: do NOT add `allow-same-origin` — that lets the frame remove its own sandbox

- **`srcdoc` is the right injection mechanism over `blob:` URL** for this project because:
  - No extra CSP directive needed: a srcdoc frame inherits the parent's CSP. Since our
    parent CSP already has `script-src 'self' 'unsafe-eval'`, the frame's scripts run under
    that same policy — no new `frame-src blob:` directive is needed, and no network request
    is made for the document itself.
  - Blob URLs require adding `blob:` to `frame-src` in the CSP meta tag. Our `csp.test.ts`
    hashes the tag; adding a new directive needs the hash update as a cascading change.
  - `data:` URIs: same-origin with parent, defeating sandbox.
  - Conclusion: `iframe.srcdoc = generatedHTML` is the correct mechanism. Widely available,
    no new CSP surface, inherits existing policy. **PLATFORM-NATIVE, NO DEP.**

### Shipping React into the frame — the hard constraint

React 19 **dropped UMD builds** (confirmed: `node_modules/react/` has no `umd/` directory;
only `cjs/` exports exist). This is intentional — React 19 is ESM-first. There is no
official `react.production.min.js` UMD for React 19.

Inlining React into srcdoc has three viable paths:

**Option 1 (RECOMMENDED): Serialize the compiled string; re-instantiate via `new Function` in
the frame with React injected via `postMessage` transferable — but Functions are NOT
structured-clone transferable.**

The structured clone algorithm (used by `postMessage`) explicitly prohibits Functions and
throws `DataCloneError`. React components (`ComponentType`) are functions. You CANNOT pass
a React component or the React object itself via postMessage.

**Option 2 (RECOMMENDED for v3.0): Send the transpiled JS string across postMessage; let
the frame re-instantiate it with its own copy of React.**

The frame's srcdoc contains:
1. A `<script>` that inlines the CJS builds of `react` + `react-dom/client` (as plain text,
   wrapped in an IIFE that assigns `window.React` and `window.ReactDOM`).
2. A `<script>` that listens for the `{ type: 'MOUNT', transpiledJS }` message and calls
   `new Function("React", ..., transpiledJS)(window.React, ...)` plus
   `ReactDOM.createRoot(mountPoint).render(...)`.

Size analysis (raw CJS, no gzip in srcdoc context):
- `react.production.js` CJS: 17KB
- `react-dom-client.production.js` CJS: 536KB
- Total: ~553KB inlined in the srcdoc string

This is the size cost per frame. On a per-window basis this is acceptable for a desktop OS
(each window is one app; there are rarely >10 concurrent windows). The CJS files ship with
the host bundle anyway — Vite bundles them — so they are already parsed and in memory. The
frame gets a separate copy at a cost of ~553KB DOM string per frame.

**Option 3: Third-party UMD wrappers (`umd-react`, `@additio/react-umd`)**
Community-maintained packages re-wrap React 19 CJS into a UMD shim. The `umd-react` package
tracks upstream (latest: v19.2.7 as of 2026-06-26). Size is equivalent to Option 2.
AVOID: adds a dep, adds a supply-chain surface, and provides no size advantage.

### Wrapping the compiled string in CJS module shim inside the frame

The transpiler output currently uses `module.exports` / `exports.default` (Babel CJS
transform). Inside the frame, you need the same `module`/`exports` shim that `instantiate.ts`
already provides. The frame's listener function replicates the existing `instantiate()` logic
verbatim — no new code patterns needed, just a copy of the 40-line instantiation logic
running inside `<script>` in the frame's HTML.

The scope injected inside the frame: `new Function("module","exports","React","useWidget","runHandler","require", transpiledJS)`.
`useWidget` and `runHandler` inside the frame are stubs that message the parent.

### CSP implications for `unsafe-eval` inside the frame

The frame inherits the parent CSP. The parent already has `'unsafe-eval'` in `script-src`
(required for `new Function` / Babel). The frame therefore inherits it — `new Function`
inside the frame works today with no CSP changes. **No CSP delta needed for HARD-01.**

### Existing seam — no architectural surgery required

`src/execution/mount.ts` currently calls `createRoot(container).render(...)`. The v2.0 key
decision was to render app bodies "in-tree" (WindowBody inside WindowFrame inside React
tree) to stay inside the test `act()` scope. The iframe model CHANGES this: the `<iframe>`
element itself stays in-tree (React renders it), but the app body moves inside the frame.

The integration point in `src/ui/WindowFrame.tsx` is the `<div className="window-chrome__body">`.
Replace the `<WindowBody>` with `<iframe sandbox="allow-scripts" srcdoc={...} ref={frameRef} />`.
The `WindowBody` component (and with it the in-tree `AppShell` + `ErrorBoundary`) moves out
of the React tree and into the frame's own document. Error handling becomes a postMessage event
from the frame.

**Where to put the new code:**
- `src/execution/frameMount.ts` — new module; builds the srcdoc HTML string from the
  transpiled JS, owns the React CJS inline strings (read from node_modules at build time via
  Vite's `?raw` or via a build-time constant), calls `iframeEl.srcdoc = html`
- `src/ui/SandboxedWindowBody.tsx` — React component replacing `WindowBody`; renders the
  `<iframe>` element, manages the postMessage listener, proxies `onModify` calls to the
  parent handler
- `src/ui/WindowFrame.tsx` — swap `WindowBody` → `SandboxedWindowBody`

The `AppShell` `⋮` menu moves to the titlebar (Capability D) BEFORE this work, making the
body an undecorated content area — exactly the shape needed for the iframe to fill it cleanly.

### Theme CSS vars re-injection

CSS custom properties do NOT cross the iframe boundary. `--b1`, `--glass`, etc. set on
`document.documentElement` of the parent are invisible inside the frame.

Re-injection strategy: when the frame posts `{ type: 'READY' }`, the parent reads the 12
vars from `document.documentElement.style` (or from the `VIBE_THEMES[currentTheme]` object
it already holds) and replies with `{ type: 'THEME', vars: Record<string,string> }`. The
frame's listener calls `document.documentElement.style.setProperty(k, v)` for each var.

On theme switch: `VibeThemeProvider`'s `setTheme` broadcasts a `{ type: 'THEME', vars }` to
all open frame contentWindows. The parent already has all open window IDs via
`useWindowManager` — iterate them and `frame.contentWindow.postMessage(...)`.

**PLATFORM-NATIVE. NO DEP.** The 12 CSS vars are already a named, stable contract
(`VIBE_THEMES` object in `VibeThemeProvider.tsx`).

---

## Capability B: Typed `postMessage` RPC Layer

### What the platform gives you

`window.postMessage` + `MessageChannel` are platform primitives with 100% evergreen browser
coverage. **HAND-ROLLABLE, NO DEP.** All "iframe RPC" libraries (Penpal, postmsg-rpc,
mini-iframe-rpc) are hand-rollable in <100 lines of TypeScript for this project's specific
message set.

### Why NOT to use a library

The v3.0 message set is small and fully enumerated (4–6 message types). A library adds:
- Supply-chain risk
- A devtools-visible SDK fingerprint (Penpal, for instance, logs identifiable strings)
- An abstraction that hides whether a message reaches the frame (hard to test)
- Incompatibility risk with the no-`allow-same-origin` opaque-origin model

### Structured clone constraint — the architectural consequence

The most important fact about `postMessage` for this project:

**Functions cannot be transferred. React components are functions. They throw `DataCloneError`
if you pass them via `postMessage`.**

This means the parent CANNOT send a resolved `ComponentType` to the frame. Instead:
- The parent sends the **compiled JS string** (`transpiledJS`) — a plain string, structurally
  cloneable.
- The frame instantiates it locally using its own React copy.

Everything else follows from this:
- `useWidget` inside the frame is a stub: it posts `{ type: 'WIDGET_REQUEST', widgetType }`
  to the parent; the parent resolves/produces the widget's transpiledJS and sends it back;
  the frame instantiates and mounts it locally.
- `runHandler` inside the frame posts `{ type: 'HANDLER_RUN', intent, input }` to the
  parent; the parent runs the handler (which may call Anthropic) and posts back the result.
- `onModify` (the `⋮` instruction) posts `{ type: 'MODIFY', instruction }` from frame to
  parent; the parent runs `routeModification`.

### Recommended RPC design

Use `window.postMessage` for frame-to-parent and parent-to-frame, with a correlation-ID
envelope. Use `MessageChannel` for the request-response pair where strict response routing
matters (multiple concurrent widget requests from different frames).

```typescript
// Envelope shape — all messages
interface RpcEnvelope {
  /** Unique per-call nonce for response correlation. */
  id: string;
  type: FrameMessageType;
  payload: unknown;
  /** Only present on response messages. */
  ok?: boolean;
  error?: string;
}

type FrameMessageType =
  | 'READY'          // frame → parent: frame DOM loaded, ready to receive MOUNT
  | 'MOUNT'          // parent → frame: { transpiledJS, instanceId }
  | 'THEME'          // parent → frame: { vars: Record<string,string> }
  | 'WIDGET_REQUEST' // frame → parent: { widgetType }
  | 'WIDGET_RESPONSE'// parent → frame: { widgetType, transpiledJS } | { error }
  | 'HANDLER_RUN'    // frame → parent: { intent, input }
  | 'HANDLER_RESULT' // parent → frame: { data?, error? }
  | 'MODIFY'         // frame → parent: { instruction }
  | 'ERROR'          // frame → parent: { message } (runtime error from frame)
```

For response correlation:
- Simple approach (sufficient for this project): each outgoing request from the frame
  generates a `crypto.randomUUID()` (or a 4-byte counter) as `id`; the parent echoes the
  same `id` back in the response; a `Map<id, resolve>` holds pending Promises.
- `MessageChannel` is an alternative for strictly scoped channels (one port per call), but
  `window.postMessage` + correlation ID is simpler, produces identical semantics, and is
  easier to test (you can `dispatchEvent(new MessageEvent(...))` without needing a port).

**WHERE TO PUT IT:**
- `src/execution/frameBridge.ts` — the typed envelope types + `sendToFrame()` + `sendToParent()`
  helpers; the Promise-returning `callParent(type, payload, timeout)` function used by stubs
  inside the frame's embedded script
- The embedded script in the srcdoc (inline, not a separate module) repeats the envelope
  logic in ~30 lines of plain ES5 (no TypeScript, no imports) because it runs in an opaque
  context that cannot import from the host bundle.

### Timeout handling

Unresolved Promises hang if the other side never responds (e.g., frame navigates away,
parent closes). Add a `setTimeout` rejection for every `callParent` call. Recommended:
5000ms for widget requests (may need to produce), 30000ms for handler calls (may call
Anthropic). Clean up the `Map` entry on timeout to avoid leaks.

### Security: validate the message origin

Inside the frame's listener: `if (event.source !== window.parent) return;`
Inside the parent's listener: `if (event.source !== frameRef.current?.contentWindow) return;`
This prevents message injection from other frames or malicious scripts.

**VERDICT: Platform-native `postMessage` + hand-rolled typed envelope. NO DEP. ~80 lines
of TypeScript in `src/execution/frameBridge.ts`.**

---

## Capability C: Desktop Persistence (Window Geometry + Session + Theme)

### IndexedDB schema migration DB v3 → v4

The `db.ts` file currently opens `"MarketplaceRegistry"` at `VERSION = 3`. Adding a
`windows` object store for geometry persistence requires bumping to `VERSION = 4`.

The existing migration pattern is additive and idempotent: `if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName)`. Follow the identical pattern. Existing stores and their data are untouched; `idb` handles the version-change transaction.

**Window geometry record shape:**
```typescript
interface WindowGeometryRecord {
  id: string;        // window id (e.g. "win-3")
  appType: string;   // e.g. "weather"
  title: string;
  icon: string;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  instanceId: string;
  // NOT stored: the ComponentType (a function — cannot be serialized)
  // The app body is re-resolved on restore via the existing loader path
}
```

**Important:** ComponentType cannot be stored — functions are not structured-clone-safe and
are not IndexedDB serializable. On restore, each window entry triggers the normal
`resolveComponent` → cache lookup → (cache hit) instantiate path. A restore from IDB is
identical to re-opening the app from the dock, which hits IndexedDB immediately for cached
apps — no model calls on restore unless the app was never cached.

**z-order on restore:** Store absolute z values. Re-read `zTop` from `max(stored z values)`
on init so new windows stack above restored ones.

**WHERE TO PUT IT:**
- `src/registry/db.ts` — bump `REGISTRY_DB_VERSION` to 4, add `windows` store to schema and
  upgrade handler
- `src/registry/windowsStore.ts` — new module; `readAll()`, `write(record)`, `remove(id)`,
  `clear()` over the `windows` store; same `best-effort, never throws` pattern as
  `settingsStore.ts`
- `src/ui/useWindowManager.tsx` — hook `open()`/`close()`/`onMove()` to call `windowsStore`
  write/remove; add a `restoreWindows()` effect on mount that reads saved geometry and opens
  windows (triggering `resolveComponent` for each)

**Theme persistence** is already done: `STORAGE_KEY_OS_THEME` in `localStorage` +
`settingsStore` (IDB `settings` store v3). No new work needed.

**No new dependencies.** `idb@8` is already in use. The migration is identical to the DB
v2→v3 migration already built. **PLATFORM-NATIVE via idb 8. NO DEP.**

### Multi-tab conflict

If two tabs open simultaneously both trying to open DB at version 4, `idb`'s
`onversionchange` fires on the tab holding the v3 connection. Standard mitigation:
`db.onversionchange = () => db.close()` in `openRegistry()`. The `idb` library surfaces this
via the `openDB` options `blocked` and `blocking` callbacks. Add both: `blocked: () => window.location.reload()` (safe, user-visible reload) and `blocking: () => db.close()`.

---

## Capability D: Window UX & Chrome (⋮ to Titlebar, Maximize/Snap, Keyboard)

### Moving ⋮ from AppShell to WindowFrame titlebar

This is a pure React refactor — no new APIs, no new deps.

Current: `AppShell` owns the `⋮` button + `ContextualPrompt` popover; `WindowFrame` renders
`AppShell` as child via `WindowBody`.
Target: `WindowFrame` owns the `⋮` button in its titlebar right-side; `AppShell` with the
title and controls slot is either simplified (title-only) or removed entirely once its header
is redundant.

The `onModify` callback already flows from `DesktopShell` → `WindowFrame` → `WindowBody`
→ `AppShell`. Move the `ContextualPrompt` invocation up into `WindowFrame`'s titlebar render.
The `ContextualPrompt` component is already decoupled (takes `targetName`, `onApply`,
`onCancel`). No interface changes needed — just move the usage site.

**WHERE:** `src/ui/WindowFrame.tsx` gains a right-aligned `⋮` button in the
`.window-chrome__titlebar` div; `src/ui/AppShell.tsx` loses the header controls entirely
(becomes a content-only wrapper, or is collapsed into its children slot).

**PLATFORM-NATIVE. NO DEP.**

### Maximize / snap

Full-screen maximize and half-screen snap are implementable via CSS class toggling + a
`maximized` / `snapped` state field in `WindowEntry`. No ResizeObserver, no framer-motion,
no library.

```typescript
// Add to WindowEntry:
maximized?: boolean;
snapped?: 'left' | 'right' | null;
```

CSS:
```css
.window-chrome--maximized {
  /* Override the JS transform — CSS wins when class is present */
  transform: none !important;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 0;
}
.window-chrome--snapped-left  { transform: none !important; inset: 0 50% 0 0; width: 50%; height: 100%; }
.window-chrome--snapped-right { transform: none !important; inset: 0 0 0 50%; width: 50%; height: 100%; }
```

The maximize traffic-light button (currently `disabled` in `WindowFrame.tsx`) is enabled
and calls `onMaximize`. The `useWindowManager` hook gains `maximize(id)` / `unmaximize(id)` /
`snap(id, side)` — the same pattern as the existing `minimize` / `restore`.

**Keyboard affordances:** `useEffect` + `document.addEventListener('keydown')` in
`WindowFrame` (or a centralized handler in `DesktopShell`) for `Escape` (exit maximize/snap)
and `ArrowLeft`/`ArrowRight` when combined with a modifier for snap. Standard `KeyboardEvent`
API. **PLATFORM-NATIVE. NO DEP.**

Double-click on the titlebar to toggle maximize is a `onDoubleClick` handler on
`.window-chrome__titlebar`. **Platform-native.**

---

## Capability E: Theme Editor / Custom Themes

### Color input — platform-native

`<input type="color">` is the correct choice. It is:
- Available in all evergreen browsers
- Returns `#rrggbb` hex strings natively
- Renders the OS-native color picker on click (no custom UI to build)
- Zero deps

For the 12-var theme contract, the editor is 12 color pickers + 2 gradient pickers (for
`--wall`, which is a `radial-gradient(...)` string, not a plain color). The gradient vars
need a different UI: a textarea or structured gradient builder. For v3.0, a reasonable MVP
is to treat `--wall` as a freeform text field (the user can paste a gradient) while all
10 color-valued vars use `<input type="color">`.

**Var categorization:**
- Color vars (use `<input type="color">`): `--text`, `--b1`, `--b2`, `--b3`, `--b4`,
  `--bord`, `--hi`, `--accentA`, `--accentB`
- Alpha-color vars (rgba strings): `--glass`, `--glass2` — `<input type="color">` only
  handles opaque hex; for alpha, a `<input type="range">` for opacity + `<input type="color">`
  for the hue is the native approach, or accept a text field for the full `rgba(...)` string.
- Gradient var: `--wall` — text field.

**PLATFORM-NATIVE. NO DEP.**

### Contrast checking — platform-native via CSS `contrast-color()`

`contrast-color()` reached Baseline Newly Available in April 2026 (Chrome 147, Firefox 146,
Safari 26). It is available on the target browser population for this product (modern
evergreen). Global browser coverage is 74% as of June 2026.

Usage in the theme editor:
```css
.theme-editor__swatch-text {
  color: contrast-color(var(--b1));
}
```

For programmatic contrast checking in TypeScript (to flag low-contrast pairs), a hand-rolled
WCAG relative-luminance calculation is 20 lines and needs no dep:

```typescript
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  const lin = (c: number) => c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4;
  return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
}
function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((a,b)=>b-a);
  return (l1 + 0.05) / (l2 + 0.05);
}
```

No library. **HAND-ROLLABLE. NO DEP.**

### Persisting custom themes in IndexedDB

Custom themes live in the `settings` store (already at DB v3) under a compound key pattern.
Two options:
1. Store each custom theme as a separate `settings` record: key `customTheme:${name}`,
   value = `JSON.stringify(vars)`.
2. Store all custom themes as one record: key `customThemes`, value = `JSON.stringify(Map)`.

Recommend option 1 (per-theme records): additive, easy to delete individual themes, matches
the existing `osTheme` single-key pattern. The `SettingRecord` shape (`key: string, value: string`)
already supports this.

**`VibeThemeName` union** must extend to include custom theme names. The current type is
`"aurora" | "aero" | "aqua" | "noir"`. For v3.0 it becomes:
```typescript
export type VibeThemeName = "aurora" | "aero" | "aqua" | "noir" | string;
// or discriminated:
export type BuiltinThemeName = "aurora" | "aero" | "aqua" | "noir";
export type ThemeName = BuiltinThemeName | `custom:${string}`;
```

`applyVibeTheme()` needs to handle both the `VIBE_THEMES[name]` built-in lookup and a
provided `Record<string,string>` for custom themes. Keep built-ins immutable; pass custom
theme vars directly.

**WHERE:**
- `src/registry/customThemeStore.ts` — new module; `save(name, vars)`, `loadAll()`,
  `remove(name)` over the existing `settings` store
- `src/ui/VibeThemeProvider.tsx` — extend to load custom themes on mount, expose
  `customThemes: Map<string, Record<string,string>>` in context
- `src/ui/ThemeEditor.tsx` — new component; 12 inputs + name field + save/delete;
  calls `customThemeStore.save()` + `setTheme()`
- No DB migration needed: the `settings` store already exists at v3

**NO DEP.**

---

## Summary: Zero New Dependencies

| Capability | Approach | New Dep? |
|------------|----------|----------|
| A. iframe sandbox | Platform `<iframe sandbox="allow-scripts" srcdoc=...>`; React CJS inlined in srcdoc string | NO |
| A. React in frame | Inline `react.production.js` + `react-dom-client.production.js` CJS (~553KB raw) from node_modules at build time | NO |
| A. Theme re-injection | postMessage `THEME` event with 12-var `Record<string,string>` | NO |
| B. postMessage RPC | Hand-rolled typed envelope; correlation ID via counter; Promise+timeout | NO |
| C. Window persistence | idb 8 (existing), new `windows` store at DB v4, additive migration | NO |
| C. Restore flow | Re-uses existing `resolveComponent` + `loader` cache-hit path | NO |
| D. ⋮ titlebar move | Pure React refactor within `WindowFrame.tsx` + `AppShell.tsx` | NO |
| D. Maximize/snap | CSS class toggle + `WindowEntry` state field | NO |
| D. Keyboard | `KeyboardEvent` listener | NO |
| E. Color input | `<input type="color">` platform primitive | NO |
| E. Contrast check | 20-line hand-rolled WCAG luminance calculation | NO |
| E. Custom theme persist | Existing `settings` IDB store, new `customThemeStore.ts` module | NO |

**Zero new npm dependencies.** The zero-dep bias holds across all four capabilities.

---

## Module Map — New Files

| New File | Responsibility |
|----------|---------------|
| `src/execution/frameBridge.ts` | Typed envelope types, `sendToFrame()` / `callParent()` helpers, correlation-ID map |
| `src/execution/frameMount.ts` | Builds the srcdoc HTML string; inlines React CJS; posts `MOUNT` message |
| `src/ui/SandboxedWindowBody.tsx` | `<iframe>` React component; `READY`/`ERROR` message handler; proxies `onModify` |
| `src/registry/windowsStore.ts` | IDB `windows` store CRUD; same best-effort pattern as `settingsStore.ts` |
| `src/registry/customThemeStore.ts` | Custom theme CRUD over existing `settings` store |
| `src/ui/ThemeEditor.tsx` | 12-var theme editor UI; `<input type="color">` grid; save/delete/preview |

---

## Existing File Changes

| Existing File | Change |
|---------------|--------|
| `src/registry/db.ts` | Bump `REGISTRY_DB_VERSION` to 4; add `windows` store to schema + upgrade |
| `src/ui/WindowFrame.tsx` | Add `⋮` button + `ContextualPrompt` to titlebar; swap `WindowBody` → `SandboxedWindowBody`; add `onMaximize`/`onSnap` props; enable maximize traffic-light |
| `src/ui/AppShell.tsx` | Remove header controls (⋮ + close) — becomes content-only wrapper or removed entirely |
| `src/ui/useWindowManager.tsx` | Add `maximized`/`snapped` to `WindowEntry`; add `maximize`/`snap` actions; wire `windowsStore` persist/restore on open/close/move |
| `src/ui/VibeThemeProvider.tsx` | Load custom themes on mount; extend `setTheme` to accept custom theme name; broadcast THEME to open frames on switch |

---

## Risks and Flags for Phase Planning

**R1 (HIGH): React in-frame instantiation test coverage.**
The `src/execution/instantiate.ts` logic runs in jsdom today. The frame's embedded script
runs in a real browser document with no `act()` boundary. The existing integration test
pattern (RTL + JSDOM) cannot simulate a real srcdoc iframe. Plan for a Playwright/browser
test to prove the full round-trip: parent → postMessage MOUNT → frame instantiates → renders
correctly. This is a new test category not present in the 727-test suite.

**R2 (MEDIUM): srcdoc size per window.**
553KB of React CJS raw (not gzipped — srcdoc doesn't benefit from HTTP compression) inlined
per open window. At 10 concurrent windows this is 5.5MB of additional DOM strings. Memory
pressure is real. Mitigation: store the srcdoc string in a module-level constant so it is
built once and reused across frame instances (all frames share the same base HTML template).

**R3 (MEDIUM): Devtools hygiene inside the frame.**
The frame document is visible in devtools Elements panel. The embedded script's variable
names must follow the same neutral-naming constraint as the host. The srcdoc HTML must not
contain banned tokens in comments or identifiers. The hygiene CI gate (`src/hygiene.test.ts`)
does NOT currently scan the dynamically-built srcdoc string — extend it to scan the template.

**R4 (LOW): `contrast-color()` 74% browser coverage.**
The function is Baseline Newly Available as of April 2026. Users on older browsers (pre-Chrome
147, pre-Firefox 146, pre-Safari 26) won't get CSS-based contrast autocheck. Mitigation:
the hand-rolled TypeScript luminance calculation serves as the functional fallback for the
editor's warning UI; `contrast-color()` is cosmetic enhancement only.

**R5 (LOW): WindowEntry restore without ComponentType.**
On restore, each persisted window triggers `resolveComponent`. For apps in the IDB cache,
this is an O(1) cache hit — instantaneous. For apps NOT in the cache (evicted by LRU), the
restore triggers a production call, consuming API budget. Document this behavior. Consider
skipping restore for evicted apps (open as empty placeholder with a retry button) rather than
silently spending the user's API credits on page load.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `srcdoc` for frame injection | `blob:` URL | Requires `blob:` in `frame-src` CSP → hash change in `csp.test.ts`; no advantage |
| `srcdoc` for frame injection | `data:` URI | Same-origin with parent, defeats sandbox isolation |
| `srcdoc` for frame injection | Cross-origin subdomain (production end-state) | Requires a server / CDN; violates zero-infra constraint; appropriate for a future hosted version |
| Inline React CJS in srcdoc | Third-party UMD wrapper (`umd-react`) | Adds npm dep + supply-chain surface; no size benefit |
| Inline React CJS in srcdoc | React 18 UMD from CDN | Wrong React version; would create a second React instance violating the single-React invariant; needs network |
| Hand-rolled postMessage RPC | Penpal / postmsg-rpc | Adds dep; devtools-visible SDK strings; no value for a 6-message set |
| `<input type="color">` | react-colorful / react-color | Adds dep; OS-native picker is correct UX for a theme editor; zero styling cost |
| Hand-rolled contrast check | chroma-js / color.js | Adds dep; 20-line WCAG formula needs no library |
| idb 8 (existing) for window persistence | localStorage | localStorage sync-serializes the call stack; IDB is already the storage layer; no new pattern needed |

---

## Version Compatibility

| Package | Version | Compatibility Note |
|---------|---------|-------------------|
| `react` | 19.2.7 | CJS build at `cjs/react.production.js` — inline this in srcdoc (no UMD available) |
| `react-dom` | 19.2.7 | CJS client build at `cjs/react-dom-client.production.js` — provides `createRoot`; inline in srcdoc |
| `idb` | 8.0.3 | Schema version bump v3→v4 is additive; `idb` `openDB` upgrade handler pattern unchanged |
| `@babel/standalone` | 7.29.7 | Already present; no change for HARD-01 (Babel runs in the parent, not the frame) |
| CSP | current (meta tag) | No new directives needed; srcdoc inherits parent policy; `unsafe-eval` already present |
| `contrast-color()` CSS | Chrome 147+, Firefox 146+, Safari 26+ | Baseline Newly Available April 2026; use as enhancement, not sole mechanism |

---

## Sources

- MDN `HTMLIFrameElement.srcdoc` — srcdoc opaque origin behavior, sandbox rules, CSP
  inheritance: https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/srcdoc — HIGH
- MDN `Window.postMessage` + Structured Clone Algorithm — Functions throw DataCloneError,
  cannot transfer React components:
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm — HIGH
- React 19 UMD removal — `node_modules/react@19.2.7` has no `umd/` directory; confirmed by
  npm package inspection and community `umd-react` repo tracking: https://github.com/lofcz/umd-react — HIGH
- `contrast-color()` browser support — Baseline Newly Available April 2026; 74% global
  coverage per caniuse: https://caniuse.com/wf-contrast-color — HIGH
- CSP `srcdoc` inheritance behavior — "srcdoc document inherits the parent page's CSP":
  https://github.com/w3c/webappsec-csp/issues/700 — HIGH
- Anvil Engineering blog — MessageChannel vs `window.postMessage` per-call port isolation:
  https://www.useanvil.com/blog/engineering/using-message-channel-to-call-functions-within-iframes/ — MEDIUM
- CSP `blob:` frame-src requirement — `blob:` must be explicit; wildcard `*` doesn't match:
  https://content-security-policy.com/frame-src/ — HIGH
- IndexedDB additive migration pattern — version bump, conditional `createObjectStore`:
  https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB — HIGH
- Live codebase measurements (2026-06-26):
  - `react.production.js` CJS: 17KB raw
  - `react-dom-client.production.js` CJS: 536KB raw
  - `@babel/standalone` 7.29.7: 3.1MB raw / 661KB gzip
  - Production bundle: 3.26MB raw / 757KB gzip — HIGH (measured)
- CONSULT-sandboxing-execution.md (prior research, 2026-06-24) — iframe isolation spectrum,
  no `allow-same-origin` trap, postMessage bridge pattern — MEDIUM (AI consult, verified above)

---

*Stack research for: Vibe App Store v3.0 Trusted Desktop*
*Researched: 2026-06-26*
