---
phase: 18-theme-aware-generation
reviewed: 2026-06-26T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/execution/colorCheck.ts
  - src/execution/colorCheck.test.ts
  - src/execution/producer.ts
  - src/execution/producer.test.ts
  - src/hygiene.test.ts
  - src/ui/sanitizeDisplayName.ts
  - src/ui/sanitizeDisplayName.test.ts
  - src/ui/useWindowManager.tsx
  - src/ui/useWindowManager.test.tsx
  - src/test/fixtures/budget.code.txt
  - src/test/fixtures/budget.raw.txt
  - src/test/fixtures/calculator.code.txt
  - src/test/fixtures/calculator.raw.txt
  - src/test/fixtures/weather.code.txt
  - src/test/fixtures/weather.raw.txt
  - src/test/fixtures/widget-data-table.raw.txt
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: resolved
resolution: "All 2 critical + 5 warnings fixed and committed; IN-01/IN-03 fixed; IN-02 accepted (cosmetic :root shim, no correctness impact). 727 tests pass, tsc 0 errors, build 0 source maps, hygiene gate green."
---

# Phase 18: Code Review Report

**Reviewed:** 2026-06-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Phase 18 adds three new behavioral surfaces: `checkForHardcodedColors()` wired into `produceComponent`, `sanitizeDisplayName()` applied at the `useWindowManager.open()` boundary, and a hygiene gate extension covering the new files. The core logic of all three features is sound, but two critical correctness defects were found, along with five warnings and three informational items.

The two critical findings are behavioral defects in the color checker:

1. The generic error message thrown by `checkForHardcodedColors` means the self-heal loop's early-stop fires after only two attempts — not three — for any consecutive color violation, regardless of whether the colors are the same or different. This silently halves the effective retry budget for color check failures compared to Babel errors.

2. The 4-digit hex shorthand `#rgba` (valid CSS Colors Level 4) is captured by the regex but then silently skipped, creating a real evasion path for saturated colors.

The warnings cover: three prompt builder functions that omit the TGEN-01 theme CSS variable mandate on retry paths, a hygiene gate SELF-exclusion that matches on filename instead of full path, and module-level side effects inside React state updaters.

---

## Critical Issues

### CR-01: colorCheck's generic error message collapses effective retry budget from 3 to 2

**File:** `src/execution/colorCheck.ts:60-76` / `src/execution/producer.ts:491-498`

**Issue:** `checkForHardcodedColors` always throws the exact same message string regardless of which color triggered the violation:

```
"Produced code contains hardcoded colors — use the theme CSS variables..."
```

The early-stop guard in `producer.ts` (lines 491-498) fires when `errorMsg === lastError`. For Babel errors this is intentional: the same syntax error twice means the model made no progress. For color errors, however, two entirely different saturated colors (`#ff0000` then `#00ff00`) produce the identical `errorMsg`, so the early-stop fires after the second attempt even though the model produced different code. The result is that `checkForHardcodedColors` violations always consume at most **2 attempts** (initial + one repair) instead of the documented 3.

**Fix:** Include the offending color literal in the error message so that two different color violations produce different `errorMsg` strings, restoring the full 3-attempt budget:

```typescript
// In colorCheck.ts — hex branch:
throw new TranspileError(
  `Produced code contains a hardcoded color (#${hexMatch[1]}) — use the theme CSS variables ` +
  `(var(--accentA), var(--accentB), var(--text), etc.) instead of hardcoded hex or rgb values.`,
  null,
);

// rgb branch:
throw new TranspileError(
  `Produced code contains a hardcoded color (rgb(${r},${g},${b})) — use the theme CSS variables ` +
  `(var(--accentA), var(--accentB), var(--text), etc.) instead of hardcoded hex or rgb values.`,
  null,
);
```

This also makes the self-heal repair message more actionable, giving the model the exact offending value to find and replace.

---

### CR-02: 4-digit hex shorthand `#rgba` is silently skipped, allowing saturated colors through

