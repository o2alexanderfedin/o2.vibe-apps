# The Marketplace — System Blueprint

> A marketplace platform where users browse, open, and interact with **apps**.
> Each app is a React widget, generated on-demand by a cheap LLM, cached
> per-app in IndexedDB, and injected live. Apps are composed of **widgets**
> (smaller UI building blocks), also generated on-demand. The user always
> thinks in terms of apps — they never see any "generate" UI.
>
> **Language rule:** The word "synthesize / synthesized / synthesis" must not appear
> anywhere visible via browser devtools: not in UI copy, not in JS symbol names,
> not in IndexedDB store/key names, not in console logs, not in network request
> payloads or headers, not in source comments (source maps expose these),
> not in CSS class names, not in HTML attributes.
> To the user, apps simply *exist* on the platform — they come from the
> marketplace. He pays a subscription; the platform takes care of the rest.

---

## Naming Conventions

| Term | Meaning |
|---|---|
| **Marketplace** | The system itself — the host platform the user lands on |
| **App** | What the user sees, opens, and thinks of as a discrete product. Internally a React widget mounted at the top level. |
| **Widget** | A UI building block used *inside* an app. Also generated on-demand (internally: synthesized). Apps can compose many widgets. |
| **Synthesize** | *Internal term.* The act of synthesizing an app or widget via LLM when it does not yet exist in the registry. Never surfaces in code symbols, logs, or network payloads visible via browser devtools. |

> Every app is technically a widget. "App" is the user-facing name for
> top-level widgets. "Widget" is the internal name for anything composable
> inside an app.

---

## Core Concept

When a user performs a **meaningful marketplace action** (opening an app,
interacting with a field, requesting a view inside an app) the system:

1. Classifies the intent and the app or widget type required
2. Checks the local IndexedDB registry for a cached app/widget
3. On cache **hit** → transpiles (once) and renders immediately
4. On cache **miss** → calls Haiku with the user's API key, receives JSX,
   transpiles, stores, then renders
5. Any app or widget can be `⋮`-prompted to **tweak, clone, or remove** it
   via a contextual natural-language prompt

The same pattern applies to backend handlers (data ops, mock APIs) — generated
on first need, cached for all subsequent calls.

---

## Built Reality (v1.1) — How the Implementation Diverges From This Blueprint

This blueprint describes the original v1.0 design. The shipped code implements it
and then moved past it. Where the two differ, **the code is authoritative**; the
sections below are annotated with the deltas, and `.planning/BLUEPRINT-DELTA.md`
carries the full audit. The headline divergences:

- **Delegated thin-shell is the default for unseeded apps (not monolithic).** A
  cache miss on an unseeded app produces a *behavior-free module* — `initialState`
  (the state SSOT), a **markup-only** `view(state)` whose interactive elements carry
  `data-action="…"` and **no** handlers, and a precise `actionSpec`. A permanent
  `DelegatedShell` runtime (`src/execution/delegated.tsx`) mounts it: one
  container-level click delegate reads `data-action` and **produces that action's
  behavior on demand** via `runHandler`, caching it so a re-press is a cache hit
  ("attached forever"). Behavior handlers are produced as **TypeScript** with a
  require-purity guard. **Seeded apps stay monolithic**, and a delegated payload
  that exports no `view` **gracefully falls back** to the monolithic path. This
  trades the blueprint's `<400`-line single component for a tiny markup module +
  many small per-action handlers (smaller → more reliable from a cheap model).
- **Flat token budget.** One `MAX_TOKENS = 8192` for every kind, not the per-kind
  1500/1000/800 — real components overran the smaller budgets and truncated.
- **Simplified theming variables.** Generated UI uses the triad
  `var(--color-surface)`, `var(--color-text)`, `var(--color-accent)` (set on
  `:root` via a `data-theme` attribute), not the larger primary/secondary/tertiary
  set this blueprint's prompt templates show.
- **Two layers this blueprint omits.** `src/host/` — resilience (token bucket,
  429 backoff+jitter, a sliding-window produce-cost gate, a global async error
  backstop, storage-pressure LRU eviction); `src/services/` — the IoC/DI
  composition root that injects the transport, registry, key getter, and cost gate
  so tests substitute every external dependency (no network, no real IndexedDB).
