---
phase: 19-window-chrome-menu-relocation
plan: 04
type: execute
wave: 4
depends_on: [19-03-snap-half]
files_modified:
  - src/ui/DesktopShell.tsx
  - src/ui/DesktopShell.test.tsx
autonomous: true
requirements: [CHROME-04]
must_haves:
  truths:
    - "Cmd/Ctrl+W closes the active window (the browser tab is never closed)"
    - "Cmd/Ctrl+M minimizes the active window"
    - "Both shortcuts call preventDefault so the browser tab/window action is suppressed — a test asserts event.defaultPrevented === true"
    - "Close/minimize fire only when a Vibe OS window is active (no-op when no window is open)"
    - "All 727 prior tests stay green; hygiene + CSP gates pass; tsc 0; zero new deps; build emits no source maps"
  artifacts:
    - path: "src/ui/DesktopShell.tsx"
      provides: "Cmd/Ctrl+W close + Cmd/Ctrl+M minimize, added to the keydown effect from Plan 03, with preventDefault"
      contains: "preventDefault"
  key_links:
    - from: "src/ui/DesktopShell.tsx keydown handler (Cmd/Ctrl+W)"
      to: "handleClose(active.id, active.instanceId)"
      via: "activeId() resolves the front-most non-minimized window; preventDefault first"
      pattern: "handleClose"
    - from: "src/ui/DesktopShell.tsx keydown handler (Cmd/Ctrl+M)"
      to: "windowManager.minimize(active.id)"
      via: "activeId() resolves the active window; preventDefault first"
      pattern: "minimize"
---

<objective>
Add keyboard shortcuts acting on the active window: `Cmd/Ctrl+W` closes it, `Cmd/Ctrl+M` minimizes it — each calling `preventDefault()` so the browser tab is never accidentally closed and the browser's minimize is never triggered. Both fire only when a Vibe OS window is active (not when focus is in a browser chrome element). This plan EXTENDS the keydown effect introduced by Plan 03 (Ctrl+Left/Right) and runs the final phase-wide regression + hygiene gate confirming the CHROME-01..04 acceptance bar.

Purpose: CHROME-04 — keyboard-first window control without sacrificing the browser tab. A test asserts `event.defaultPrevented === true`.
Output: Cmd/Ctrl+W + Cmd/Ctrl+M in the DesktopShell keydown effect with preventDefault; the full phase-19 gate (727 green, tsc 0, hygiene/CSP green, no source maps, zero deps).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-window-chrome-menu-relocation/19-CONTEXT.md
@.planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md
@.planning/phases/19-window-chrome-menu-relocation/19-03-SUMMARY.md

<interfaces>
<!-- Source-of-truth excerpts. Plan 03 (snap) is a hard dependency — its keydown useEffect already
     exists in DesktopShellInner; EXTEND it here rather than adding a second global listener. -->

From Plan 03 (already shipped): DesktopShellInner has a keydown `useEffect` handling Ctrl+ArrowLeft/Right (snap). Add Cmd/Ctrl+W (close) and Cmd/Ctrl+M (minimize) to the SAME handler — one global keydown listener, not two.

DesktopShell.tsx existing pieces to reuse:
  - `handleClose(id, instanceId)` (lines 164-181, useCallback) — the canonical teardown (evict + close + drop body/position). Cmd/Ctrl+W calls this.
  - `windowManager.minimize(id)` — the canonical minimize. Cmd/Ctrl+M calls this.
  - `windowManagerRef.current` (lines 159-160) — stale-closure guard; read `.activeId()` (Plan 02) or `.windows` for the active entry inside the handler.
  - The active window = front-most non-minimized = highest z (DesktopShell already computes `activeWindow` at lines 443-446 the same way; or use `activeId()`).
  - 19-PATTERNS.md "New keyboard shortcut useEffect" shows the exact close/minimize bodies: `const mod = e.metaKey || e.ctrlKey; if (!mod) return; if (!document.hasFocus()) return;` then on key "w" → preventDefault + handleClose(active); on key "m" → preventDefault + minimize(active). Note: the snap path in Plan 03 keyed on `e.ctrlKey` for ArrowLeft/Right; close/minimize key on `e.metaKey || e.ctrlKey` for w/m — both branches coexist in one handler.

"Active" gating (CONTEXT.md): close/minimize fire ONLY when a Vibe OS window is active — i.e. an active window exists AND focus is not in a browser chrome element. Use `document.hasFocus()` AND an active entry being present as the gate. With no open window, the shortcut is a no-op (and need not preventDefault — but the test that asserts defaultPrevented runs WITH a window open).

