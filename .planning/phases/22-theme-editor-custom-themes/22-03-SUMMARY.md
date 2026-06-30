---
phase: 22-theme-editor-custom-themes
plan: "03"
subsystem: ui
tags: [theme-editor, custom-themes, live-preview, wcag, css-supports, tdd]
dependency_graph:
  requires: [22-01, 22-02]
  provides:
    - src/ui/ThemeEditor.tsx (ThemeEditor modal — 12-var editor with live preview, save, delete, contrast warning)
    - src/ui/ThemeEditor.test.tsx (12-test suite covering all THEME-06/07/10 behaviors)
  affects:
    - VibeThemeProvider (via setTheme, refreshCustomThemes)
    - settingsStore (via writeRaw, deleteRaw, readRaw)
    - DesktopShell (mounting point — wired in plan 22-04)
tech_stack:
  added: []
  patterns:
    - "CSS.supports('background', value) as the universal validation gate for all 12 CSS vars"
    - "useRef snapshot of :root on mount — restored on Cancel without state"
    - "handleVarChange: setProperty synchronously on every keystroke (live preview, no IDB)"
    - "sanitizeDisplayName applied before any key construction or DOM render"
    - "setTheme('aurora') before deleteRaw — auto-switch ordering (SC#5)"
    - "JSDOM CSS.supports stub pattern: Object.defineProperty(window, 'CSS', ...) in beforeEach"
    - "broadcastTheme spy via vi.spyOn + toHaveBeenCalledWith(expect.objectContaining)"
key_files:
  created:
    - src/ui/ThemeEditor.tsx
    - src/ui/ThemeEditor.test.tsx
  modified: []
decisions:
  - "Empty-name check uses !nameInput.trim() before sanitizeDisplayName (sanitizeDisplayName returns 'App' not '' for empty input)"
  - "contrastWarning checks --text vs --b1 only (the hex pair most likely to be user-adjusted)"
  - "Task 2 tests all passed immediately because the full implementation was complete in Task 1 GREEN — no separate GREEN phase commit needed for Task 2"
  - "broadcast.mock.calls avoided (hygiene: 'mock' as standalone word banned) — replaced with toHaveBeenCalledWith(expect.objectContaining(...))"
metrics:
  duration_minutes: 8
  completed_date: "2026-06-30"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
  tests_added: 12
  tests_total: 922
---

# Phase 22 Plan 03: ThemeEditor Component + Test Suite Summary

ThemeEditor modal with 12 CSS custom-property inputs, live :root preview (no IDB on keystroke), CSS.supports validation gate, sanitizeDisplayName on name input, IDB + localStorage mirror on save, delete auto-switch to Aurora, advisory WCAG AA contrast warning. Full 12-test TDD suite covering every acceptance criterion.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 RED | Minimal failing test for ThemeEditor | `8ef35a1` | src/ui/ThemeEditor.test.tsx |
| 1 GREEN | ThemeEditor component implementation | `f57672a` | src/ui/ThemeEditor.tsx |
| 2 | Comprehensive 12-test suite | `b0224c3` | src/ui/ThemeEditor.test.tsx |

## What Was Built

### ThemeEditor.tsx (THEME-06/07/10)

`ThemeEditorProps` interface: `onClose: () => void`, `initialVars?: Record<string,string>`, `editingName?: string`.

**Live preview:** `handleVarChange` calls `document.documentElement.style.setProperty(cssVar, value)` synchronously on every keystroke. No IDB or localStorage touch.

**Cancel / Escape:** A `useRef` snapshot of all 12 `:root` var values is captured on mount. `handleClose` restores these values before calling `onClose`.

**Save handler (async):**
1. Reject empty name before sanitization: `if (!nameInput.trim()) { setError(...); return; }`
2. `sanitizeDisplayName(nameInput.trim())` — strips banned tokens
3. CSS.supports gate: `isValidValue(value)` = `typeof CSS !== "undefined" && CSS.supports("background", value)` on every var; rejects before any IDB write
4. `idbKey = "custom:<sanitized>"` — built-in collision impossible by namespace
5. `settingsStore.writeRaw(idbKey, serialized)`
6. `settingsStore.readRaw("customThemeIndex")` → update array → `writeRaw("customThemeIndex", ...)`
7. `localStorage.setItem("vibe.customTheme.<sanitized>", ...)` + `localStorage.setItem(STORAGE_KEY_OS_THEME, idbKey)` — FOUC mirror
8. `setTheme(idbKey, vars)` → triggers `broadcastTheme(vars)` to all frames
9. `await refreshCustomThemes()` → updates switcher pills
10. `onClose()`