- **The mandatory browser header.** Browser `fetch` to Anthropic also sends
  `anthropic-dangerous-direct-browser-access: true` (omitted by this blueprint's
  Auth line) — without it the CORS preflight is rejected.
- **The cache-key contract is folded and opaque** (see Layer 2): SHA-256 over the
  normalized `(kind, type, prompt)` parts, so an app and a widget of the same type
  slug never collide and each tweak variant keys separately.

---

## Architecture Layers

### Layer 0 — User Interaction Surface

The marketplace presents a normal storefront UI. No "AI" controls are visible.

**Entry points:**
- User opens or interacts with an app → triggers app-level resolution
- An app's internal interaction triggers widget-level resolution
- `⋮` hover button on any app or widget → opens contextual prompt popover
- Contextual prompt supports: `"tweak: ..."`, `"clone"`, `"remove"`, free-form

**Stored client-side:**
- `localStorage.anthropic_api_key` — user's own Anthropic API key (never sent
  to any server other than `api.anthropic.com`)
- `localStorage.theme` — `"light"` | `"dark"` | `"system"`

---

### Layer 1 — Intent Resolver

Triggered on every meaningful user action. Produces a structured intent object.
Works identically for app-level and widget-level resolution.

```typescript
interface Intent {
  operation:  "render" | "mutate" | "clone" | "remove";
  kind:       "app" | "widget";           // top-level vs composable
  type:       string;                     // e.g. "weather-app", "line-chart"
  promptOverride?: string;                // from contextual ⋮ prompt
  contextBundle: {
    openApps:      string[];              // app types currently open
    siblingWidgets: string[];             // widgets already inside the host app
    appState:      Record<string, unknown>;
    userPrompt?:   string;
  };
  cacheKey: string;                       // sha256(kind + type + promptHash)
}
```

**Classification logic (cheap, client-side):**
- Static mapping for known action → app/widget type pairs
- Fallback: single Haiku call to classify ambiguous intent (result cached)
- Special-case keywords parsed client-side without AI:
  - `"remove"` / `"delete"` → `operation: "remove"`, no AI call
  - `"clone"` / `"duplicate"` → `operation: "clone"`, no AI call
  - Everything else → `operation: "mutate"` with full prompt

---

### Layer 2 — App & Widget Registry (IndexedDB)

Single IndexedDB database: **`MarketplaceRegistry`**, version 1.

#### Object stores

**`apps`** — top-level marketplace entries, keyed by `id` (string: `cacheKey`)

```typescript
interface StoredApp {
  id:           string;   // cacheKey = hash(kind:"app" + type + promptHash)
  type:         string;   // app type tag, e.g. "expense-tracker"
  displayName:  string;   // what the user sees in the marketplace
  prompt:       string;   // prompt used to generate it (for re-gen)
  sourceJSX:    string;   // raw generated JSX from model
  transpiledJS: string;   // Babel output — stored so Babel never runs twice
  widgetDeps:   string[]; // widget type IDs this app declares it may use
  createdAt:    number;
  updatedAt:    number;
  useCount:     number;   // incremented on every cache hit
}
```

**`widgets`** — composable building blocks, same schema minus `displayName`

```typescript
interface StoredWidget {
  id:           string;   // cacheKey = hash(kind:"widget" + type + promptHash)
  type:         string;   // widget type tag, e.g. "line-chart", "data-table"
  prompt:       string;
  sourceJSX:    string;
  transpiledJS: string;
  createdAt:    number;
  updatedAt:    number;
  useCount:     number;
}
```

**`handlers`** — backend-generated handlers, same schema

```typescript
interface StoredHandler {
  id:         string;
  intent:     string;       // e.g. "export-csv", "fetch-user-stats"
  sourceCode: string;       // generated handler JS
  createdAt:  number;
}
```

#### Cache key construction

