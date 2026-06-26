# Feature Research

**Domain:** Browser OS desktop shell — windowing, theme system, create panel (v2.0 Vibe OS)
**Milestone:** v2.0 Vibe OS — layered on shipped v1.1
**Researched:** 2026-06-26
**Confidence:** HIGH — grounded in `design/VibeOS.dc.html` (complete reference prototype with full interaction logic) and `.planning/PROJECT.md`

> **Scope note.** This file researches the v2.0 Vibe OS milestone: multi-window manager, themed desktop surface, bottom dock, top menu bar, named-theme system, and visible create panel. The question is "what do users expect, what differentiates, and what should we explicitly not build?" Throughout, "existing features" refers to the shipped v1.1 capabilities (AppShell, produce loop, delegated thin-shell, WidgetShell, ContextualPrompt, ThemeProvider, resilience).
>
> *(Supersedes the v1.1 FEATURES.md for this milestone.)*

---

## Design Reference Behavior Summary (VibeOS.dc.html)

The reference is a fully working prototype. All interactions below are derived directly from its code.

**Windows**: positioned absolutely by `(x, y, z)` state; drag via `pointerdown/pointermove/pointerup` on the title bar; `z` is a monotonic counter (`ztop++`); `min: true` hides via `display:none`; close removes from the windows array. Re-opening an existing `kind` re-raises and un-minimizes instead of duplicating.

