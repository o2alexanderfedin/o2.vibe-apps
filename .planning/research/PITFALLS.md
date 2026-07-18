# Pitfalls Research

**Domain:** iframe-sandbox isolation + desktop persistence + theme editor + window-chrome UX on an existing client-only React SPA (Vibe App Store v3.0 "Trusted Desktop")
**Researched:** 2026-06-26
**Confidence:** HIGH (iframe/sandbox security, postMessage, CSP-in-frame, React-across-frame, IDB migration, theme contract, and hygiene-gate regressions verified against MDN, OWASP, HTML spec, first-party codebase analysis of `src/execution/instantiate.ts`, `src/registry/db.ts`, `src/hygiene.test.ts`, `index.html`, and `src/ui/VibeThemeProvider.tsx`; prior v2.0 pitfalls cross-referenced for continuity)

> This file covers **v3.0 Trusted Desktop additive pitfalls only**. v1.x and v2.0 baseline pitfalls remain valid and are documented in `PITFALLS-v1.1.md` and `PITFALLS-v2.0.md`. Phase names below follow the v3.0 milestone roadmap (order TBD by roadmap; references use descriptive phase labels). The iframe-sandbox pillar gets the most coverage because a single mistake there re-exposes the API key the milestone exists to protect.

---

## Critical Pitfalls — iframe Sandbox (HARD-01)

### Pitfall 1: allow-same-origin + allow-scripts Together Defeats the Opaque Origin

**What goes wrong:**
The entire security premise of HARD-01 is that the frame has an **opaque origin** — a unique, synthetic origin that has no access to `localStorage`, `sessionStorage`, `IndexedDB`, or `document.cookie` on the parent's origin. The API key stored in `localStorage('marketplace.apiKey')` is invisible to opaque-origin frames. But if `allow-same-origin` is added alongside `allow-scripts`, the frame loses its opaque origin and regains the parent's full same-origin privileges — including direct access to `localStorage` and the API key. Worse, with both flags set, the frame's own scripts can programmatically remove the `sandbox` attribute from their containing iframe element, eliminating all restrictions.

The specific bypass: the frame's script reaches `window.frameElement.removeAttribute('sandbox')` (possible because same-origin means the frame can access its parent's DOM), then navigates to execute unrestricted code. This is documented in the HTML spec and confirmed in browser behavior. The result is no more secure than having no sandbox at all.

**Why it happens:**
Developers sometimes add `allow-same-origin` incrementally to debug a broken frame (frame can't load local assets, `fetch` calls fail with opaque-origin errors, `postMessage` cross-origin ping breaks). The fix seems simple: add `allow-same-origin`. It works, the frame loads — and the security model is silently destroyed.

**How to avoid:**
- **Use ONLY `sandbox="allow-scripts"` — never add `allow-same-origin` to this sandbox.** The app body executes JavaScript via `allow-scripts`; the opaque origin from the absence of `allow-same-origin` is the security boundary.
- If the frame needs to load assets (React, Babel), bundle them into the `srcdoc` string or a `blob:` URL — do NOT solve it by adding `allow-same-origin`.
- Add a CI or integration test that reads the `sandbox` attribute of the rendered `<iframe>` element and asserts it does not contain `allow-same-origin`.
- Code-review rule: any PR touching iframe construction must be reviewed with this specific flag combination in mind.

**Warning signs:**
- The iframe frame body has access to `localStorage` (test: `postMessage` a `localStorage.getItem(...)` probe from the frame; it should throw a SecurityError in a correctly sandboxed frame).
- A sandbox error disappears when `allow-same-origin` is added — this indicates the wrong fix was applied.
- Frame can call `window.frameElement.removeAttribute('sandbox')` without throwing.

**Phase to address:**
iframe Sandbox Phase (HARD-01). Prevention test: assert `sandbox` attribute of the mounted frame does not contain `allow-same-origin`. Security test: probe `localStorage` from inside the frame via controlled `postMessage`; expect a SecurityError.

---

### Pitfall 2: postMessage targetOrigin Wildcard Leaks Data to Hostile Frames

**What goes wrong:**
When the parent host sends a `postMessage` to the frame (to inject theme variables, respond to a `runHandler` request, deliver a `useWidget` result, etc.), using `targetOrigin: "*"` means any window — including a malicious one that has replaced the frame's location — can receive the message. If the parent includes the API key in a theme-push message ("here are the current vars, and also the key for you to verify identity"), the key is delivered to whoever is listening with `"*"`.

The less-obvious direction: if the frame sends messages to `parent.postMessage(..., "*")` and the parent moves to a different location (or the frame is embedded by an attacker page), the message is delivered to the wrong origin.

For this system specifically: the parent's theme-var push is low-sensitivity, but the `runHandler` response path carries real data (weather, currency — and in a misconfigured system, could accidentally include the API key echo). Any `postMessage` path that touches handler responses must be scrutinized.

**Why it happens:**
During development, `"*"` is convenient — no CORS errors, no origin mismatch bugs. Developers ship it because "it's only sending CSS vars" and forget that the same infrastructure is later extended to carry data responses.

**How to avoid:**
- **Parent → frame:** The frame is a `srcdoc`/`blob:` frame with an opaque origin. The correct `targetOrigin` is `"*"` ONLY for opaque-origin targets (you cannot know their "origin" — it is an implementation-internal value). **This is a genuine exception:** opaque origins cannot be specified as a target. The mitigation is to ensure the message never contains the API key or anything the key can be derived from. Audit every outbound parent→frame message for key-adjacent data.
- **Frame → parent:** The parent is the host (`localhost` in dev, the deployed origin in prod). The frame should always `postMessage(data, parentOrigin)` where `parentOrigin` is injected into the frame at construction time (in the `srcdoc` template or as a URL parameter). This pins the response to the exact parent origin.
- Treat every message type as a potential exfiltration path; enumerate them and annotate each with "contains: [field list]". Add a failing test if any message type in the parent→frame direction contains any key-adjacent field.

**Warning signs:**
- Any `postMessage` call uses `"*"` as targetOrigin for frame→parent direction.
- The message payload for a theme push includes fields other than the 12 CSS variable names.
- Handler response messages bubble through the frame→parent bridge without stripping the `input` field (which the user typed — may contain the API key if a user pastes it into an app).

**Phase to address:**
iframe Sandbox Phase (HARD-01). Verify: enumerate all `postMessage` call sites in the bridge; assert no frame→parent call uses `"*"`; assert no parent→frame call carries any key-adjacent field by reviewing the message shape type definitions.

---

### Pitfall 3: Missing origin + source Checks on Incoming postMessage Events

**What goes wrong:**
A `message` listener on the parent host that processes frame requests (`runHandler`, `useWidget`, `modify`) must check BOTH `event.origin` AND `event.source` before acting. If only `event.origin` is checked with a loose test (`event.origin.includes('localhost')`), an attacker page served on `localhost:12345` (a dev server or an XSS on a different localhost port) can send forged messages that trigger arbitrary handler execution on behalf of the user. If neither is checked, ANY page can invoke `runHandler("deleteAll", {})` and the parent shell executes it.

The `event.source` check is equally important: verify that the message came from one of the known sandboxed frame instances (`iframeRef.current.contentWindow === event.source`). Without it, another frame or window can impersonate a sandboxed app.

The message-ordering / correlation-ID race is a related failure mode: if the parent sends a handler request to frame A, and frame B replies with a matching correlation ID before frame A does, the parent applies frame B's response to frame A's pending callback. This allows a compromised frame (if one were to exist in a multi-frame scenario) to poison another frame's data.

**Why it happens:**
- `event.origin` check is documented as the primary defense; `event.source` is easy to skip because it is not emphasized in tutorials.
- Correlation IDs are generated with `Math.random()` or a monotone counter, which are predictable and guessable across frames.
- Multi-frame concurrent handler calls share a single `Map<correlationId, Promise>` — no per-frame namespacing.

**How to avoid:**
- **Always check both `event.origin` AND `event.source`.** For opaque-origin frames, `event.origin` is `"null"` (the string). Verify this is exactly `"null"` and that `event.source === knownFrameContentWindow`. Both checks together are the correct guard for sandboxed-srcdoc frames.
- Use `crypto.randomUUID()` or a cryptographically random correlation ID (not `Math.random()`) to prevent ID guessing across frames.
- Namespace the pending-callback map by `[frameId, correlationId]` rather than just `correlationId` — this prevents cross-frame correlation poisoning.
- In the `message` listener, fail closed: if any check fails, drop the message and log (via the gated logger, with no key-adjacent content in the log).

**Warning signs:**
- The `message` listener checks `event.origin` but not `event.source`.
- Correlation IDs are sequential integers or `Date.now()`.
- A single shared `Map<string, resolver>` handles all frames' pending requests without frame scoping.
- The listener does not have an explicit `event.origin === "null"` check for opaque-origin frames.

**Phase to address:**
iframe Sandbox Phase (HARD-01). Verify: write a test that dispatches a forged `message` event from a different source window; assert the listener drops it without executing any callback. Verify `event.origin === "null"` is the branch taken for srcdoc frames.

---

### Pitfall 4: API Key Leaking Into the Frame via srcdoc Template or Config Push

**What goes wrong:**
The frame receives its initial content via `srcdoc` (or a `blob:` URL). If the srcdoc template string is assembled by interpolating variables from the parent scope, a developer might accidentally include `apiKey` or a theme-config object that was built with `{ ...settings, apiKey }`. The key is then visible in:
1. DevTools → Elements → the `<iframe srcdoc="...">` attribute value (fully readable in the inspector).
2. The Network tab if the frame loads via a `blob:` URL that the parent constructed by embedding the key.
3. The frame's own `document.documentElement.innerHTML` (accessible via the browser's `about:srcdoc` session history entry cross-origin leak, documented in Chromium issue 41487933).

