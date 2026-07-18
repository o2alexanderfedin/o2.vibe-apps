# Vibe App Store

A **client-only, browser-based generative app marketplace**. You browse a storefront, open an app, and use it — and every app is a live React component produced **on demand** by a cheap LLM (Claude Haiku), compiled in the browser, cached locally in IndexedDB, and injected into the page at runtime.

There is **no application server**. You supply your own Anthropic API key (kept in `localStorage`), and the platform calls `api.anthropic.com` directly from your browser. Even backend-style data operations are produced on demand as cached **handlers**.

> **The core illusion:** to the user there is no "AI" and no "generate" button. Apps simply *exist* on the platform. Open one and it renders and works — instantly on a cache hit, seamlessly on a cache miss — and nothing visible ever reveals it was made on demand.

---

## How it works

Opening or interacting with an app runs one loop:

```
resolve intent → cache lookup → (miss) call Haiku → transpile JSX → new Function() → render → interact
       │              │                                  │                │
   structured     SHA-256 key                   @babel/standalone   explicit named
     intent      apps/widgets/handlers          classic runtime      scope only
```

- **Cache hit** → the app renders immediately from the local registry, with no model call.
- **Cache miss** → the platform calls Haiku, transpiles the returned JSX in-browser, stores the compiled JS **string** (never a function — functions aren't serializable), instantiates it via `new Function(...)`, and renders it. A bounded self-heal loop (~3 retries) feeds the **compiler** error back to the model on failure, because compiler errors are the most actionable.
- **Apps compose widgets.** An app can declare `@widget` dependencies that are resolved (cached or produced) and pre-warmed before mount, avoiding render-time waterfalls.
- **Behavior is delegated.** Unseeded apps default to a **thin shell**: the model first returns a behavior-free view (markup whose interactive elements carry `data-action`), and a permanent shell produces and caches each action's handler on first press — so every re-press is an O(1) cache hit.
- **Modify in place.** Any app or widget can be tweaked, cloned, or removed through a contextual natural-language prompt. Remove/clone resolve client-side with no model call; a tweak derives a new cache key and swaps the target in place.

Each app body runs inside an **opaque-origin `<iframe sandbox="allow-scripts">`** that the API key never enters; the host shell brokers all data over a typed `postMessage` RPC.

## Features

- 🖥️ **Desktop shell** — draggable glass windows with a macOS-style titlebar, multi-window management, minimize-to-dock, maximize, half-tiling snap (`Ctrl+←/→`), and keyboard controls (`Cmd/Ctrl+W` / `Cmd/Ctrl+M`).
- 🎨 **Themeable** — four built-in themes (Aurora / Aero / Aqua / Noir) plus a custom theme editor over a 12-variable CSS-custom-property contract, with live re-skin of open windows and FOUC-safe first paint.
- 🔍 **Launcher** — describe an app and open it, or pick a pre-installed one, from a Spotlight-style search panel.
- 💾 **Persistent desktop** — window geometry, z-order, and the open-app set survive a reload.
- 🛡️ **Resilience** — typed HTTP errors, backoff + jitter + token-bucket on the transport, per-app/widget error boundaries with retry, a sliding-window produce-cost cap, and LRU eviction under storage pressure.

## Tech stack

| Concern | Choice |
|---|---|
| UI runtime | **React 19.2** / react-dom 19.2 (one shared instance injected into every generated component) |
| In-browser transpile | **@babel/standalone** (pinned v7, **classic** JSX runtime → `React.createElement`) |
| Model | **Claude Haiku** (`claude-haiku-4-5-20251001`) via direct browser `fetch` to `/v1/messages` |
| Storage | **IndexedDB** via `idb` (stores: `apps`, `widgets`, `handlers`, `settings`), with an in-memory `Map` fallback |
| Validation | **zod** |
| Host build | **Vite 8** + `@vitejs/plugin-react`, strict **TypeScript 6** |
| Testing | **Vitest** + Testing Library + `fake-indexeddb`; **Playwright** for e2e |

The host has a normal Vite build; **only generated code is no-build** (compiled at runtime). The two compile paths are kept fully separate.

## Getting started

**Prerequisites:** Node 18+ and an [Anthropic API key](https://console.anthropic.com/).

```bash
npm install
npm run dev          # start the Vite dev server
```

Open the app in your browser, then enter your Anthropic API key when prompted (the key dialog). It is stored in `localStorage` on your machine, sent only to `api.anthropic.com`, and never logged or proxied.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build (source maps **off**, minified) |
| `npm run preview` | Preview the production build |
| `npm test` | Run the unit/integration suite (Vitest) |
| `npm run test:ui` | Vitest interactive UI |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run e2e` | Playwright end-to-end tests |

## Project structure

```
src/
  registry/    IndexedDB (db, cacheKey, registry, storagePressure, settingsStore)
  intent/      structured-intent resolver + modification routing
  execution/   producer, transpile, widget parse/prewarm, instantiate, mount,
               colorCheck, frame bridge, delegated thin-shell, handlers
  host/        modelClient + resilience (token-bucket, backoff, produce gate, backstop)
  services/    IoC seams (transport / registry / key / gate / settings) for tests
  data/, apps/ app registry, seeds, data broker
  ui/          DesktopShell, WindowFrame, Dock, MenuBar, SearchLauncherPanel,
               theme providers/editor, AppShell, WidgetShell, ContextualPrompt, KeyDialog
```

## Security model

`new Function(...)` runs generated code in a scope with only an explicit named parameter list (`React`, `useWidget`, `runHandler`, a `require` shim) — **no `eval`, no `innerHTML`** (rendering goes through React's virtual DOM). Ambient globals (`window`, `document`, `localStorage`) remain reachable, so `new Function` is **containment-by-convention, not a security boundary**; the real isolation is the opaque-origin sandboxed iframe, which the API key never enters. A CSP meta tag pins `connect-src` to `self` + `api.anthropic.com` (plus the vetted open data endpoints). The threat model that makes this acceptable: the code is produced by *your own* key, generating UI for *you*.

## Testing

```bash
npm test        # 90+ test files, run offline against captured model fixtures
npm run e2e     # real-browser Playwright smoke suite
```

The whole open→render flow is testable offline: the LLM transport, registry, key store, and produce gate are dependency-injected, so tests substitute the model with captured Haiku fixtures — no live network required.

## License

[MIT](./LICENSE) © 2026 Alexander Fedin
