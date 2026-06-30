---
phase: 19-window-chrome-menu-relocation
plan: 03
type: execute
wave: 3
depends_on: [19-02-maximize-work-area]
files_modified:
  - src/ui/useWindowManager.tsx
  - src/ui/useWindowManager.test.tsx
  - src/ui/DesktopShell.tsx
  - src/ui/DesktopShell.test.tsx
  - src/index.css
autonomous: true
requirements: [CHROME-03]
must_haves:
  truths:
    - "Dragging a window so the pointer reaches the left or right screen edge shows a translucent drop-zone preview"
    - "Releasing the drag at the edge snaps the window to that half of the work area"
    - "Ctrl+Left snaps the active window to the left half; Ctrl+Right snaps it to the right half — without a drag"
    - "Snapped geometry is computed from the work area (same model as maximize), not the full viewport"
  artifacts:
    - path: "src/ui/useWindowManager.tsx"
      provides: "snapLeft/snapRight (or a generic setRect) on the manager that records the snapped rect + side"
      contains: "snap"
    - path: "src/ui/DesktopShell.tsx"
      provides: "snap drop-zone overlay state + edge-detection at drag commit + Ctrl+Left/Right keyboard snap"
      contains: "snapPreview"
    - path: "src/index.css"
      provides: ".desktop-snap-preview translucent drop-zone overlay styles (left + right halves)"
      contains: "desktop-snap-preview"
  key_links:
    - from: "src/ui/DesktopShell.tsx drag-commit onMove edge check"
      to: "useWindowManager.snapLeft/snapRight"
      via: "pointer-x within SNAP_THRESHOLD of an edge at commit triggers a snap instead of a normal position set"
      pattern: "SNAP_THRESHOLD"
    - from: "src/ui/DesktopShell.tsx Ctrl+Left/Right keydown"
      to: "useWindowManager.snapLeft/snapRight on activeId()"
      via: "keyboard handler snaps the active window without a drag"
      pattern: "Ctrl|ctrlKey"
---

<objective>
Add snap-to-left/right-half. Dragging a window so the pointer hits the left or right screen edge shows a translucent drop-zone preview; on release the window snaps to that half of the work area. `Ctrl+Left` / `Ctrl+Right` snap the active window without dragging. Snapped geometry is computed from the work area (same model as maximize).

Purpose: CHROME-03 — first-class window tiling. Quarter/corner snap is DEFERRED to v3.1 (CHROME-F1) — HALF ONLY in this phase.
Output: snap manager ops + snapped-rect state; a drop-zone overlay + edge detection at drag commit + Ctrl+Left/Right keyboard snap in DesktopShell; `.desktop-snap-preview` CSS.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-window-chrome-menu-relocation/19-CONTEXT.md
@.planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md
@.planning/phases/19-window-chrome-menu-relocation/19-02-SUMMARY.md

<interfaces>
<!-- Source-of-truth excerpts. Plan 02 (maximize) is a hard dependency — its workArea() and the
     maximized-rect-applied-to-frame mechanism already exist. Reuse them. -->

From Plan 02 (already shipped): DesktopShell has `workArea()` returning `{ x, y, w, h }` = viewport minus menu bar minus dock, and a mechanism to apply an explicit rect (w/h) to a WindowFrame's style. A snapped window uses the SAME rect-application path — a left snap is `{ x: wa.x, y: wa.y, w: wa.w/2, h: wa.h }`, a right snap is `{ x: wa.x + wa.w/2, y: wa.y, w: wa.w/2, h: wa.h }`.

