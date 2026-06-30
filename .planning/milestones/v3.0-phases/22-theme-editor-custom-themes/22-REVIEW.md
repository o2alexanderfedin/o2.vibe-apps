---
phase: 22-theme-editor-custom-themes
reviewed: 2026-06-30T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/ui/VibeThemeProvider.tsx
  - src/host/settingsStore.ts
  - src/ui/ThemeEditor.tsx
  - src/ui/contrastRatio.ts
  - src/ui/ThemeSelector.tsx
  - src/ui/MenuBar.tsx
  - src/ui/DesktopShell.tsx
  - src/services/testServices.ts
  - index.html
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-06-30
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

The custom theme editor and persistence plumbing is largely well-structured. The
IoC/DI seam is correctly honoured throughout (no direct IDB access in components),
the "custom:" namespace avoids collisions with built-ins, the delete ordering
(switch then delete) satisfies the SC#5 requirement, and `sanitizeDisplayName`
always returns a non-empty string so the blank-name injection path is closed by
the library. `settingsStore.ts` introduces no new object stores and no version
bump, satisfying the additive-IDB-only constraint.

One blocker stands out: the save handler in `ThemeEditor` conflates "save" with
"create-only" — it adds to the IDB index and writes the new key but never removes
the old key or old index entry when the user renames a theme. Every rename silently
duplicates the theme. The remaining findings are quality / correctness issues
(false-positive contrast warnings on every built-in theme, a potential silent name
substitution, a non-atomic write pair, and a transient render-order glitch).

---

## Critical Issues

### CR-01: Rename path in `handleSave` orphans old entry — duplicate theme pills on every rename

**File:** `src/ui/ThemeEditor.tsx:148-206`

**Issue:** `handleSave` is wired as a pure "upsert new key" operation. When the
editor is open in edit mode (`editingName` is set) and the user changes the name,
`sanitized !== editingName`. The handler writes the theme vars to the NEW key
(`custom:${sanitized}`), appends `sanitized` to the index if absent, and updates
localStorage — but it never:

- `deleteRaw("custom:" + editingName)` (old IDB entry stays)
- removes `editingName` from the `names` array before re-writing the index
- `removeItem("vibe.customTheme." + editingName)` (old localStorage mirror stays)

After closing the editor, `refreshCustomThemes` repopulates `customThemesState`
from the index, which now contains BOTH `editingName` and `sanitized`. The
`ThemeSelector` renders a pill for each entry, so the user sees the old theme
pill and the renamed theme pill side-by-side. The old entry has no UI path to
delete it (no "Edit" button that correctly identifies it after the rename), and it
persists in IDB, localStorage, and the index permanently.

Renaming with the **same** name is correct (the upsert overwrites in place and the
index check is idempotent). The bug is exclusively in the name-change path.

**Fix:** At the start of the save try-block, detect whether a rename is in progress
and delete the stale entries before writing the new ones:

```typescript
// Inside the try block, BEFORE writeRaw(idbKey, serialized):
const isRename = editingName !== undefined && editingName !== sanitized;
if (isRename) {
  // Remove old IDB data entry and clean localStorage mirror first.
  await settingsStore.deleteRaw(`custom:${editingName}`);
  try {
    localStorage.removeItem(`vibe.customTheme.${editingName}`);
  } catch { /* best-effort */ }
}

await settingsStore.writeRaw(idbKey, serialized);

// When rebuilding the index, remove the old name as well as adding the new one.
const indexRaw = await settingsStore.readRaw("customThemeIndex");
let names: string[] = indexRaw ? (JSON.parse(indexRaw) as string[]) : [];
if (isRename) {
  names = names.filter((n) => n !== editingName);
}
if (!names.includes(sanitized)) {
  names.push(sanitized);
}
await settingsStore.writeRaw("customThemeIndex", JSON.stringify(names));
```

---

## Warnings

### WR-01: `sanitizeDisplayName` silently replaces banned-token-only names with "App" — no user feedback

**File:** `src/ui/ThemeEditor.tsx:152-159`

**Issue:** The pre-sanitization guard (`if (!nameInput.trim())`) correctly rejects
an empty input with an error message. However, `sanitizeDisplayName` has its own
fallback: when the entire stripped result is empty (e.g. the user typed "synthesize"
or any other fully-banned token), it returns the literal string `"App"`. The save
path then continues silently, persisting the theme under the key `custom:App` with
no indication to the user that their chosen name was rejected and replaced.

