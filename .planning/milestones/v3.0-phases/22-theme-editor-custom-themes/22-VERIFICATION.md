---
phase: 22-theme-editor-custom-themes
verified: 2026-06-30T01:45:00Z
status: human_needed
score: 6/6
overrides_applied: 0
human_verification:
  - test: "FOUC: create a custom theme, save it, hard-reload the browser (Cmd+Shift+R)"
    expected: "The desktop appears immediately in the custom theme — no brief Aurora flash before the custom theme applies"
    why_human: "First-paint timing cannot be observed by JSDOM or Node; the FOUC script is implemented and the CSP hash is correct, but the actual paint ordering requires a real browser reload to observe"
  - test: "THEME_PUSH to live frames: open two apps, switch to a custom theme from the theme switcher"
    expected: "Both app frame bodies re-skin in lockstep with the host chrome — the custom theme vars reach both opaque-origin iframes"
    why_human: "broadcastTheme is confirmed called in unit tests, but iframe re-skinning across the opaque-origin boundary requires a real browser (Phase 20 Playwright tests cover built-in theme switching; custom theme variant needs a real-browser check)"
---

# Phase 22: Theme Editor & Custom Themes — Verification Report

**Phase Goal:** A user can create, name, edit, and save custom themes over the 12-variable contract, see them in the menu-bar switcher alongside the built-ins, and find them waiting after a hard reload — without any Aurora flash on first paint.

**Verified:** 2026-06-30T01:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Live preview mutates `:root` without saving | VERIFIED | `ThemeEditor.tsx:131-134` `handleVarChange` calls `document.documentElement.style.setProperty(cssVar, newValue)` with no IDB call; Test 1 in `ThemeEditor.test.tsx` asserts `:root` mutated and `store.rawWriteCount("custom:mytheme") === 0` |
| 2 | Name+save appears in switcher; re-skins host AND frames via THEME_PUSH | VERIFIED | `ThemeEditor.tsx:177-201` writes IDB, updates index, then calls `setTheme(idbKey, vars)` which hits `VibeThemeProvider.tsx:325` `broadcastTheme(resolvedVars)`; `ThemeSelector.tsx:71-98` renders custom pills from `customThemes` context; Test 6 asserts `broadcastTheme` called once with correct vars |
| 3 | Invalid color → rejected before any IDB write (CSS.supports gate) | VERIFIED | `ThemeEditor.tsx:161-168` loops all 12 vars through `isValidValue` (CSS.supports gate) and returns early with error before any `writeRaw` call; Test 2 confirms `rawWriteCount === 0` and error element visible |
| 4 | Create custom theme, reload → still in switcher; active theme applied on first paint with NO Aurora flash | VERIFIED (code) / HUMAN NEEDED (visual paint timing) | `ThemeEditor.tsx:189-195` mirrors vars to `localStorage["vibe.customTheme.<name>"]` and selection to `localStorage["marketplace.osTheme"]`; `index.html:88-104` FOUC script checks `vibeStored.indexOf('custom:') === 0`, reads `localStorage.getItem('vibe.customTheme.' + customName)`, applies vars to `:root`; CSP hash `sha256-8Bk+Rf26odMnPYZdW1mOxS01ZIGzT+3Bfq5SfwHxtl0=` verified to match current FOUC script body; `csp.test.ts` passes |
| 5 | Name "aurora" → "custom:aurora"; built-in Aurora intact; delete auto-switches to Aurora before deleteRaw | VERIFIED | `ThemeEditor.tsx:172` always prefixes: `const idbKey = \`custom:${sanitized}\``; Test 8 asserts `rawWriteCount("custom:aurora") === 1` and `rawWriteCount("aurora") === 0`; `ThemeEditor.tsx:215` calls `setTheme("aurora")` at line 215, `deleteRaw(idbKey)` at line 218; Test 7 asserts `broadcastTheme` index in callOrder is less than `deleteRaw:custom:existingTheme` index |
| 6 | Inline non-blocking WCAG-AA contrast warning; Save NOT disabled | VERIFIED | `ThemeEditor.tsx:245-248` computes `contrastRatio(vars["--text"], vars["--b1"])` with 4.5 threshold; warning rendered as `role="alert"` (line 313); no `disabled` attribute on Save button (confirmed by grep); Tests 10+11 confirm warning presence/absence; `contrastRatio.ts` is a pure WCAG 2.1 implementation |

