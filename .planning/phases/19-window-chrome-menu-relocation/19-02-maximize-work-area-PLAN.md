---
phase: 19-window-chrome-menu-relocation
plan: 02
type: execute
wave: 2
depends_on: [19-01-menu-relocation]
files_modified:
  - src/ui/useWindowManager.tsx
  - src/ui/useWindowManager.test.tsx
  - src/ui/WindowFrame.tsx
  - src/ui/WindowFrame.test.tsx
  - src/ui/DesktopShell.tsx
  - src/ui/MarketplaceWindows.test.tsx
autonomous: true
requirements: [CHROME-02]
must_haves:
  truths:
    - "Double-clicking a window titlebar zooms it to fill the work area (viewport minus menu bar minus dock) — not OS full-screen; the menu bar and dock stay visible"
    - "Double-clicking again restores the prior (pre-maximize) geometry"
    - "The green traffic-light maximize button toggles maximize/restore (no longer disabled)"
    - "While maximized, the window cannot be dragged out of the maximized rect (drag is disabled or un-maximizes)"
  artifacts:
    - path: "src/ui/useWindowManager.tsx"
      provides: "WindowEntry.maximized + restoreRect; maximize/unmaximize callbacks; activeId helper"
      contains: "maximized"
    - path: "src/ui/WindowFrame.tsx"
      provides: "maximized prop + onMaximize prop; enabled max traffic-light; double-click handler; drag gated while maximized"
      contains: "onMaximize"
    - path: "src/ui/DesktopShell.tsx"
      provides: "workArea() geometry helper; maximize wiring + maximized rect applied to the frame style"
      contains: "workArea"
  key_links:
    - from: "src/ui/WindowFrame.tsx onDoubleClick / max button onClick"
      to: "useWindowManager.maximize/unmaximize"
      via: "onMaximize prop wired in DesktopShell to toggle by entry.maximized"
      pattern: "onMaximize"
    - from: "src/ui/DesktopShell.tsx workArea()"
      to: "WindowFrame x/y/w/h style"
      via: "when entry.maximized, the frame is positioned/sized to the work area instead of its restoreRect"
      pattern: "workArea\\(\\)"
---

<objective>
Add maximize = zoom-to-work-area (NOT OS full-screen). A window fills the work area = viewport minus the menu bar (top) minus the dock (bottom). `WindowEntry` gains `maximized: boolean` + `restoreRect: {x,y,w,h} | null`. Toggle via the (currently disabled) green traffic-light maximize button AND double-click on the titlebar; unmaximize restores the prior geometry.

Purpose: CHROME-02 — first-class window management. OS full-screen is an explicit anti-feature (it hides the dock + menu bar that ARE the product identity).
Output: `maximized`/`restoreRect` window state + `maximize`/`unmaximize`/`activeId` manager ops; an enabled max button + double-click handler + drag-gating in WindowFrame; a `workArea()` geometry helper + maximize wiring in DesktopShell.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-window-chrome-menu-relocation/19-CONTEXT.md
@.planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md

<interfaces>
<!-- Source-of-truth excerpts. Implement against these. -->

useWindowManager.tsx current shape (the patterns to extend):
  WindowEntry { id, instanceId, appType, title, icon, x, y, z, minimized } — add `maximized: boolean` and `restoreRect: { x: number; y: number; w: number; h: number } | null`.
  Module constants: DEFAULT_W = 400, DEFAULT_H = 300 (lines 26-27) — reuse for restoreRect default w/h.
  z is minted OUTSIDE the setState updater (Strict-Mode purity rule — see open() lines 124-127, focus() 158-164, restore() 172-180). maximize/unmaximize MUST follow this: mint `const z = ++zTop` before setWindows when a z-bump is needed (unmaximize/maximize raise the window).
  open() (lines 118-156) builds the entry object — add `maximized: false, restoreRect: null` to the defaults.
  WindowManagerValue interface (lines 48-66) — add `maximize: (id) => void`, `unmaximize: (id) => void`, `activeId: () => string | null` and expose them in the `value` object (lines 214-223).

WindowFrame.tsx current shape (Plan 01 already moved the ⋮ here):
  WindowFrameProps (lines 68-84) — add `maximized: boolean` and `onMaximize: () => void`.
  The max traffic-light (lines 146-151) is currently `disabled` — remove `disabled`, add `onClick={onMaximize}` AND `aria-label` stays "Maximize". Add `e.stopPropagation()` so the click does not start a drag.
  The titlebar div (line 126-132) has `onPointerDown` — add `onDoubleClick={onMaximize}`. Gate drag while maximized: in onPointerDown, `if (maximized) return;` BEFORE onFocus()/handlePointerDown (simplest path per CONTEXT.md — disable drag while maximized).