Practical consequence: the user types "Mock Dark" → theme is saved as "App Dark"
(or just "App" if the word "Mock" was the entire input). The editor closes and a
pill labelled "App" appears in the ThemeSelector — unexpected and confusing.

**Fix:** After `sanitizeDisplayName`, check whether the result differs from the
trimmed input in a meaningful way, and if the canonical fallback "App" was injected,
surface a specific error:

```typescript
const sanitized = sanitizeDisplayName(nameInput.trim());
if (sanitized === "App" && nameInput.trim().toLowerCase() !== "app") {
  setError("That name contains reserved words — choose a different name");
  return;
}
```

A stricter alternative is to surface the sanitized preview in real-time inside the
input field, but the above guard is the minimum correct fix.

---

### WR-02: Contrast warning fires as a false positive on every built-in theme — wrong color pair

**File:** `src/ui/ThemeEditor.tsx:245-248`

**Issue:** The WCAG AA advisory check computes `contrastRatio(vars["--text"], vars["--b1"])`.
`--b1` is labelled "Accent 1" and is used for interactive controls (buttons, brand
highlights), NOT for a page background. The built-in themes intentionally use
saturated accent colours against light-coloured text, which produces ratios well
below the 4.5:1 threshold:

| Theme  | --text    | --b1      | Approx. ratio |
|--------|-----------|-----------|---------------|
| Aurora | `#f3f1ff` | `#7c5cff` | ~3.9:1        |
| Aero   | `#eef6ff` | `#4aa3ff` | ~4.2:1        |
| Aqua   | `#f4f8ff` | `#5ea9ff` | ~4.1:1        |
| Noir   | `#f5eeff` | `#e040fb` | ~3.0:1        |

All four built-in themes fail the check. Because `initialVars` for a Duplicate or
Edit flow is seeded from one of these themes, the warning will fire immediately
when the editor opens in those modes — before the user has changed anything. This
trains users to dismiss or ignore the warning, defeating its purpose entirely.

The semantically correct pair would be `--text` vs the page background (`--wall`),
but `--wall` is a CSS `radial-gradient()` string that `parseHex` correctly returns
`null` for. The current fallback to `--b1` is therefore both wrong semantically
and guaranteed to produce noise.

**Fix (minimum):** Change the checked pair to `--text` vs `--accentA` or
`--text` vs `--accentB`, which are the colours used for text-on-surface situations.
Or suppress the warning entirely when `contrastRatio` returns `null` (already done)
AND guard that the checked pair is labelled clearly as text-on-accent, not
text-on-background. A better fix changes the label to:

```
Low contrast between text colour and Accent 1 — text rendered on this accent may be hard to read
```

This removes the false-positive implication that the overall theme contrast is low.
The cleanest fix is to remove the check from the current pair and introduce it only
at the point where the theme actually renders text over an accent background.

---

### WR-03: Partial IDB write leaves orphaned theme entry when index update fails

**File:** `src/ui/ThemeEditor.tsx:175-187`

**Issue:** The save sequence inside the `try` block is:

```
1. writeRaw("custom:X", serialized)     ← theme data written
2. readRaw("customThemeIndex")
3. writeRaw("customThemeIndex", …)      ← index updated
```

Steps 2 and 3 are not atomic with step 1. If step 1 succeeds but step 2 or 3
fails (IDB error, storage full, or `JSON.parse` throws on a corrupt index), the
outer `catch` fires `setSaveError`, telling the user to retry. The theme vars entry
`custom:X` is now in IDB but absent from the index. A subsequent `refreshCustomThemes`
call (on retry or next mount) will never read it because iteration walks only the
index. The orphaned entry is unreachable via the UI and accumulates silently.

For a same-name retry this is harmless (the orphan is overwritten). For a
different-name retry the orphan persists indefinitely alongside the successfully
saved theme.

**Fix:** On index-update failure, delete the already-written theme entry as a
best-effort rollback so the orphan is not created:

```typescript
try {
  await settingsStore.writeRaw(idbKey, serialized);
  try {
    const indexRaw = await settingsStore.readRaw("customThemeIndex");
    // … update and rewrite index …
  } catch {
    // Index update failed — roll back the theme data write so no orphan is created.
    await settingsStore.deleteRaw(idbKey);
    throw new Error("index update failed");
  }
  // … localStorage, setTheme, refresh, close …
} catch {
  setSaveError("Could not save the theme. Please try again.");
}
```

---