**Score:** 6/6 truths verified in code

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ui/ThemeEditor.tsx` | 12-var editor with live preview, CSS.supports gate, save/delete, contrast warning | VERIFIED | 355 lines; all behaviors implemented and tested |
| `src/ui/ThemeEditor.test.tsx` | 12 behavioral tests | VERIFIED | Tests 1-12 covering all SC requirements |
| `src/ui/contrastRatio.ts` | WCAG 2.1 contrast ratio pure function | VERIFIED | 59 lines; linearize + relativeLuminance + parseHex; returns null for non-hex |
| `src/ui/contrastRatio.test.ts` | Tests for contrastRatio | VERIFIED | Tests black/white (21:1), below-AA (#777 on white), null for rgba/gradients, 3-char hex |
| `src/ui/ThemeSelector.tsx` | Custom theme pills alongside 4 built-ins + New Theme + Duplicate + Edit | VERIFIED | Lines 71-108 render custom pills from `customThemes` context map |
| `src/ui/ThemeSelector.test.tsx` | Tests for custom pills, Duplicate, Edit, New Theme | VERIFIED | 7 tests including Phase 22 custom pill scenarios |
| `src/ui/VibeThemeProvider.tsx` | `CustomThemeName`, `AnyThemeName`, `currentVars`, `customThemes`, `refreshCustomThemes` | VERIFIED | All 5 additions present; `setTheme` calls `broadcastTheme`; `currentVars` memo handles custom themes |
| `src/host/settingsStore.ts` | `deleteRaw` method on `SettingsStore` interface + implementation | VERIFIED | Interface at line 34-36; real implementation at lines 111-121; test double in `testServices.ts:135-140` |
| `index.html` (FOUC script) | Custom theme branch: reads `vibe.customTheme.<name>` from localStorage | VERIFIED | Lines 88-104; `indexOf('custom:') === 0` guard, reads and applies custom vars |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ThemeEditor.tsx` handleSave | IDB settings store | `settingsStore.writeRaw("custom:<name>", ...)` | WIRED | Lines 177, 187 |
| `ThemeEditor.tsx` handleSave | localStorage FOUC mirror | `localStorage.setItem("vibe.customTheme.<name>", ...)` | WIRED | Lines 192-193 |
| `ThemeEditor.tsx` handleSave | broadcastTheme | `setTheme(idbKey, vars)` → `VibeThemeProvider.setTheme` → `broadcastTheme(resolvedVars)` | WIRED | ThemeEditor line 198; VibeThemeProvider line 325 |
| `ThemeEditor.tsx` handleSave | ThemeSelector refresh | `refreshCustomThemes()` → updates `customThemesState` → re-renders pills | WIRED | ThemeEditor line 201; VibeThemeProvider lines 215-251 |
| `ThemeEditor.tsx` handleDelete | Aurora switch before delete | `setTheme("aurora")` at line 215 then `deleteRaw` at line 218 | WIRED | Ordering confirmed by Test 7 |
| `ThemeSelector.tsx` | `VibeThemeContext.customThemes` | `useVibeTheme()` in ThemeSelector.tsx:43 | WIRED | Lines 71-98 iterate `customThemes.entries()` |
| `MenuBar.tsx` | `ThemeSelector` with `onOpenThemeEditor` | `ThemeSelectorProps["onOpenThemeEditor"]` prop at line 22 | WIRED | MenuBar.tsx:22, 52 |
| `DesktopShell.tsx` | `MenuBar.onOpenThemeEditor` | `setThemeEditorState(opts ?? {})` at line 994 | WIRED | Confirmed wired |
| `DesktopShell.tsx` | `ThemeEditor` modal | `{themeEditorState !== null && <ThemeEditor .../>}` at lines 1027-1032 | WIRED | Confirmed wired |
| `DesktopShell.tsx` currentVars | `WindowFrame.themeVars` (SandboxFrame) | `themeCtx?.currentVars ?? VIBE_THEMES["aurora"]` at lines 857-863; passed as `themeVars={currentThemeVars}` at line 964 | WIRED | Phase 22 enhancement uses `currentVars` (not `VIBE_THEMES[theme]`) so custom themes deliver real vars |
| FOUC script | localStorage `marketplace.osTheme` | `vibeStored.indexOf('custom:') === 0` branch | WIRED | index.html lines 88-104 |
| CSP hash | FOUC script body | `sha256-8Bk+Rf26odMnPYZdW1mOxS01ZIGzT+3Bfq5SfwHxtl0=` in script-src | WIRED | Computed hash matches; csp.test.ts passes |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ThemeSelector.tsx` custom pills | `customThemes` (ReadonlyMap) | `VibeThemeProvider` refreshCustomThemes reads IDB `customThemeIndex` + per-key entries | Yes — reads real IDB keys via `readRaw` | FLOWING |
| `ThemeEditor.tsx` contrast warning | `showContrastWarning` | `contrastRatio(vars["--text"], vars["--b1"])` — live computed from picker state | Yes — pure calculation | FLOWING |
| `DesktopShell.tsx` custom vars to frame | `currentThemeVars` | `themeCtx.currentVars` resolves from `customThemesState.get(name)` | Yes — custom theme map populated from IDB on mount | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| tsc --noEmit | `npx tsc --noEmit` | 0 errors, 0 warnings | PASS |
| Full test suite (930 tests) | `npx vitest run` | 92 test files, 930 tests, all passed | PASS |
| ThemeEditor tests (12 tests) | `npx vitest run src/ui/ThemeEditor.test.tsx` | 12/12 passed | PASS |
| CSP hash guard | `npx vitest run src/csp.test.ts` | 5/5 passed (hash matches FOUC script) | PASS |
| Hygiene gate + HYGIENE-07 | `npx vitest run src/hygiene.test.ts` | 6/6 passed; ThemeEditor.tsx in PHASE20_FILES | PASS |
| REGISTRY_DB_VERSION unchanged | `grep REGISTRY_DB_VERSION src/registry/db.ts` | Value is 3 (no version bump) | PASS |
| No new runtime deps | Checked `package.json "dependencies"` | Same 6 deps as before Phase 22; 0 new | PASS |
| No sourcemaps in dist | `ls dist/*.map` | No .map files found | PASS |
| No debt markers in Phase 22 files | grep TBD/FIXME/XXX across Phase 22 source | Zero matches | PASS |
| FOUC script hash matches CSP | `node -e "computed hash"` → `sha256-8Bk+Rf26odMnPYZdW1mOxS01ZIGzT+3Bfq5SfwHxtl0=` | Present in script-src | PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| THEME-06 | Theme editor with 12-var inputs, live preview, CSS.supports rejection | SATISFIED | `ThemeEditor.tsx` full implementation; SC1+SC3 verified |
| THEME-07 | Named, saved, duplicated, deleted themes; sanitized; no built-in collision; delete auto-switches | SATISFIED | SC2+SC5 verified; Tests 3,4,7,8,9 |
| THEME-08 | Custom theme in menu-bar switcher; re-skins host AND frames via THEME_PUSH | SATISFIED (code) / human for iframe repaint | `ThemeSelector.tsx` custom pills; `VibeThemeProvider.setTheme` → `broadcastTheme` |
| THEME-09 | Reload FOUC-free; vars mirrored to localStorage; CSP hash updated in same commit | SATISFIED | SC4 verified; CSP hash confirmed in sync |
| THEME-10 | Inline non-blocking WCAG-AA contrast warning | SATISFIED | SC6 verified; `contrastRatio.ts` + `showContrastWarning` in ThemeEditor |
| HYGIENE-07 | ThemeEditor.tsx covered by isolation-word gate | SATISFIED | `hygiene.test.ts` PHASE20_FILES includes `src/ui/ThemeEditor.tsx`; scan passes |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No debt markers, placeholder returns, hardcoded empty data, or stub implementations found in Phase 22 files.

### Human Verification Required

#### 1. No Aurora Flash on First Paint (SC4 — visual timing)

**Test:** Create a custom theme (e.g., set `--text` to `#ff0000`), save it, confirm it's active in the switcher (pill shows as pressed). Hard-reload the browser (Cmd+Shift+R / Ctrl+Shift+R).

**Expected:** The desktop appears immediately in the custom theme (red text visible from the first frame) — no brief Aurora flash (purple `--text` #f3f1ff) before the custom theme applies.

**Why human:** First-paint FOUC prevention depends on the FOUC script running synchronously before any React paint. JSDOM has no paint pipeline; Node cannot observe frame timing. The code implements this correctly (localStorage mirror + FOUC script `custom:` branch + CSP hash in sync), but actual zero-flash behavior must be observed in a real browser.

#### 2. THEME_PUSH Re-Skins Live Opaque-Origin Frames (SC2 — iframe boundary)

**Test:** Open two apps (they render as sandboxed iframes in iframe mode). Switch from a built-in theme to a custom theme using the menu-bar switcher.

**Expected:** Both app frame bodies immediately re-skin to the custom theme's color scheme — no lag, no stale frame, in lockstep with the menu bar and desktop chrome.

**Why human:** `broadcastTheme` is unit-tested (Test 6 confirms it is called with the correct vars), and the frame bridge (`broadcastTheme` in `frameMount.ts`) sends `THEME_PUSH` postMessages to all tracked frames. But the actual CSS custom property application inside opaque-origin iframes requires a real browser — JSDOM tests use the in-tree fallback mode where `SandboxFrame` is not the real iframe path.

---

### Gaps Summary

No blocking gaps identified. All 6 success criteria are implemented in code, wired end-to-end, and covered by passing tests. The two human verification items are behavioral/visual checks that cannot be confirmed by static analysis or JSDOM-based tests.

---

_Verified: 2026-06-30T01:45:00Z_
_Verifier: Claude (gsd-verifier)_
