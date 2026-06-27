# Research Summary — v3.0 Trusted Desktop

**Project:** Vibe App Store
**Domain:** Client-only generative app marketplace — security hardening, persistence, personalization
**Researched:** 2026-06-26
**Confidence:** HIGH (all four capability areas verified against MDN, browser spec, HTML spec, OWASP, first-party codebase inspection, and prior CONSULT artifacts)

---

## Executive Summary

The v3.0 "Trusted Desktop" milestone converts the Vibe OS from containment-by-convention (a `new Function` scope) to genuine opaque-origin isolation (an `<iframe sandbox="allow-scripts">` per app body), while adding desktop persistence and a custom theme editor. All four research streams independently confirmed the same dependency-driven build order: window chrome refactoring first, iframe isolation second, desktop persistence third, theme editor fourth. This ordering is not a preference — it is a hard constraint. Once an app body moves into an opaque frame, no mechanism exists to inject host-owned chrome from outside; the contextual `⋮` menu must be relocated to the host titlebar before any iframe work begins. Violating this order creates an insoluble UX problem.

The iframe security work (HARD-01) is the highest-risk and highest-value pillar. All four researchers independently flagged the same set of critical failure modes: adding `allow-same-origin` to the sandbox (which silently destroys the opaque-origin guarantee and lets the frame script remove its own sandbox), leaking the API key through the srcdoc template or `postMessage` payloads, skipping `event.source` checks alongside `event.origin` checks, and failing to push CSS custom properties into each frame on theme switch (CSS vars do not cross iframe document boundaries). Every one of these is a "looks done but isn't" failure mode — the product appears to work while the security guarantee is gone. The prevention strategy is type-enforcement plus dedicated CI tests at each gate, not code review alone.

The remaining two pillars (persistence, theme editor) are lower-risk and build on existing infrastructure: both use the IDB `settings` store already at v3. The schema question — whether to bump to DB v4 with a dedicated `windowLayout` store (STACK.md proposal) or store `WindowLayoutRecord[]` and `customThemes[]` as new keys in the existing `settings` object store (ARCHITECTURE.md proposal) — is **resolved in favor of the additive-keys approach** (ARCHITECTURE.md). The `settings` store already uses an open-ended key-value pattern; adding `writeRaw` / `readRaw` for new keys requires zero migration, zero version bump, and zero risk to existing `apps`, `widgets`, `handlers`, and `settings` data. A dedicated store is the fallback only if querying complexity grows beyond a flat key-value lookup, which the v3.0 scope does not require.

---

## Key Findings

### Recommended Stack

The existing stack (Vite 8, React 19.2, `@babel/standalone` 7.29.7 classic-runtime, `idb` 8, Claude Haiku `claude-haiku-4-5-20251001`) requires **zero new npm dependencies** for all four v3.0 pillars. All four researchers confirmed this independently. Every capability is achievable with platform primitives, hand-rolled typed helpers, or existing library features already in use.

**Core new technical facts (verified, load-bearing for implementation):**

- **React 19 has no UMD builds.** `node_modules/react@19.2.7/` contains only CJS. To ship React into the sandboxed frame's srcdoc, inline `react.production.js` (17KB raw) and `react-dom-client.production.js` (536KB raw) as CJS wrapping IIFEs that assign `window.React` / `window.ReactDOM`. Total per-frame DOM string: ~553KB. Store the template as a module-level constant so it is built once and reused across all frame instances.

- **`srcdoc` over `blob:` for frame injection.** `srcdoc` frames inherit the parent's CSP (no new directives), require no `URL.createObjectURL` cleanup, and carry no new `frame-src` entry. `blob:` URLs require adding `blob:` to `frame-src`, cascading to a `csp.test.ts` hash change. `data:` URIs are same-origin with the parent (defeating isolation).

- **`postMessage` to opaque-origin frames must use `"*"` as targetOrigin.** Sending to the string `"null"` does not work — the browser blocks it. Use `"*"` for parent-to-frame messages and strictly audit that no parent-to-frame payload contains key-adjacent data. Frame-to-parent messages must use the injected `parentOrigin` (the real host origin), not `"*"`.