useWindowManager.tsx (post Plan 02): WindowEntry already has `maximized` + `restoreRect`. For snap, the SIMPLEST model per 19-PATTERNS.md is to store the snapped rect ON the entry and a `snapSide: "left" | "right" | null` marker so DesktopShell knows to apply a half-rect (and so a future drag clears it). Add `snapSide` to WindowEntry (default null in open()). Add `snapLeft(id)` / `snapRight(id)` callbacks that set `snapSide` and capture `restoreRect` from current x/y (so a later un-snap could restore — mirrors maximize). z-mint-outside-updater rule applies if the snap raises the window.
  ALTERNATIVELY a generic `setRect(id, {x,y,w,h})` could carry both maximize and snap, but CONTEXT.md/19-PATTERNS.md name snapLeft/snapRight explicitly — prefer the named ops for test clarity and Ctrl+Left/Right symmetry.

DesktopShell.tsx drag-commit seam: the WindowFrame onMove callback (DesktopShell lines 489-493) fires once on pointer-up with the committed (x,y). 19-PATTERNS.md "Snap integration in useDrag" shows the edge check at commit: if the committed x <= SNAP_THRESHOLD → snapLeft; if x + DEFAULT_W >= window.innerWidth - SNAP_THRESHOLD → snapRight; else the normal setPositions. Pick a SNAP_THRESHOLD (e.g. 20px). The drop-zone PREVIEW (shown DURING the drag, before release) needs a live pointer signal — useDrag currently only reports onCommit. Add a minimal `onEdge?: (side: "left" | "right" | null) => void` callback to useDrag that fires during the rAF move loop when the pointer crosses/leaves the threshold, and drive a `snapPreview` useState in DesktopShellInner from it. (useDrag.ts is in this plan's file set ONLY if you choose this approach — if you instead derive the preview from the WindowFrame's own pointermove without touching useDrag, keep useDrag.ts out of the diff. Either is acceptable; the criterion is a visible translucent preview during the drag.)
  NOTE: if you DO modify useDrag.ts, add it to files_modified in the SUMMARY and keep its existing onCommit contract unchanged so the 727 drag tests stay green.

Keyboard: a keydown listener (Plan 04 adds Cmd/Ctrl+W/M; this plan adds Ctrl+Left/Right). To avoid two competing global listeners on the same surface, COORDINATE: either (a) land Ctrl+Left/Right in the SAME listener Plan 04 introduces (Plan 04 is wave 4, AFTER this plan — so this plan introduces the listener and Plan 04 extends it), or (b) this plan introduces its own keydown effect for Ctrl+Left/Right and Plan 04 adds Cmd/Ctrl+W/M to it. Choose (b): introduce the keydown effect HERE (Ctrl+Left/Right only), and Plan 04 will extend the SAME effect. Use the matchMedia useEffect (DesktopShell lines 426-439) as the listener-lifecycle template; read the active window via `windowManager.activeId()` (added in Plan 02) and the windowManagerRef.current stale-closure guard (DesktopShell lines 159-160).