### WR-04: Transient Aurora flash when saving a new custom theme due to intermediate render state

**File:** `src/ui/VibeThemeProvider.tsx:259-269` and `src/ui/ThemeEditor.tsx:197-203`

**Issue:** In `handleSave`, after writing to IDB:

```typescript
setTheme(idbKey, vars);          // (1) queues setThemeState("custom:X")
await refreshCustomThemes();     // (2) async IDB reads → setCustomThemesState
onClose();
```

`setTheme` does not call `applyVarsToRoot` directly; that side-effect lives in
the `useEffect` that depends on `[theme, customThemesState]`. If React processes
the pending `setThemeState` from (1) before `refreshCustomThemes` from (2) resolves
and updates `customThemesState`, there is an intermediate render where:

- `theme === "custom:X"` (new value)
- `customThemesState.get("X") === undefined` (not yet populated)

The `useEffect` falls through to the fallback:
```typescript
const vars = customThemesState.get(name) ?? VIBE_THEMES[DEFAULT_THEME]; // Aurora
applyVarsToRoot(vars); // ← overwrites :root with Aurora for the frame duration
```

The editor overlay and underlying desktop briefly flash to Aurora colours before
`setCustomThemesState` triggers the corrective re-render. The flash duration equals
the IDB read round-trip inside `refreshCustomThemes` (typically 1–10 ms). It may
be imperceptible under typical conditions but is code-level incorrect and may
become visible under storage load.

**Fix:** Apply vars to `:root` eagerly inside `setTheme` when an explicit `vars`
parameter is provided, avoiding the dependency on `customThemesState` being
populated first:

```typescript
// Inside setTheme, after setThemeState(name):
if (vars !== undefined) {
  applyVarsToRoot(vars);
} else if ((VALID_THEMES as readonly string[]).includes(name as string)) {
  applyVibeTheme(name as VibeThemeName);
}
// The useEffect remains as a catch-all for mount / theme restore.
```

---

## Info

### IN-01: `contrastRatio.ts` header comment incorrectly describes the check as "text/background"

**File:** `src/ui/contrastRatio.ts:1-6`

**Issue:** The module comment states "text/background ratio falls below the WCAG AA
threshold." The function is actually called with `--text` and `--b1` (an accent
colour), not a background. The misleading comment makes it harder to diagnose why
the check fires on readable themes (see WR-02).

**Fix:** Update the comment to match actual usage:

```typescript
// Used by ThemeEditor to show an advisory contrast warning when the
// text-colour / accent-colour (--text vs --b1) ratio falls below the WCAG AA
// threshold of 4.5:1. Returns null for non-hex values (gradients, rgba).
```

---

### IN-02: Theme name `<input>` has no `maxLength` — unbounded localStorage key length

**File:** `src/ui/ThemeEditor.tsx:275-287`

**Issue:** The theme name input has no `maxLength` attribute. An arbitrarily long
name passes through `sanitizeDisplayName`, which collapses whitespace but does not
truncate, and ends up as a very long localStorage key
(`vibe.customTheme.<name>`) and IDB key (`custom:<name>`). While there is no
security risk in a same-origin client-only app, very long keys may cause observable
latency in some browsers' localStorage implementations.

**Fix:**
```jsx
<input
  maxLength={64}
  /* … rest of props … */
/>
```

---

### IN-03: `RecordingSettingsStore.rawDeletes` is a `Set` — duplicate-call count is undetectable in tests

**File:** `src/services/testServices.ts:87,134-144`

**Issue:** The interface comment says "All keys passed to deleteRaw, in call order
(set, so duplicates collapse)." Because `rawDeletes` returns a `Set`, a test cannot
assert that `deleteRaw("custom:X")` was called exactly once vs. twice. The
custom-theme delete path calls `deleteRaw` once (correct), but if a future
refactor accidentally calls it twice a `Set`-based assertion would not detect the
regression.

**Fix:** Replace the `Set` with an array in both the interface and the
implementation so tests can assert exact call counts:

```typescript
// Interface change:
readonly rawDeletes: readonly string[];

// Implementation:
const rawDeletesList: string[] = [];
// …
deleteRaw(key: string): Promise<void> {
  rawCurrentMap.delete(key);
  rawDeletesList.push(key);   // preserves duplicate calls
  return Promise.resolve();
},
get rawDeletes(): readonly string[] {
  return [...rawDeletesList]; // snapshot
},
```

---

_Reviewed: 2026-06-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