- **`contrast-color()` is Baseline Newly Available as of April 2026** (Chrome 147, Firefox 146, Safari 26). Use as CSS enhancement only; the TypeScript WCAG luminance calculation (20 lines, no dep) is the functional fallback for the editor's contrast warning.

- **CSS custom properties do not cross iframe document boundaries.** The frame has its own `:root`. Push theme vars at frame init via srcdoc `<style>` block and on every theme switch via `postMessage({ type: 'THEME_PUSH', vars })` to all live frame `contentWindow` references.

**Zero-new-dependency table (full capability coverage):**

| Capability | Mechanism | New Dep? |
|------------|-----------|----------|
| `<iframe sandbox>` isolation | Platform `sandbox="allow-scripts" srcdoc` | NO |
| React in frame | Inline CJS from node_modules at build time | NO |
| Theme re-injection | `postMessage THEME_PUSH` to all frame refs | NO |
| postMessage RPC | Hand-rolled typed envelope (~80 lines, `frameBridge.ts`) | NO |
| Window persistence | Existing `idb@8` + new keys in `settings` store | NO |
| Restore path | Re-uses existing `resolveComponent` + cache-hit path | NO |
| `⋮` titlebar move | Pure React refactor within `WindowFrame.tsx` | NO |
| Maximize / snap | CSS class toggle + `WindowEntry` state fields | NO |
| Keyboard shortcuts | `KeyboardEvent` listener in `DesktopShell` | NO |
| Color input | `<input type="color">` platform primitive | NO |
| Contrast check | 20-line hand-rolled WCAG luminance calculation | NO |
| Custom theme persist | Existing `settings` IDB store + new `customThemeStore.ts` | NO |

---

### Expected Features

#### Must-Have — v3.0 Launch Criteria (P1)

| Feature | Complexity | Dependency |
|---------|------------|------------|
| `⋮` menu relocated to titlebar (right-aligned) | LOW | **Hard prerequisite for all iframe work** |
| Maximize / unmaximize (zoom to work area, NOT full-screen) | LOW | useWindowManager |
| Snap to left / right half (drag to edge + keyboard) | MEDIUM | useDrag, maximize geometry model |
| Cmd+W close / Cmd+M minimize (with `preventDefault`) | LOW | useWindowManager, active window tracking |
| `<iframe sandbox="allow-scripts">` isolation per app | HIGH | Titlebar `⋮` must complete first |
| Theme CSS vars re-injected per frame | MEDIUM | iframe isolation |
| Window geometry + open-app-set persistence across reloads | MEDIUM | IDB settings store (existing) |
| Theme name + save + duplicate-from-built-in + delete | LOW | IDB settings store |
| Live preview while editing (mutate `:root` vars in real time) | LOW | VibeThemeProvider, 12-var contract |

#### Anti-Features — Explicitly Excluded

| Feature | Reason to Exclude |
|---------|------------------|
| OS-level full-screen (hides dock + menu bar) | Destroys the desktop chrome that is the product identity; use zoom-to-work-area instead |
| Snap Assist cascade (auto-fill other half) | Significant state complexity for marginal real-world use; manual drag is sufficient |
| Color theory / HSL wheel / palette generation | Obscures the 12-var semantic contract; direct labeled pickers are more intuitive |
| Community theme gallery | Requires a server; violates zero-infra constraint; JSON export/import is the sharing primitive |
| Per-window theme | Global theme contract; per-frame overrides break OS aesthetic coherence |
| Undo/redo in theme editor | High implementation cost for 12-var editor; duplicate-before-edit workflow substitutes |
| True full-screen API | Anti-feature; permanent exclusion, not a deferral |
| Persist in-app state (scroll, form values) | No stable serialization contract for generated apps; stale form state is confusing |
| Any user-visible mechanic reference | Hard rule: "iframe", "sandbox", "isolation", "generate", "synthesize" must not appear in any UI copy, error message, or mechanic-revealing surface |

#### Defer to v3.1+