**File:** `src/execution/colorCheck.ts:54-57`

**Issue:** The hex regex `/#([0-9a-fA-F]{3,8})\b/g` captures 4-digit hex strings like `#f0f8`, but the dispatch block that follows (lines 40-57) has branches only for lengths 3, 6, and 8. A 4-digit match falls through to:

```typescript
} else {
  // 4, 5, or 7-digit: unusual; skip to avoid false positives.
  continue;
}
```

4-digit hex (`#rgba`) is a valid CSS shorthand introduced in CSS Colors Level 4. A browser will render `#f0f8` as `rgba(255, 0, 255, 0.53)` — fully saturated magenta — but `checkForHardcodedColors` silently passes it. Any model output containing a 4-digit saturated hex bypasses the checker entirely.

5-digit and 7-digit hex are not valid CSS and the skip there is genuinely safe. Only 4-digit needs to be added.

**Fix:**

```typescript
} else if (hex.length === 4) {
  // 4-digit #rgba shorthand (CSS Colors Level 4): expand each nibble.
  r = parseInt(hex[0]! + hex[0]!, 16);
  g = parseInt(hex[1]! + hex[1]!, 16);
  b = parseInt(hex[2]! + hex[2]!, 16);
  // alpha (hex[3]) is irrelevant for saturation check.
} else {
  // 5 or 7-digit: not valid CSS; skip.
  continue;
}
```

Also add a test case in `colorCheck.test.ts`:

```typescript
it("throws TranspileError for saturated 4-digit hex #f0f8 (CSS rgba shorthand)", () => {
  expect(() =>
    checkForHardcodedColors(`<div style={{color: "#f0f8"}} />`)
  ).toThrow(TranspileError);
});
```

---

## Warnings

### WR-01: `buildLengthPrompt` (app/widget branch) omits the TGEN-01 theme CSS variable contract

**File:** `src/execution/producer.ts:293-304`

**Issue:** When the model returns a truncated response, `produceComponent` falls back to `buildLengthPrompt`. The app/widget branch of this function (lines 293-304) says "minimal inline styling" but contains no instruction to use `var(--accentA)`, `var(--accentB)`, `var(--text)`, etc. and no warning against hardcoded hex/rgb. The model thus has no prompt-level guidance to produce theme-compliant styling on the truncation retry. `colorCheck` will still catch violations (so correctness is not broken), but the model is given a repair prompt that does not mention the constraint it violated, reducing the chance of a clean retry.

**Fix:** Add the styling line used in the main `buildPrompt` app branch:

```typescript
// Inside buildLengthPrompt, app/widget subject block:
`- Style using the host CSS variables: var(--accentA) and var(--accentB) for brand colors, ` +
`var(--text) for text, var(--glass) and var(--glass2) for surfaces, var(--bord) for borders, ` +
`var(--hi) for highlights. For shadows/overlays rgba(0,0,0,α) and rgba(255,255,255,α) are ` +
`allowed — do NOT use hardcoded hex or rgb brand colors.\n` +
```

Also add a test mirroring the existing `buildPrompt` TGEN-01 test:

```typescript
it("length prompt (app/widget) carries the new theme var contract (TGEN-01)", () => {
  const prompt = buildLengthPrompt("timer");
  expect(prompt).toContain("var(--accentA)");
  expect(prompt).not.toContain("var(--color-surface)");
});
```

---

### WR-02: `buildLengthPrompt` and `buildRepairPrompt` (delegated branch) omit TGEN-01 theme CSS variable contract

**File:** `src/execution/producer.ts:282-291` (length) and `233-245` (repair)

**Issue:** Both retry prompts for `kind === "delegated"` omit the styling constraint. The initial `buildPrompt` delegated branch (line 155) includes the full theme variable contract. Neither the repair prompt (lines 233-245) nor the length prompt (lines 282-291) carry it forward. Since `delegated` components produce rendered markup, missing the CSS constraint on retries creates the same problem as WR-01: the model gets no positive instruction to use theme vars on its second or third attempt.