**Initial placement**: cascade formula — `x = clamp(vw/2 - w/2 + 140 + n*26, 16, vw-w-16)`, `y = clamp(vh/2 - 200 + n*22, 58, vh)`. Bounds clamp: `y = Math.max(44, e.clientY - oy)` (can't drag behind menu bar).

**Title bar chrome**: macOS-style traffic lights (close = red/gradient, minimize = amber/gradient, green circle present but non-interactive in reference).

**No resize handle in reference.** Width is per-kind constant (`widthFor`). Height is content-driven.

**Dock**: centered bottom strip; items added to `installed[]` on first open; store icon always present; running indicator = 4px dot below icon when `!min`; hover → `scale(1.22) translateY(-7px)`.

**Menu bar**: 40px fixed top strip; left = wordmark + active-app name; right = 4-theme segmented control + `HH:MM` clock.

**Theme system**: 4 named themes (Aurora/Aero/Aqua/Noir) as flat CSS-variable maps; applied inline on root shell `div`; switcher is segmented control in menu bar; no persistence in prototype (state-only) — IndexedDB persistence is the v2.0 requirement.

**CSS-variable contract**: `--accentA`, `--accentB`, `--text`, `--glass`, `--glass2`, `--bord`, `--hi`, `--wall`, `--b1`–`--b4`.

**Create panel**: always visible, centered on desktop (not a window); three states — idle (suggestion chips), vibing (shimmer skeleton + step labels + progress bar), result (app card with Open/Discard); Enter key or "Vibe it" button triggers; `onOpen` calls `openApp` which mounts a window.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features expected of any "desktop OS" metaphor. Missing = product feels broken.

| Feature | Why Expected | Complexity | Dependency on Existing Features | Notes |
|---------|--------------|------------|----------------------------------|-------|
| **Draggable windows (title-bar grab)** | Every windowing system since 1984; the defining interaction of a windowed OS | LOW | New: `WindowManager` state component | `pointerdown/pointermove/pointerup`; ~40 LOC in reference |
| **Z-order / focus-raise on any click** | Clicking a background window must bring it front; violating this breaks the OS metaphor immediately | LOW | Drag (same state); monotonic `z` counter | `onMouseDown` on the whole window frame; updates `activeName` |
| **Close button** | Every window must be dismissible | LOW | `WindowManager` | Removes window from array; no confirmation needed |
| **Minimize to dock** | Expected on every macOS/Windows-style window | LOW | Dock (running indicator); `min` flag | `display:none` when `min: true` |
| **Restore from dock** | Complement of minimize; clicking a dock icon restores | LOW | Dock | Same `openApp` path: re-raises + clears `min` |
| **Window title bar (icon + name + traffic lights)** | Visual identity, drag surface, close/minimize affordance | LOW | AppShell refactor | Replace existing AppShell chrome with `WindowTitleBar` component |
| **Multiple windows open concurrently** | The entire point of a windowing system | MEDIUM | Execution engine: N independent React roots; AppShell refactor | `createRoot` per window content div; already feasible per React 19 design |
| **Bottom dock bar** | Standard OS chrome; running-app overview | LOW | `WindowManager` (installed list, min status) | Centered glass strip; always-present store icon + one icon per `installed` app |
| **Running indicator on dock** | Dot below icon = app is open and not minimized; absent = closed/minimized | LOW | Dock + window state | `d.running = !!windows.find(w => w.kind === k && !w.min)` |
| **Dock hover-scale animation** | macOS magnification is universally expected on a dock | LOW | Dock | CSS `transform: scale(1.22) translateY(-7px)` on `:hover`; reference already specifies `cubic-bezier(.2,.8,.2,1)` |
| **Top menu bar** | Standard OS chrome: wordmark, active context, global controls | LOW | New layout shell | 40px fixed top; `backdrop-filter: blur` glass strip |
| **Active app name in menu bar** | Shows focus context; expected in any macOS-style shell | LOW | Focus-raise (updates `activeName`) | Truncated with ellipsis for long names |
| **Live clock in menu bar** | Users expect it in any OS-style shell; grounds the session | LOW | 1s `setInterval` tick | `HH:MM` tabular-numeric format |
| **Initial placement / cascade** | New windows don't all stack on top of each other | LOW | `WindowManager` | Reference cascade formula; first window is roughly centered |
| **Bounds clamping (top edge)** | Windows can't disappear behind the menu bar | LOW | Drag handler | `y = Math.max(44, e.clientY - oy)` |
| **Deduplication: one window per app kind** | Re-opening same app raises it rather than spawning a duplicate | LOW | `WindowManager` | `exists = windows.find(w => w.kind === kind)` → raise instead of push |
| **Theme switcher in menu bar** | Users expect a centrally-placed appearance control | LOW | ThemeProvider refactor | 4-button segmented control; inline in menu bar right section |
| **Theme live-apply (instant, no reload)** | Any modern app; a reload for a theme change feels broken | LOW | CSS custom property injection on root element | `Object.assign(rootDiv.style, themeVars)` or equivalent |
| **Theme persistence (IndexedDB)** | Users expect any preference to survive a page reload | LOW | Existing `idb` wrapper + registry init (LOOP-03) | Single `preferences` record; read on init, write on change |
| **4 named built-in themes (Aurora/Aero/Aqua/Noir)** | A curated theme set is the v2.0 promise; users expect the switcher to actually switch to visually distinct looks | LOW | Theme system | Exact CSS-variable maps defined in reference; no guessing needed |
| **Theme applied to host chrome AND app content** | A theme that only re-skins the menu bar and not the windows looks broken | LOW | CSS vars cascade via root element | CSS custom properties cascade into window content divs automatically |
| **Create panel: idle state with suggestion chips** | Reduces blank-page anxiety; helps first-time users know what to type | LOW | Create panel | 5 static suggestions; click fills input and triggers vibe |
| **Create panel: loading affordance during production** | User must see *something* is happening during a 2–5s LLM call; a frozen UI feels broken | LOW | Create panel + produce integration | Shimmer skeleton + step-label rotation + progress bar |
| **Create panel: result card (Open / Discard)** | Confirm before opening; gives user agency; expected in any wizard-style flow | LOW | Create panel | App name, tag, prompt echo, Open/Discard buttons |
| **Create panel → opens in window** | The logical conclusion of the create flow | LOW | `WindowManager.openApp` | `onOpen` → `openApp(kind)` → mounts window |
| **AppShell inside windows (existing features work)** | The contextual prompt, error boundary, widget shells must survive the windowing redesign | MEDIUM | AppShell refactor | AppShell sheds full-page layout role; becomes a content-only component inside window's scroll div |

### Differentiators (Competitive Advantage)

Features that go beyond expectations and make Vibe OS visually and functionally distinctive.

| Feature | Value Proposition | Complexity | Dependency on Existing Features | Notes |
|---------|-------------------|------------|----------------------------------|-------|
| **Theme-aware generated apps** | Apps re-skin for free when the theme changes — the key product insight of v2.0 | MEDIUM | Produce system-prompt update; CSS-variable contract | The non-obvious load-bearing piece: produce prompt must mandate `var(--accentA)`, `var(--text)`, `var(--glass)` etc; existing apps will need re-production (cache-miss) to pick up the contract |
| **Animated blob background (theme-matched)** | The desktop feels alive, not static; establishes Vibe OS as a visual product, not a browser wrapper | LOW | Theme system (`--b1–b4`) | 4 radial-gradient orbs with `vibeFloat` animation; colors from theme vars; already fully specified in reference |
| **Glass morphism window chrome** | Signature aesthetic that establishes a coherent visual language across all apps | LOW | WindowManager | `backdrop-filter: blur(32px) saturate(195%)` + inner-highlight inset; CSS-only; reference CSS is complete |
| **Window open animation (`vibeWin`)** | New windows fade+scale in; signals quality without being showy | LOW | WindowManager | `@keyframes vibeWin` already defined in reference; `animation: vibeWin .35s cubic-bezier(.2,.8,.2,1)` |
| **Step-label progress ("Reading your vibe…")** | Branded, playful production feedback that normalizes the wait without naming the mechanic | LOW | Create panel + produce integration | Rotate through 5 steps during the real LLM call; steps in reference: "Reading your vibe… / Sketching the layout… / Wiring up the logic… / Pouring the glass… / Adding the shimmer…" |
| **"Live" badge on create panel** | Signals the platform is online/ready; makes the panel feel like a live service without naming AI | LOW | Create panel | Pulsing green dot + "live" label; pure CSS; already in reference |
| **Dock items persist across reloads** | Installed apps stay in dock after page reload; the platform remembers you | MEDIUM | IndexedDB; share `preferences` store with theme persistence | Store `installed[]` alongside `theme` in a single preferences record |
| **Shimmer skeleton during production** | High-quality loading affordance; matches the glass aesthetic; doesn't feel like a generic spinner | LOW | Create panel | Icon shimmer + two text-line shimmers; `vibeSheen` animation; already in reference |
| **Contextual prompt still works inside windows** | The existing tweak/clone/remove superpower is preserved in the new OS context | MEDIUM | ContextualPrompt z-index; AppShell refactor | Popover z-index must exceed any window's `z`; needs a z-ceiling above `ztop` |

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly NOT build in v2.0.

| Feature | Why Requested | Why Problematic | Better Alternative |
|---------|---------------|-----------------|-------------------|
| **Window resize handles** | Users expect resizable windows in a "real OS" | High complexity: drag-resize logic, min/max constraints, content reflow; generated app bodies have fixed-width layouts that break when width changes arbitrarily; blocks milestone scope | Fixed per-kind widths (reference: `widthFor` map); content-driven height; defer post-v2 |
| **Window maximize / full-screen** | Expected in a desktop OS | Conflicts with the glassmorphism partial-screen aesthetic where the desktop surface is always visible; adds state and edge cases for minimal gain at widget scale | Windows are intentionally partial-screen; defer |
| **Snap / tiling (half-screen, quadrant layout)** | Power-user productivity feature | Over-engineered for a vibe aesthetic where apps are widget-scale, not document editors; adds drag-target detection, layout engine, keyboard handling | Deliberate anti-feature; the aesthetic is free-floating glass, not a tiling WM |
| **Multi-desktop / virtual desktops** | macOS Spaces / Windows virtual desktops | Adds a navigation model far beyond milestone scope; existing apps are small enough that one desktop surface is fine | Out of scope; one desktop surface |
| **Window layout persistence (positions on reload)** | "Remember where my windows were" | Transient window positions add complex state; apps re-produce or cache-hit instantly on re-open; saving/restoring absolute pixel positions across viewport changes adds bugs | Restore which apps were in the dock (`installed[]`) but not positions; re-opening is already fast |
| **Focus-follows-cursor (X11-style)** | Advanced power-user preference | Conflicts with click-to-focus expectation; confusing for the majority of users coming from macOS/Windows conventions | Click-to-focus only (already in reference) |
| **Custom user-created themes** | "I want to pick my own colors" | Out of scope for v2.0 per PROJECT.md; requires a theme editor, color picker, IndexedDB schema extension, validation, and conflict-free naming | Built-in themes only (Aurora/Aero/Aqua/Noir); custom themes deferred to v3 |
| **Streaming code generation visible as progress** | "Show progress during creation" | SSE source stream is a Network-tab hygiene leak; can't compile partial JSX | Non-streaming produce; step labels provide branded progress without exposing the mechanic |
| **Naming the mechanic in create panel copy** | Transparency / honesty | Violates devtools-hygiene (HYGIENE-01–05) and the premise that apps simply exist; banned-token gate still enforced | Branded copy only: "Vibe it ✦", "Vibe Store", "vibed just now" — mechanic never named |
| **Per-theme CSS class names or `data-theme` attributes that reveal intent** | Developer ergonomics | Mechanic-adjacent naming leaks the OS-shell nature in source; neutral names required | Neutral CSS variable names (`--accentA`, `--glass`) not `--ai-accent`, `--generated-bg` |

---

## Feature Dependencies

```
[Theme CSS-variable contract (--accentA, --accentB, --text, --glass, --glass2, --bord, --hi, --wall, --b1–b4)]
    └──required-by──> [Theme-aware generated apps]        (produce prompt mandates vars)
    └──required-by──> [Glass morphism window chrome]      (windows use --glass, --bord, --hi)
    └──required-by──> [Animated blob background]          (orbs use --b1–b4)
    └──required-by──> [Dock glass strip]                  (uses same glass vars)
    └──required-by──> [Create panel glass card]           (create panel is also a glass surface)

[WindowManager state (windows[], installed[], activeName, z-counter)]
    └──required-by──> [Drag + z-order + focus-raise]
    └──required-by──> [Close + Minimize + Restore]
    └──required-by──> [Dock running indicators]
    └──required-by──> [Active app name in menu bar]
    └──required-by──> [Multiple concurrent app mounts]    (one React root per window)

[Multiple concurrent React roots (N createRoot calls)]
    └──requires──>    [AppShell refactor]                 (AppShell must be content-only, not full-page layout)
    └──requires──>    [ContextualPrompt z-index hardening] (must float above all windows)

[AppShell refactor]
    └──enables──>     [WidgetShell inside windows]        (WidgetShell lives inside AppShell; both work unchanged)
    └──enables──>     [ContextualPrompt inside windows]   (contextual menu trigger lives in AppShell)

[Create panel — produce integration]
    └──requires──>    [Existing: producer, resilience, cacheKey, instantiate] (LOOP-01–08, GEN-01–05, RESIL-01–06)
    └──requires──>    [WindowManager.openApp]             (result "Open app" mounts a window)
    └──constrains──>  [Loading step labels]               (HYGIENE-01: no banned tokens in step copy)

[Theme persistence (IndexedDB)]
    └──requires──>    [Existing idb wrapper + registry init] (LOOP-03)

[Dock persistence (installed[])]
    └──requires──>    [Theme persistence]                 (share same preferences store/record)

[Devtools hygiene gate (HYGIENE-01–05)]
    └──constrains──>  [Create panel copy]                 (no AI/LLM/generate/synthesize/mock/fake)
    └──constrains──>  [CSS variable + class names]        (neutral names only)
    └──constrains──>  [Window/dock/store identifiers]     (neutral naming in source/logs/IndexedDB keys)
```

### Dependency Notes

- **AppShell refactor is the critical prerequisite.** The existing `AppShell` owns the full-page layout including the `AppBar`. It must be decomposed into: (a) a content-only `AppContent` component that sits inside a window's scroll div, and (b) all layout chrome moving to the new desktop shell. This unblocks multiple concurrent windows.
- **Theme-aware generated apps is the non-obvious load-bearing piece.** The integration is simple (one system-prompt update), but the consequence is significant: all produce calls after the change will produce apps that use `var(--accentA)` etc; existing cached apps (pre-v2.0) will not re-skin until their cache is invalidated. A cache-busting strategy (e.g. cache-key includes a `contractVersion` salt) should be considered.
- **Dock persistence and theme persistence should share a single IndexedDB record** (`preferences: { theme, installed[] }`) to avoid schema proliferation. They use the same `idb` wrapper already in the stack.
- **ContextualPrompt z-index**: with a monotonic `ztop` counter driving windows, the contextual prompt popover must use a z-index guaranteed to exceed any window's `z`. Use a fixed ceiling (e.g. `z-index: 99999`) on the popover.
- **Create panel position**: the create panel is NOT a window (it has no drag handle, no title bar, no close button in the reference). It's a fixed centered panel on the desktop surface, always visible behind open windows. This is intentional — it is the "home" of the OS.

---

## MVP Definition

### Launch With (v2.0 milestone scope)

All items below are table stakes for the Vibe OS premise to feel real:

- [ ] **Desktop surface** — fullscreen, themed background with animated blobs (`vibeFloat`), replacing the flat storefront page
- [ ] **Top menu bar** — wordmark + active-app name + theme segmented control (4 themes) + live clock
- [ ] **WindowManager** — `windows[]`, `installed[]`, `activeName`, z-counter; open/close/minimize/restore/focus-raise
- [ ] **Draggable glass windows** — title-bar drag, traffic-light buttons (close + minimize; green non-interactive), cascade placement, bounds clamp
- [ ] **Dock** — centered bottom glass strip, store icon always present, per-installed-app icons, running dot, hover-scale
- [ ] **Theme system** — 4 named themes as CSS-variable maps, live-apply to root element, IndexedDB persistence
- [ ] **Theme applied to host chrome AND all window content** — CSS vars cascade; no extra per-window theming needed
- [ ] **Create panel** — idle/vibing/result states, wired to real produce path, Enter key + button trigger, `onDiscard` clears
- [ ] **Create panel → window** — `onOpen` calls `openApp`, produced component mounts in a new window
- [ ] **AppShell refactor** — content-only inside window div; existing contextual prompt, error boundary, widget shells still work
- [ ] **Theme-aware generated apps** — produce system-prompt updated to mandate CSS-variable contract
- [ ] **Multiple concurrent app mounts** — N independent React roots; each window gets its own `createRoot`
- [ ] **Devtools hygiene holds** — create panel step labels, window titles, dock labels, CSS vars all use neutral/branded language; banned-token gate green

### Add After Validation (v2.x)

- [ ] **Dock persistence** — restore `installed[]` on page reload; reuse `preferences` IndexedDB record
- [ ] **Cache-key contract versioning** — add a `contractVersion` salt to bust pre-v2 cached apps and force re-production with the CSS-variable contract
- [ ] **Window resize handles** — defer until usage confirms users want resizable windows at widget scale

### Future Consideration (v3+)

- [ ] **Custom user-created themes** — theme editor, color picker, named custom themes saved to IndexedDB
- [ ] **HARD-01 `<iframe sandbox>` isolation** — security end-state; each window becomes an iframe; key never enters frame
- [ ] **Snap / tiling** — deliberate anti-feature; revisit only if core use cases emerge
- [ ] **Multi-desktop / virtual desktops** — only if usage patterns justify
- [ ] **Window layout persistence** — positions across reloads; low user value

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Desktop surface + blob background | HIGH | LOW | P1 |
| Top menu bar (wordmark, clock, theme switcher) | HIGH | LOW | P1 |
| WindowManager (windows[], z, min, activeName) | HIGH | MEDIUM | P1 |
| Draggable glass windows + traffic lights | HIGH | LOW | P1 |
| Bottom dock + running indicators + hover-scale | HIGH | LOW | P1 |
| Theme system: 4 named themes, live-apply, persistence | HIGH | LOW | P1 |
| Theme applied to chrome AND app content | HIGH | LOW | P1 |
| Create panel: 3 states wired to real produce | HIGH | MEDIUM | P1 |
| Create panel → opens window | HIGH | LOW | P1 |
| AppShell refactor (content-only) | HIGH | MEDIUM | P1 — prerequisite for windowing |
| Theme-aware generated apps (prompt update) | HIGH | MEDIUM | P1 — load-bearing, non-obvious |
| Multiple concurrent React roots | HIGH | MEDIUM | P1 |
| Window open animation (vibeWin) | MEDIUM | LOW | P2 |
| Animated blob background | MEDIUM | LOW | P2 |
| Step-label progress copy (branded) | MEDIUM | LOW | P2 |
| Dock persistence (installed[]) | MEDIUM | LOW | P2 |
| ContextualPrompt z-index hardening | HIGH | LOW | P2 — easy but must not be forgotten |
| Cache-key contract versioning | MEDIUM | MEDIUM | P2 |
| Window resize handles | LOW | HIGH | P3 — defer |
| Custom themes | LOW | HIGH | P3 — defer |
| Snap / tiling WM | LOW | HIGH | P3 — anti-feature |

**Priority key:** P1 = must have for v2.0 launch · P2 = should have, add when possible · P3 = future.

---

## Existing Features: What Carries Forward vs What Changes

| Existing Feature | v2.0 Fate | Notes |
|-----------------|-----------|-------|
| Marketplace storefront grid | **Replaced** by desktop surface + always-visible create panel | Grid browsing → always-on create panel + dock for running apps |
| AppShell (full-page) | **Refactored** → content-only inside window div | Must shed full-page layout, AppBar inclusion; keep error boundary, contextual menu trigger, loading affordance |
| WidgetShell | **Unchanged** | Still renders inside AppShell content area, which is now inside a window |
| ContextualPrompt | **Unchanged logic** — **z-index hardening needed** | Must float above all windows; use z-ceiling > any `ztop` value |
| ThemeProvider (light/dark/system) | **Superseded** by named-theme system | Remove or demote the existing light/dark/system toggle; named themes take over completely |
| AppBar (existing top bar) | **Replaced** by new menu bar | New menu bar has wordmark, active-app name, theme switcher, clock |
| KeyDialog | **Carries forward** — surface via menu bar action | Key configuration must remain accessible; move trigger to menu bar or a settings icon |
| Produce path + resilience + cache (LOOP, GEN, RESIL) | **Unchanged** — wired to create panel | Core loop is untouched; create panel calls the existing producer |
| IndexedDB registry (apps/widgets/handlers stores) | **Extended** — add `preferences` store | Existing stores untouched; new `preferences` object store for `{ theme, installed[] }` |
| Delegated thin-shell + per-action handlers | **Unchanged** — works inside windows | Each app window mounts the same delegated shell; handler production still happens per-action |
| Devtools hygiene gate (CI lexicon test) | **Unchanged + extended** | New surfaces (create panel copy, window titles, CSS vars, dock labels) all pass through the same gate |

---

## Sources

- `design/VibeOS.dc.html` — complete reference implementation; all windowing, dock, menu bar, theme, create panel interactions derived directly from source code (HIGH confidence — primary reference)
- `.planning/PROJECT.md` — v2.0 milestone scope, deferred items, existing feature inventory, devtools-hygiene constraints (HIGH confidence)
- `CLAUDE.md` (project) — tech stack, constraints, hygiene rules, AppShell/WidgetShell/ContextualPrompt module map (HIGH confidence)
- Desktop windowing conventions: macOS Human Interface Guidelines, Windows UX design principles — drag/z-order/minimize/restore/dock/menu-bar behavior norms (well-established, HIGH confidence from general knowledge)

---

*Feature research for: v2.0 Vibe OS — windowing, theme system, create panel*
*Researched: 2026-06-26 · Confidence: HIGH*