Implemented as `registryKey()` in `src/registry/cacheKey.ts`. SHA-256 — not
`btoa`, which throws on emoji/CJK and is partially readable — over the
per-part-normalized parts joined by a unit separator (`U+001F`, which survives
normalization so field boundaries can't blur), yielding an opaque 64-char
lowercase-hex key. Folding `kind` in keeps an app and a widget of the same type
slug distinct; folding the normalized `prompt` in keys each tweak variant
separately. (A single-string `cacheKey(input)` primitive remains for opaque keys
that need no structure.)

```typescript
type RegistryKind = "app" | "widget" | "handler";

// normalizePart: NFC → lowercase → trim → collapse internal whitespace (per part).
const registryKey = async (
  kind: RegistryKind,
  type: string,
  prompt = "",
): Promise<string> =>
  sha256Hex([kind, normalizePart(type), normalizePart(prompt)].join(""));
```

#### Lookup flow

```
resolve(intent)
  → store = intent.kind === "app" ? "apps" : "widgets"
  → db.get(store, intent.cacheKey)
  → found?  YES → deserialise → skip to Execution Engine
             NO  → AI Generation → store → Execution Engine
```

---

### Layer 3 — AI Generation

**Model:** `claude-haiku-4-5-20251001`
**Transport:** Direct browser `fetch` to `https://api.anthropic.com/v1/messages`
**Auth / headers:** `x-api-key: ${localStorage.anthropic_api_key}`,
`anthropic-version: 2023-06-01`, and **`anthropic-dangerous-direct-browser-access: true`**
(mandatory — the browser CORS preflight is rejected without it).
**Max tokens:** a single flat `8192` for every kind. *(This blueprint originally
specified 1500/1000/800 per kind; real components overran those and truncated
mid-JSX → transpile failure, so the budget was unified and raised.)*

> **Delegated default (v1.1):** an unseeded app is produced as a behavior-free
> module (`initialState` + markup-only `view` + `actionSpec`) mounted through the
> permanent `DelegatedShell`, with per-action behavior produced on demand via
> `runHandler` and cached — NOT the monolithic component the templates below show.
> Seeds stay monolithic; non-module payloads fall back to the monolithic path.
> See "Built Reality (v1.1)" above.

#### App generation prompt template

```
Generate a React app for a marketplace app called: {{type}}

User requirement: {{userPrompt || "a polished default version"}}

Marketplace context:
- Other apps already open: {{openApps.join(", ") || "none"}}

This app may use sub-widgets. To use a widget inside this app, call:
  useWidget("widget-type-slug")
which returns a mounted React component you can render as <Widget />.
Declare any widgets you need at the top of the component as:
  // @widget line-chart
  // @widget data-table

Requirements:
- React hooks (useState, useEffect, useMemo as needed)
- CSS variables for theming (the shipped triad, set on `:root` via `data-theme`):
    var(--color-surface), var(--color-text), var(--color-accent)
- Realistic interactive sample data
- Self-contained — no imports other than React and useWidget()
- Default export
- Under 400 lines

Respond with ONLY the JSX code. No prose, no markdown fences.
```

#### Widget generation prompt template

```
Generate a React widget of type: {{type}}

User requirement: {{userPrompt || "a polished default version"}}

Host app context:
- Sibling widgets already in this app: {{siblingWidgets.join(", ") || "none"}}
- Do NOT duplicate functionality already present

Requirements:
- React hooks as needed
- CSS variables for theming (same as app)
- Accepts props: { data?, config?, onAction? }
- Self-contained — no imports other than React
- Default export
- Under 300 lines

Respond with ONLY the JSX code. No prose, no markdown fences.
```

#### Widget dependency declaration & resolution

When an app is generated it may declare widget dependencies via comments:

```jsx
// @widget line-chart
// @widget data-table
export default function ExpenseTracker() { ... }
```

At mount time the `AppShell` parser extracts these slugs and pre-warms the
widget registry (resolve each → cache or generate) before rendering the app.

The `useWidget(type)` hook is injected alongside `React` into the app's
`new Function()` scope:

```typescript
function makeUseWidget(appId: string) {
  return function useWidget(type: string): React.ComponentType {
    // Returns cached widget component synchronously after pre-warm,
    // or a <Skeleton /> with async resolution if called dynamically.
    return widgetRegistry.get(cacheKey("widget", type, "")) ?? Skeleton;
  };
}
```

#### Self-heal loop

```typescript
async function generateWithRetry(
  kind: "app" | "widget" | "handler",
  prompt: string,
  maxAttempts = 3
) {
  let lastError = "";
  for (let i = 0; i < maxAttempts; i++) {
    const code = await callHaiku(
      i === 0 ? prompt : `${prompt}\n\nPrevious attempt failed:\n${lastError}\nFix it.`
    );
    const result = tryTranspile(code);
    if (result.ok) return result.transpiledJS;
    lastError = result.error;
  }
  throw new Error(`${kind} generation failed after ${maxAttempts} attempts`);
}
```

#### Stripping model preamble

```typescript
const cleanJSX = (raw: string) =>
  raw.replace(/^```[a-z]*\n?/gm, "").replace(/^```$/gm, "").trim();
```

---

### Layer 4 — Execution Engine

Runs entirely in the browser. No build step.

#### Step 1 — Transpile (once per app/widget)

```typescript
import * as Babel from "@babel/standalone";

function transpile(sourceJSX: string): string {
  // Only called on cache miss — result stored back to IndexedDB
  const { code } = Babel.transform(sourceJSX, {
    presets: ["react"],
    filename: "component.jsx",
  });
  return code;
}
```

#### Step 2 — Instantiate

```typescript
function instantiate(
  transpiledJS: string,
  extras: Record<string, unknown> = {}
): React.ComponentType {
  const mod = { exports: {} as any };
  const argNames = ["module", "exports", "React", ...Object.keys(extras)];
  const argValues = [mod, mod.exports, React, ...Object.values(extras)];
  new Function(...argNames, transpiledJS)(...argValues);
  return mod.exports.default ?? mod.exports;
}

// For apps: pass useWidget into scope
const AppComponent = instantiate(app.transpiledJS, {
  useWidget: makeUseWidget(appId)
});
```

#### Step 3 — Render

```typescript
function mount(Component: React.ComponentType, container: HTMLElement) {
  const root = ReactDOM.createRoot(container);
  root.render(
    React.createElement(ErrorBoundary, null, React.createElement(Component))
  );
  return root; // caller stores this for later unmount
}
```

#### In-memory transpiled cache (session-scoped)

```typescript
const transpiledCache = new Map<string, string>();
// cacheKey → transpiledJS
// Populated from IndexedDB on load, updated on generation
```

---

### Layer 5 — UI Surface & Contextual Prompt

#### App shell (wraps every open app)

```
┌─────────────────────────────────────┐
│  Expense Tracker              [⋮]  │  ← app name + contextual menu
│─────────────────────────────────────│
│                                     │
│   <AppComponent />                  │
│     ├── <Widget type="line-chart"/> │
│     └── <Widget type="data-table"/> │
│                                     │
└─────────────────────────────────────┘
```

Widgets inside the app render inside their own `WidgetShell`, which also
exposes a `⋮` button — so widgets can be tweaked independently of their
parent app.

#### Contextual Prompt Popover

Same popover for both apps and widgets. Title reflects which is being modified:

```
┌──────────────────────────────────────────┐
│  Modify: Expense Tracker                 │
│  ──────────────────────────────────────  │
│  [textarea: "what would you like to..."] │
│                                          │
│  [Cancel]              [Apply ↗]         │
└──────────────────────────────────────────┘
```

**Prompt routing (client-side, no AI):**

```typescript
function routePrompt(prompt: string, target: AppInstance | WidgetInstance): void {
  const p = prompt.toLowerCase().trim();

  if (/\b(remove|delete|close)\b/.test(p)) return removeTarget(target);
  if (/\b(clone|duplicate|copy)\b/.test(p)) return cloneTarget(target);

  // Everything else → regenerate with prompt as mutation context
  return regenerateTarget(target, prompt);
}
```

**Regeneration:** creates a new `cacheKey` (kind + type + mutation prompt),
checks registry, generates if missing, renders in-place.

---

### Layer 6 — Backend Handler Generation (optional)

Same pattern as app/widget generation, applied to server-side logic.
Apps and widgets call `runHandler(intent, input)` — they don't know or care
whether the handler was pre-written or generated on-demand.

#### When to trigger

An app or widget requests data or an operation with no real handler yet:
- `"export this as CSV"`
- `"fetch live user stats"`
- `"save this form to a database"`

#### Handler generation prompt template

```
Generate a JavaScript async function that handles: {{intent}}

Context: {{contextDescription}}

Requirements:
- Named export: export async function handler(input) { ... }
- Return { data?, error? }
- Use realistic mock data if no real data source is available
- Self-contained — no external imports
- Under 150 lines

Respond with ONLY the JavaScript. No prose, no markdown fences.
```

#### Runtime execution

```typescript
async function runHandler(intent: string, input: unknown) {
  const key = cacheKey("handler", intent, "");
  const stored = await db.get("handlers", key);
  const code = stored?.sourceCode ?? await generateHandler(intent);

  const fn = new Function("input", `${code}; return handler(input);`);
  return await fn(input);
}
```

---

## Data Flow — Full Request Lifecycle

```
User opens / interacts with an app
    │
    ▼
Intent Resolver
    │  produces Intent { operation, kind, type, cacheKey, contextBundle }
    ▼
IndexedDB lookup  ("apps" or "widgets" store)
    │
    ├── HIT ────────────────────────────────────────────┐
    │                                                   │
    ▼                                                   │
AI Generation (Haiku, user's API key)                  │
    │  → raw JSX (app or widget)                        │
    │  → clean → transpile → store to IndexedDB         │
    │  → parse @widget deps → pre-warm widget registry  │
    │                                                   │
    ▼                                                   ▼
Execution Engine
    │  → check in-memory transpiled cache
    │  → instantiate (inject React + useWidget into scope)
    │  → ReactDOM.render inside AppShell or WidgetShell
    ▼
UI Surface
    │  → user sees app (which renders its widgets)
    │  → ⋮ on app or any widget opens contextual prompt
    │  → any interaction re-enters at Intent Resolver
    ▼
(loop)
```

---

## Error Handling

### Render errors

```typescript
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ color: "var(--color-text-danger)", fontSize: 13, padding: 12 }}>
        Render error — <button onClick={() => this.setState({ error: null })}>retry</button>
      </div>
    );
    return this.props.children;
  }
}
```

### Generation errors

| Scenario | Behaviour |
|---|---|
| API key missing | Inline prompt to configure key — no crash |
| API 401 | "Invalid API key" inline, prompt to reconfigure |
| API 429 | Exponential backoff, 3 retries, then user-visible error |
| Transpilation fail | Self-heal loop (max 3 attempts) then inline error |
| Render throw | ErrorBoundary catches, shows retry button |
| Widget dep fails | App renders without that widget; shows placeholder |
| IndexedDB unavailable | Degrade to in-memory Map only, warn user |

---

## Devtools Hygiene

> An advanced user pressing F12 can see JS symbols, IndexedDB contents, console
> output, network request bodies/headers, source comments (via source maps),
> CSS class names, and HTML attributes. **None of these must reveal that apps
> are synthesized on demand.** The user's mental model is that apps exist on
> the platform — the platform's internal mechanics are invisible.

### What is visible via F12 and how to handle it

| Devtools surface | Rule |
|---|---|
| **JS symbol names** | Use neutral names: `generateApp()`, `synthesizeWidget()`, `resolveApp()`, `AppRegistry`, `WidgetRegistry`. Never use: `[redacted]App`, `fakeApp`, `mockApp`. |
| **IndexedDB** | Store names: `apps`, `widgets`, `handlers`. Key names: opaque hashes only — never include the source prompt or type slug in a readable key. |
| **Console logs** | No `console.log("synthesizing widget...")`. Logs in production: off by default, enabled only via `localStorage.debug = true`. When enabled, use neutral language: `[Marketplace] Resolving app: weather`, not `[Marketplace] Generating fake app`. |
| **Network tab** | Request body sent to `api.anthropic.com` contains the generation prompt. The prompt must use neutral language: "Generate a React component for a weather app" — not any phrasing that reveals the mechanic. |
| **Source comments** | Source maps expose comments in production if enabled. Write comments as if users can read them: `// resolve from registry or generate` not `// [generate/fake] if missing`. |
| **HTML attributes** | No `data-synthesized`, `data-generated`, or `data-fake` attributes on rendered apps or widgets. |
| **CSS class names** | No `.synthesized-app`, `.generated-widget`. Use structural names: `.app-shell`, `.widget-frame`. |
| **Error messages** | Errors shown in the UI or logged to console must never say "generation failed" or "synthesis error". Say "This app couldn't load. Try again." |
| **localStorage keys** | `marketplace.theme`, `marketplace.apiKey` — neutral and product-branded. |

### Naming reference — internal vs visible

| Concept | Internal codebase (invisible) | Visible anywhere (F12, UI) |
|---|---|---|
| Creating an app/widget via LLM | `synthesize`, `generate`, `resolve` | — (never describe the mechanic) |
| App that came from the LLM | `synthesizedApp`, `generatedApp` | `app` |
| Cache miss → LLM call | `onCacheMiss()` | — |
| The registry | `AppRegistry`, `WidgetRegistry` | — |
| IndexedDB database | `MarketplaceDB` | — |
| Loading state (UI) | — | "Opening…", "Loading…", "Just a moment…" |
| Error state (UI) | — | "Couldn't load this app. Try again." |

## Security Considerations

| Concern | Mitigation |
|---|---|
| Arbitrary code execution | All generated code runs in `new Function()` scope with only `React` + `useWidget` injected; no `eval`, no global pollution |
| Widget calling parent scope | `useWidget` returns pre-resolved components only; widgets cannot reach the app's state or the marketplace shell |
| XSS from generated HTML | Components render through React's virtual DOM — direct `innerHTML` is never used |
| API key exposure | Key stored in `localStorage`, sent only to `api.anthropic.com` via HTTPS, never logged or proxied |
| Prompt injection via UI | User-supplied prompt text is treated as a plain string, never interpolated into trusted positions |

> ⚠️ For production: consider running apps inside sandboxed `<iframe>`s with
> `sandbox="allow-scripts"` and `postMessage` for marketplace ↔ app
> communication.

---

## File & Module Structure

```
src/
├── db/
│   ├── index.ts              # IndexedDB init, typed get/put helpers
│   ├── apps.ts               # apps object store CRUD
│   ├── widgets.ts            # widgets object store CRUD
│   └── handlers.ts           # handlers object store CRUD
│
├── intent/
│   ├── resolver.ts           # action → Intent object (app + widget aware)
│   ├── classifier.ts         # static map + Haiku fallback
│   └── router.ts             # prompt keyword routing (remove/clone/mutate)
│
├── generation/
│   ├── app.ts                # buildAppPrompt(), parseWidgetDeps()
│   ├── widget.ts             # buildWidgetPrompt()
│   ├── handler.ts            # backend handler generation
│   ├── transpile.ts          # Babel wrapper, in-memory cache
│   └── selfHeal.ts           # retry loop with error feedback
│
├── execution/
│   ├── instantiate.ts        # new Function() → React component
│   ├── mount.ts              # ReactDOM.createRoot().render()
│   ├── useWidget.ts          # hook factory injected into app scope
│   └── ErrorBoundary.tsx
│
├── ui/
│   ├── AppShell.tsx          # wrapper for top-level apps, ⋮ button
│   ├── WidgetShell.tsx       # wrapper for widgets inside apps, ⋮ button
│   ├── ContextualPrompt.tsx  # shared popover (works for apps + widgets)
│   ├── Marketplace.tsx       # storefront grid of available/open apps
│   └── AppBar.tsx            # top nav, API key config, theme toggle
│
├── store/
│   ├── apiKey.ts             # localStorage get/set/clear
│   └── theme.ts              # localStorage theme + system detection
│
└── app.tsx                   # root, DB init, theme init, marketplace shell
```

> **Shipped structure differs.** `db/` → **`registry/`** (`cacheKey.ts`,
> `registry.ts`, `db.ts`, `storagePressure.ts`); generation lives in
> **`execution/producer.ts`** (app / widget / handler / **delegated** kinds), with
> `execution/delegated.tsx` (the `DelegatedShell` runtime) and `loader.ts` (the
> three-tier resolve → compile → instantiate path). Two layers this tree omits:
> **`host/`** (resilience — token bucket, 429 backoff, produce-cost gate, global
> error backstop, storage-pressure LRU) and **`services/`** (the IoC/DI
> composition root). `store/` → `lib/storage.ts`; `app.tsx` → `App.tsx` + `main.tsx`.

---

## Key Implementation Notes for Claude Code

1. **Babel must load before any generation attempt.** Import
   `@babel/standalone` at app init, not lazily — the first cache miss would
   otherwise block on a ~450KB download.

2. **IndexedDB is async; treat it as always-async.** All registry operations
   return Promises. Use `await` everywhere; never assume synchronous access.

3. **`new Function()` scope is strict.** Pass every dependency as a named
   parameter. Apps receive `React` and `useWidget`. Widgets receive only
   `React`. Neither receives `window`, `document`, or any other global.

4. **One `ReactDOM.createRoot()` per container.** Calling it twice on the same
   element throws. Track mounted roots in a `Map<string, Root>` keyed by
   app/widget ID; call `root.unmount()` before removing.

5. **Pre-warm widget deps before mounting the app.** Parse `// @widget` comments
   from the app's source, resolve each widget (cache or generate), then mount
   the app. This prevents waterfalls of widget generation after the app renders.

6. **`useWidget` must be synchronous at render time.** Pre-warming ensures the
   widget is in the in-memory registry before the app renders. `useWidget(type)`
   returns the component immediately; it must never trigger async work inside a
   render cycle.

7. **Cache key stability matters.** The same type + prompt must produce the same
   cache key every time. Normalise prompts before hashing (lowercase, trim,
   collapse whitespace).

8. **Theme CSS variables must be defined on `:root`.** Generated apps and
   widgets use `var(--color-*)` — these must be available from the host page.

9. **The self-heal loop must append the Babel error, not the JS error.** Babel
   errors are more actionable for the model (line number, unexpected token).

10. **Never store compiled functions in IndexedDB.** Store `transpiledJS`
    (string) and recompile via `new Function()` on load. The in-memory
    `transpiledCache` Map handles the per-session "compile once" guarantee.

11. **Widget failure must not crash its parent app.** Each `WidgetShell` wraps
    its content in an `ErrorBoundary`. A broken widget shows a placeholder;
    the app continues rendering.

12. **Backend handlers are transparent to apps and widgets.** Both call
    `runHandler(intent, input)` and receive `{ data?, error? }`. Handler
    resolution (cache → generate → execute) happens inside that helper only.

---

## Dependencies

| Package | Purpose | CDN / npm |
|---|---|---|
| `react` + `react-dom` | App and widget rendering | npm |
| `@babel/standalone` | In-browser JSX transpilation | CDN (cdnjs) |
| `idb` (optional) | Typed IndexedDB wrapper | npm |
| `anthropic` SDK (optional) | Typed API client | npm — or raw `fetch` |

All other functionality is vanilla browser APIs.

---

## MVP Checklist

- [ ] IndexedDB init with `apps`, `widgets`, and `handlers` stores
- [ ] `localStorage` API key get/set/clear UI
- [ ] Marketplace storefront grid (shows available app types)
- [ ] Intent resolver: static map of user action → app/widget type + kind
- [ ] Registry lookup: `db.get("apps" | "widgets", cacheKey)`
- [ ] Haiku call: `fetch` to `/v1/messages` with app or widget prompt
- [ ] JSX clean + Babel transpile + `new Function()` instantiate
- [ ] `useWidget` hook factory + injection into app scope
- [ ] `@widget` dep parser + pre-warm before app mount
- [ ] `ReactDOM.createRoot().render()` inside `AppShell`
- [ ] `WidgetShell` with `⋮` button for widgets inside apps
- [ ] Shared `ContextualPrompt` popover (app + widget aware)
- [ ] Prompt router: remove / clone / mutate branches
- [ ] Mutation: new cache key → generate → replace in-place
- [ ] `ErrorBoundary` around every app and every widget
- [ ] Self-heal retry loop (3 attempts, error appended to prompt)
- [ ] Theme switcher: light / dark / system via CSS variables
- [ ] Backend handler generation + `runHandler()` helper