Snap geometry uses work-area HALVES — never the full viewport (the dock + menu bar stay visible, same as maximize).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED+GREEN — snapSide on WindowEntry + snapLeft/snapRight in the manager</name>
  <files>src/ui/useWindowManager.tsx, src/ui/useWindowManager.test.tsx</files>
  <read_first>
    - src/ui/useWindowManager.tsx (full file — post Plan 02: maximized/restoreRect/activeId already present; WindowEntry, open(), the z-mint rule)
    - src/ui/useWindowManager.test.tsx (the maximize/activeId cases from Plan 02 — mirror their harness)
    - .planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md (the "snapLeft / snapRight" excerpt + the z-mint-outside-updater shared pattern)
    - .planning/phases/19-window-chrome-menu-relocation/19-02-SUMMARY.md (confirm the exact shape Plan 02 left WindowEntry/value in)
  </read_first>
  <behavior>
    - WindowEntry gains `snapSide: "left" | "right" | null`; open() defaults it to null.
    - snapLeft(id): sets snapSide="left", captures restoreRect from current x/y (so an unsnap could restore), raises the window (mint z outside updater).
    - snapRight(id): sets snapSide="right", same capture + raise.
    - Snapping a window clears its maximized flag (a window cannot be both maximized and snapped) — snapLeft/snapRight set maximized:false.
    - Test cases (RED first): (a) open default snapSide===null; (b) snapLeft sets snapSide==="left" and restoreRect non-null; (c) snapRight sets snapSide==="right"; (d) snapping a maximized window sets maximized:false; (e) snapLeft raises z above another window.
  </behavior>
  <action>
    Add `snapSide: "left" | "right" | null` to `WindowEntry`; default `snapSide: null` in the `open()` entry. Add `snapLeft` and `snapRight` to `WindowManagerValue` and the returned `value`. Implement each as a `useCallback` that sets `snapSide`, sets `maximized: false`, captures `restoreRect` from the entry's current x/y (w/h = DEFAULT_W/DEFAULT_H), and mints a fresh z OUTSIDE the setWindows updater (per the Strict-Mode rule). Write the 5 test cases in useWindowManager.test.tsx FIRST (RED), then implement to GREEN.
  </action>
  <verify>
    <automated>npm test -- src/ui/useWindowManager.test.tsx 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "snapSide" src/ui/useWindowManager.tsx` returns >= 3 (interface field, open default, snap bodies).
    - `grep -c "snapLeft\|snapRight" src/ui/useWindowManager.tsx` returns >= 4 (interface + value + two impls).
    - snapLeft/snapRight set maximized:false (grep shows both snap callbacks set `maximized: false`).
    - `npm test -- src/ui/useWindowManager.test.tsx` exits 0 (the 5 new snap cases GREEN; Plan 02 maximize cases still green).
  </acceptance_criteria>
  <done>The manager carries snapSide + snapLeft/snapRight (clearing maximized, raising z); unit tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — drop-zone overlay + edge-detection snap at drag commit + .desktop-snap-preview CSS</name>
  <files>src/ui/DesktopShell.tsx, src/index.css, src/ui/DesktopShell.test.tsx, src/ui/useDrag.ts (only if the onEdge approach is chosen)</files>
  <read_first>
    - src/ui/DesktopShell.tsx (full file — post Plan 02: workArea() + maximized-rect application; the window map onMove at lines ~489-493; the conditional launcher panel render lines 519-528 as the overlay template)
    - src/ui/useDrag.ts (the rAF move loop + onCommit contract — only touch if you choose the onEdge approach; keep onCommit unchanged)
    - src/index.css lines 798-805 (.desktop-shell positioning context for the overlay) and lines 952-996 (dock geometry to size the work-area halves)
    - .planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md (the "Snap drop-zone overlay" + "Snap integration in useDrag" excerpts)
  </read_first>
  <behavior>
    - A `snapPreview: "left" | "right" | null` useState in DesktopShellInner drives a translucent overlay: when "left", a `.desktop-snap-preview--left` div covers the left half of the work area; when "right", the right half; null renders nothing.
    - During a drag, when the pointer is within SNAP_THRESHOLD (e.g. 20px) of the left/right edge, snapPreview is set to that side; leaving the threshold clears it.
    - On drag commit (pointer-up), if the committed position is within the edge threshold, the window snaps to that half (snapLeft/snapRight) instead of a normal position set; otherwise the normal setPositions runs (unchanged). snapPreview clears on commit.
    - A snapped entry renders at the work-area half-rect (reuse Plan 02's rect-application path: left = {x:wa.x, y:wa.y, w:wa.w/2, h:wa.h}; right = {x:wa.x+wa.w/2, ...}).
    - The overlay is aria-hidden (decorative) and uses a translucent theme-aware background.
  </behavior>
  <action>
    Add a `snapPreview` useState to DesktopShellInner. In the WindowFrame onMove (commit) path, compute the edge proximity from the committed x and `window.innerWidth` with a `SNAP_THRESHOLD` constant: x <= SNAP_THRESHOLD → `windowManager.snapLeft(entry.id)`; x + DEFAULT_W >= innerWidth - SNAP_THRESHOLD → `windowManager.snapRight(entry.id)`; else the existing `setPositions(...)`. Clear snapPreview on commit. For the DURING-drag preview, drive snapPreview from a live pointer signal — EITHER add a minimal `onEdge?: (side) => void` to useDrag (fired in the rAF move loop, onCommit contract untouched) and wire it per WindowFrame, OR derive the preview from the frame's own pointermove without touching useDrag. Render the overlay conditionally (mirror the launcherOpen panel pattern): `{snapPreview !== null && <div className={"desktop-snap-preview desktop-snap-preview--" + snapPreview} aria-hidden="true" />}`. When an entry has `snapSide`, apply the work-area half-rect to its WindowFrame (reuse Plan 02's explicit-rect mechanism). Add `.desktop-snap-preview`, `.desktop-snap-preview--left`, `.desktop-snap-preview--right` CSS in src/index.css: position absolute within the work area (top: 40px / menu-bar height; bottom: dock reserve), each covering its half-width, translucent (theme-aware, e.g. `var(--glass)` at low opacity), with a soft border + rounded corners, pointer-events:none, a high-ish z below the dock/menu-bar (z 9000). The class names + any copy carry NO banned token and no iframe/sandbox/isolation word.
  </action>
  <verify>
    <automated>npm test -- src/ui/DesktopShell.test.tsx src/ui/MarketplaceWindows.test.tsx 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "snapPreview" src/ui/DesktopShell.tsx` returns >= 3 (state, set during drag, conditional render).
    - `grep -c "SNAP_THRESHOLD" src/ui/DesktopShell.tsx` returns >= 2.
    - `grep -c "desktop-snap-preview" src/index.css` returns >= 3 (base + left + right).
    - `grep -c "snapLeft\|snapRight" src/ui/DesktopShell.tsx` returns >= 2 (wired at commit).
    - If useDrag.ts was modified: `grep -c "onCommit" src/ui/useDrag.ts` is unchanged in signature (the existing onCommit contract is intact; the 727 drag tests pass).
    - `npm test -- src/ui/DesktopShell.test.tsx src/ui/MarketplaceWindows.test.tsx` exits 0 (no regression to existing drag/position tests).
  </acceptance_criteria>
  <done>A translucent drop-zone preview shows during an edge drag; release snaps to the work-area half; existing drag tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: RED+GREEN — Ctrl+Left / Ctrl+Right snap the active window (no drag)</name>
  <files>src/ui/DesktopShell.tsx, src/ui/DesktopShell.test.tsx</files>
  <read_first>
    - src/ui/DesktopShell.tsx (full file — the matchMedia useEffect lines 426-439 as the listener template; activeWindow lines 443-446; windowManagerRef lines 159-160; activeId() from Plan 02)
    - src/ui/DesktopShell.test.tsx (the integration harness — renderDesktopShell, openApp, frameByTitle; how keyboard events are dispatched/asserted)
    - .planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md (the "New keyboard shortcut useEffect" + "windowManagerRef.current access pattern" excerpts)
  </read_first>
  <behavior>
    - A global keydown effect (introduced HERE; Plan 04 extends the SAME effect with Cmd/Ctrl+W/M): when Ctrl is held and ArrowLeft is pressed AND a Vibe OS window is active, preventDefault and `snapLeft(activeId())`; Ctrl+ArrowRight → `snapRight(activeId())`. No-op when no window is active.
    - Active window = `windowManagerRef.current.activeId()` (topmost non-minimized).
    - Test cases (RED first): (a) open a window, dispatch Ctrl+ArrowLeft → the active window's snapSide becomes "left" (assert via the snapped rect / a marker class on the frame); (b) Ctrl+ArrowRight → snapSide "right"; (c) with NO window open, Ctrl+ArrowLeft is a no-op (no throw).
  </behavior>
  <action>
    Add a keydown `useEffect` to DesktopShellInner (lifecycle modeled on the matchMedia effect: guard `typeof window === "undefined"`, addEventListener("keydown", handler) on mount, removeEventListener on cleanup). In the handler: read `const mod = e.ctrlKey` (Ctrl specifically for snap — note Cmd is reserved for Plan 04's close/minimize); if Ctrl+ArrowLeft and an active window exists, `e.preventDefault()` then `windowManagerRef.current.snapLeft(active)`; Ctrl+ArrowRight → `snapRight(active)`. Read the active id via `windowManagerRef.current.activeId()`. Add the 3 test cases to DesktopShell.test.tsx FIRST (RED): dispatch a `KeyboardEvent("keydown", { key: "ArrowLeft"/"ArrowRight", ctrlKey: true, bubbles: true, cancelable: true })` on window and assert the active frame snaps (read its applied half-rect width or a `.window-chrome--snap-left/right` marker if you add one) and that with no window the dispatch is a harmless no-op. Keep this effect SEPARATE-but-extensible so Plan 04 adds Cmd/Ctrl+W/M to it (document the extension point in a comment, no banned tokens).
  </action>
  <verify>
    <automated>npm test -- src/ui/DesktopShell.test.tsx 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "ArrowLeft\|ArrowRight" src/ui/DesktopShell.tsx` returns >= 2.
    - `grep -c "preventDefault" src/ui/DesktopShell.tsx` returns >= 1 (the Ctrl+Arrow snap prevents default).
    - The keydown handler reads `activeId()` (grep `activeId` in DesktopShell.tsx returns >= 1).
    - `npm test -- src/ui/DesktopShell.test.tsx` exits 0 with the 3 new keyboard-snap cases GREEN.
  </acceptance_criteria>
  <done>Ctrl+Left/Right snap the active window to the work-area half without a drag; keyboard-snap tests green; the keydown effect is ready for Plan 04 to extend.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| global keydown → window-manager snap ops | A global keydown listener acts on the active window; must not fire when focus is in browser chrome / must not hijack unrelated Ctrl+Arrow text navigation outside a Vibe OS window. |
| devtools-visible source surface | New class names (.desktop-snap-preview*, snap markers) + constants are F12-visible — no banned token. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-07 | Information disclosure | .desktop-snap-preview class + snap markers | mitigate | The drop-zone class names + any overlay copy carry no mechanic lexicon and no iframe/sandbox/isolation word; the phase hygiene run (Plan 04) re-asserts the gate over src/index.css + DesktopShell.tsx. |
| T-19-08 | Tampering | Ctrl+Arrow hijacking text navigation | mitigate | preventDefault fires ONLY when a Vibe OS window is active (activeId() non-null); with no window the handler is a no-op (asserted in Task 3 case c). |
| T-19-09 | Denial of service | rAF snap-preview loop spinning | accept | The preview signal piggybacks the existing single rAF drag loop (no new loop); cleared on commit — bounded by the drag lifetime. |
</threat_model>

<verification>
- `npm test -- src/ui/useWindowManager.test.tsx src/ui/DesktopShell.test.tsx src/ui/MarketplaceWindows.test.tsx` exits 0.
- Edge drag shows a translucent preview; release snaps to the work-area half.
- Ctrl+Left/Right snap the active window without a drag; no-op with no window.
- Existing drag/position tests green; tsc 0; zero new deps.
</verification>

<success_criteria>
1. Drag to a screen edge shows a translucent drop-zone preview; release snaps to that half of the work area.
2. Ctrl+Left / Ctrl+Right snap the active window to the corresponding half without a drag.
3. Snapped geometry comes from the work area (dock + menu bar visible), not the full viewport.
4. No regression: drag tests green; tsc 0; hygiene gate clean over the new CSS/markers; zero new deps.
</success_criteria>

<output>
After completion, create `.planning/phases/19-window-chrome-menu-relocation/19-03-SUMMARY.md`
</output>