**Fix:** Add the theme styling line to both delegated retry branches. For `buildRepairPrompt` delegated:

```typescript
`- Style using inline style={{ ... }} and the host CSS variables (var(--accentA), ` +
`var(--accentB), var(--text), var(--glass), var(--glass2), var(--bord), var(--hi)). ` +
`For shadows/overlays rgba(0,0,0,α) and rgba(255,255,255,α) are allowed. ` +
`Do NOT use hardcoded hex or rgb brand colors.\n` +
```

Apply the same addition to `buildLengthPrompt` delegated branch.

---

### WR-03: Hygiene gate SELF exclusion matches on filename only, not full path

**File:** `src/hygiene.test.ts:78, 86`

**Issue:** The `walk()` function excludes the hygiene gate file from its own scan using:

```typescript
const SELF = "hygiene.test.ts";
// ...
} else if (SCANNABLE.test(entry) && entry !== SELF) {
```

`entry` comes from `readdirSync(dir)` which returns bare filenames, not full paths. Any file named `hygiene.test.ts` located anywhere under `src/` — e.g. `src/ui/hygiene.test.ts` or `src/test/hygiene.test.ts` — would be silently excluded from the hygiene scan. This is a latent escape hatch: a future contributor could place banned tokens in a file with that name in any subdirectory.

**Fix:** Compare using the full path relative to the repo root:

```typescript
const SELF_PATH = "src/hygiene.test.ts";
// In walk():
} else if (SCANNABLE.test(entry)) {
  const relPath = relative(REPO_ROOT, full).split(sep).join("/");
  if (relPath !== SELF_PATH) acc.push(full);
}
```

---

### WR-04: Module-level `zTop` mutated inside React state updater functions

**File:** `src/ui/useWindowManager.tsx:134, 155, 168`

**Issue:** `zTop` is a module-level mutable variable. It is incremented (`++zTop`) as a side effect inside three `setWindows` updater functions: inside `open()` at line 134, `focus()` at line 155, and `restore()` at line 168. React's contract for state updater functions is that they must be pure (no side effects), and React Strict Mode deliberately invokes updaters twice in development builds to surface exactly this issue. Calling `open()` in Strict Mode would advance `zTop` by 2 instead of 1, producing gaps in z-values and potentially unexpected rendering order. The `counter` increment (`++counter`) at line 120 — which happens outside the updater — does not have this problem.

**Fix:** Capture the new z-value before the `setWindows` call and close over it:

```typescript
// In open():
const z = ++zTop;
setWindows(prev => {
  const { x, y } = cascadePlace(prev);
  const entry: WindowEntry = { ..., z, ... };
  // ...
});

// In focus():
const newZ = ++zTop;
setWindows(prev => prev.map(w => w.id === id ? { ...w, z: newZ } : w));

// In restore():
const newZ = ++zTop;
setWindows(prev => prev.map(w => w.id === id ? { ...w, minimized: false, z: newZ } : w));
```

---

### WR-05: `rgba(var(--color-accent-rgb, 100, 100, 255), ...)` in budget fixture evades `colorCheck`

**File:** `src/test/fixtures/budget.code.txt:83` / `src/test/fixtures/budget.raw.txt:85`

**Issue:** Both budget fixtures contain:

```
backgroundColor: "rgba(var(--color-accent-rgb, 100, 100, 255), 0.1)"
```

The rgb scanner in `colorCheck.ts` uses `/\brgba?\s*\(\s*(\d+)/` which requires a digit immediately after the opening paren. Since `var(` is not a digit, this pattern is not matched. The CSS fallback value `100, 100, 255` is a saturated blue (r≠b), but `colorCheck` never sees it.

