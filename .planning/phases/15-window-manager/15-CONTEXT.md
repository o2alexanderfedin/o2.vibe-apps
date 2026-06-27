# Phase 15: Window Manager - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Autonomous (grey areas resolved with noted defaults; research-grounded). HIGHEST regression risk — touches the render path.

<domain>
## Phase Boundary

Apps open as **independently draggable glass windows**, several concurrently, each in its own React root, with z-order / focus / minimize / close lifecycle owned by a single hook — and **no React-root leaks** on close. Requirements: **WIN-01..05**.

**In scope:** `useDrag`, `useWindowManager`, `WindowFrame` (glass chrome + traffic-light titlebar wrapping the app), and rewiring "open app" to open a window. **Out of scope this phase:** the themed wallpaper, the dock, and the menu bar (Phase 16); the search/launcher panel (Phase 17). Phase 15 renders windows on a **minimal positioned desktop container**; Phase 16 turns that container into the full themed desktop with dock + menu bar.
</domain>

<decisions>
## Implementation Decisions (auto-resolved — KISS/research-grounded; override if you disagree)

1. **Open flow → windowed.** Replace today's single-app open with opening the app inside a draggable `WindowFrame` on a minimal absolutely-positioned desktop container. Clicking multiple storefront cards opens multiple concurrent windows (each its own `mountApp` instance). This is the testable path NOW, before the dock/desktop exist.
2. **`useDrag` hook** (~60 lines): `pointerdown` on the titlebar handle → `setPointerCapture(e.pointerId)` on the handle + `user-select:none` on the desktop root; `pointermove` → write position imperatively via `requestAnimationFrame` (`style.left/top` or `transform`); **commit final x/y to React state only on `pointerup`** (avoid 60fps reconciliation thrash). Clamp to viewport bounds. Release pointer capture on `pointerup`. (Research Pitfalls 1, 2.)
3. **`useWindowManager`** owns `WindowEntry[]` `{ id, instanceId, appType, title, icon, x, y, z, minimized }` in React state, parallel to `mount.ts`'s roots Map on the same `instanceId`. A module-level `let zTop = 200` increments on focus. API: `open(appType, meta)` (cascade-place + clamp), `focus(id)` (raise z + mark active), `minimize(id)`, `restore(id)`, `close(id)`. One hook/context — the single source of window truth.
4. **`WindowFrame`**: glass chrome (uses Phase 14 theme vars `--glass`/`--glass2`/`--bord`/`--hi`/`--text`) + macOS traffic-light titlebar (red=close, amber=minimize, green=decorative), app icon + title; a **body container ref** into which the app mounts via `mountApp(instanceId, ref, Component)` in a `useEffect`; on close/unmount → `unmountApp(instanceId)`. The existing **`AppShell` + its contextual prompt (MOD-01..04) render as the window's content** — `WindowFrame` is the outer draggable frame; do NOT break the contextual-prompt wiring.
5. **Close = zero leak** (Research Pitfall 8): `close(id)` routes through the manager → `unmountApp(instanceId)` → drop the entry. Test asserts `mountedCount()` returns to the pre-open baseline and no timers/listeners survive. Three-step teardown (evict state → unmount root → remove entry) if ordering matters.
6. **Mid-flight produce on close** (Research Pitfall 9): if a window is closed while its app is still being produced (cache miss in flight), guard the eventual `mountApp` against the now-closed instance (a "closed" check, or an `AbortController` if cheap) so no orphan root mounts. Best-effort cancel; the invariant is **no leaked root**.
7. **Z-index / stacking** (Research Pitfalls 3, 8): the desktop/window container uses `isolation: isolate`; windows are absolutely positioned within it; z is bounded by the `zTop` counter (not arbitrary large numbers).
8. **Focus vs input** (Research Pitfall 12): raise-to-front on `pointerdown` on the titlebar (and window body), but do NOT `preventDefault` on the window body or app inputs — only on the drag handle — so an app's `<input>` keeps focus/caret while typing.
9. **Minimize** = `display:none` on the window (Research Pitfall 4 — minimized windows must not composite). Phase 15 delivers the minimize/restore **mechanism** (manager API + state); the **dock UI** that triggers restore lands in Phase 16. For Phase 15 testability, expose `restore(id)` via the manager (covered by tests) and a minimal temporary restore affordance if needed.
10. **Cascade placement**: new windows offset down-right from the previous, clamped so they stay fully in-viewport (mirror the design's `openApp` placement math).

</decisions>

<code_context>
## Existing Code Insights (scouted)

- `src/execution/mount.ts` — roots `Map<instanceId, Root>`; `mountApp(instanceId, container, Component)` (createRoot once per id, wraps in `ErrorBoundary`), `unmountApp(instanceId)`, `isMounted(id)`, `mountedCount()`, `unmountAll()`. **This is the window lifecycle seam** — WindowFrame mounts into its body via `mountApp`, close calls `unmountApp`; `mountedCount()` is the leak assertion.
- `src/ui/AppShell.tsx` — current app frame + contextual menu (MOD-01..04). Render it as window content; keep its wiring intact.
- The current "open one app" flow (App.tsx / Marketplace / loader) — find where a card click currently resolves+mounts an app and rewire it to `useWindowManager.open(...)`. The loader/produce path is unchanged; only the *mount target* becomes a WindowFrame body.
- Phase 14 theme vars (`--glass`, `--bord`, `--hi`, `--text`, `--accentA/B`) are live on `document.documentElement` — WindowFrame chrome references them so windows are themed and re-skin.

</code_context>

<specifics>
## Specific Ideas / Acceptance

- Multiple apps open concurrently as independent windows; state isolated between them.
- Drag a window by its titlebar across the desktop AND across another window's content area — tracks cleanly, no stick, no text-selection, no frame drops; clamps at viewport edges.
- Click raises to front (z-order); new windows cascade-place.
- Minimize hides the window (display:none); restore (via API/temp affordance now, dock in P16) brings it back with app state intact.
- Close → `mountedCount()` returns to baseline; no surviving timers/listeners; re-open creates a fresh root with no `createRoot` warning.
- Closing a window mid-produce leaks no root.
- All existing tests stay green (570); `tsc` 0; build clean (no source maps); hygiene gate green (neutral names — `.window-*`/`useWindowManager`/etc., no banned tokens). TDD with real fixtures; IoC/DI preserved.

</specifics>

<deferred>
## Deferred Ideas

- Themed wallpaper / animated blobs, the dock (incl. the restore-on-dock-click UI), and the menu bar (Phase 16).
- Window resize, maximize, snap/tiling (Out of Scope — cut).
- Window-position persistence across reloads (Future Requirements).
- Search/launcher panel (Phase 17).

</deferred>