- Snap to quarter (corner drag) — low delta cost after half-snap, but lower priority
- Keyboard window cycle (Cmd+`) — moderate complexity in key capture
- Theme export / import (JSON) — low complexity; IDB record is already a clean serializable object

---

### Architecture Approach

The v3.0 architecture is an **evolution of the v2.0 in-tree model into a host-brokered frame model**. The execution seam (`WindowFrame` -> body content) is the pivot point: `WindowBody` (in-tree `<Component />`) is replaced by `SandboxFrame` (an `<iframe sandbox="allow-scripts">` that receives the `transpiledJS` string via `postMessage` and instantiates it inside the frame with its own React copy). The key invariant is that this swap is **contained behind the existing seam interface** — `SandboxFrame` accepts the same props that `WindowBody` previously did, and an `in-tree` fallback mode (injected via `ServicesProvider`, the existing IoC pattern) keeps all 727 existing RTL tests green without a real browser.

**What stays in the parent (host):** API key, registry, `resolveComponent` pipeline, `transpile.ts`, `producer.ts`, `dataBroker` allowlist enforcement, `useWindowManager`, all chrome components (MenuBar, Dock, WindowFrame titlebar, ContextualPrompt), `VibeThemeProvider` as theme source-of-truth.

**What moves into the frame (untrusted generated code):** The compiled component string (instantiated via `new Function` inside the frame), `useWidget` and `runHandler` as postMessage stubs, `ResizeObserver` for height reporting, `window.onerror` for error reporting.

**What never crosses the boundary:** The Anthropic API key, any `Function` object (structured clone prohibits it — `DataCloneError`), compiled `ComponentType` instances, the `services` graph, IDB references.

**New files:**

| File | Responsibility |
|------|---------------|
| `src/execution/frameBridge.ts` | Typed `RpcEnvelope`, `sendToFrame()`, `callParent()`, correlation-ID map |
| `src/execution/frameMount.ts` | `Map<instanceId, HTMLIFrameElement>` for theme broadcast; `broadcastTheme()`, `registerFrame()`, `unregisterFrame()` |
| `src/ui/SandboxFrame.tsx` | `<iframe>` React component; srcdoc generation with inline React CJS; `VIBE_BOOTSTRAP` send; `postMessage` handler for RUN_HANDLER / FETCH_DATA / MODIFY_REQUEST / FRAME_ERROR / FRAME_RESIZE |
| `src/registry/customThemeStore.ts` | Custom theme CRUD over existing `settings` store |
| `src/ui/ThemeEditor.tsx` | 12-var custom theme editor UI; `<input type="color">` grid; save / delete / preview |

**Modified files:** `src/ui/WindowFrame.tsx` (add `⋮` to titlebar, replace `WindowBody` with `SandboxFrame`), `src/ui/AppShell.tsx` (remove `⋮` — becomes content-only wrapper or is retired), `src/ui/VibeThemeProvider.tsx` (load custom themes on mount, broadcast `THEME_PUSH` on switch), `src/registry/settingsStore.ts` (add `writeRaw` / `readRaw` for new keys), `src/ui/DesktopShell.tsx` (debounced persistence write + boot-time restore), `index.html` FOUC script (extend to read `localStorage["vibe.customThemes"]` for active custom theme), `src/csp.test.ts` (recompute SHA-256 hash after FOUC script change).

**Files explicitly unchanged:** `src/execution/loader.ts`, `src/execution/instantiate.ts`, `src/execution/transpile.ts`, `src/execution/producer.ts`, all of `src/registry/` (except settingsStore), `src/host/`, `src/services/`, `src/data/dataBroker.ts`, `src/ui/Dock.tsx`, `src/ui/SearchLauncherPanel.tsx`.

**Schema decision — SETTLED: additive keys in existing `settings` store, no DB version bump.**
STACK.md proposed bumping `REGISTRY_DB_VERSION` to 4 and creating a dedicated `windows` object store. ARCHITECTURE.md proposed storing `WindowLayoutRecord[]` and `customThemes[]` as new keys (`"windowLayout"`, `"customThemes"`) in the existing `settings` object store. **Use the additive-keys approach.** The `settings` store at v3 already accepts arbitrary key-value records. Adding `writeRaw(key, value)` and `readRaw(key)` to `settingsStore.ts` costs one new method pair and zero migration risk. The dedicated-store option (DB v4 + `windows` store) is a valid fallback if querying needs grow beyond flat lookup — it is NOT needed for v3.0.

---

### Critical Pitfalls

Ranked by severity. The first five are security-critical and map to the iframe phase:

1. **`allow-same-origin` + `allow-scripts` together destroys the sandbox** — The frame's scripts can call `window.frameElement.removeAttribute('sandbox')`, escaping all isolation. Use exactly `sandbox="allow-scripts"` — no exceptions, ever. CI test: assert the mounted iframe `sandbox` attribute does not contain `"allow-same-origin"`. Browser probe test: confirm `localStorage` throws `SecurityError` from inside the frame.

2. **API key leaking into the frame** — Three vectors: (a) `srcdoc`-building function inadvertently receiving the `services` graph, (b) `postMessage` init payload including a config object built from the settings store, (c) error messages echoing raw handler `input` containing user-pasted key material. Prevention: type-enforce `buildSrcdoc(transpiledJS: string, themeVars: Record<string,string>, parentOrigin: string)` — no other parameters accepted. CI test: assert `iframeEl.getAttribute('srcdoc')` does not match `/sk-ant/`.

3. **Missing `event.source` check on incoming `postMessage` events** — Checking `event.origin` alone is insufficient. The correct guard for opaque-origin frames is: `event.origin === "null" && event.source === knownIframeContentWindow`. Use `crypto.randomUUID()` for correlation IDs (not `Math.random()`). Namespace the pending-callback map by `[frameId, correlationId]`.

4. **CSS custom properties do not cross the iframe boundary** — The frame has its own `:root`. Bake the 12 theme vars into the srcdoc `<style>` block at construction time. On every `setTheme()` call in `VibeThemeProvider`, call `broadcastTheme(vars)` to all registered frame `contentWindow` references via `postMessage({ type: 'THEME_PUSH', vars }, "*")`.

5. **`⋮` must be in the titlebar before any iframe work begins** — Once the body is an opaque frame, the parent cannot inject a button into the frame's DOM without compromising isolation. `createPortal` across the boundary requires `allow-same-origin`, which must not be set. Gate: existing MOD-01 through MOD-04 tests pass with the prompt triggered from the titlebar.

6. **Stale `instanceId` on restore** — Persisted `instanceId` values are session-scoped UUIDs meaningless to the next session. On restore, always mint a fresh `instanceId` via `windowManager.open()` using the persisted `appType`. Serialize restores (cap concurrent restores at 1-2) to avoid simultaneous produce-gate hits. Evicted-app-on-restore opens as a placeholder with a retry button — not silent API spend.

7. **FOUC for custom themes** — The `index.html` FOUC script has a hard-coded `VIBE_THEMES` object (built-ins only). Mirror custom theme vars to `localStorage["vibe.customTheme.<name>"]` at write time; extend the FOUC script to check `localStorage` for the active custom theme if not found in the built-in block. Any FOUC script change requires a `csp.test.ts` SHA-256 hash recompute.

8. **Infinite-loop inside a frame cannot be `terminate()`d (known v3.0 limitation)** — A generated app that enters an infinite loop inside the frame cannot be killed via `Worker.terminate()` (no Worker is involved). Document this explicitly. Mitigation: add an unresponsive-app ping/timeout/force-close overlay. Do not pretend to solve the infinite-loop problem itself.

---

## Implications for Roadmap

### Prescribed Build Order (dependency-enforced)

All four researchers independently arrived at the same four-phase order. The dependency chain is hard, not advisory:

```
[Phase 1: Window Chrome & ⋮ Relocation]
  -> hard prerequisite for ->
[Phase 2: iframe Sandbox Isolation (HARD-01)]
  -> enables ->
[Phase 3: Desktop Persistence]    <- independent of Phase 2 at data-model level
[Phase 4: Theme Editor]           <- independent of Phase 2 at data-model level
```

Phases 3 and 4 are independent of each other and of Phase 2 at the data-model level (both use the existing `settings` IDB store without a version bump). They can be developed in parallel with or immediately after Phase 2. Both should build on the Phase 1 `WindowFrame` structure, so Phase 1 is the practical start gate for all work.

---

### Phase 1: Window Chrome — `⋮` Relocation + Maximize / Snap / Keyboard

**Rationale:** Hard prerequisite for all iframe work. Once the body is an opaque frame, the parent cannot inject chrome from outside. This phase also delivers table-stakes window management features independently.

**Delivers:**
- `⋮` button moved to `WindowFrame` titlebar (right-aligned), `ContextualPrompt` rendered from `WindowFrame`
- `AppShell` reduced to content-only wrapper or retired (removes its header entirely)
- Maximize toggle (fills work area between menu bar and dock — NOT OS full-screen; double-click on titlebar = same)
- Snap to left / right half (drag-to-edge with translucent drop-zone preview + `Ctrl+Left` / `Ctrl+Right`)
- `Cmd+W` / `Ctrl+W` close, `Cmd+M` / `Ctrl+M` minimize (both with `preventDefault`)

**Addresses (FEATURES.md):** All P1 window chrome table stakes

**Avoids (PITFALLS.md):** Pitfalls 5 and 6 (portal and React-in-iframe problems pre-empted by completing this phase first)

**Gate:** MOD-01 through MOD-04 tests pass with `ContextualPrompt` triggered from titlebar. `AppShell` no longer renders `ContextualPrompt`. Maximize fills work area (not OS full-screen). Keyboard shortcuts do not close the browser tab.

**Research flag:** No deeper research needed. Pure React refactor + CSS class toggling. Well-documented patterns.

---

### Phase 2: `<iframe sandbox>` Isolation (HARD-01)

**Rationale:** The core security milestone. Highest risk, highest value. All key-leak pitfalls concentrate here. Must follow Phase 1. The existing execution seam makes this a contained swap.

**Delivers:**
- `src/ui/SandboxFrame.tsx` — `<iframe sandbox="allow-scripts" srcdoc=...>` rendering app body in opaque origin
- `src/execution/frameBridge.ts` — typed `RpcEnvelope`, correlation-ID map (using `crypto.randomUUID()`), `callParent()` / `sendToFrame()` helpers
- `src/execution/frameMount.ts` — `Map<instanceId, HTMLIFrameElement>`, `broadcastTheme()`, `registerFrame()` / `unregisterFrame()`
- srcdoc template: inline React CJS (17KB react + 536KB react-dom-client), in-frame `new Function` instantiation, `VIBE_BOOTSTRAP` bootstrap message handler, `window.onerror` / `ResizeObserver` reporting
- `postMessage` RPC broker in `SandboxFrame`: `RUN_HANDLER`, `FETCH_DATA` (dataBroker allowlist enforced in parent), `MODIFY_REQUEST`, `FRAME_ERROR`, `FRAME_RESIZE`, `THEME_PUSH`
- `VibeThemeProvider` extended: calls `broadcastTheme(vars)` on every `setTheme()` call
- `in-tree` fallback mode via `ServicesProvider` flag — all 727 existing RTL tests remain green
- CI tests: `sandbox` attribute assertion (no `allow-same-origin`), srcdoc key-pattern assertion (no `/sk-ant/`), forged-message drop test, theme-in-frame round-trip test
- Unresponsive-app ping/timeout/force-close overlay (documents the known infinite-loop limitation)

**Addresses (FEATURES.md):** HARD-01 security isolation, theme re-injection per frame, `⋮` menu working across frame boundary (host-owned, so no coordination needed)

**Avoids (PITFALLS.md):** Pitfalls 1-7 (all critical iframe pitfalls)

**Testing note:** Existing RTL / JSDOM tests use the `in-tree` fallback path. The full iframe round-trip (READY -> MOUNT -> render -> FRAME_RESIZE -> THEME_PUSH) requires a real browser. At least one Playwright / browser-native integration test is required. This is a new test category not in the 727-test baseline.

**Research flag:** High-risk phase; full verification checklist in PITFALLS.md "Looks Done But Isn't" section. Security review at gate recommended.

---

### Phase 3: Desktop Persistence

**Rationale:** Independent of Phase 2 at the data-model level. Uses the existing `settings` IDB store at v3 — no version bump, no migration. Low risk; the `settingsStore.ts` pattern and `resolveComponent` restore path are already established.

**Delivers:**
- `settingsStore.ts` gains `writeRaw(key: string, value: unknown)` / `readRaw(key: string): Promise<unknown>`
- `DesktopShell` gains debounced `useEffect` (300ms trailing) writing `"windowLayout": WindowLayoutRecord[]` on any window geometry change
- Boot-time restore: reads `"windowLayout"` from settings on mount; for each record mints a fresh `instanceId`; restores geometry; calls `resolveComponent` (cache hit for previously opened apps)
- Serialized restore queue: cap concurrent restores at 2 to avoid simultaneous produce-gate hits
- Evicted-app-on-restore: opens as placeholder with retry button (not silent API spend)
- Persisted record shape: `{ appType, title, icon, x, y, z, minimized }` only — no `instanceId`, no `transpiledJS`, no `prompt`, no `Component`

**Schema:** No DB version bump. New keys `"windowLayout"` and `"openSet"` in existing `settings` store via `writeRaw` / `readRaw`.

**Addresses (FEATURES.md):** Window geometry + open-app-set persistence (P1 table stakes)

**Avoids (PITFALLS.md):** Pitfall 8 (stale instanceId), Pitfall 9 (IDB migration risk — eliminated by additive-keys decision), Pitfall 10 (persisting secrets), Pitfall 15 (IDB quota from frequent layout writes)

**Gate:** Close 3+ windows -> reload -> all windows restore at saved geometry without produce-gate throttle errors. IDB `settings` record for `"windowLayout"` has exactly `{ appType, title, icon, x, y, z, minimized }` per entry. Drag a window 50+ times -> IDB shows 1 record update (debounce working).

**Research flag:** No deeper research needed. Follows v2.0 `settingsStore` precedent exactly.

---

### Phase 4: Theme Editor / Custom Themes

**Rationale:** Independent of all other phases at the data-model level. The IDB `settings` store and `VibeThemeProvider` are the only dependencies, both at the correct state. Can be developed in parallel with Phase 3 or immediately after.

**Delivers:**
- `src/registry/customThemeStore.ts` — `save(name, vars)`, `loadAll()`, `remove(name)` over existing `settings` store with `"customTheme:<name>"` key namespace
- `src/ui/ThemeEditor.tsx` — 9 color pickers (`<input type="color">`) for opaque vars, 2 alpha-color inputs (range + color) for `--glass` / `--glass2`, 1 text field for `--wall` gradient; name field; save / duplicate-from-built-in / delete; live preview; `CSS.supports` validation gate before any IDB write; inline WCAG contrast warning (non-blocking)
- `VibeThemeProvider` extended: loads custom themes from IDB on mount; merges into runtime registry as `custom:<name>` namespace; broadcasts `THEME_PUSH` to all open frames on custom theme switch
- `MenuBar` gains "+" trigger for `ThemeEditor`; renders custom theme pills alongside built-ins
- FOUC script extended: if `vibeStored` starts with `"custom:"`, reads `localStorage["vibe.customTheme.<name>"]` (mirrored at save time) and applies vars synchronously; falls back to Aurora only if that key is also absent
- `csp.test.ts` SHA-256 hash updated after FOUC script change

**Theme name rules:** Custom themes namespaced `custom:<name>` — cannot collide with built-in names. User-supplied theme names sanitized through `sanitizeDisplayName` before any DOM render or IDB storage. Delete is guarded: if the active theme is being deleted, auto-switch to Aurora first. Built-in four themes remain permanently read-only.

**Addresses (FEATURES.md):** Theme name + save + duplicate-from-built-in + delete (P1), live preview (P1); theme export/import JSON deferred to v3.1 (IDB record is already a clean serializable object)

**Avoids (PITFALLS.md):** Pitfall 11 (invalid color value), Pitfall 12 (custom theme name collision / banned token), Pitfall 13 (FOUC for custom themes), Pitfall 16 (low-contrast custom theme — inline warning)

**Gate:** Create custom theme -> appears in MenuBar -> selecting re-skins desktop + all open frames live -> persists across hard reload -> FOUC script applies custom theme on first paint (no Aurora flash). Create theme named `"aurora"` -> rejected or auto-namespaced to `"custom:aurora"`, built-in Aurora still accessible. Theme editor copy passes CI lexicon gate.

**Research flag:** No deeper research needed. Standard IDB key-value pattern; `<input type="color">` is well-documented.

---

### Phase Ordering Rationale

- **Phase 1 before Phase 2 (hard constraint):** `createPortal` cannot cross an opaque iframe boundary without `allow-same-origin`, which must not be set. The `⋮` menu must be host-owned chrome before any frame isolation. All four researchers confirmed this independently.

- **Phases 3 and 4 are independent and can be parallelized:** Both use the existing `settings` IDB store at v3 with no version bump. Neither depends on Phase 2 completion for their data model. Phase 1 is the practical start gate for all work (because `WindowFrame` structure is shared).

- **Additive-keys schema eliminates the migration risk** that would have serialized Phases 3 and 4 (no DB version bump = no migration window = no blocking dependency between these phases).

- **Custom theme FOUC is a known design-time constraint.** The localStorage-mirror strategy (write custom vars to both IDB and localStorage at save time) is the correct pattern, already used for the active-theme preference.

---

### Cross-Cutting Constraints (Every Phase)

| Constraint | Scope | Enforcement |
|-----------|-------|-------------|
| Devtools hygiene lexicon gate | `src/**`, `index.html`, srcdoc template strings, `postMessage` payload field names, IDB store/key names | `hygiene.test.ts` — extend to scan `frameBridge.ts`, `SandboxFrame.tsx`, `ThemeEditor.tsx`, srcdoc template constant |
| Zero new npm dependencies | All four pillars | Confirmed by all four researchers; devDependencies for Playwright are out of scope of this constraint |
| IoC / DI with captured-Haiku fixtures | All execution paths | `in-tree` fallback mode via `ServicesProvider` flag for all new components |
| `build.sourcemap: false` + minify in prod | Vite prod config | Prevents source map exposure of srcdoc template strings, variable names, comments |
| CSP allowlist — `connect-src: 'self' api.anthropic.com` | Any new fetch call site | Frame never calls Anthropic directly; dataBroker allowlist enforced in parent |
| Key never enters frame | All postMessage payloads, srcdoc template | Type-enforced `buildSrcdoc` signature; CI test on srcdoc attribute |
| Never name the mechanic | All user-visible surfaces, error messages, devtools-visible IDB keys | Sanitizer applied to model-supplied names and user-supplied theme names; banned token set extended to cover new surfaces |

---

### Research Flags

**Needs Playwright / browser-native tests:**
- **Phase 2 (HARD-01):** The full iframe round-trip (READY -> MOUNT -> render -> FRAME_RESIZE -> THEME_PUSH) cannot be tested in JSDOM. At least one Playwright integration test is required to prove: (a) the frame renders correctly, (b) theme vars are applied inside the frame, (c) `localStorage` is inaccessible from inside the frame (`SecurityError`), (d) a forged `postMessage` from an unknown source is dropped.

**Standard patterns (skip deeper research):**
- **Phase 1 (Window Chrome):** Pure React state + CSS class toggling. No novel patterns.
- **Phase 3 (Persistence):** Established `settingsStore.ts` key-value pattern. Additive; no migration.
- **Phase 4 (Theme Editor):** `<input type="color">` + `CSS.supports` validation + `localStorage` mirror. All standard.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry live; React 19 UMD absence confirmed by node_modules inspection; CSP inheritance by srcdoc confirmed against HTML spec; Babel CJS sizes measured directly |
| Features | HIGH | Apple HIG, macOS keyboard shortcuts, Windows 11 snap behavior, shadcn/tweakcn theme editor patterns — all verified against primary sources; dependency graph independently confirmed by all four researchers |
| Architecture | HIGH | Direct source inspection of all named files (WindowFrame.tsx, AppShell.tsx, useWindowManager.tsx, DesktopShell.tsx, VibeThemeProvider.tsx, instantiate.ts, mount.ts, loader.ts, db.ts, settingsStore.ts, hygiene.test.ts, index.html); prior CONSULT-sandboxing-execution.md cross-referenced |
| Pitfalls | HIGH | Verified against MDN, OWASP, HTML spec (WHATWG), Chromium issue tracker, React hook call invariant docs, and first-party codebase; prior v2.0 pitfalls cross-referenced for continuity |

**Overall confidence: HIGH**

### Gaps to Address During Implementation

| Gap | How to Handle |
|-----|--------------|
| Playwright / browser-native test infrastructure | Phase 2 planning must include a decision on whether to add Playwright as a devDependency (separate from the zero-new-runtime-dep bias) or use an alternative browser-native approach |
| srcdoc hygiene gate extension | `hygiene.test.ts` currently scans `src/**` + `index.html` only. Extend to scan the srcdoc template constant in `frameMount.ts` / `SandboxFrame.tsx` |
| `loader.ts` transpiled-string accessor | The iframe path needs `transpiledJS` as a string. Recommended accessor: `export function getTranspiledJS(cacheKey: string): string | undefined` — verify against session-tier `transpiledCache` structure before Phase 2 planning commits |
| Multi-tab IDB conflict on restore | Two tabs open during reload may write conflicting `"windowLayout"` values. Last-write-wins via IDB transaction ordering. Acceptable for v3.0; document as known multi-tab behavior |
| Alpha-color input UX for `--glass` / `--glass2` | `<input type="color">` returns only `#rrggbb` hex. Decide during Phase 4 planning: accept text-field input for alpha vars, or implement a dual range+color picker pattern |

---

## Sources

### Primary (HIGH confidence)

- MDN `HTMLIFrameElement.srcdoc` — srcdoc opaque origin behavior, sandbox rules, CSP inheritance
- MDN `Window.postMessage` + Structured Clone Algorithm — Functions throw `DataCloneError`; opaque origin is string `"null"`
- HTML spec (WHATWG) — section 9.3 Cross-document messaging; origin-at-send-time semantics
- OWASP / SecureFlag — `event.source` check requirement alongside `event.origin`
- React 19 UMD removal — confirmed by `node_modules/react@19.2.7` inspection (no `umd/` directory)
- MDN CSS Custom Properties — cascade is per-document; vars do not inherit across iframe document boundaries
- MDN `<iframe> sandbox` — `allow-scripts + allow-same-origin` defeats opaque origin; `window.frameElement.removeAttribute('sandbox')` bypass documented
- `contrast-color()` — Baseline Newly Available April 2026; caniuse coverage 74%
- React docs — Invalid Hook Call Warning — two React copies cause hook context mismatch
- npm registry (verified 2026-06-26) — `react`/`react-dom` 19.2.7, `idb` 8.0.3
- platform.claude.com/docs — `claude-haiku-4-5-20251001` confirmed current
- Direct first-party source inspection (2026-06-26): `src/ui/WindowFrame.tsx`, `src/ui/AppShell.tsx`, `src/ui/useWindowManager.tsx`, `src/ui/DesktopShell.tsx`, `src/ui/VibeThemeProvider.tsx`, `src/execution/instantiate.ts`, `src/execution/mount.ts`, `src/execution/loader.ts`, `src/registry/db.ts`, `src/registry/settingsStore.ts`, `src/hygiene.test.ts`, `index.html`
- `.planning/research/CONSULT-sandboxing-execution.md` — prior iframe research, allowlist pattern, infinite-loop limitation

### Secondary (MEDIUM confidence)

- Anvil Engineering blog — `MessageChannel` vs `window.postMessage` per-call port isolation
- postmessage.dev — wildcard `targetOrigin` data leak patterns
- simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access — CORS header requirement
- Apple HIG — context menu placement conventions
- Microsoft Support — Snap layouts and keyboard shortcuts (Windows 11)
- shadcn/tweakcn — theme editor live-preview reference patterns

### Tertiary (LOW confidence — patterns only, verify during implementation)

- Google web.dev IDB best practices — quota behavior, `QuotaExceededError` handling
- Dev.to — IndexedDB upgrade version conflict handling patterns

---

*Research completed: 2026-06-26*
*Ready for roadmap: yes*