This matters on two levels: (1) the fixture itself contains a saturated color literal that the TGEN-02 check was intended to eliminate, and (2) it demonstrates a functional bypass pattern — any generated component using `rgba(var(..., <saturated>, ...), alpha)` evades the check silently. The budget fixture thus models a bypassed pattern, which could influence future model outputs or mislead developers reading the fixture.

**Fix (fixture):** Replace the saturated-fallback `rgba(var(..., 100, 100, 255), ...)` patterns with neutral rgba or plain CSS var usage:

```
backgroundColor: "rgba(var(--color-accent-rgb, 128, 128, 128), 0.1)"
                                              ^^^^^^^^^^^^^^^^^
                                              grayscale fallback
```

Or simply use `var(--glass)` which is one of the TGEN-01 surface variables.

**Fix (colorCheck — long-term):** Consider also adding a check that flags `rgba(var(...,` patterns where the fallback values are non-grayscale, though this is harder to implement correctly with a pure regex.

---

## Info

### IN-01: Misleading test comment — "near-grayscale" is actually exact grayscale

**File:** `src/execution/colorCheck.test.ts:108`

**Issue:** The test description reads:

```
"does NOT throw for rgba(50, 50, 50, 0.8) — near-grayscale shadow (R=G=B=50)"
```

The phrase "near-grayscale" implies approximate equality, but R=G=B=50 is exact grayscale (all three channels are identical). The test is correct; the comment is misleading.

**Fix:** Change "near-grayscale" to "exact grayscale":

```typescript
it("does NOT throw for rgba(50, 50, 50, 0.8) — exact grayscale shadow (R=G=B=50)", () => {
```

---

### IN-02: Re-skinned fixtures use old CSS variable names via `:root` shim, not the TGEN-01 variable contract

**File:** `src/test/fixtures/budget.code.txt:379-386`, `src/test/fixtures/calculator.code.txt:103-106`, `src/test/fixtures/weather.code.txt:78-81`

**Issue:** The three re-skinned fixtures (budget, calculator, weather) continue to use the old CSS variable naming convention (`--color-surface`, `--color-text`, `--color-accent`) throughout their markup. Each fixture adds a `:root` block that maps these old names to the new theme vars (e.g. `--color-accent: var(--accentA)`). This is a compatibility shim, not native use of the TGEN-01 contract variables. The new prompts in `producer.ts` mandate using `var(--accentA)`, `var(--text)`, `var(--glass)`, etc. directly. The fixtures therefore do not model the output that TGEN-01-updated prompts are supposed to produce, which reduces their value as regression test samples.

**Fix:** Update the fixtures to use the new TGEN-01 variables (`var(--accentA)`, `var(--text)`, `var(--glass)`, etc.) directly throughout, removing the `:root` shim block.

---

### IN-03: No test coverage for `buildPrompt` `shell` kind theme CSS variable mandate

**File:** `src/execution/producer.test.ts:106-127`

**Issue:** The existing TGEN-01 test at line 106 covers only `kind = "app"`. `kind = "shell"` and `kind = "delegated"` (in `buildPrompt`) both include the theme CSS variable contract at lines 125 and 155 respectively, but neither is tested. A future edit to those branches that accidentally removes the constraint would not be caught.

**Fix:** Add tests for the shell and delegated initial prompt branches:

```typescript
it("shell prompt mandates the new theme CSS variable contract (TGEN-01)", () => {
  const prompt = buildPrompt("calculator", "shell");
  expect(prompt).toContain("var(--accentA)");
  expect(prompt).toContain("var(--text)");
  expect(prompt).not.toContain("var(--color-surface)");
});

it("delegated prompt mandates the new theme CSS variable contract (TGEN-01)", () => {
  const prompt = buildPrompt("todo", "delegated");
  expect(prompt).toContain("var(--accentA)");
  expect(prompt).toContain("var(--glass)");
  expect(prompt).not.toContain("var(--color-accent)");
});
```

---

_Reviewed: 2026-06-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
