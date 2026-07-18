---
phase: 22-theme-editor-custom-themes
plan: "04"
subsystem: ui
tags: [theme-switcher, custom-themes, ThemeEditor, DesktopShell, TDD, THEME-07, THEME-08, THEME-09]
dependency_graph:
  requires: [22-01, 22-02, 22-03]
  provides:
    - Extended ThemeSelector with custom pills + Duplicate/Edit/New Theme
    - MenuBar with onOpenThemeEditor prop
    - DesktopShell with ThemeEditor modal wiring + themeEditorState
    - DesktopShell:863 confirmed using themeCtx?.currentVars (SandboxFrame coupling)
  affects:
    - ThemeSelector (props extended, new buttons)
    - MenuBar (new prop)
    - DesktopShell (ThemeEditor mount, onOpenThemeEditor wiring)
    - SandboxFrame (receives correct themeVars for custom themes via currentVars)
tech_stack:
  added: []
  patterns:
    - "ThemeSelectorProps interface — exported from ThemeSelector for MenuBar type reuse"
    - "onOpenThemeEditor(undefined) explicit call for New Theme — avoids .mock.calls pattern (hygiene gate)"
    - "themeEditorState: ThemeEditorState state mirrors keyDialogOpen pattern (null = closed)"
    - "setThemeEditorState(opts ?? {}) converts ThemeSelectorProps callback to state update"
    - "TDD RED commit before GREEN — 6 failing tests, then all pass in GREEN"
key_files:
  created: []
  modified:
    - src/ui/ThemeSelector.tsx
    - src/ui/ThemeSelector.test.tsx
    - src/ui/MenuBar.tsx
    - src/ui/MenuBar.test.tsx
    - src/ui/DesktopShell.tsx
    - src/ui/DesktopShell.test.tsx
decisions:
  - "onOpenThemeEditor(undefined) explicit — passes undefined to allow toHaveBeenCalledWith(undefined) without banned .mock.calls property access"
  - "ThemeEditorState = { initialVars?, editingName? } | null — exactly mirrors KeyDialog boolean pattern with richer payload"
  - "Duplicate button aria-label='Duplicate Aurora' (etc) — uniquely queryable, no exact-count dependency in tests"
  - "Edit button aria-label='Edit myTheme' — same queryability pattern for custom pills"
  - "DesktopShell.tsx:863 currentVars fix was already applied in 22-01; plan 22-04 confirmed it, added regression test"
  - "Rule 3 auto-fix: added temporary onOpenThemeEditor stub in DesktopShell.tsx during Task 1 to unblock tsc, replaced with full impl in Task 2"
  - "Rule 1 hygiene fix: removed comment containing .mock.calls from ThemeSelector.tsx source"
metrics:
  duration: "8m"
  completed: "2026-06-30"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 6
  tests_added: 10
  tests_total: 930
---

# Phase 22 Plan 04: ThemeEditor Wiring — Switcher + DesktopShell Integration Summary

Extended ThemeSelector with custom theme pills (from VibeThemeContext), Duplicate buttons on built-ins, Edit buttons on custom themes, and a New Theme trigger. Extended MenuBar to pass onOpenThemeEditor through. Wired DesktopShell to mount ThemeEditor via themeEditorState mirroring the KeyDialog pattern. Confirmed DesktopShell:863 uses themeCtx?.currentVars (the SandboxFrame fix applied in plan 22-01).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 RED | Failing tests for ThemeSelector/MenuBar custom wiring | `330c72c` | ThemeSelector.test.tsx, MenuBar.test.tsx |
| 1 GREEN | ThemeSelector + MenuBar implementation | `3161888` | ThemeSelector.tsx, MenuBar.tsx, ThemeSelector.test.tsx, DesktopShell.tsx |
| 2 | DesktopShell ThemeEditor wiring + DesktopShell tests | `4285fdf` | DesktopShell.tsx, DesktopShell.test.tsx, ThemeSelector.tsx, ThemeSelector.test.tsx |

## What Was Built

### ThemeSelector.tsx (THEME-07/08)

`ThemeSelectorProps` interface exported with `onOpenThemeEditor: (opts?) => void`.

**Four built-in pills** now each have an adjacent `Duplicate` button:
- `aria-label="Duplicate Aurora"` (and so on per pill)
- onClick calls `onOpenThemeEditor({ initialVars: VIBE_THEMES[name] })`

**Custom theme pills** rendered from `[...customThemes.entries()]`:
- Theme pill button: onClick calls `setTheme("custom:<name>", vars)`, `aria-pressed` tracks active state
- `Edit` button with `aria-label="Edit <name>"`: onClick calls `onOpenThemeEditor({ initialVars: vars, editingName: name })`

**New Theme button**: onClick calls `onOpenThemeEditor(undefined)` (explicit undefined to avoid .mock.calls in tests).

### MenuBar.tsx (THEME-07)

`MenuBarProps` extended with `onOpenThemeEditor: ThemeSelectorProps["onOpenThemeEditor"]` (type reuse). Passed directly to `<ThemeSelector onOpenThemeEditor={onOpenThemeEditor} />`.

### DesktopShell.tsx (THEME-06/07/08)