The defaultPrevented test (19-PATTERNS.md "Keyboard shortcuts" excerpt): open a window, then `const event = new KeyboardEvent("keydown", { key: "w", metaKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);` and assert the window closes. The event MUST be `cancelable: true` for defaultPrevented to be observable.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED+GREEN — Cmd/Ctrl+W close + Cmd/Ctrl+M minimize with preventDefault, active-gated</name>
  <files>src/ui/DesktopShell.tsx, src/ui/DesktopShell.test.tsx</files>
  <read_first>
    - src/ui/DesktopShell.tsx (full file — the keydown useEffect from Plan 03; handleClose lines 164-181; minimize via windowManager; activeWindow lines 443-446; windowManagerRef lines 159-160)
    - src/ui/DesktopShell.test.tsx (the integration harness: renderDesktopShell, openApp, frames(), frameByTitle, appBodyCount; the Plan 03 keyboard-snap cases to mirror)
    - .planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md (the "New keyboard shortcut useEffect" + "Keyboard shortcuts" test excerpts — exact close/minimize bodies + the defaultPrevented assertion)
    - .planning/phases/19-window-chrome-menu-relocation/19-03-SUMMARY.md (confirm where Plan 03 placed the keydown effect + its current key branches)
  </read_first>
  <behavior>
    - Cmd/Ctrl+W: when a Vibe OS window is active, preventDefault() then close the active (front-most non-minimized) window via handleClose. The browser tab is never closed.
    - Cmd/Ctrl+M: when a Vibe OS window is active, preventDefault() then minimize the active window via windowManager.minimize.
    - Active gating: handler reads the active window (activeId() / highest-z non-minimized) and `document.hasFocus()`; with no active window it is a no-op (no throw, no preventDefault needed for the no-op case).
    - These branches live in the SAME keydown handler Plan 03 created (Ctrl+Left/Right). Do NOT add a second global listener.
    - Test cases (RED first): (a) open Notes, dispatch a cancelable Cmd+W KeyboardEvent on window → assert event.defaultPrevented === true AND the window closes (frames() length 0, appBodyCount 0); (b) open Notes, dispatch Cmd+M → assert the frame gains window-chrome--minimized and event.defaultPrevented === true; (c) with NO window open, dispatch Cmd+W → no throw, frames() stays 0; (d) (optional) Ctrl+W (not Cmd) on a non-mac path also closes (metaKey||ctrlKey).
  </behavior>
  <action>
    Extend the Plan 03 keydown handler in DesktopShellInner: add a `mod = e.metaKey || e.ctrlKey` branch for the close/minimize keys (the existing Ctrl+Arrow snap branch stays). Resolve the active window via `windowManagerRef.current.activeId()` (and look up the full entry for its id+instanceId via `windowManagerRef.current.windows`), gated by an active window existing AND `document.hasFocus()`. On `e.key === "w"` with mod: `e.preventDefault()` then `handleClose(active.id, active.instanceId)`. On `e.key === "m"` with mod: `e.preventDefault()` then `windowManagerRef.current.minimize(active.id)`. Ensure `handleClose` is in the effect's dependency array (it is memoized — safe). Write the test cases in DesktopShell.test.tsx FIRST (RED): construct `new KeyboardEvent("keydown", { key: "w"/"m", metaKey: true, bubbles: true, cancelable: true })`, `window.dispatchEvent(event)`, assert `event.defaultPrevented === true` and the close/minimize effect; plus the no-window no-op case. Then implement to GREEN. Keep all copy/identifiers free of banned tokens.
  </action>
  <verify>
    <automated>npm test -- src/ui/DesktopShell.test.tsx 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "metaKey" src/ui/DesktopShell.tsx` returns >= 1 (Cmd/Ctrl gating).
    - `grep -c "preventDefault" src/ui/DesktopShell.tsx` returns >= 2 (one from Plan 03 snap, plus close/minimize) — confirm the close + minimize branches both call it.
    - `grep -c "handleClose" src/ui/DesktopShell.tsx` shows handleClose called from the keydown handler (in addition to the existing close traffic-light wiring).
    - Exactly ONE `addEventListener("keydown"` in DesktopShell.tsx: `grep -c 'addEventListener("keydown"' src/ui/DesktopShell.tsx` returns 1 (the Plan 03 effect was extended, not duplicated).
    - The new tests assert `event.defaultPrevented === true` for Cmd+W and Cmd+M, the window closes/minimizes, and the no-window case is a no-op.
    - `npm test -- src/ui/DesktopShell.test.tsx` exits 0 (new keyboard cases + Plan 03 snap cases all GREEN).
  </acceptance_criteria>
  <done>Cmd/Ctrl+W closes and Cmd/Ctrl+M minimizes the active window with preventDefault; one keydown listener; defaultPrevented asserted; no-window no-op; tests green.</done>
</task>

<task type="auto">
  <name>Task 2: Phase-19 gate — full suite + tsc + hygiene + CSP + no-source-maps build + zero deps</name>
  <files>(no source changes — runs npm test / typecheck / build / hygiene / csp gates)</files>
  <read_first>
    - src/hygiene.test.ts (the lexicon gate over src/** + index.html — must be green; confirm the v3.0 extended words iframe/sandbox/isolation appear in NO UI copy)
    - src/csp.test.ts (FOUC/CSP SHA-256 invariant — untouched by Phase 19; must stay green)
    - vite.config.ts (confirm build.sourcemap: false is set; the prod build must emit no .map files)
    - package.json (scripts: test, typecheck, build; the dependency list — must be unchanged)
  </read_first>
  <action>
    Run the entire test suite (`npm test`), the typecheck (`npm run typecheck`), and the production build (`npm run build`). Confirm: (1) the full suite is green including the 5 Plan 01 test files, the manager unit tests, the WindowFrame max tests, and the DesktopShell snap + keyboard tests; (2) tsc reports 0 errors; (3) the hygiene gate (src/hygiene.test.ts) passes — none of the new class names (.desktop-snap-preview, window-chrome--maximized/snap markers), constants (workArea, MENU_BAR_H, SNAP_THRESHOLD), aria-labels, or copy introduced across Plans 01-04 leak a banned mechanic token OR the words iframe/sandbox/isolation; (4) the CSP test (src/csp.test.ts) passes (Phase 19 touched no FOUC script, so the hash is unchanged); (5) the build emits NO source maps (no `.map` files in dist; `build.sourcemap` stays false); (6) package.json dependencies + devDependencies are byte-identical to the Phase 19 start (zero new deps). Confirm the CHROME-01..04 acceptance bar end-to-end: ⋮ in titlebar drives MOD-01..04 (Plan 01), double-click maximize to work-area (Plan 02), edge-drag + Ctrl+Left/Right snap (Plan 03), Cmd/Ctrl+W/M with preventDefault (Plan 04). Fix any failure surfaced; do NOT weaken any assertion to make it pass.
  </action>
  <verify>
    <automated>npm test 2>&1 | tail -12 && npm run typecheck 2>&1 | tail -6 && npm run build 2>&1 | tail -8 && (find dist -name '*.map' | head; echo "map-count: $(find dist -name '*.map' 2>/dev/null | wc -l)")</automated>
  </verify>
  <acceptance_criteria>
    - `npm test` exits 0 (entire suite green; the 727 baseline preserved net of the documented AppShell.test.tsx header→region adjustment from Plan 01).
    - `npm run typecheck` exits 0.
    - `npm test -- src/hygiene.test.ts` exits 0 (no banned token + no iframe/sandbox/isolation word in any Phase 19 source/UI surface).
    - `npm test -- src/csp.test.ts` exits 0 (FOUC/CSP hash unchanged).
    - `npm run build` exits 0 and `find dist -name '*.map' | wc -l` returns 0 (no source maps emitted).
    - `git diff --stat -- package.json` shows no dependency line change (zero new npm deps, runtime and dev).
    - All four requirement gates pass: MOD-01..04 from titlebar, maximize=work-area, snap-half (drag + keyboard), Cmd/Ctrl+W/M with defaultPrevented.
  </acceptance_criteria>
  <done>The full Phase 19 gate is green: 727 tests, tsc 0, hygiene + CSP clean, no source maps, zero new deps; CHROME-01..04 confirmed end-to-end.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| global keydown → close/minimize | Cmd/Ctrl+W/M intercept browser-native shortcuts; preventDefault must fire ONLY when a Vibe OS window is active so the user can still close the browser tab when no window is focused. |
| devtools-visible source surface | New handler identifiers + comments are F12-visible — no banned token; the words iframe/sandbox/isolation must not appear. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-10 | Denial of service | Cmd/Ctrl+W hijacking tab-close globally | mitigate | preventDefault fires ONLY when an active Vibe OS window exists AND document.hasFocus(); with no window the handler is a no-op (Task 1 case c) so the user can still close the browser tab normally. |
| T-19-11 | Information disclosure | New keydown handler identifiers/comments | mitigate | Task 2 runs src/hygiene.test.ts asserting no mechanic lexicon and no iframe/sandbox/isolation word leaks into any Phase 19 surface. |
| T-19-12 | Tampering | minimize/close acting on the wrong window | mitigate | The handler resolves the active window via activeId() (highest-z non-minimized) — the same definition the menu bar uses; Task 1 cases assert the correct window closes/minimizes. |
</threat_model>

<verification>
- `npm test` exits 0; `npm run typecheck` exits 0; `npm run build` exits 0 with zero `.map` files.
- `npm test -- src/hygiene.test.ts src/csp.test.ts` exits 0.
- A test asserts `event.defaultPrevented === true` for Cmd/Ctrl+W and Cmd/Ctrl+M.
- One global keydown listener (Plan 03's effect extended, not duplicated).
- package.json dependencies unchanged (zero new deps).
</verification>

<success_criteria>
1. Cmd/Ctrl+W closes the active window; Cmd/Ctrl+M minimizes it — the browser tab is never closed.
2. Both call preventDefault; a test asserts event.defaultPrevented === true.
3. The shortcuts fire only when a Vibe OS window is active (no-op otherwise).
4. The full Phase 19 gate is green: 727 tests, tsc 0, hygiene + CSP clean, no source maps, zero new deps; CHROME-01..04 confirmed end-to-end.
</success_criteria>

<output>
After completion, create `.planning/phases/19-window-chrome-menu-relocation/19-04-SUMMARY.md`
</output>
