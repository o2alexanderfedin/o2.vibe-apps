# Feature Research

**Domain:** Browser-based desktop OS / generative app platform (v3.0 Trusted Desktop milestone)
**Researched:** 2026-06-26
**Confidence:** HIGH

---

## Scope

This document covers only the **four new v3.0 pillars**. Everything shipped in v1.x and v2.0 is out of scope. The four pillars are:

1. **Window UX & chrome** — `⋮` menu into titlebar, maximize/snap/tile, keyboard shortcuts, focus management
2. **Security: `<iframe sandbox>` isolation** — opaque-origin frame per app, postMessage brokering
3. **Desktop persistence** — window geometry / z-order / open-app set / last theme across reloads
4. **Theme editor / custom themes** — create / name / edit / save over the 12-var contract

The devtools-hygiene hard rule (never name the mechanic) and zero-new-dependency bias remain in force across all four.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Depends On (existing) | Notes |
|---------|--------------|------------|----------------------|-------|
| **`⋮` menu in titlebar (right-aligned)** | Every windowed OS puts overflow/contextual menus in chrome, not in app body; toolbar row feels foreign in a window frame | LOW | `WindowFrame` traffic-light titlebar (WIN-01), `ContextualPrompt` (MOD-01) | Hard prerequisite for iframe isolation — once the body is an opaque frame, the menu MUST live in host-owned chrome. Drop the in-body app-shell header after relocation. |
| **Maximize / unmaximize toggle** | Green/expand button is universally understood; users expect a window to fill the desktop work area without going full-screen (macOS "zoom" ≠ full-screen) | LOW | `useWindowManager`, `useDrag`, `WindowFrame` (WIN-01/03) | Fills the area between menu bar and dock (viewport minus the two chrome strips). Option+green in macOS goes "zoom-not-fullscreen"; replicate that semantic: expand to work area, not OS-level full-screen. No true full-screen (tab / menu bar hidden) for v3 — that breaks the desktop chrome and is out of scope. |
| **Snap to half (left / right edge drag)** | Windows 11 and macOS 15+ have trained users to drag to an edge → half-fill. Absence is noticed. | MEDIUM | `useDrag` (WIN-03), viewport geometry | Show a translucent drop-zone preview while dragging near an edge. Snap left = left 50% of work area; snap right = right 50%. Keyboard variant: dedicated shortcut. No Snap Assist cascade (filling the other pane) for v3 — differentiator, not table stakes. |
| **Cmd/Ctrl+W closes active window** | Universal browser + macOS shortcut; users press it reflexively | LOW | `useWindowManager` `close()`, active window tracking | Also prevents default browser tab close (must `e.preventDefault()`). |
| **Cmd/Ctrl+M minimizes active window** | Standard macOS shortcut; dock running dot already ships (WIN-04) | LOW | `useWindowManager` `minimize()` | |
| **Window focus on click** | Click anywhere on a window raises it (z-order) | LOW | `useWindowManager` z-order (WIN-03) | Already partially built; verify the frame boundary doesn't swallow the pointer event once iframe lands. |
| **Desktop state survives reload** | Users expect the desktop to look the same after refresh, just like a native OS | MEDIUM | IDB `settings` store (THEME-03), `useWindowManager`, `idb` (LOOP-03) | Persist: window geometry (x, y, w, h), z-order rank, minimized flag, the open-app-type set. Restore on mount in `useWindowManager` before first paint. |
| **Active theme survives reload** | Already partially shipped (THEME-03) but geometry is not; both must persist together for the reload to feel complete | LOW | `settings` IDB store, FOUC-safe script (THEME-03) | Theme persistence is done; wire geometry to the same store. |
| **Theme name + save** | Any theme editor without save is a toy; users expect to name and keep their work | LOW | IDB `settings` store, `ThemeSelector` (THEME-01) | Name field + save button; no save = no custom theme. |
| **Live preview while editing** | Every modern theme tool (shadcn/tweakcn/VS Code) updates the UI in real time as colors change; a separate "apply" step feels broken | LOW | `VibeThemeProvider`, CSS custom properties on `:root` (THEME-04) | Mutate the 12 vars directly on `document.documentElement` as sliders/pickers move. No batch-apply step. |
| **Duplicate a built-in theme as starting point** | Users never start from blank; they tweak an existing theme. Every theme editor offers a "duplicate" or "fork" action. | LOW | 4 built-in themes (THEME-01), IDB `settings` | Duplicate → enter edit mode for the copy. The 4 built-ins remain read-only. |
| **Delete a custom theme** | Users expect CRUD; create without delete is incomplete | LOW | IDB `settings` | Guard: cannot delete if it is the active theme (auto-switch to a built-in first). |