A subtler variant: the `postMessage` bridge sends a "theme + config" payload during frame init (to push CSS vars and the `runHandler` URL or similar). A developer adds the API key to this payload so the frame can "authenticate itself back to the parent." This is architecturally wrong — the frame must NEVER hold the key — but it is an easy mistake if the key is in scope when building the init payload.

A third vector: **error messages.** If a handler invocation fails and the error message echoes the original request (which the user typed), and the user happened to paste the API key into an app's text field (unlikely but possible), the error message carries the key through the bridge back to the parent's error logger.

**Why it happens:**
- The parent scope where `srcdoc` is built has access to `localStorage`, hence the key. A spread operator or a `JSON.stringify(config)` is all it takes.
- Error serialization is often lazy (`String(err)` or `err.message`) and does not scrub PII from request context.

**How to avoid:**
- **The key never enters the frame construction path.** The `buildSrcdoc(transpiledJS, themeVars, parentOrigin)` function must have a strictly typed signature that physically cannot accept the API key. Never pass the services object or the settings store into this function.
- **Audit the theme-push message type.** Define `interface FrameInitMessage { type: 'init', themeVars: Record<string, string>, parentOrigin: string }` — no other fields. Make the TypeScript type the enforcement mechanism.
- **Scrub error messages** before logging them through the bridge. Strip any value that matches the pattern of an Anthropic key (`sk-ant-...`) before forwarding to the gated logger.
- Add a CI test that asserts the `srcdoc` attribute of the rendered `<iframe>` does not contain the string `sk-ant` or the value of any known key pattern.

**Warning signs:**
- The `srcdoc`-building function receives anything beyond `(transpiledJS: string, themeVars: Record<string, string>, parentOrigin: string)`.
- The `FrameInitMessage` type has more than 3 fields.
- Error responses from the bridge include the raw `input` payload that was sent to the handler.
- DevTools → Elements → the iframe element shows a `srcdoc` attribute longer than ~50KB (Babel + React + transpiledJS is substantial but predictable; a key-containing config would stand out).

**Phase to address:**
iframe Sandbox Phase (HARD-01). Verify: render an iframe; assert `iframeEl.getAttribute('srcdoc')` does not contain any substring matching `/sk-ant/`; assert the FrameInitMessage type definition has no key-adjacent field; unit test `buildSrcdoc` with a spy confirming it never reads from the services key store.

---

### Pitfall 5: CSP-in-Frame Gaps — Frame Needs Its Own unsafe-eval and Babel

**What goes wrong:**
The parent page's CSP (the `<meta http-equiv="Content-Security-Policy">` in `index.html`) does not apply to srcdoc-based frames the same way. According to the HTML spec and Chrome's implementation, a `srcdoc` frame **inherits the parent's CSP**. This is good for `connect-src` (the frame can't fetch from arbitrary origins), but it means the frame needs `script-src 'unsafe-eval'` in the parent CSP for `new Function` and Babel to work inside the frame.

The current CSP already has `'unsafe-eval'` in `script-src`. However, if you split the CSP to tighten the parent's `script-src` (removing `'unsafe-eval'` from the host shell and adding it only to a frame-specific CSP header), the srcdoc inheritance breaks your plan: there are no separate CSP headers for srcdoc frames since they can't be served with HTTP response headers.

The second issue: Babel standalone is ~1.5MB+ (minified/gzipped varies). Shipping it inside every frame's srcdoc string means 1.5MB per open window, not shared. If you instead use `blob:` URL to hold Babel once, the frame's `script-src` must allow `blob:` — which is not in the current CSP. Loading Babel from `cdn.jsdelivr.net` or similar requires adding that CDN to `script-src` — a significant hygiene surface.

**Why it happens:**
- Developers assume frames can have their own CSP. For srcdoc frames, they can't (no HTTP response headers; CSP inheritance applies).
- The compile path works in the parent (`unsafe-eval` is there), developers assume it works in the frame — and it does, until the parent CSP is tightened.
- Babel's size is not factored into per-frame memory cost.

**How to avoid:**
- **Accept the srcdoc CSP inheritance** — don't try to tighten the parent `script-src` without the frame in mind. The `'unsafe-eval'` must remain because the frame uses `new Function`.
- **Share Babel across frames via a `blob:` URL created once at host init.** Build the Babel UMD blob on startup, store the `blob:` URL in a module-level variable, inject it as a `<script src="blob:...">` tag in the srcdoc template. Add `blob:` to the `script-src` CSP directive. This is a one-time Babel fetch/parse cost shared by all frames, not per-frame.
- Update the CSP hash test (`csp.test.ts`) to include the new `blob:` entry and recompute the inline-script hash after any srcdoc template changes.
- Verify that Babel's `transform` output inside the frame produces `React.createElement` (classic runtime) — since Babel is loaded fresh in the frame's global scope, the `presets: [["react", { runtime: "classic" }]]` config must be explicit in the frame's compile call, not inherited from the parent.

**Warning signs:**
- `new Function` calls inside the frame throw a CSP violation logged in DevTools as `EvalError: Refused to evaluate a string as JavaScript`.
- Each open window causes a separate ~450KB+ network request to load Babel (visible in the Network tab as multiple identical requests).
- The csp.test.ts hash check fails after any srcdoc template change (correct — treat as a reminder to recompute, not an exception to silence).
- The frame's Babel output contains `_jsx(` instead of `React.createElement(` (automatic runtime leak).

**Phase to address:**
iframe Sandbox Phase (HARD-01). Verify: open 3 windows; DevTools Network shows Babel loaded once, not three times. The iframe renders correctly with `new Function`. CSP violation console is empty. The csp.test.ts passes.

---

### Pitfall 6: React-in-iframe — Two React Copies, Event System Mismatch, and Portal Failures

