---
phase: 19-window-chrome-menu-relocation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/WindowFrame.tsx
  - src/ui/AppShell.tsx
  - src/ui/AppShell.test.tsx
  - src/ui/WindowFrame.test.tsx
  - src/ui/MarketplaceModify.test.tsx
  - src/ui/MarketplaceWindows.test.tsx
  - src/ui/DesktopShell.test.tsx
autonomous: true
requirements: [CHROME-01]
must_haves:
  truths:
    - "A user clicks the ⋮ button in the window titlebar (right of the traffic-lights / title) and the contextual modify prompt opens"
    - "The in-body app-shell header (duplicate title + ⋮ + suppressed ×) is gone; AppShell renders only its content"
    - "remove (MOD-04) from the titlebar closes the window with no model call"
    - "clone (MOD-04) from the titlebar mints a second window with no model call"
    - "tweak (MOD-03) from the titlebar replaces the app in place via a new cache key"
    - "All 727 existing tests stay green; the 5 affected test files find the ⋮ in the titlebar"
  artifacts:
    - path: "src/ui/WindowFrame.tsx"
      provides: "Titlebar-owned ⋮ button + ContextualPrompt + promptOpen state; onModify flows to the titlebar"
      contains: "App options"
    - path: "src/ui/AppShell.tsx"
      provides: "Content-only wrapper: role=region + app-shell__content, no header"
      contains: "app-shell__content"
  key_links:
    - from: "src/ui/WindowFrame.tsx ⋮ button onClick"
      to: "ContextualPrompt onApply"
      via: "promptOpen useState + handleApply calling onModify"
      pattern: "onModify\\?\\("
    - from: "src/ui/DesktopShell.tsx handleModify"
      to: "WindowFrame onModify prop"
      via: "existing onModify prop already wired to handleModify(entry.instanceId, instruction)"
      pattern: "onModify=\\{\\(instruction\\)"
---

<objective>
Relocate the per-app `⋮` contextual menu (the MOD-01 prompt) out of the app body (`AppShell`) into the `WindowFrame` titlebar, right-aligned opposite the traffic-lights. `ContextualPrompt` now renders from `WindowFrame`, which already receives `onModify`. `AppShell` is reduced to a content-only wrapper so the app body becomes a chrome-free zone.

Purpose: CHROME-01 is the HARD prerequisite for Phase 20 — once the app body becomes an opaque frame, host chrome cannot be injected into it. The contextual menu must be host-owned (in the titlebar) before any body becomes a frame.
Output: Titlebar `⋮` + `ContextualPrompt` in `WindowFrame`; header-free `AppShell`; 5 test files updated to find the `⋮` in the titlebar with assertions kept (not weakened).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-window-chrome-menu-relocation/19-CONTEXT.md
@.planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md

<interfaces>
<!-- Source-of-truth excerpts the executor implements against. Use these directly. -->

ContextualPrompt props (src/ui/ContextualPrompt.tsx — reused as-is, no change):
  ContextualPrompt({ targetName: string, onApply: (instruction: string) => void, onCancel: () => void })
  Renders role="dialog" with heading "Modify: {targetName}", a textbox, and Apply/Cancel buttons.

WindowFrame already receives and forwards `onModify?: (instruction: string) => void` (WindowFrame.tsx lines 83, 99, 165). DesktopShell already wires it (DesktopShell.tsx lines 494-496): `onModify={(instruction) => void handleModify(entry.instanceId, instruction)}`. NO DesktopShell change is required for this plan — the prop is already plumbed; only WindowFrame's CONSUMPTION of it moves from the body to the titlebar.

The ⋮ button + ContextualPrompt + promptOpen pattern being MOVED lives in AppShell.tsx lines 46-89. The exact button markup (class "app-bar__icon-btn", aria-label "App options", aria-haspopup "dialog", aria-expanded={promptOpen}, title "Options", MoreVertical icon) and the handleApply body are reproduced verbatim in 19-PATTERNS.md "WindowFrame.tsx" section.