- `import { ThemeEditor } from "./ThemeEditor"` alongside the existing KeyDialog import
- `ThemeEditorState = { initialVars?, editingName? } | null` type defined locally
- `const [themeEditorState, setThemeEditorState] = useState<ThemeEditorState>(null)` near keyDialogOpen
- MenuBar prop: `onOpenThemeEditor={(opts) => setThemeEditorState(opts ?? {})}`
- Conditional render: `{themeEditorState !== null && <ThemeEditor onClose={() => setThemeEditorState(null)} initialVars={themeEditorState.initialVars} editingName={themeEditorState.editingName} />}`
- Line 863: `themeCtx?.currentVars ?? VIBE_THEMES["aurora"]` — confirmed correct (applied in 22-01)

### DesktopShell.test.tsx (THEME-06/08)

Two new tests in a Phase 22 describe block:
1. **THEME-08 regression guard**: Pre-seeds custom theme `"myCustom"` in IDB, sets localStorage to select it, verifies `document.documentElement.style.getPropertyValue("--text")` equals the custom value after provider loads
2. **THEME-06 mount test**: Clicks "New Theme" in the menu bar banner, asserts ThemeEditor dialog appears with heading "New color theme", verifies Cancel closes the dialog

### ThemeSelector.test.tsx (TDD)

6 new tests added (5 ThemeSelector + 1 MenuBar passthrough):
1. Custom pills appear when customThemes has entries (waitFor async load)
2. Clicking a custom pill writes `"custom:myTheme"` to localStorage and sets aria-pressed
3. New Theme button calls onOpenThemeEditor(undefined)
4. Duplicate Aurora calls onOpenThemeEditor({ initialVars: VIBE_THEMES["aurora"] })
5. Edit myTheme calls onOpenThemeEditor({ initialVars: customVars, editingName: "myTheme" })
6. MenuBar "New Theme" button triggers the onOpenThemeEditor callback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DesktopShell.tsx tsc error from new required MenuBar prop**
- **Found during:** Task 1 GREEN verification (`npx tsc --noEmit`)
- **Issue:** Adding `onOpenThemeEditor` as required to `MenuBarProps` immediately caused TS2741 error in DesktopShell.tsx (Task 2 scope). tsc must pass before committing Task 1.
- **Fix:** Added stub `onOpenThemeEditor={() => {}}` to the MenuBar render in DesktopShell.tsx as part of Task 1. Task 2 replaced it with the full `setThemeEditorState` implementation.
- **Files modified:** src/ui/DesktopShell.tsx
- **Commit:** `3161888` (stub), `4285fdf` (full impl)

**2. [Rule 1 - Bug] Hygiene gate: `.mock.calls` in test → implementation comment**
- **Found during:** Full suite run after Task 2 implementation (`src/hygiene.test.ts` failed)
- **Issue 1:** Test used `onOpenThemeEditor.mock.calls[0]` to check zero-arg call — `.mock` is a banned standalone word in the hygiene gate (confirmed by 22-03 SUMMARY deviation).
- **Fix 1:** Changed implementation to `onOpenThemeEditor(undefined)` (explicit undefined arg) and test to `toHaveBeenCalledWith(undefined)`.
- **Issue 2:** Comment in ThemeSelector.tsx mentioning `.mock.calls` for explanation also triggered the gate.
- **Fix 2:** Removed the comment entirely.
- **Files modified:** src/ui/ThemeSelector.tsx, src/ui/ThemeSelector.test.tsx
- **Commit:** `4285fdf`

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| Task 1 RED (test) | `330c72c` | 6 tests fail (elements don't exist) |
| Task 1 GREEN (feat) | `3161888` | 14 ThemeSelector + MenuBar tests pass |
| Task 2 feat | `4285fdf` | 930/930 all pass |

## Verification Results

```
npx tsc --noEmit                         -> 0 errors
npx vitest run src/ui/ThemeSelector      -> 8/8 passed
npx vitest run src/ui/MenuBar            -> 6/6 passed
npx vitest run src/ui/DesktopShell       -> 31/31 passed
npx vitest run (full suite)              -> 930/930 passed (no regressions)
grep "VIBE_THEMES\[themeCtx" DesktopShell.tsx -> 0 matches (old pattern gone)
grep "currentVars" DesktopShell.tsx      -> 2 matches (comment + implementation)
ThemeSelector.tsx exports ThemeSelectorProps -> confirmed
DesktopShell.tsx imports ThemeEditor     -> confirmed
DesktopShell.tsx mounts ThemeEditor when themeEditorState !== null -> confirmed
```

## Known Stubs

None — all features are fully wired. The ThemeEditor component itself is complete (plan 22-03). The switcher shows custom themes, selecting them calls setTheme with correct vars, the editor opens and closes from DesktopShell.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes in this plan. The ThemeEditorState carries only theme vars and editingName — no secrets, no API key (T-22-12, accepted per plan threat model). The Duplicate/Edit/New Theme flows open the ThemeEditor which handles IDB writes internally (all mitigations already in ThemeEditor — plan 22-03). T-22-11 (undefined themeVars to SandboxFrame) is mitigated by the existing `themeCtx?.currentVars ?? VIBE_THEMES["aurora"]` fix confirmed in this plan.

## Self-Check: PASSED

Files exist:
- src/ui/ThemeSelector.tsx found
- src/ui/ThemeSelector.test.tsx found
- src/ui/MenuBar.tsx found
- src/ui/MenuBar.test.tsx found
- src/ui/DesktopShell.tsx found
- src/ui/DesktopShell.test.tsx found

Commits exist:
- 330c72c (test RED task 1) found
- 3161888 (feat GREEN task 1) found
- 4285fdf (feat task 2) found
