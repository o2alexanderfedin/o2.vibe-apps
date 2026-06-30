# Phase 19: Window Chrome & Menu Relocation — Context

**Gathered:** 2026-06-27
**Status:** Ready for planning
**Mode:** Autonomous (skip_discuss=true) — enriched from v3.0 research SUMMARY.md + a Google AI Mode design consult.

<domain>
## Phase Boundary

Make the **window titlebar own all host-controlled actions**: relocate the per-app `⋮` contextual menu (the MOD-01 prompt) out of the app body (`AppShell`) into the `WindowFrame` titlebar (right-aligned, opposite the traffic-lights), and add **maximize / snap / keyboard** window management. Completing this phase makes the app body a **chrome-free zone** ready to become an opaque `<iframe>` in Phase 20.

Requirements: **CHROME-01, CHROME-02, CHROME-03, CHROME-04.**

This is the hard prerequisite for Phase 20 — once the body is an opaque frame, host chrome cannot be injected into it (`createPortal` across the boundary needs `allow-same-origin`, which must never be set). The contextual menu must be host-owned **before** any body becomes a frame.
</domain>

<decisions>
## Implementation Decisions

### CHROME-01 — `⋮` relocation (design locked via Google AI Mode consult)
- **Render the `⋮` button AND `ContextualPrompt` from `WindowFrame` (the titlebar)**, holding `promptOpen` as a `useState` in `WindowFrame`. The Google AI Mode consult recommended Context+Portal to avoid re-rendering the whole window tree; for THIS codebase that isolation already exists — `WindowFrame` is per-window and the app body is a memoized `WindowBody`, so titlebar state changes do not re-render the app subtree. **KISS/YAGNI: no new context infrastructure.** Keep `createPortal(..., document.body)` as a fallback ONLY if the titlebar's `overflow` clips the popover.
- `AppShell` is reduced to a **content-only wrapper** — its header (duplicate title + `⋮` + the `hideClose`-suppressed `×`) is removed. The `onModify` prop now flows to `WindowFrame`, which already receives it. Verify `AppShell` has no remaining consumers of the removed header (grep `app-shell__header`, `app-shell__controls`).
- **MOD-01..04 must still pass from the titlebar** — remove/clone resolve client-side (no model call); tweak produces a new key. Existing tests that do `within(region).getByRole("button", { name: "App options" })` will need to target the titlebar instead — update them, do not weaken assertions.
- The titlebar `⋮` uses the existing `MoreVertical` lucide icon + `app-bar__icon-btn` styling for visual consistency.

### CHROME-02 — Maximize = zoom-to-work-area (NOT OS full-screen)
- Maximize fills the **work area** = viewport minus the menu bar (top) minus the dock (bottom). NOT the Fullscreen API (that hides the dock/menu bar that ARE the product identity — explicit anti-feature).
- `WindowEntry` gains `maximized: boolean` + a stored `restoreRect: {x,y,w,h}` (the pre-maximize geometry). Toggle via the (currently disabled) traffic-light maximize button AND double-click on the titlebar.
- While maximized, drag should un-maximize (restore) and follow the pointer (standard desktop behavior) — or simplest: disable drag while maximized for v1 of this phase; planner picks the simpler that passes the criteria.

### CHROME-03 — Snap to left/right half
- Drag a window so the pointer hits the left or right screen edge → show a translucent **drop-zone preview**; on release, snap the window to that half of the work area. Also `Ctrl+Left` / `Ctrl+Right` snap the active window without dragging.
- Snapped geometry is computed from the work area (same model as maximize). Quarter/corner snap is **deferred to v3.1** (CHROME-F1) — half only.

### CHROME-04 — Keyboard shortcuts
- `Cmd/Ctrl+W` closes the active window; `Cmd/Ctrl+M` minimizes it. **Both call `preventDefault()`** so the browser tab is never closed — and the close/minimize only fire when a Vibe OS window is active (not when focus is in a browser chrome element). A test asserts `event.defaultPrevented === true`.
- Listener lives in `DesktopShell` (it already owns the window-manager). Active-window tracking already exists (z-order top / focused entry).

### Cross-cutting (every v3.0 phase)
- Zero new npm deps. `tsc` 0. Build clean (no source maps). Hygiene + CSP gates green. IoC/DI preserved. **The words "iframe/sandbox/isolation" must not appear in any UI copy** (HYGIENE-07 lands in P20 but the lexicon discipline applies now).
- All **727 existing tests stay green** — this is a refactor + additive features, not a behavior change to the produce loop.
</decisions>

<code_context>
## Existing Code Insights (from direct inspection)

- `src/ui/WindowFrame.tsx` — titlebar = `window-chrome__titlebar` with `window-chrome__traffic-lights` (close/min/**max disabled**) + `window-chrome__title-group` (icon + title). Body = `window-chrome__body` → memoized `WindowBody` → `AppShell` → `ErrorBoundary` → `<Component/>`. `WindowBody` is passed `hideClose={true}`. Drag via `useDrag` (setPointerCapture + rAF; commit on pointerup via `onMove`). Position is `transform: translate(x,y)`; z via `zIndex`.
- `src/ui/AppShell.tsx` — renders `app-shell__header` (title + `app-shell__controls`: the `⋮` "App options" button [`MoreVertical`, opens `ContextualPrompt`] + an optional `×` suppressed by `hideClose`). Holds `promptOpen` useState + renders `ContextualPrompt` on open; `onModify` fires on apply. **This header is what moves to the titlebar; AppShell becomes content-only.**
- `src/ui/ContextualPrompt.tsx` — the popover (targetName + free-form instruction + Apply/Cancel). Reused as-is; just re-parented to `WindowFrame`.
- `src/ui/useWindowManager.tsx` — `WindowEntry[]` + module-level `zTop`; `open/focus/minimize/restore/close`. Add `maximized` + `restoreRect` + snap geometry here.
- `src/ui/DesktopShell.tsx` — root; owns the window manager + dock + menu bar. Keyboard listener goes here. Work-area geometry (menu bar height, dock height) is derivable from the existing layout constants.
- Tests referencing the `⋮`: `AppShell.test.tsx`, `DesktopShell.test.tsx:208`, `MarketplaceModify.test.tsx:53,78`, `MarketplaceWindows.test.tsx:314`, `WindowFrame.test.tsx:92`. All must be updated to find the `⋮` in the titlebar and keep passing.
</code_context>

<specifics>
## Specific Ideas / Acceptance gates (from ROADMAP success criteria)

1. `⋮` in the titlebar triggers the contextual prompt; the in-body app-shell header is gone; MOD-01..04 all pass from the titlebar.
2. Double-click titlebar zooms the window to the work area (not OS full-screen); double-click again restores the prior geometry.
3. Drag to a screen edge shows a drop-zone preview; release snaps to that half; `Ctrl+Left/Right` snaps the active window without a drag.
4. `Cmd/Ctrl+W` closes, `Cmd/Ctrl+M` minimizes — browser tab never closed; a test asserts `event.defaultPrevented`.
5. All 727 prior tests green; hygiene gate passes; zero new runtime deps; `tsc` 0; build emits no source maps.
</specifics>

<deferred>
## Deferred Ideas
- Quarter/corner snap (CHROME-F1) → v3.1.
- Keyboard window-cycle `Cmd+`` ` (CHROME-F2) → v3.1.
- Animated maximize/snap transitions — nice-to-have, not required for the criteria.
</deferred>