**Delete handler (async):**
1. `setTheme("aurora")` — auto-switch BEFORE delete (SC#5)
2. `settingsStore.deleteRaw("custom:<editingName>")`
3. `localStorage.removeItem("vibe.customTheme.<editingName>")`
4. Update index: filter out name → writeRaw
5. `await refreshCustomThemes()`
6. `onClose()`

**Contrast advisory:** `contrastRatio(vars["--text"], vars["--b1"]) < 4.5` rendered as `<p role="alert">` — non-blocking (Save remains enabled).

### ThemeEditor.test.tsx (12 tests)

All 12 behavior tests from the plan:

| # | Behavior | Assertion |
|---|----------|-----------|
| 1 | Live preview | `getPropertyValue("--text") === "#aabbcc"` after input change, no IDB write |
| 2 | CSS.supports rejection | `rawWriteCount("custom:mytheme") === 0`, error element present |
| 3 | Save IDB key | `rawWriteCount("custom:mytheme") === 1`, value has `--text` key |
| 4 | customThemeIndex | `rawWriteCount("customThemeIndex") === 1`, array contains "mytheme" |
| 5 | localStorage mirror | `localStorage.getItem("vibe.customTheme.mytheme")` has `--text` |
| 6 | broadcastTheme spy | Called once with `objectContaining({"--text": any(String)})` |
| 7 | Delete auto-switch order | `broadcastTheme` index < `deleteRaw` index in shared call log |
| 8 | Built-in collision | `rawWriteCount("custom:aurora") === 1`, `rawWriteCount("aurora") === 0` |
| 9 | sanitizeDisplayName | IDB key uses sanitized name |
| 10 | Contrast warning present | `role="alert"` element found for `#777777`/`#ffffff` pair |
| 11 | Contrast warning absent | No `role="alert"` for `#ffffff`/`#000000` pair |
| 12 | Cancel restores :root | `getPropertyValue("--text")` reverts from `#changed` to `#original` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `broadcast.mock.calls` triggers hygiene gate**
- **Found during:** Full suite run after Task 2 test commit attempt
- **Issue:** `broadcast.mock.calls[0]?.[0]` — the word "mock" as a standalone property name (terminated by `.`) matches `\bmock\b` in the hygiene gate
- **Fix:** Replaced with `expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({"--text": expect.any(String)}))` — zero banned tokens, same behavior verified
- **Files modified:** src/ui/ThemeEditor.test.tsx
- **No separate commit** — fixed within the Task 2 test commit

**2. [Rule 2 - Missing] Empty-name check before sanitizeDisplayName**
- **Found during:** Task 1 implementation analysis
- **Issue:** Plan says "if sanitized.length is 0, show error" — but `sanitizeDisplayName` returns "App" for empty input (never empty string), so the length check would never fire
- **Fix:** Added `if (!nameInput.trim())` check before sanitization call; this is the correct guard for the intended behavior
- **Files modified:** src/ui/ThemeEditor.tsx

### TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| Task 1 RED (test) | `8ef35a1` | Module resolution error — ThemeEditor.tsx absent |
| Task 1 GREEN (feat) | `f57672a` | 2 scaffold tests pass; tsc 0 |
| Task 2 test | `b0224c3` | All 12 tests pass immediately (full impl existed from Task 1 GREEN) |

Task 2 had no separate GREEN commit because the Task 1 implementation satisfied all 12 behavior tests on first run. No regressions — full suite 922/922.

## Verification Results

```
npx tsc --noEmit              -> 0 errors
npx vitest run src/ui/ThemeEditor -> 12/12 tests passed
npx vitest run                -> 922/922 tests passed (no regressions)
grep banned-tokens ThemeEditor.tsx -> 0 matches (iframe, sandbox, isolation, synthesi, AI, llm, generat)
ThemeEditor.tsx exports ThemeEditorProps and ThemeEditor -> confirmed
```

## Known Stubs

None — ThemeEditor is a complete implementation. It is not yet mounted in DesktopShell (that is plan 22-04's responsibility).

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. The save handler writes to the existing `settings` IDB store via `writeRaw` (same trust boundary as Phase 21). All mitigations from plan threat_model are present:

| Threat | Mitigation | Status |
|--------|------------|--------|
| T-22-07 User input → IDB key | `sanitizeDisplayName` applied first; `"custom:"` prefix hardcoded | Implemented |
| T-22-08 CSS value → setProperty + IDB | `CSS.supports("background", value)` gate; rejects before writeRaw | Implemented |
| T-22-09 Theme name → DOM | `sanitizeDisplayName` before any DOM render (title, aria-labelledby) | Implemented |
| T-22-10 Malformed vars from IDB | CSS.supports gate at save time; initialVars comes from context (already validated in plan 22-01) | Accepted |

## Self-Check: PASSED

Files exist:
- src/ui/ThemeEditor.tsx found
- src/ui/ThemeEditor.test.tsx found

Commits exist:
- 8ef35a1 (test RED task 1) found
- f57672a (feat GREEN task 1) found
- b0224c3 (test task 2) found