### Differentiators (Competitive Advantage)

Features that set the product apart or add meaningful value beyond expectations.

| Feature | Value Proposition | Complexity | Depends On | Notes |
|---------|-------------------|------------|------------|-------|
| **Snap to quarter (corner drag)** | Windows 11 trains users to drag to corners for quadrant placement; power users appreciate it | LOW (delta from half-snap) | Half-snap already built | Drag to corner → drop zone covers a viewport quadrant. Keyboard: maximize → snap-left → snap to top-left quadrant via modifier. Add only after half-snap ships and is stable. |
| **Keyboard window cycle (Cmd+` / Cmd+Tab within desktop)** | macOS Command+Grave cycles within-app windows; desktop users expect it in a multi-window environment | MEDIUM | Active window tracking, `useWindowManager` | Cmd+Tab at the browser level hijacks the browser's own app-switch; use Cmd+` (grave) to cycle windows within the Vibe desktop. Intercept at the `DesktopShell` `keydown` listener. |
| **Theme export / import (JSON)** | Lets users back up, share, and port themes across browser profiles; no server required | LOW | IDB `settings`, JSON serialization of 12 vars | Export = download a `<name>.json` blob. Import = file picker → validate 12-var schema → save to IDB. Validation prevents malformed imports from breaking the theme contract. |
| **Contained app misbehavior (sandbox)** | A misbehaving app can no longer freeze the tab or access the API key; each frame is process-isolated in modern browsers | HIGH | `WindowFrame`, `execution/instantiate.ts`, `execution/mount.ts`, postMessage broker | The user sees no difference on the happy path. The differentiator is the absence of breakage (tab freeze, key theft) that users would otherwise blame on the platform. Invisible = correctly implemented. |
| **Theme vars re-injected per frame** | Generated apps inside sandboxed iframes keep the current theme; switching themes re-skins all frames live | MEDIUM (delta from sandbox work) | Sandboxed iframe broker, `VibeThemeProvider`, THEME-02 | Parent listens for `theme-change`, posts updated CSS vars to each frame. Frame applies them to its local `:root`. Must happen automatically — no user action required. |
| **Contextual menu (`⋮`) works across frame boundary** | Tweak / clone / remove still work after isolation; user never notices the architectural change | MEDIUM | Titlebar `⋮` (prerequisite), postMessage broker | The menu is host-owned (titlebar). Only the app body is in the frame. No cross-frame coordination needed for the menu itself — the move to titlebar is what makes this work. |

### Anti-Features (Explicitly Avoid)

Features that seem good but create scope creep, maintenance cost, or UX harm in this specific context.

| Feature | Why Requested | Why Avoid | What to Do Instead |
|---------|---------------|-----------|-------------------|
| **True OS-level full-screen** (hides menu bar + dock) | Green button on macOS does this by default | Destroys the desktop chrome (menu bar, dock, titlebar) that is the product's identity; requires exiting full-screen to use any other app; disorienting in a browser tab context | Maximize-to-work-area (fills space between menu bar and dock). That is the correct semantic for this desktop. |
| **Snap Assist cascade** (fill the other half with a suggested window) | Windows 11 ships it; feels "complete" | Requires tracking spatial relationships between windows; significant state complexity; rarely used in practice by most users | Let the user drag a second window to the other half manually. Simpler and sufficient. |
| **Color theory / HSL wheel / palette generation** | "Smart" theme tools generate harmonious palettes | 12 vars already have clear semantic roles (brand, accent, glass, wall); color theory tools obscure the mapping and confuse non-designers; the contract is small enough that direct editing is intuitive | Expose the 12 vars directly as labeled color pickers with plain names ("Accent color", "Window glass tint", etc.). No OKLab/harmonics. |
| **Theme gallery / community sharing** | Theme sharing feels social | Requires a server, user accounts, or CDN — all forbidden by the zero-infra constraint | Export/import JSON is the sharing primitive. Users can share `.json` files outside the platform. |
| **Per-window theme** | Power-user request in customization tools | The 12-var contract is global; per-window theming would require per-frame overrides and breaks the coherent OS aesthetic | One active theme, platform-wide. |
| **Undo/redo in theme editor** | Standard in design tools | A theme editor with 12 color pickers has low edit cost; undo is a significant implementation burden for negligible UX gain in this scope | Duplicate-before-edit workflow: duplicate the theme, edit the copy. The original is always preserved. |
| **Window layout presets / named workspaces** | Power-user feature in tiling WMs | Out of scope for a 4-pillar milestone; adds significant state management complexity | Single "restore last layout" from persistence. Named workspaces are a v4+ consideration. |
| **Transparent / iframe-visible security messaging** | Tempting to show "this app runs in a secure sandbox" badge | Naming the mechanic, even obliquely (security = something to hide from?), breaks the illusion. Users don't care about isolation details; they care that apps work. | Sandbox is completely invisible on the happy path. Errors from contained apps surface as the existing error boundary UI, not as "sandbox violation" messages. |
| **Persist in-app state (scroll position, form values)** | Some desktop restore tools save this | In-app state is ephemeral and app-specific; generated apps have no stable state-serialization contract; restoring stale in-app state is often confusing (stale form = user re-types) | Restore the window frame (position / size / which app), not the app's internal state. Apps re-initialize fresh. |

---

## Feature Dependencies

```
[Titlebar ⋮ menu]
    └──prerequisite-for──> [iframe sandbox isolation]
                               └──enables──> [Theme re-injection per frame]
                               └──enables──> [Contextual menu across frame boundary]

[Desktop persistence]
    └──requires──> [IDB settings store] (already exists, THEME-03)
    └──requires──> [useWindowManager] (already exists, WIN-01..05)
    └──enhances──> [Open-app set restore] (new: must know which apps were open)

[Theme editor]
    └──requires──> [IDB settings store] (already exists)
    └──requires──> [VibeThemeProvider + 12-var contract] (already exists, THEME-04)
    └──extends──> [ThemeSelector] (add "custom themes" section to existing switcher)
    └──enables──> [Theme export/import] (JSON blob over the same 12 vars)

[Maximize]
    └──requires──> [useWindowManager] (already exists)
    └──conflicts-with──> [True full-screen] (excluded — anti-feature)

[Snap to half]
    └──requires──> [useDrag] (already exists, WIN-03)
    └──requires──> [Maximize geometry model] (same geometry tracking)
    └──enhances-to──> [Snap to quarter] (differentiator, add after half-snap)

[Keyboard shortcuts]
    └──requires──> [Active window tracking] (already exists in useWindowManager)
    └──requires──> [Titlebar ⋮ menu] (Cmd+W must target a known active window)
```

### Dependency Notes

- **Titlebar `⋮` requires completion before iframe work begins.** Once the app body is an opaque frame, there is no path to inject a menu from within it. The move to host-owned titlebar chrome is the prerequisite, not a parallel track.
- **Desktop persistence is independent of iframe.** It can be built in parallel with or after iframe work; it shares only the `settings` IDB store that already exists.
- **Theme editor is independent of iframe and persistence.** It extends the existing `VibeThemeProvider` and `settings` IDB store. Can be the last pillar.
- **Snap and maximize share geometry state.** Both write to the same `windowState.geometry` record. Build maximize first (simpler), then extend with snap zones.

---

## MVP Definition for v3.0

### Must Ship (v3.0 launch criteria)

- [ ] **Titlebar `⋮` menu (right-aligned)** — prerequisite for the entire milestone; unblocks iframe
- [ ] **Maximize / unmaximize** — table stakes; lowest complexity in window chrome
- [ ] **Snap to left/right half** — table stakes for a desktop-class window manager
- [ ] **Cmd+W close / Cmd+M minimize** — table stakes; expected reflexively
- [ ] **`<iframe sandbox="allow-scripts">` per app body** — the core security milestone (HARD-01); key never in frame; postMessage broker for data / handler / modify calls; theme vars re-injected
- [ ] **Window geometry + open-app set persistence** — reload restores the desktop; table stakes for a desktop OS
- [ ] **Theme name + save + duplicate-from-built-in + delete** — minimum viable theme editor; without save, there is no theme editor
- [ ] **Live preview in theme editor** — without this, the editor is unusable; zero-cost given CSS vars on `:root`

### Add After v3.0 Ships (v3.1 candidates)

- [ ] **Snap to quarter (corner drag)** — power-user differentiator; low delta cost after half-snap
- [ ] **Keyboard window cycle (Cmd+`)** — differentiator; moderate complexity in key capture
- [ ] **Theme export / import (JSON)** — differentiator; low complexity; enables sharing without a server

### Defer to v4+ (Out of v3 scope)

- [ ] **Named workspaces / layout presets** — significant state management; not validated by users yet
- [ ] **True OS full-screen** — anti-feature for this product shape; excluded permanently
- [ ] **Color theory palette generation in theme editor** — anti-feature; over-complicates a 12-var contract

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Titlebar `⋮` menu | HIGH (prerequisite) | LOW | P1 |
| Maximize / unmaximize | HIGH | LOW | P1 |
| Snap to half (left/right) | HIGH | MEDIUM | P1 |
| Cmd+W / Cmd+M shortcuts | HIGH | LOW | P1 |
| iframe sandbox isolation | HIGH (security) | HIGH | P1 |
| Theme re-injection per frame | HIGH (correctness) | MEDIUM | P1 (part of iframe) |
| Window geometry persistence | HIGH | MEDIUM | P1 |
| Open-app set persistence | HIGH | LOW (delta) | P1 |
| Theme name + save + duplicate + delete | HIGH | LOW | P1 |
| Live preview in theme editor | HIGH | LOW | P1 |
| Snap to quarter (corners) | MEDIUM | LOW (delta) | P2 |
| Keyboard window cycle (Cmd+`) | MEDIUM | MEDIUM | P2 |
| Theme export / import JSON | MEDIUM | LOW | P2 |
| Snap Assist cascade | LOW | HIGH | P3 (anti-feature, skip) |
| Per-window theme | LOW | HIGH | P3 (anti-feature, skip) |
| OS-level full-screen | LOW | MEDIUM | P3 (anti-feature, skip) |

**Priority key:**
- P1: Ships in v3.0
- P2: v3.1 candidates after v3.0 validates
- P3: Anti-features or deferred to v4+

---

## Behavioral Specification Notes

### (a) Window Chrome

- **`⋮` placement:** Right side of titlebar, after the traffic lights and title. Tap → popover (same `ContextualPrompt` UI, re-parented). Remove the in-body app-shell header entirely after relocation — it is redundant and occupies app real estate.
- **Maximize semantics:** Fill the work area (viewport minus menu bar height minus dock height). Toggle: maximize → restore to pre-maximize geometry. NOT OS-level full-screen. Double-click on titlebar = same as clicking maximize button (macOS convention).
- **Snap semantics:** Drag window to left/right viewport edge (within ~40px) → show translucent drop-zone preview covering half the work area → release → snap. Snap stores the geometry so restore also restores snapped state. Keyboard alternative for snap: a shortcut cycles through left-half / right-half / restore (e.g., Ctrl+Left / Ctrl+Right).
- **Keyboard shortcuts — table stakes:** Cmd+W (Mac) / Ctrl+W (Win/Linux) closes the active window. Cmd+M / Ctrl+M minimizes. Both must `preventDefault()` to not close the browser tab.
- **Focus:** Clicking any part of a window raises it. With iframe: the `pointerdown` on the frame's container div (host-owned) must trigger raise; the iframe interior cannot bubble DOM events to the parent by default — handle by listening on the host-side frame wrapper, not on the iframe itself.

### (b) Desktop Persistence

- **What to persist (IDB `settings` store, keyed by `'desktop-layout'`):**
  - `windows[]`: array of `{ appType, x, y, width, height, zIndex, minimized }` in z-order
  - `activeTheme`: already persists (THEME-03); confirm it is written on every switch
  - Nothing else — notably NOT in-app state (scroll, form values, widget sub-state)
- **What NOT to persist:**
  - In-app scrolll positions and form values (ephemeral, app-specific, no stable contract)
  - Window `title` strings (re-derived from `appType` on restore)
  - Error states, loading states (apps re-initialize)
- **Cold start vs. restore UX:**
  - **No saved layout:** Open storefront or a default single window (current behavior)
  - **Saved layout:** Restore windows in z-order before first paint; mount each app in `WindowFrame` immediately so the desktop appears populated. Apps that need production on cache miss show the neutral loading affordance normally — the frame is there, the content loads.
  - **Stale app types (an app type removed from registry):** Skip silently — don't restore that window. Log internally (no visible error).
- **Save trigger:** Debounced write on any geometry change (drag end, resize end, minimize, close, open). Not on every pointer move.

### (c) Theme Editor

- **Access:** A new entry in the `ThemeSelector` menu — "Edit themes..." or a pencil icon — opens the theme editor panel/modal. Do not make it a separate route.
- **Controls per theme (12 vars):** Labeled color pickers for each semantic var. Plain language labels: "Brand color", "Accent color", "Window glass tint", "Background / wallpaper tone", etc. No OKLab wheels, no palette generation, no harmony suggestions.
- **Live preview:** Every color change mutates the corresponding CSS custom property on `document.documentElement` immediately. No "Apply" button needed. If the user discards (Cancel), revert to the previous values.
- **Name + save:** A required text field for the theme name. Save writes to `settings` IDB. Built-in four (Aurora / Aero / Aqua / Noir) are read-only in the editor — the "Edit" action on a built-in is "Duplicate first".
- **Duplicate:** "Duplicate" clones the current theme's 12 vars into a new custom theme with the name "Copy of [original]" → immediately enters edit mode for the new copy.
- **Delete:** Trash icon on custom themes only. If the theme being deleted is active, switch to Aurora (the default) before deletion. Confirm dialog before delete.
- **Export / import (v3.1, not v3.0):** Out of MVP scope; designed so the IDB record is already a clean `{ name, vars: Record<string, string> }` object that trivially serializes to JSON.

### (d) Sandbox Isolation (Visible Behavioral Delta)

- **On the happy path, users see nothing different.** Apps load, render, and interact identically. This is correct behavior.
- **What changes user-visibly:**
  - A misbehaving app (infinite loop, `alert()`, `document.write()`) is contained to its frame. The rest of the desktop remains usable. Previously the whole tab could freeze.
  - `alert()` / `confirm()` / `prompt()` calls inside a sandboxed frame without `allow-modals` are silently suppressed — the app may behave unexpectedly if it relied on them, but the desktop is not blocked. (Generated apps should not use these; the generation prompt must specify this.)
  - The `⋮` contextual menu (tweak / clone / remove) continues to work because it lives in the host-owned titlebar, not in the frame.
  - Theme switching re-skins the app live — vars are re-posted to each frame on theme change.
- **What users MUST NOT see:**
  - Any message referencing "sandbox", "iframe", "isolation", or the mechanic. Error boundaries use the same neutral UI as today.
  - Latency regression: the iframe communication (postMessage) for data / handler broker must be fast enough to be imperceptible on cache hits. Cache hits remain O(1) — the compiled string is already in the session Map; only instantiation and mount are inside the frame.

---

## Sources

- Apple Human Interface Guidelines — Context Menus: https://developer.apple.com/design/human-interface-guidelines/components/menus-and-actions/context-menus/
- Apple Support — Mac keyboard shortcuts (Cmd+W, Cmd+M, Cmd+`): https://support.apple.com/en-us/102650
- Apple Support — Move and arrange app windows on Mac: https://support.apple.com/guide/mac-help/work-with-app-windows-mchlp2469/mac
- OS X Daily — Maximize & Zoom vs Full Screen: https://osxdaily.com/2014/10/28/maximize-zoom-windows-os-x-mac/
- Microsoft Support — Snap Your Windows (half / quarter snap zones, visual preview): https://support.microsoft.com/en-us/windows/snap-your-windows-885a9b1e-a983-a3b1-16cd-c531795e6241
- Windows Forum — Master Window Management in Windows 11 (snap layouts, keyboard shortcuts): https://windowsforum.com/threads/master-window-management-in-windows-11-minimize-maximize-snap-and-fancyzones.386259/
- MDN Web Docs — `<iframe>` sandbox attribute: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- Medium — Building a Secure Code Sandbox (iframe isolation + postMessage patterns): https://medium.com/@muyiwamighty/building-a-secure-code-sandbox-what-i-learned-about-iframe-isolation-and-postmessage-a6e1c45966df
- tweakcn — Theme editor live preview reference (shadcn/ui): https://tweakcn.com/
- Shadcn Studio — Theme generator (live CSS var editing): https://shadcnstudio.com/theme-generator
- PersistentWindows / Linux Window Session Manager — session restore patterns: https://github.com/kangyu-california/PersistentWindows/blob/master/Help.md
- Mozilla Bugzilla — session restore z-order and window ordering issues: https://bugzilla.mozilla.org/show_bug.cgi?id=346301
- Vibe App Store PROJECT.md — v2.0 shipped features and v3.0 active requirements (primary source)

---

*Feature research for: Vibe App Store v3.0 Trusted Desktop milestone*
*Researched: 2026-06-26*