Titlebar CSS (src/index.css line 714): `.window-chrome__titlebar` is `display: grid; grid-template-columns: auto 1fr auto`. The traffic-lights occupy column 1 (auto), title-group column 2 (1fr, centered). The ⋮ button goes in column 3 (the trailing `auto`) right-aligned opposite the traffic-lights — NO new CSS column needed.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — update the 5 test files to find the ⋮ in the titlebar (failing against current code)</name>
  <files>src/ui/AppShell.test.tsx, src/ui/WindowFrame.test.tsx, src/ui/MarketplaceModify.test.tsx, src/ui/MarketplaceWindows.test.tsx, src/ui/DesktopShell.test.tsx</files>
  <read_first>
    - src/ui/AppShell.test.tsx (3 header tests to replace)
    - src/ui/WindowFrame.test.tsx (line 84-100 body-⋮ assertion to relocate)
    - src/ui/MarketplaceModify.test.tsx (applyModification helper line 47-57; MOD-01 test line 72-83)
    - src/ui/MarketplaceWindows.test.tsx (line 307-323 the contextual ⋮ test)
    - src/ui/DesktopShell.test.tsx (line 201-216 the contextual ⋮ remove test)
    - .planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md (the "Test Update Patterns" section — exact before/after queries)
    - src/ui/desktopShellTestKit.tsx (frameByTitle, frames helpers used to locate the titlebar)
  </read_first>
  <behavior>
    - AppShell.test.tsx: DELETE the 3 header tests (inner × default, hideClose suppresses ×, ⋮ with hideClose). REPLACE with one test "renders children inside a labeled region": render AppShell with displayName "Notes" + a child with data-testid "child"; assert within(getByRole("region",{name:"Notes"})).getByTestId("child") is present, and assert AppShell renders NO button (queryByRole("button") is null).
    - WindowFrame.test.tsx line 84-100: assert the "App options" button is in `.window-chrome__titlebar` (via within(titlebar)), and that `.window-chrome__body` does NOT contain it (body.querySelector('[aria-label="App options"]') is null). Keep the app-body assertion (getByTestId("app-body")).
    - MarketplaceModify.test.tsx applyModification helper + MOD-01 test: target the ⋮ in the titlebar of the frame (frameByTitle or region.closest(".window-chrome") → .window-chrome__titlebar), then the dialog. Keep ALL existing assertions (no transport call for remove/clone, content replaced for tweak, "Modify: Notes" naming) unchanged.
    - MarketplaceWindows.test.tsx line 307-323 + DesktopShell.test.tsx line 201-216: same titlebar re-target for the ⋮; keep the remove-closes-window assertions.
  </behavior>
  <action>
    Update all 5 test files so every `within(region).getByRole("button", { name: "App options" })` query instead locates the ⋮ in `.window-chrome__titlebar`. Use the helper pattern from 19-PATTERNS.md: get the frame via `frameByTitle(title)` (already exported from desktopShellTestKit) or `screen.getByText(title).closest(".window-chrome")`, then `frame.querySelector(".window-chrome__titlebar")`, then `within(titlebar).getByRole("button", { name: "App options" })`. The `ContextualPrompt` dialog renders inside the `.window-chrome` (not inside the `role="region"` body) — query it via `within(frame).getByRole("dialog")` or `screen.getByRole("dialog")`. Do NOT weaken any behavioral assertion: remove/clone must still assert zero transport calls, tweak must still assert in-place content replacement, MOD-01 must still assert the "Modify: Notes" heading. In AppShell.test.tsx, replace the 3 deleted header tests with the single labeled-region test from the behavior block. These tests MUST fail now (RED) because the current ⋮ is still in the body — confirm the failure before Task 2.
  </action>
  <verify>
    <automated>npm test -- src/ui/AppShell.test.tsx src/ui/WindowFrame.test.tsx 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `npm test -- src/ui/AppShell.test.tsx` reports the new "labeled region" test FAILING (RED) against current AppShell (which still has a header/buttons).
    - `npm test -- src/ui/WindowFrame.test.tsx` reports the relocated ⋮ assertion FAILING (RED) — the ⋮ is not yet in the titlebar.
    - `grep -c "within(region).getByRole(\"button\", { name: \"App options\" })" src/ui/MarketplaceModify.test.tsx src/ui/MarketplaceWindows.test.tsx src/ui/DesktopShell.test.tsx` returns 0 for each (all relocated to titlebar queries).
    - No test assertion was deleted except the 3 named AppShell header tests; remove/clone/tweak transport-call assertions are intact (grep `transportCalled).toBe(false)` still present in MarketplaceModify.test.tsx).
  </acceptance_criteria>
  <done>The 5 test files query the ⋮ in the titlebar; AppShell.test.tsx + WindowFrame.test.tsx show RED against current code; no behavioral assertion weakened.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — move ⋮ + ContextualPrompt to WindowFrame; strip AppShell to content-only</name>
  <files>src/ui/WindowFrame.tsx, src/ui/AppShell.tsx</files>
  <read_first>
    - src/ui/WindowFrame.tsx (full file — the titlebar grid, WindowBody memo, WindowFrameProps, onModify already received)
    - src/ui/AppShell.tsx (full file — the header pattern lines 46-89 being moved out)
    - src/ui/ContextualPrompt.tsx (the popover being re-parented, reused as-is)
    - .planning/phases/19-window-chrome-menu-relocation/19-PATTERNS.md (the "WindowFrame.tsx" + "AppShell.tsx" sections — exact excerpts for button markup, handleApply, stopPropagation, WindowBody prop removal)
    - src/index.css lines 714-722 (titlebar grid: auto 1fr auto — the ⋮ goes in the trailing auto column)
  </read_first>
  <action>
    In WindowFrame.tsx: add `useState` to the React import; import `MoreVertical` from "lucide-react" and `ContextualPrompt` from "./ContextualPrompt". In the WindowFrame function body add `const [promptOpen, setPromptOpen] = useState(false)` and `handleApply(instruction)` that calls `setPromptOpen(false)` then `onModify?.(instruction)`. Render the `⋮` button (className "app-bar__icon-btn", aria-label "App options", aria-haspopup "dialog", aria-expanded={promptOpen}, title "Options", MoreVertical size={20} aria-hidden) inside the `.window-chrome__titlebar` div as the THIRD grid column (after `.window-chrome__title-group`), right-aligned opposite the traffic-lights. The button's onClick toggles promptOpen AND calls `e.stopPropagation()` so the click does not trigger the titlebar drag's onPointerDown. Render `{promptOpen && <ContextualPrompt targetName={title} onApply={handleApply} onCancel={() => setPromptOpen(false)} />}` AFTER the titlebar div but still inside `.window-chrome` (NOT inside the body). If the titlebar's `overflow` clips the popover, use `createPortal(..., document.body)` as a FALLBACK only — prefer in-titlebar render (KISS/YAGNI per CONTEXT.md). Update WindowBody (the memo) to stop passing `onModify` and `hideClose` to AppShell — drop both from WindowBodyProps and the AppShell call; AppShell now receives only `displayName` and children.
    In AppShell.tsx: remove the entire `app-shell__header` div (title span + controls + ⋮ + the × ), the `promptOpen` useState, `handleApply`, and the `ContextualPrompt` render. Remove imports `useState`, `MoreVertical`, `ContextualPrompt`. Remove props `onClose`, `onModify`, `hideClose` — keep `displayName` (for the region aria-label) and `children`. The returned JSX is `<div className="app-shell" role="region" aria-label={displayName}><div className="app-shell__content">{children}</div></div>`. Keep `import type { ReactNode } from "react"`.
  </action>
  <verify>
    <automated>npm test -- src/ui/AppShell.test.tsx src/ui/WindowFrame.test.tsx src/ui/MarketplaceModify.test.tsx src/ui/MarketplaceWindows.test.tsx src/ui/DesktopShell.test.tsx 2>&1 | tail -25</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "app-shell__header" src/ui/AppShell.tsx` returns 0; `grep -c "app-shell__controls" src/ui/AppShell.tsx` returns 0.
    - `grep -c "App options" src/ui/WindowFrame.tsx` returns >= 1; `grep -c "App options" src/ui/AppShell.tsx` returns 0.
    - `grep -c "ContextualPrompt" src/ui/WindowFrame.tsx` returns >= 1; `grep -c "ContextualPrompt" src/ui/AppShell.tsx` returns 0.
    - WindowFrame.tsx `WindowBody` no longer passes `onModify` or `hideClose` to AppShell: `grep -v '^//' src/ui/WindowFrame.tsx | grep -c "hideClose={true}"` returns 0.
    - The ⋮ button onClick calls `e.stopPropagation()` (grep `stopPropagation` in WindowFrame.tsx returns >= 1).
    - All 5 test files pass: the npm test command above exits 0 for those files (GREEN).
  </acceptance_criteria>
  <done>⋮ + ContextualPrompt live in WindowFrame titlebar; AppShell is header-free content-only; the 5 test files all pass.</done>
</task>

<task type="auto">
  <name>Task 3: Full-suite regression + hygiene gate + tsc</name>
  <files>(no source changes — runs npm test / typecheck / hygiene / csp gates)</files>
  <read_first>
    - src/hygiene.test.ts (the lexicon gate — confirms no banned token leaks; "synthesi", and the v3.0 extended words iframe/sandbox/isolation must not appear in UI copy)
    - src/csp.test.ts (FOUC/CSP invariant — must stay green; this plan touches no FOUC script)
    - package.json (scripts: test, typecheck)
  </read_first>
  <action>
    Run the full test suite, the typecheck, and confirm the hygiene gate is green. This plan adds NO new UI copy strings and NO banned tokens — the ⋮ aria-label "App options", title "Options", and ContextualPrompt copy ("Modify", "Apply", "Cancel") are all pre-existing neutral strings simply moved. Confirm the 727-test baseline is preserved (the 5 edited files keep their assertion count; AppShell.test.tsx goes from 3 header tests to 1 region test — net suite count adjusts by -2 in that file but the overall behavioral coverage is preserved, which is expected and acceptable per CONTEXT.md). Do NOT introduce any new npm dependency. Fix any tsc error surfaced by the AppShell prop removal (e.g. a stale `onClose`/`onModify`/`hideClose` passed to AppShell anywhere) — search all callers with grep before declaring done.
  </action>
  <verify>
    <automated>npm test 2>&1 | tail -15 && npm run typecheck 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - `npm test` exits 0 (entire suite green; no remaining file queries the ⋮ in the body).
    - `npm run typecheck` exits 0 (no AppShell caller still passes removed props).
    - `npm test -- src/hygiene.test.ts` exits 0 (no banned token leaked by the move).
    - `npm test -- src/csp.test.ts` exits 0 (FOUC/CSP hash untouched).
    - `git diff --stat package.json` shows no dependency change (zero new deps).
    - `grep -rn "App options" src/ --include="*.tsx" | grep -i "within(region)\|within(body)\|app-shell" ` returns no matches (every ⋮ query targets the titlebar).
  </acceptance_criteria>
  <done>Full suite + typecheck + hygiene + CSP all green; no new deps; the CHROME-01 gate (MOD-01..04 from the titlebar) is confirmed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user instruction → ContextualPrompt → onModify → routeModification | Free-form text the user types in the ⋮ prompt crosses into the modification router (client-side only, no model call for remove/clone). |
| devtools-visible source surface | Source comments + class names + copy strings are inspectable via F12 — the hygiene hard rule applies. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-01 | Information disclosure | Moved ⋮ markup + ContextualPrompt copy | mitigate | The moved strings ("App options", "Options", "Modify"/"Apply"/"Cancel") carry no banned token; Task 3 runs `src/hygiene.test.ts` to assert the move leaks no mechanic lexicon and no iframe/sandbox/isolation word. |
| T-19-02 | Tampering | onModify routing from the titlebar | accept | The instruction is the user's own input acting on the user's own window; remove/clone resolve client-side with no model call (no new attack surface vs the pre-move body ⋮). |
| T-19-03 | Repudiation | n/a | accept | Local single-user desktop; no audit requirement. |
</threat_model>

<verification>
- All 727 prior tests green (`npm test` exits 0).
- `npm run typecheck` exits 0.
- `grep -c "app-shell__header" src/ui/AppShell.tsx` returns 0.
- `grep -c "App options" src/ui/WindowFrame.tsx` returns >= 1 and the same grep on AppShell.tsx returns 0.
- Hygiene + CSP gates green.
</verification>

<success_criteria>
1. The ⋮ button is in the `WindowFrame` titlebar (right of the traffic-lights / title), not the app body.
2. Clicking it opens the contextual prompt; the in-body app-shell header is gone (AppShell is content-only).
3. MOD-01..04 all pass from the titlebar (remove/clone no model call; tweak new key) — the Phase 20 gate.
4. All 727 tests green; tsc 0; hygiene + CSP green; zero new deps.
</success_criteria>

<output>
After completion, create `.planning/phases/19-window-chrome-menu-relocation/19-01-SUMMARY.md`
</output>