DesktopShell.tsx current shape:
  The window map (lines 470-499) renders each WindowFrame with x/y from `positions` override ?? entry.x/y. For a maximized entry, x/y MUST come from `workArea()` (not the positions override / cascade) and the frame must also size to the work-area w/h. Apply maximized geometry here.
  Work-area constants: the menu bar is `height: 40px` (src/index.css line 896); the dock reserves bottom ~88px (`.dock` bottom:16px + icon 52px + ~9px*2 padding, src/index.css lines 952-991). Define `MENU_BAR_H = 40` and `DOCK_RESERVE = 88` (confirm against src/index.css before finalizing) and `workArea()` returning `{ x: 0, y: MENU_BAR_H, w: window.innerWidth, h: window.innerHeight - MENU_BAR_H - DOCK_RESERVE }`.
  onMaximize wiring: pass `onMaximize={() => entry.maximized ? windowManager.unmaximize(entry.id) : windowManager.maximize(entry.id)}` and `maximized={entry.maximized}` to each WindowFrame.

IMPORTANT — WindowFrame positions today by `transform: translate(x,y)` + fixed min-width/min-height in CSS (.window-chrome min-width:320px min-height:240px, src/index.css ~700). To make a maximized window FILL the work area, the frame needs an explicit width/height when maximized. Add `w`/`h` to the WindowFrame style ONLY when maximized (pass an optional sizing via a `maximizedRect` derived in DesktopShell, or extend the style object). Keep the non-maximized path byte-identical to today (transform-only) so the 727 drag/position tests stay green.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED+GREEN — WindowEntry.maximized + restoreRect + maximize/unmaximize/activeId in the manager</name>
  <files>src/ui/useWindowManager.tsx, src/ui/useWindowManager.test.tsx</files>
  <read_first>
    - src/ui/useWindowManager.tsx (full file — WindowEntry, WindowManagerValue, open/focus/minimize/restore, the z-mint-outside-updater rule)
    - src/ui/useWindowManager.test.tsx (existing manager unit tests — the harness pattern for rendering the hook + asserting state)
    - .planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md (the "useWindowManager.tsx" section — exact maximize/unmaximize/snap excerpts + z-mint pattern)
  </read_first>
  <behavior>
    - maximize(id): sets `maximized: true` and stores `restoreRect: { x: w.x, y: w.y, w: DEFAULT_W, h: DEFAULT_H }` (the pre-maximize geometry); raises the window (mint z outside updater).
    - unmaximize(id): sets `maximized: false`, raises the window (mint z outside updater); leaves restoreRect intact (DesktopShell reads x/y from the entry; restoreRect carries the pre-maximize w/h if needed).
    - open() defaults: a fresh window has `maximized: false, restoreRect: null`.
    - activeId(): returns the id of the topmost non-minimized window (highest z), or null if none.
    - Test cases (RED first, then GREEN): (a) a new window has maximized=false, restoreRect=null; (b) maximize sets maximized=true and a non-null restoreRect capturing prior x/y; (c) unmaximize sets maximized=false; (d) maximize raises z above a second window; (e) activeId returns the highest-z non-minimized id and null when all minimized.
  </behavior>
  <action>
    Extend `WindowEntry` with `maximized: boolean` and `restoreRect: { x: number; y: number; w: number; h: number } | null`. Add `maximized: false, restoreRect: null` to the entry built in `open()`. Add `maximize`, `unmaximize`, and `activeId` to `WindowManagerValue` and to the returned `value` object. Implement `maximize` as a `useCallback` that stores `restoreRect` from the current x/y (with w/h = DEFAULT_W/DEFAULT_H) and sets `maximized: true`, minting z OUTSIDE the setWindows updater (see focus/restore for the Strict-Mode rationale). Implement `unmaximize` as a `useCallback` setting `maximized: false` and minting a fresh z. Implement `activeId` reading the current windows (filter !minimized, sort by z desc, return [0]?.id ?? null) — read live state the same way the component does; if the existing manager only exposes `windows` as a snapshot, compute from that array. Write the 5 test cases in useWindowManager.test.tsx FIRST (RED), then implement to GREEN.
  </action>
  <verify>
    <automated>npm test -- src/ui/useWindowManager.test.tsx 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "maximized" src/ui/useWindowManager.tsx` returns >= 3 (interface field, open default, maximize body).
    - `grep -c "restoreRect" src/ui/useWindowManager.tsx` returns >= 2.
    - `grep -c "activeId" src/ui/useWindowManager.tsx` returns >= 2 (interface + value).
    - maximize/unmaximize mint z OUTSIDE the updater: `grep -c "const z = ++zTop" src/ui/useWindowManager.tsx` increased by 2 vs baseline (one per new z-bumping op).
    - `npm test -- src/ui/useWindowManager.test.tsx` exits 0 with the 5 new cases passing (GREEN).
  </acceptance_criteria>
  <done>The manager carries maximized/restoreRect, exposes maximize/unmaximize/activeId, and its unit tests are green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: RED+GREEN — WindowFrame maximize button + double-click + drag gating</name>
  <files>src/ui/WindowFrame.tsx, src/ui/WindowFrame.test.tsx</files>
  <read_first>
    - src/ui/WindowFrame.tsx (full file — post-Plan-01 state: ⋮ in titlebar, the disabled max button at the traffic-lights, the titlebar onPointerDown, WindowFrameProps)
    - src/ui/WindowFrame.test.tsx (makeProps factory line 41-60 — add maximized + onMaximize defaults; the existing titlebar/drag tests)
    - .planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md (the "Maximize button activation" + "Double-click titlebar" + "Disable drag while maximized" excerpts)
  </read_first>
  <behavior>
    - The green max traffic-light (aria-label "Maximize") is NO LONGER disabled; clicking it calls onMaximize once. The click calls e.stopPropagation() so it does not start a drag.
    - Double-clicking the titlebar calls onMaximize once.
    - When maximized=true, pointerdown on the titlebar does NOT start a drag (onFocus may or may not fire — simplest: early-return so neither drag nor onFocus fires while maximized; pick the variant that keeps existing focus tests green for the maximized=false default).
    - makeProps must default maximized:false and onMaximize: vi.fn() so all existing WindowFrame tests keep compiling.
  </behavior>
  <action>
    Add `maximized: boolean` and `onMaximize: () => void` to `WindowFrameProps` and destructure them in the function signature. Remove `disabled` from the max traffic-light button and add `onClick` that calls `e.stopPropagation()` then `onMaximize()`. Add `onDoubleClick={onMaximize}` to the `.window-chrome__titlebar` div. Gate drag while maximized: in the titlebar `onPointerDown`, add `if (maximized) return;` as the first statement (before onFocus()/handlePointerDown) — the simplest path per CONTEXT.md. Update WindowFrame.test.tsx makeProps to include `maximized: false` and `onMaximize: vi.fn()`. Add 2 tests (RED first): (a) clicking the max traffic-light calls onMaximize once; (b) double-clicking the titlebar calls onMaximize once. Optionally add a test that pointerdown on the titlebar while maximized=true does NOT call onMove/onFocus.
  </action>
  <verify>
    <automated>npm test -- src/ui/WindowFrame.test.tsx 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "disabled" src/ui/WindowFrame.tsx` returns 0 on the max traffic-light line (the button is enabled). (Verify the only remaining `disabled` references, if any, are unrelated.)
    - `grep -c "onMaximize" src/ui/WindowFrame.tsx` returns >= 3 (prop type, destructure, button + double-click wiring).
    - `grep -c "onDoubleClick" src/ui/WindowFrame.tsx` returns >= 1.
    - WindowFrame.tsx gates drag while maximized: `grep -c "if (maximized) return" src/ui/WindowFrame.tsx` returns >= 1.
    - `npm test -- src/ui/WindowFrame.test.tsx` exits 0 (new max + double-click tests GREEN; existing drag/focus tests still green).
  </acceptance_criteria>
  <done>WindowFrame has an enabled max button + double-click maximize + drag gated while maximized; its tests are green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GREEN — workArea() geometry + maximize wiring in DesktopShell; integration test</name>
  <files>src/ui/DesktopShell.tsx, src/ui/MarketplaceWindows.test.tsx</files>
  <read_first>
    - src/ui/DesktopShell.tsx (full file — the window map lines 470-499, the positions/components state, the activeWindow computation lines 443-446)
    - src/index.css lines 891-996 (menu-bar height 40px; dock geometry — confirm DOCK_RESERVE)
    - src/index.css lines 698-780 (.window-chrome sizing + titlebar; needed to know how a maximized w/h must be applied)
    - src/ui/MarketplaceWindows.test.tsx (the windowing integration tests + the frameByTitle/frames helpers from desktopShellTestKit)
    - .planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md (the "DesktopShell.tsx" workArea() + conditional-render excerpts)
  </read_first>
  <behavior>
    - A `workArea()` helper returns `{ x: 0, y: MENU_BAR_H, w: window.innerWidth, h: window.innerHeight - MENU_BAR_H - DOCK_RESERVE }` with MENU_BAR_H=40 and DOCK_RESERVE confirmed from CSS (~88).
    - When an entry is maximized, the WindowFrame is positioned at the work-area x/y AND sized to the work-area w/h (the frame fills the work area; the menu bar + dock remain visible — NOT OS full-screen).
    - When an entry is NOT maximized, the frame renders exactly as today (transform-only, positions override ?? entry x/y, CSS min-size) — no regression to the existing position/drag tests.
    - onMaximize wired per entry: maximized ? unmaximize(id) : maximize(id); maximized + the maximized rect passed to WindowFrame.
    - Integration test: open a window, double-click its titlebar → assert the frame is sized to the work-area dimensions (or carries a maximized marker the test can read); double-click again → assert it returns to its prior size/position. Assert the dock + menu bar are still in the document while maximized (NOT full-screen).
  </behavior>
  <action>
    In DesktopShell.tsx (or a small co-located helper module if cleaner), add `MENU_BAR_H` and `DOCK_RESERVE` constants and a `workArea()` function returning the work-area rect from `window.innerWidth/innerHeight`. In the window map, when `entry.maximized` is true, derive `{ x, y, w, h }` from `workArea()` and pass them so the frame fills the work area; pass `maximized={entry.maximized}` and `onMaximize={() => entry.maximized ? windowManager.unmaximize(entry.id) : windowManager.maximize(entry.id)}`. The maximized width/height must reach the frame's style — extend WindowFrame to accept an optional explicit width/height applied ONLY when maximized (keep the non-maximized branch transform-only and CSS-min-sized, unchanged). Add ONE integration test in MarketplaceWindows.test.tsx: open Notes, double-click the titlebar, assert the frame fills the work area (width === window.innerWidth, height === innerHeight - MENU_BAR_H - DOCK_RESERVE, or read an `.window-chrome--maximized` marker class if you add one), assert `.menu-bar` and `.dock` are still present (NOT full-screen), then double-click again and assert restore. Use jsdom's window.innerWidth/innerHeight (set them in the test if needed; jsdom defaults to 1024x768).
  </action>
  <verify>
    <automated>npm test -- src/ui/MarketplaceWindows.test.tsx 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "workArea" src/ui/DesktopShell.tsx` returns >= 2 (definition + use).
    - `grep -c "MENU_BAR_H" src/ui/DesktopShell.tsx` returns >= 2 and `MENU_BAR_H = 40` matches the `.menu-bar { height: 40px }` in src/index.css.
    - `grep -c "onMaximize" src/ui/DesktopShell.tsx` returns >= 1 (wired per entry).
    - The new integration test asserts: maximized frame fills the work area AND `.menu-bar` + `.dock` remain in the document (NOT OS full-screen); a second double-click restores prior geometry.
    - `npm test -- src/ui/MarketplaceWindows.test.tsx` exits 0; the existing position/drag tests in that file still pass (no regression).
  </acceptance_criteria>
  <done>DesktopShell maximizes a window to the work area (menu bar + dock visible), double-click toggles, and the integration test is green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| window-manager state → frame geometry | maximize/restore state drives the frame rect; a stale restoreRect would mislocate a restored window. |
| devtools-visible source surface | New constants/class names ("maximized", "workArea", "window-chrome--maximized") are F12-visible — must carry no banned token. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-04 | Information disclosure | New geometry constants + maximize markers | mitigate | "maximized"/"workArea"/"window-chrome--maximized" carry no banned lexicon and no iframe/sandbox/isolation word; the phase-wide hygiene run (Plan 04) re-asserts the gate over all edited files. |
| T-19-05 | Tampering | restoreRect carrying wrong geometry on restore | mitigate | restoreRect is captured at maximize time from the entry's own x/y; the integration test in Task 3 asserts restore returns to prior geometry. |
| T-19-06 | Denial of service | n/a (no network, no model) | accept | maximize is pure local state; no produce-gate or egress involved. |
</threat_model>

<verification>
- `npm test -- src/ui/useWindowManager.test.tsx src/ui/WindowFrame.test.tsx src/ui/MarketplaceWindows.test.tsx` exits 0.
- Maximized frame fills the work area; `.menu-bar` + `.dock` stay visible (asserted in the integration test).
- Double-click toggles maximize/restore; restore returns to prior geometry.
- The non-maximized render path is byte-identical to today (existing drag/position tests green).
</verification>

<success_criteria>
1. Double-click titlebar (or the green max button) zooms the window to the work area — NOT OS full-screen; dock + menu bar remain.
2. Double-click again restores the prior geometry.
3. While maximized the window cannot be dragged out of the maximized rect.
4. No regression: existing drag/position tests green; tsc 0; zero new deps.
</success_criteria>

<output>
After completion, create `.planning/phases/19-window-chrome-menu-relocation/19-02-SUMMARY.md`
</output>