**What goes wrong:**
The frame's srcdoc bootstraps a separate HTML document with its own global scope. If React is loaded inside the frame independently (e.g., from a CDN script tag in the srcdoc template), the frame has a separate React instance from the host. This causes:
1. **Invalid hook call.** A component from the host scope (`ErrorBoundary`, `useWidget`) imported into the frame uses the host's React instance; hooks called inside a frame-context component use the frame's React instance. Two React instances = "Invalid hook call" at runtime.
2. **Event system mismatch.** React 17+ attaches its synthetic event system to the component's root container (not `document`). If the host's `WindowFrame` renders JSX subtrees that straddle the iframe boundary (e.g., a `createPortal` into the parent document from inside the frame's React tree), events from the portal target won't bubble correctly through React's delegation tree.
3. **Portals across the boundary.** `createPortal(element, parentDocument.body)` from inside the frame requires `allow-same-origin` — which must NOT be set. Portals in the frame can only target elements inside the frame's own document. The contextual prompt (`⋮` menu) must live in the host's chrome (the titlebar), not inside the frame — this is why the window-chrome UX refactor (moving `⋮` to the titlebar) is a prerequisite for iframe isolation.

A fourth failure mode: `ResizeObserver` and `MutationObserver` attached to elements in the frame observe elements in the frame's document only. The parent's `useDrag` hook reads `frameRef.current.getBoundingClientRect()` — that works (the host can read the iframe element's geometry from the host document). But if the frame tries to measure its own content height and `postMessage` it to the parent to set the iframe height dynamically, the height includes the frame's scroll content — which can differ from the visible area in the host.

**Why it happens:**
- React is loaded via a `<script>` tag in the srcdoc, creating a second independent React global.
- Developers use `createPortal` for menus and dropdowns, forgetting the opaque-origin frame has a separate DOM.
- The contextual prompt was in the app body (AppShell) before the window-chrome UX refactor, so iframe isolation is impossible without moving it to the titlebar first.

**How to avoid:**
- **Inject the shared React instance into the frame.** The same pattern used in `new Function` scope today — pass React as a named parameter — applies in the frame. Build the srcdoc template so it receives `window.__REACT__` injected via a parent `postMessage` immediately after load, or serialize the React module as a blob URL once and load it as a `<script>` from the same blob, ensuring there is one React instance per page load. The frame's `new Function` scope then receives this same instance, not a fresh copy.
- **The `⋮`-to-titlebar move is a hard prerequisite** (already noted in PROJECT.md). No portals can cross from the frame to the parent; all host-owned chrome must be in the host React tree before the iframe move.
- **Never `createPortal` across the iframe boundary.** Any portal target must be inside the frame's own `document`. Design the frame's rendered tree to be self-contained.
- For dynamic height: the frame can observe its `document.body.scrollHeight` with `ResizeObserver` and `postMessage` the height to the parent, which sets `iframe.style.height`. Test that this does not produce a resize loop.

**Warning signs:**
- "Invalid hook call" error in the console after the first sandboxed frame renders.
- Menus or dropdowns inside the frame appear at wrong coordinates because they're using `document.body` from the wrong document.
- The `⋮` contextual prompt is still inside `AppShell` (inside the frame body) when the iframe phase starts — this must be moved before iframe work begins.
- DevTools shows two separate React DevTools roots — one for the host, one inside the frame.

**Phase to address:**
Window Chrome UX Phase (prerequisite: move `⋮` to titlebar) THEN iframe Sandbox Phase. Verify: a single React instance is detectable across host and frame; `window.__REACT__ === iframeRef.current.contentWindow.__REACT__` after frame init (or equivalent verification that no second React was loaded). No "Invalid hook call" in console. No `createPortal` calls target `document.body` when the frame is active.

---

### Pitfall 7: Theme CSS Variables Do Not Cross the iframe Boundary

**What goes wrong:**
CSS custom properties set on `document.documentElement` in the **host** document do not cascade into an iframe's document. The iframe has its own `document`, its own `:root`, and its own inherited value chain. The frame's generated app will render with no theme — the `--accentA`, `--glass`, `--text`, etc. variables are `undefined` (or whatever the frame's own `:root` has as initial values — which is nothing, since no CSS file is loaded unless the srcdoc includes one).

The failure mode: the frame renders its generated React component which references `var(--accentA)` in inline styles. The computed value is empty string. The app looks completely unstyled — no colors, potentially transparent backgrounds. A theme switch in the host updates the host's `:root` but the frame's `:root` is never touched, so the frame appears to ignore all theme changes.

A secondary FOUC variant: the frame's srcdoc is built synchronously with the theme vars at construction time (interpolated into a `<style>` block inside the srcdoc HTML). When the user switches theme, the old frame has the old vars baked in. The new vars must be re-pushed via `postMessage` and the frame must update its `:root` in response. Until the message arrives and the frame processes it, there is a visible flash of the old theme inside open windows.

**Why it happens:**
- CSS inheritance does not cross document boundaries. This is a fundamental browser behavior, not a bug.
- The v2.0 architecture (CSS vars on `document.documentElement`) works perfectly for separately-created React roots in the host document (they share the same `document`). It breaks completely when those subtrees move into separate iframe documents.
- Developers assume "I set CSS vars on `:root` so all subtrees get them" — true for same-document roots, false for iframes.

**How to avoid:**
- **Push theme vars into the frame on init and on every theme switch.**
  1. At srcdoc build time, serialize the current theme's 12 CSS vars into a `<style>` block inside the srcdoc `<html><head><style>:root { --accentA: #9b7cff; ... }</style>` — this gives the frame its initial theme with zero flash.
  2. On every theme change in the host, `postMessage({ type: 'theme', vars: themeVars }, '*')` to each live frame. The frame's message listener receives it and calls `document.documentElement.style.setProperty(key, value)` for each var.
- **The frame must never derive its own theme** — it is always a receiver. The host is the single source of truth.
- Test: mount a frame, switch theme, assert the frame's `document.documentElement` computed style for `--accentA` matches the newly active theme within 100ms.

**Warning signs:**
- A frame-hosted app renders with completely transparent or black background (no CSS vars resolved).
- A theme switch updates the host OS chrome but all open windows keep their old colors.
- The srcdoc HTML template does not contain a `<style>` block with the initial theme vars.
- There is no `postMessage` call in the `setTheme` path that targets open frames.

**Phase to address:**
iframe Sandbox Phase (HARD-01). Verify: open a frame, switch theme 3 times, assert the frame's `--accentA` computed value matches the current theme's value after each switch (measured via a `postMessage` probe to the frame that replies with `getComputedStyle(document.documentElement).getPropertyValue('--accentA')`).

---

## Critical Pitfalls — Desktop Persistence

### Pitfall 8: Stale instanceId on Restore — Restoring a Window Whose App No Longer Exists in the Registry

**What goes wrong:**
The persisted window layout stores `{ instanceId, appType, title, x, y, z, minimized }` per window. On reload, the shell tries to restore these windows by calling `resolveComponent(instanceId, appType, cacheKey, services)`. If the user cleared their IDB cache (e.g., by running the LRU eviction or by clearing browser storage), the `appType` is no longer in the registry. The restore flow gets a cache miss — and must re-produce the app (a Haiku call), potentially during initial load when all windows are restoring simultaneously.

Five simultaneous cache-miss restores at page load = five simultaneous Haiku API calls, hitting the produce gate throttle, causing 2-4 windows to show "You're opening a lot of apps quickly" error states on every reload. This is a catastrophic UX regression for persistence.

A second variant: the `instanceId` stored in the persisted layout is re-used as the key into the `components` Map and the live-component cache. If two browser tabs both restored and wrote back to IDB, they may have stored conflicting `instanceId` values. On the next reload, the instanceId assigned by `windowManager.open()` is a freshly generated UUID — it will NOT match the stored instanceId. The stored instanceId is stale from the previous session and should not be used as the live-session instanceId.

**Why it happens:**
- `instanceId` is a session-scoped UUID minted by `windowManager.open()`. The persisted layout captures the session's IDs, which are meaningless to the next session.
- Developers assume IDB will always have the app since the user "just had it open." Cache eviction, browser storage clearing, or a version bump can invalidate this.
- Restore triggers multiple simultaneous resolves with no serialization, bypassing the produce gate's intent.

**How to avoid:**
- **On restore, mint a fresh `instanceId` via `windowManager.open()` for each restored window.** The persisted `instanceId` is metadata-only — use `appType` + `cacheKey` to resolve, never re-use the session-scoped persisted ID as a live instanceId.
- **Serialize restores with a queue.** Restore up to 1-2 windows in parallel, enqueue the rest, and resolve them after the first wave settles. This keeps the produce gate happy and avoids the simultaneous-Haiku-call DoS.
- **Handle a cache-miss restore gracefully.** The window can open with a "Preparing..." state (same as a new open); the produce call is queued. No error state should appear on restore for a cache-miss window — it should just behave exactly like a new open.
- **Store only layout geometry, not instanceId, in persistence.** The persisted record is `{ appType, title, icon, x, y, z, minimized, cacheKey? }`. The instanceId is minted fresh at restore time.

**Warning signs:**
- Reload with 4+ open windows shows multiple "You're opening a lot of apps quickly" fallbacks.
- The persisted layout record has an `instanceId` field and the restore code uses it directly in `windowManager.open()` or `components.set(persistedInstanceId, ...)`.
- A window that was open before reload opens blank (no component, no error) because the wrong instanceId was used as the components Map key.

**Phase to address:**
Desktop Persistence Phase. Verify: persist a 3-window layout; hard reload; all 3 windows restore without throttle errors; heap snapshot shows no instanceId collision between sessions; `mountedCount()` equals 3 after restore.

---

### Pitfall 9: IDB Schema Migration DB v3 → v4 — openDB Without Version Bump Breaks on Upgrade

**What goes wrong:**
The current IDB schema is `REGISTRY_DB_VERSION = 3` with stores: `apps`, `widgets`, `handlers`, `settings`. The v3.0 milestone needs to persist window layout — logically a new `windowLayout` object store. The mistake: the developer adds the new store to the `upgrade()` callback but **forgets to bump `REGISTRY_DB_VERSION` from 3 to 4**. With the version unchanged, `openDB` opens the existing v3 database without invoking the `upgrade` callback at all — the new `windowLayout` store is never created, and every `db.transaction(['windowLayout'], ...)` call throws `DOMException: IDBDatabase: 'windowLayout' is not a valid store name`.

A second migration mistake: the upgrade callback is written to unconditionally create the `windowLayout` store without checking `if (!db.objectStoreNames.contains('windowLayout'))`. On a browser that already has a v4 database (e.g., from the developer's prior run that partially created the store), `db.createObjectStore` on an existing store name throws `DOMException: objectStore already exists`. This crashes the upgrade and leaves the database in a broken state.

A third issue specific to multi-tab environments: if the user has two tabs open and one tab gets the v4 code first, it opens the database at v4. The second tab, still running v3 code, gets a `versionchange` event and should call `db.close()`. If it doesn't (the current `openRegistry()` does not register a `onversionchange` handler), the v4 tab's upgrade is blocked until the v3 tab is closed. To the user, the page appears to hang on reload.

**Why it happens:**
- `REGISTRY_DB_VERSION` is a hand-maintained constant — easy to forget to increment.
- The additive pattern (just add the store to upgrade without checking) works the first time but not idempotently.
- `onversionchange` is rarely implemented in tutorial-grade code; `idb`'s `openDB` wraps the raw API but does not add automatic blocking resolution.

**How to avoid:**
- **Increment `REGISTRY_DB_VERSION` to 4** and add to the upgrade callback: `if (!db.objectStoreNames.contains('windowLayout')) db.createObjectStore('windowLayout')`. The same `if`-guard pattern already used for `settings` (Phase 14) must be repeated.
- **Add a `blocked` callback to `openDB`.** When the v3 tab blocks the v4 upgrade, the `blocked` callback fires on the new tab. Use it to prompt the user to close other tabs, or silently degrade (open without the new store and retry after a delay).
- **Write a migration test.** Simulate a v3 database (manually `openDB('MarketplaceRegistry', 3, ...)` and write a known record), then open with v4 and assert: all v3 stores are intact, the v4 `windowLayout` store exists, and no data was lost.
- In the `openRegistry` function, add: `blocked() { console.warn('...'); }` (using the gated logger with neutral wording — not "database upgrade blocked," which could be misread as a security event).

**Warning signs:**
- `db.transaction(['windowLayout'])` throws `DOMException: IDBDatabase: 'windowLayout' is not a valid store name`.
- The `REGISTRY_DB_VERSION` constant remains at 3 after any store addition.
- Reload hangs (IDB open does not resolve) with two tabs open — the v3 tab is blocking the v4 upgrade.
- After a partial-upgrade failure, all IDB operations throw `DOMException: The requested version of the database is less than the existing version`.

**Phase to address:**
Desktop Persistence Phase. Verify: migration test green (v3 data intact after v4 upgrade); `windowLayout` store exists and is writable after a fresh install; `windowLayout` store exists after migrating from a v3 seed database; no data loss in `apps`/`widgets`/`handlers`/`settings` stores.

---

### Pitfall 10: Persisting Secrets — API Key or App Source Written Into the Layout Store

**What goes wrong:**
The layout persisted in IDB should contain only geometric metadata: `{ appType, title, icon, x, y, z, minimized }`. If the developer serializes the full window state (including `components: Map<instanceId, ComponentType>`, or `services: Services`, or the `tweak.instruction` field), they might accidentally write:
1. The API key (from `services.keyStore.read()` — the key is in the services graph).
2. The transpiled JS source string (large — hundreds of KB per window; also a hygiene leak: the source string contains the comment-stripped but still analyzable code, and IDB contents are visible in DevTools → Application → IndexedDB).
3. The user's `prompt` or `instruction` text from a tweak (visible in IDB, may contain sensitive text the user typed).

The devtools-hygiene implication: the `windowLayout` store's records should not show any field that reveals the on-demand mechanic. A record like `{ appType: "weather", source: "function App() { ... }" }` in IDB would expose the fact that apps are code strings — a hygiene violation visible via F12 → Application.

**Why it happens:**
- `JSON.stringify(windowManager.windows)` captures the full window state including any accidentally-included reference to the services or source tree.
- Developers persist `{ ...entry, Component: components.get(entry.instanceId) }` — `Component` is a function, which `idb` cannot structured-clone (throws `DataCloneError`). The developer then adds a `source` string to work around it, not realizing the source is a hygiene leak.

**How to avoid:**
- **Type the persisted layout record explicitly:** `interface PersistedWindowRecord { appType: string; title: string; icon: string; x: number; y: number; z: number; minimized: boolean; }`. No `source`, no `prompt`, no `Component`, no `instanceId`, no `services`.
- Run the CI lexicon gate over the IDB write path: ensure no banned token appears in any key name stored in the `windowLayout` store.
- Add a test that writes a layout, reads it back, and asserts the record has exactly the expected fields and no extras.
- The `DataCloneError` guard: if IDB write throws `DataCloneError`, log (via gated logger) and degrade silently (persistence fails; the window still works). Never add fields to work around serialization errors; remove the non-serializable field instead.

**Warning signs:**
- IDB write throws `DataCloneError` for the `windowLayout` store.
- DevTools → Application → IndexedDB → `windowLayout` shows records with `source`, `transpiledJS`, or `prompt` fields.
- The persisted record's JSON representation is larger than ~200 bytes per window entry.

**Phase to address:**
Desktop Persistence Phase. Verify: write a layout record; inspect in DevTools IDB; assert fields are exactly `{ appType, title, icon, x, y, z, minimized }`; no `DataCloneError`; no hygiene violation in the stored keys/values.

---

## Critical Pitfalls — Theme Editor / Custom Themes

### Pitfall 11: Invalid Color Value Breaking the CSS Variable Contract

**What goes wrong:**
The theme editor accepts free-form color input from the user (a color picker or a text field for the 12 CSS custom properties). If the user or the editor emits an invalid CSS color value (`#zzz`, `rgbX(1,2,3)`, an empty string, or a non-color keyword), `document.documentElement.style.setProperty('--accentA', invalidValue)` silently fails — the browser ignores the invalid value and the property retains its previous value (or the initial value if none). The UI appears to "not save" the color — confusing. Worse: if the invalid value is persisted to IDB and loaded back on the next session via the FOUC script (which reads from localStorage) or `VibeThemeProvider`, the variable is silently undefined and the entire theme collapses.

The FOUC script in `index.html` applies the active theme's vars synchronously before React mounts. For built-in themes, this is safe (hard-coded valid values). For a user-defined custom theme loaded from localStorage/IDB, an invalid persisted value is applied before any validation runs — leading to a broken first paint with no error feedback.

A second variant: a gradient value for `--wall` is typed incorrectly (e.g., `radial-gradient(130% 110% at 18% 8%` — missing the closing paren). CSS silently ignores the invalid gradient and the wallpaper disappears.

**Why it happens:**
- `setProperty` does not throw on invalid values — browser behavior swallows the error.
- Color picker widgets emit hex values without the leading `#` in some configurations.
- Gradient values have complex syntax that is easy to malform in a text editor.

**How to avoid:**
- **Validate color values client-side before storing.** Use a `CSS.supports('--test', value)` check: `CSS.supports('color', value)` for the non-gradient properties; for `--wall` (which takes a gradient), use `CSS.supports('background', value)`.
- Alternatively, apply the value to a throwaway element via `element.style.setProperty('--test', value)` and read it back — if the readback is empty string, the value was rejected.
- **Never persist an invalid value.** Only write to IDB and localStorage after passing the validation check; surface an inline error in the editor UI instead.
- The FOUC script should validate each value before applying it: add a `CSS.supports` check per property (or a simple regexp for the known patterns) and skip invalid values rather than applying them.

**Warning signs:**
- Theme editor "Save" writes to IDB but the color doesn't visually apply.
- A reload with a user-defined theme shows the default aurora colors (the custom theme's values were silently invalid and the fallback triggered).
- `document.documentElement.style.getPropertyValue('--accentA')` returns the old value immediately after `setProperty('--accentA', invalidValue)`.
- The FOUC script applies a user theme but the wallpaper `--wall` is empty, leaving a black or transparent background.

**Phase to address:**
Theme Editor Phase. Verify: enter an invalid color in the editor; assert the UI shows an error and does not write to IDB; the rendered theme is unchanged; `CSS.supports('color', invalid)` returns `false` for the tested value.

---

### Pitfall 12: Custom Theme Name Colliding with a Built-In or Containing a Banned Token

**What goes wrong:**
The user creates a custom theme named `"aurora"` — this silently overwrites the built-in aurora theme in the IDB `settings` store (or in whatever custom-theme store is introduced in v3.0). On the next reload, the FOUC script reads the persisted theme; `VIBE_THEMES["aurora"]` now returns the user's custom values (if the lookup includes both built-ins and custom themes). The built-in "aurora" is lost. To recover, the user must delete their custom theme — but they see the visual theme the whole time and may not realize the built-in is gone.

A worse variant: the user names a theme `"AI Dark"` or `"generate"` or `"synthesized-noir"`. The theme name is displayed in the theme selector UI. If the hygiene gate does not sanitize the selector's text content, the banned token appears in the DOM (visible via F12). If the theme name is also stored as a CSS class or `data-*` attribute, it is a direct CI gate violation.

A third variant: the FOUC script's `VIBE_THEMES` object is hard-coded in `index.html` and cannot include custom themes (they aren't known at build time). If the FOUC script runs and the stored `osTheme` is a custom theme name not in the built-in object, it silently falls back to `aurora` — causing FOUC for the custom theme on every reload.

**Why it happens:**
- No uniqueness constraint between custom theme names and built-in names.
- The theme name displayed in the selector is user-supplied text, not sanitized through the `sanitizeDisplayName` pipeline.
- The FOUC script cannot know about custom themes because it's a static inline script with a hard-coded `VIBE_THEMES` object.

**How to avoid:**
- **Namespace custom themes.** Prefix all custom theme keys with a disambiguator: `custom:sunset`, `custom:mybrand`. Never allow a user to create a theme with a bare key that matches a built-in name.
- **Sanitize the theme name** through `sanitizeDisplayName` before storing and before displaying in the selector. The same CI-tested sanitizer that blocks "AI Weather" from appearing in window titles must apply to theme names.
- **Extend the FOUC script to load custom themes from localStorage.** If the stored `osTheme` starts with `custom:`, look up the theme vars from a `localStorage.getItem('marketplace.customTheme.<name>')` key that was written on theme creation/modification. This allows the FOUC script to apply custom themes without a round-trip to IDB.
- Add a test: attempt to create a theme named `"aurora"`; assert the creation is rejected with an error indicating the name is reserved. Attempt to create a theme named with a banned token; assert the sanitizer strips or rejects it.

**Warning signs:**
- A user-defined theme name appears unsanitized in the theme selector's DOM (visible via F12 inspect).
- The FOUC script shows the aurora theme instead of the user's custom theme on reload (custom theme not in the hard-coded `VIBE_THEMES`).
- A custom theme named `"aurora"` persists to IDB and the built-in aurora values are overwritten.
- The theme selector iterates `Object.keys(VIBE_THEMES)` — custom themes are not returned, so a custom theme is not shown as the active selection.

**Phase to address:**
Theme Editor Phase. Verify: create a custom theme named `"aurora"`; assert rejection; create a valid custom theme; reload; assert the FOUC script applies the custom theme (not aurora) on first paint; theme selector shows custom theme as active.

---

### Pitfall 13: FOUC Script Does Not Know About Custom Themes — Flash on Reload

**What goes wrong:**
The FOUC script in `index.html` contains a verbatim copy of `VIBE_THEMES` (built-ins only) and applies the active theme synchronously before React mounts (see: Key Decision in PROJECT.md: "FOUC script duplicates VIBE_THEMES verbatim"). When the user's active theme is a custom theme, `VIBE_THEMES[vibeStored]` is `undefined`. The script falls through to `aurora` as default and applies aurora's vars. React then mounts `VibeThemeProvider`, reads the stored custom theme from localStorage, and applies the correct vars — but that happens ~200ms later, producing a visible aurora→custom flash on every reload.

This is structurally harder than the built-in FOUC problem (which was solved by duplicating VIBE_THEMES) because custom themes are user-defined and cannot be compiled into `index.html` at build time.

**Why it happens:**
The FOUC script's `VIBE_THEMES` is a static copy. Custom themes by definition postdate the build. There is no mechanism to inject dynamic user data into the script's scope before React mounts without either: (a) storing the custom theme vars in localStorage (accessible synchronously), or (b) accepting the FOUC.

**How to avoid:**
- **Store custom theme vars directly in localStorage, not only IDB.** When the user creates or modifies a custom theme, write the full `{ [varName]: value }` map to `localStorage('marketplace.customTheme.<name>')`. The FOUC script can then check: if `vibeStored` starts with `custom:`, read `localStorage.getItem('marketplace.customTheme.' + vibeStoredName)` and parse it. This extends the FOUC script to handle custom themes with zero delay.
- Update the CSP hash test (`csp.test.ts`) after modifying the FOUC script — the hash of the inline script in `index.html` must be recomputed and the CSP `sha256-...` source must be updated. The hash test already guards this; it will fail correctly if the script changes without a hash update.
- The IDB `settings` store is the durable mirror; localStorage is the fast first-paint read. Same pattern as the built-in theme (KEY DECISION in PROJECT.md).

**Warning signs:**
- Hard reload with a custom theme shows a brief aurora flash before the correct theme appears.
- The FOUC script's `var vars = VIBE_THEMES[vibeTheme]` is `undefined` when a custom theme name is stored.
- `csp.test.ts` fails after modifying the FOUC script (correct — this is the expected signal to update the hash).

**Phase to address:**
Theme Editor Phase. Verify: create a custom theme; make it active; hard reload; measure with `performance.now()` before and after first paint; assert no aurora-palette values are computed on any element between the script execution and React mount time (measure by polling `getComputedStyle` in a before-paint script).

---

## Moderate Pitfalls

### Pitfall 14: postMessage Bridge message-ordering Race on Concurrent Handler Calls

**What goes wrong:**
A generated app inside a frame calls `runHandler("fetchWeather", { city: "NYC" })`. The frame sends a `postMessage` with `{ type: "runHandler", correlationId: "abc", intent: "fetchWeather", input: { city: "NYC" } }`. The parent receives it, calls the real handler, and responds with `{ type: "handlerResponse", correlationId: "abc", data: {...} }`.

If the same app calls `runHandler` twice in rapid succession before the first response arrives (e.g., the user clicks "refresh" twice), there are two in-flight requests with correlation IDs "abc" and "def". If the network is slow and the second response arrives before the first, and the app's callback map is keyed only by correlationId without ordering, the app may receive `"abc"` response → renders weather A, then receives `"def"` response → renders weather A again (if "def" was the second call but they're the same query), or renders out-of-order data.

In the worst case, a completed handler call resolves a pending `Promise` that has already been garbage-collected (if the component unmounted while the handler was in flight). The parent bridge tries to call `pendingCallbacks.get("abc")`, finds it still present (no cleanup on unmount), and invokes it on a dead callback. This is a silent no-op today (`new Function` scope) but in the iframe architecture it causes a stale `postMessage` to an unmounted frame, which the browser discards (opaque origin frames don't error on undelivered messages, but the pending map leaks).

**Why it happens:**
- The pending-callback map is never cleaned up when a frame unmounts; correlation IDs accumulate.
- The frame's component doesn't guard for `isMounted` before applying handler responses.
- Response arrival order is assumed to match request order (it does not).

**How to avoid:**
- **Clean up the pending-callback map when a frame unmounts.** The frame's close handler (already calling `unmountApp`) must also sweep all pending correlationIds associated with that frame's instance and reject their Promises.
- **Handle out-of-order responses with a version counter.** Each `runHandler` call on a given slot increments a call counter; the response is only applied if the counter matches the request's counter.
- **Limit concurrent in-flight handler calls per frame to 1-2.** If the app fires a new `runHandler` before the previous one resolves, either queue or cancel the previous call (cancel is better: `AbortController` on the handler's `fetch` call; reject the previous Promise; remove its correlationId from the map).

**Warning signs:**
- Weather app shows stale data after rapid "refresh" clicks.
- The pending-callbacks map size grows monotonically after repeated open/close cycles (no cleanup).
- Frame close does not reject in-flight handler Promises; console shows "Unhandled Promise rejection" after a window close.

**Phase to address:**
iframe Sandbox Phase (HARD-01). Verify: open a weather app; click refresh 3 times rapidly; only the last result renders; close the window while a fetch is in flight; no unhandled Promise rejection in console; pending-callbacks map size returns to 0 after close.

---

### Pitfall 15: IDB Quota Exhaustion from Persisting Window Layout on Every Drag

**What goes wrong:**
The window layout (positions, z-order, minimized state) must persist across reloads. The naive implementation writes to IDB on every `onMove` commit (after every drag). Each write is ~200 bytes, but IDB writes are not free — they open a transaction, serialize the record, flush to disk, and fire the success event. With active dragging (50+ commits per 10-second drag session) and 4 windows open, that is 200+ IDB writes in 10 seconds. On mobile browsers or HDD-backed systems, this causes audible disk seek noise, measurable battery drain, and can cause subsequent writes to queue behind previous unflushed writes — creating a backlog that the next reload observes as stale data.

A separate quota issue: `navigator.storage.estimate()` returns `{ usage, quota }` with quota varying by browser/OS from 50MB to 60% of disk. The registry stores source + transpiledJS for every cached app (easily 5-20KB per app), plus widget records, plus handler records. A heavy user with 50+ cached apps can approach 1MB. The `windowLayout` store adds a small constant. The real quota risk is the cumulative registry growth — but adding a new store without considering eviction risks hitting a wall.

**Why it happens:**
- `onMove` is called on `pointerup` after every drag commit (current architecture from `useDrag`). Writing to IDB on every commit seems correct but is too frequent.
- IDB quota is not checked before writing layout data; the write silently fails when quota is exceeded without surfacing an error to the user.

**How to avoid:**
- **Debounce layout writes.** Coalesce writes: only write to IDB `windowLayout` after the last `onMove` in a 500ms window. Use `setTimeout` / `clearTimeout` debounce, not `requestAnimationFrame`. This reduces 50 drag-commit writes to 1 write per drag gesture.
- **Handle IDB write failures gracefully.** Wrap the layout write in a try/catch; a `QuotaExceededError` should degrade silently (layout persistence fails; the windows still work) and optionally prompt the user to clear storage if the error persists.
- **Add the `windowLayout` store to the LRU eviction budget** (already exists in `storagePressure.ts`). Set a per-store item limit for layout records (max 20 window snapshots, evict oldest).

**Warning signs:**
- IDB write queue grows behind drag operations (profiler shows IDB transaction spam during drag).
- After clearing app registry, window layout data still exists and consumes disproportionate storage.
- `navigator.storage.estimate()` shows `usage` approaching `quota`.
- IDB write throws `QuotaExceededError` silently (no user feedback; layout stops persisting without notice).

**Phase to address:**
Desktop Persistence Phase. Verify: drag a window 50 times rapidly; open Chrome DevTools → Application → IndexedDB → `windowLayout`; assert the record count is 1 per window (not 50 per window); the layout is up-to-date after the last drag.

---

### Pitfall 16: Low-Contrast Custom Theme Breaking Text Readability

**What goes wrong:**
The theme editor lets the user set `--text` and `--wall`/`--glass` background values. If the user sets `--text: #ffffff` and `--glass: rgba(255,255,255,0.9)` (white text on near-white glass), text becomes unreadable. Unlike built-in themes (which were manually designed for contrast), user-created themes have no contrast guardrail. Generated apps that use `var(--text)` for content text and `var(--glass)` for card backgrounds will become illegible.

The platform has no current mechanism to warn about low-contrast themes — and the CI lexicon gate does not check for accessibility violations.

**Why it happens:**
The theme editor is a creative tool; users can set any valid color. Without a WCAG contrast check, bad choices are silently accepted.

**How to avoid:**
- **Add inline contrast warnings in the theme editor.** After the user sets a color, compute the WCAG contrast ratio between `--text` and `--glass` using the relative luminance formula. If below 4.5:1 (WCAG AA for normal text), show an inline warning: "Text may be hard to read — consider a darker background or lighter text color." This is a warning, not a hard block (users can dismiss it and save anyway).
- This is a UX polish concern, not a security issue. Defer to a post-MVP phase if time is constrained.

**Warning signs:**
- A saved custom theme has identical or near-identical values for `--text` and `--glass`.
- Generated apps using the custom theme show text that blends into the background.

**Phase to address:**
Theme Editor Phase (post-MVP polish). Verify: set `--text: #ffffff; --glass: rgba(255,255,255,0.9)`; assert a contrast warning appears in the editor before save.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `targetOrigin: "*"` on all `postMessage` calls | No origin-match errors during dev | Data (including any key-adjacent fields) can be read by any frame/window in the page | **Never in the frame→parent direction**; only acceptable for parent→opaque-origin-frame direction where the message is strictly CSS-var-only |
| Re-using persisted `instanceId` from previous session | One fewer UUID generation | Stale IDs cause components-map misses; two browser tabs can produce colliding IDs | **Never** |
| Single-version `VIBE_THEMES` object in FOUC script (no custom themes) | No FOUC for built-ins | Custom themes cause FOUC on every reload | Acceptable for v3.0 MVP if custom theme FOUC is addressed in post-MVP polish; unacceptable if custom themes are the feature highlight |
| Load Babel independently per frame (not shared blob URL) | No blob URL infrastructure needed | 1.5MB download per open window; quota and latency hit | **Never in production** — shared blob URL is mandatory |
| Check only `event.origin` without `event.source` in message listener | Simpler listener code | Any window/frame on the page can forge messages for another frame's correlation ID | **Never** |
| Persist full window state (`{ ...entry, source, transpiledJS }`) to IDB | One `JSON.stringify` line | Source strings are hygiene violations in IDB; functions cause `DataCloneError`; quota risk | **Never** |
| Custom theme names stored without namespace prefix | Simpler lookup (same key space as built-ins) | User can overwrite built-in names; FOUC script collision | **Never** |
| Skip validation on user-supplied CSS variable values | Faster editor implementation | Invalid values silently not applied; corrupted theme on reload if invalid value persisted | **Never** |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `srcdoc` template + `services` graph | Passing `services` (which contains `keyStore`) into the `buildSrcdoc` function | Type the function to accept only `(transpiledJS: string, themeVars: Record<string,string>, parentOrigin: string)` — no services |
| `postMessage` bridge + correlation IDs | Using `Math.random().toString(36)` as correlation ID | Use `crypto.randomUUID()` for cryptographic unpredictability |
| `postMessage` listener + opaque origin | Checking `event.origin !== parentOrigin` (fails for frame→parent: parent.origin is real but for parent→frame listener, frame sees "null") | For the frame's listener: check `event.origin === parentOrigin` (injected); for the parent's listener: check `event.origin === "null" && event.source === iframeEl.contentWindow` |
| `openDB` + new store | Adding new store to upgrade callback without bumping `REGISTRY_DB_VERSION` | Always bump `REGISTRY_DB_VERSION` when adding/changing stores; guard with `!db.objectStoreNames.contains(...)` |
| FOUC script + custom themes | FOUC script only has built-in `VIBE_THEMES` | Store custom theme vars in localStorage (`marketplace.customTheme.<name>`) so FOUC script can read them synchronously |
| Theme CSS vars + iframe | `document.documentElement.style.setProperty` in host does not reach iframe `:root` | Push theme vars to each frame via `postMessage({ type: 'theme', vars })` on every `setTheme` call; also bake vars into initial srcdoc `<style>` block |
| React + iframe | Loading React from CDN inside frame creates two React copies | Serialize React as a blob URL once; inject the same blob reference into the srcdoc; verify single React instance with `window.__REACT__` assertion test |
| window layout persistence + `onMove` | Writing to IDB on every `onMove` callback (fires on every drag commit) | Debounce IDB writes to 500ms after last `onMove`; in-memory position map is the source of truth during a session |
| custom theme names + hygiene gate | Displaying user-supplied theme name verbatim in selector DOM | Run through `sanitizeDisplayName` before display; theme names with banned tokens are stripped/replaced |
| CSP hash + FOUC script | Modifying the FOUC script in `index.html` without updating the CSP sha256 source | `csp.test.ts` will fail correctly — do not suppress; recompute and update the hash in the CSP meta tag |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `sandbox="allow-scripts allow-same-origin"` | Frame can reach parent `localStorage` (API key); scripts can remove their own sandbox attribute | Use only `sandbox="allow-scripts"` — no exceptions; CI test asserts absence of `allow-same-origin` |
| API key in `srcdoc` template string | Key visible in DevTools → Elements; key readable by frame scripts | Type-enforced `buildSrcdoc` that cannot accept key; CI test asserts `srcdoc` does not contain `/sk-ant/` |
| `postMessage(data, "*")` from parent with key-adjacent data | Any frame/window can intercept the message | Enumerate all parent→frame message types; assert none contains key-adjacent fields; for opaque-origin frames, `"*"` is mandatory but the message payload must be key-free |
| Missing `event.source` check on bridge listener | Any window (or a hijacked frame) can send forged messages to the parent's bridge handler | Always check `event.origin === "null" && event.source === knownFrameContentWindow` |
| Theme `init` message including services config | If `services` is serialized into the init message, the key travels to the frame | `FrameInitMessage` TypeScript type has exactly 3 fields: `type`, `themeVars`, `parentOrigin` — enforced by the type system |
| Error messages echoing raw handler `input` | If user pasted API key into an app text field, the error carries the key back through the bridge | Strip any value matching `/sk-ant-[A-Za-z0-9_-]+/` from error messages before logging or returning |
| Storing `prompt` or `transpiledJS` in `windowLayout` IDB store | Devtools → Application shows mechanic-revealing content (source strings are generated code) | `PersistedWindowRecord` type has only geometry fields; IDB write path rejects extra fields via TypeScript |
| Custom theme name displayed unsanitized | Banned token (e.g., "AI") appears in DOM via theme selector | `sanitizeDisplayName` applied to all user-supplied theme names before any DOM render |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| All windows re-produce on reload (cache miss simultaneously) | Multiple throttle errors on reload; broken desktop | Serialize restores; cap concurrent restores at 2; never throttle-error on restore (same UX as a new open) |
| Custom theme causes FOUC on reload | Custom theme users see aurora flash on every page load | localStorage mirror of custom theme vars; FOUC script reads custom theme from localStorage |
| Theme switch doesn't update open iframe windows | Open app windows keep old theme while OS chrome re-themes | `postMessage` theme update to all live frames on every `setTheme` call |
| Invalid color silently not applied | User changes theme color, sees no effect, saves garbage | Validate with `CSS.supports` before any write; inline error in editor if invalid |
| Low-contrast custom theme makes text unreadable | User can't read content in their own custom theme | Inline WCAG contrast warning in editor (non-blocking) |
| Window restore shows throttle error | User opens browser and sees "you're opening a lot of apps quickly" for their saved layout | Serialized restore queue; restore path bypasses the produce gate or gets its own separate budget |

---

## "Looks Done But Isn't" Checklist

- [ ] **iframe sandbox flags:** Verify `sandbox` attribute has exactly `"allow-scripts"` — no `allow-same-origin`. Run the CI test that asserts this.
- [ ] **Key in srcdoc:** Assert `iframeEl.getAttribute('srcdoc')` does not contain `"sk-ant"` (or any API key pattern). Run the test that probes the srcdoc attribute.
- [ ] **postMessage origin+source check:** Open DevTools → Sources; verify the `message` listener in the bridge checks both `event.origin === "null"` and `event.source === iframeEl.contentWindow`. Write a test that sends a forged message from an unknown source and asserts it is dropped.
- [ ] **Theme in frame:** Open a frame, switch theme, inspect `getComputedStyle(document.documentElement).getPropertyValue('--accentA')` inside the frame — it must match the active theme value, not the frame's initial value.
- [ ] **Single React instance:** After a frame opens, assert `window.__REACT__ === iframeWindow.__REACT__` (or equivalent) — no second React copy loaded.
- [ ] **`⋮` in titlebar (prerequisite):** Assert `AppShell` does NOT render the contextual prompt in its body before any iframe work begins.
- [ ] **IDB migration:** Run the migration test: seed a v3 database, open with v4 code, assert `windowLayout` store exists and all v3 stores are intact.
- [ ] **Persisted record shape:** Write a layout record, read it back, assert it has exactly `{ appType, title, icon, x, y, z, minimized }` — no extra fields.
- [ ] **Restore without throttle error:** Close 4 windows after populating them; reload; assert all 4 restore without throttle fallback and without produce-gate errors.
- [ ] **Custom theme FOUC:** Create a custom theme; make it active; hard reload; measure — assert no aurora palette is applied between script execution and React mount time.
- [ ] **Custom theme name sanitization:** Create a theme named with a banned token; assert the theme selector in the DOM does not show the banned token.
- [ ] **Custom theme name uniqueness:** Create a theme named `"aurora"`; assert rejection or namespacing into `custom:aurora`; assert the built-in aurora is still accessible.
- [ ] **CSP hash after FOUC script change:** If the FOUC script changes, `csp.test.ts` fails — update the CSP hash and confirm the test turns green.
- [ ] **Hygiene gate — new surfaces:** The iframe bridge message types, frame HTML template, IDB store name (`windowLayout`), and theme editor copy must all pass the CI lexicon gate. Extend the hygiene gate file list explicitly for new files.
- [ ] **postMessage types in devtools:** Open a window; switch to Network tab (or Messages inspector); verify no `postMessage` payload contains the API key or the string `sk-ant`.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `allow-same-origin` accidentally added to sandbox | **CRITICAL** — revert immediately; no gradual fix | Remove `allow-same-origin`; audit all `srcdoc` content for key presence; rotate the user's API key (they must be instructed to do this if the mistake shipped) |
| API key found in srcdoc/message payload | **CRITICAL** — stop the ship | Remove the key from the data path; add type enforcement; patch; prompt users to rotate their key |
| `postMessage` wildcard on key-adjacent payload | HIGH | Audit message types; remove key-adjacent fields; change wildcard to specific targetOrigin or key-free payload |
| Missing `event.source` check | MEDIUM | Add check; test; deploy; no user-visible impact if fixed before exploit |
| IDB upgrade version not bumped | MEDIUM | Bump version; add `if (!db.objectStoreNames.contains(...))` guard; test migration; the broken state (missing store throws on transaction) is immediately obvious in testing |
| React duplicate in frame ("Invalid hook call") | MEDIUM | Remove the frame's independent React load; pass shared React via blob URL or `window.__REACT__` injection; re-test |
| Theme not reaching frame | LOW | Add `postMessage` push in `setTheme`; add srcdoc init vars; theme is restored on next switch |
| Custom theme FOUC | LOW | Mirror custom theme vars to localStorage; FOUC script reads from localStorage; re-test |
| Stale instanceId on restore | MEDIUM | Fix restore to mint fresh instanceIds; re-test persistence round-trip |
| IDB migration corruption | HIGH | Data may be lost for affected users; provide a "Reset storage" option in settings; document the recovery path; test migration prevents future corruption |
| Throttle errors on restore | MEDIUM | Add serialized restore queue; re-test with 5-window restore |
| Hygiene leak in new iframe surfaces | LOW–CRITICAL (depends on surface; bridge payload vs source comment) | Fix at source; extend hygiene gate to cover new file; rotate app names in user-visible stores if the banned token appeared in a stored value |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. allow-same-origin + allow-scripts defeats sandbox | iframe Sandbox Phase (HARD-01) | CI test asserts `sandbox` attribute; browser probe confirms localStorage inaccessible from frame |
| 2. postMessage targetOrigin wildcard leaks data | iframe Sandbox Phase (HARD-01) | Enumerate all `postMessage` calls; assert frame→parent uses specific origin; parent→frame payload is key-free |
| 3. Missing origin+source check on incoming messages | iframe Sandbox Phase (HARD-01) | Forged-message test; listener drops unknown-source messages |
| 4. API key in srcdoc or config push | iframe Sandbox Phase (HARD-01) | `srcdoc` attribute does not contain `/sk-ant/`; `FrameInitMessage` type has 3 fields max |
| 5. CSP-in-frame gaps (unsafe-eval, Babel) | iframe Sandbox Phase (HARD-01) | No CSP violation in console; Babel loaded once via blob URL; `new Function` works in frame |
| 6. React-in-iframe (two copies, event system, portals) | Window Chrome Phase (prerequisite: ⋮ to titlebar) + iframe Sandbox Phase | Single React instance assertion; no "Invalid hook call"; no cross-frame portals |
| 7. Theme CSS vars don't cross iframe boundary | iframe Sandbox Phase (HARD-01) | Frame `--accentA` matches host theme after switch |
| 8. Stale instanceId on restore | Desktop Persistence Phase | Fresh UUID on restore; no components-map miss; no throttle errors on reload |
| 9. IDB schema migration DB v3→v4 | Desktop Persistence Phase | Migration test green; `windowLayout` store exists; v3 data intact after upgrade |
| 10. Persisting secrets in layout store | Desktop Persistence Phase | IDB record has exactly geometry fields; no `DataCloneError`; no hygiene violation |
| 11. Invalid color value in theme editor | Theme Editor Phase | `CSS.supports` gate; editor shows error; invalid value not persisted |
| 12. Custom theme name collision/banned token | Theme Editor Phase | Rejection of reserved names; sanitizer applied; built-in themes preserved |
| 13. FOUC script doesn't know custom themes | Theme Editor Phase | localStorage mirror of custom vars; no aurora flash on reload with custom theme active |
| 14. postMessage bridge message-ordering race | iframe Sandbox Phase (HARD-01) | Rapid handler calls render only last result; close-mid-flight rejects pending Promises; map size = 0 after close |
| 15. IDB quota exhaustion from frequent layout writes | Desktop Persistence Phase | Debounce IDB writes; 1 record per window in layout store after drag session |
| 16. Low-contrast custom theme | Theme Editor Phase (post-MVP polish) | Contrast warning appears for bad pairings |

---

## Sources

- MDN — *HTML `<iframe>` element: `sandbox` attribute* — allow-scripts+allow-same-origin removes sandbox; documented behavior: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe — HIGH
- Mozilla Discourse — *iframe with both allow-scripts and allow-same-origin can remove its sandboxing*: https://discourse.mozilla.org/t/an-iframe-which-has-both-allow-scripts-and-allow-same-origin-for-its-sandbox-attribute-can-remove-its-sandboxing/28255 — HIGH
- MDN — *Window.postMessage()* — targetOrigin, event.origin, structured clone algorithm, functions not clonable: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage — HIGH
- HTML spec (WHATWG) — *9.3 Cross-document messaging* — origin-at-send-time semantics, "null" as opaque origin string: https://html.spec.whatwg.org/multipage/web-messaging.html — HIGH
- OWASP / SecureFlag — *Unchecked Origin in postMessage Vulnerability* — event.source must be checked in addition to event.origin: https://knowledge-base.secureflag.com/vulnerabilities/broken_authorization/unchecked_origin_in_postmessage_vulnerability.html — HIGH
- postmessage.dev — *Complete Guide to Window postMessage Security* — wildcard targetOrigin data leaks, origin check best practices: https://postmessage.dev/ — MEDIUM-HIGH
- Chromium issue 41487933 — *srcdoc session history entries leak document.baseURI cross-origin*: https://issues.chromium.org/issues/41487933 — HIGH (cross-origin srcdoc leak documented in browser bug tracker)
- MDN — *Content-Security-Policy: script-src* — `'unsafe-eval'` needed for `new Function`/`eval`; srcdoc frames inherit parent CSP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src — HIGH
- React docs — *Invalid Hook Call Warning* — two React copies cause hook context mismatch; single shared instance required: https://legacy.reactjs.org/warnings/invalid-hook-call-warning.html — HIGH
- MDN — *Using CSS custom properties* — cascade is per-document; custom properties do not inherit across iframe document boundaries: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties — HIGH
- Google web.dev — *Best Practices for Persisting Application State with IndexedDB* — quota behavior, `QuotaExceededError` handling: https://developers.google.com/web/fundamentals/instant-and-offline/web-storage/indexeddb-best-practices — HIGH
- IndexedDB spec / w3c issue #282 — *Backward-compatible schema changes*: https://github.com/w3c/IndexedDB/issues/282 — HIGH
- Dev.to — *Handling IndexedDB Upgrade Version Conflict*: https://dev.to/ivandotv/handling-indexeddb-upgrade-version-conflict-368a — MEDIUM
- `src/execution/instantiate.ts` (first-party) — current `new Function` scope; `sharedReact` pattern; proves the single-React-instance contract that must extend into frames — HIGH
- `src/registry/db.ts` (first-party) — current `REGISTRY_DB_VERSION = 3`; additive upgrade pattern; `SettingRecord` schema; proves the migration pattern to follow for v4 — HIGH
- `src/hygiene.test.ts` (first-party) — current banned token set; SELF-exclusion pattern; explicit file coverage assertions — HIGH
- `index.html` (first-party) — current CSP meta tag with `sha256-...` hash; FOUC script with hard-coded `VIBE_THEMES`; proves the `csp.test.ts` hash-sync invariant and the custom-theme FOUC gap — HIGH
- `src/ui/VibeThemeProvider.tsx` (first-party) — `applyVibeTheme` on `document.documentElement`; localStorage + IDB dual-write pattern — HIGH
- `src/ui/WindowFrame.tsx` (first-party) — current in-tree architecture (AppShell inside WindowFrame); confirms `⋮` is still in AppShell body (prerequisite for iframe: move it to titlebar first) — HIGH
- `.planning/research/CONSULT-sandboxing-execution.md` (first-party prior research) — allow-scripts+allow-same-origin bypass; infinite-loop DoS; constructor-inheritance escapes; HARD-01 iframe end-state — HIGH
- `.planning/research/PITFALLS-v2.0.md` (first-party prior research) — Pitfall 5 (CSS vars + separate roots), Pitfall 6 (theme FOUC), Pitfall 11 (new surfaces hygiene), Pitfall 8 (createRoot lifecycle) — HIGH (continuity reference)

---
*Pitfalls research for: iframe-sandbox isolation + desktop persistence + theme editor + window-chrome UX (Vibe App Store v3.0 "Trusted Desktop" milestone)*
*Researched: 2026-06-26*
