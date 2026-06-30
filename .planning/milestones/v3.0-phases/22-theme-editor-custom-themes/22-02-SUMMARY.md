---
phase: 22-theme-editor-custom-themes
plan: "02"
subsystem: ui
tags: [wcag, contrast, fouc, csp, theme, pure-function]
dependency_graph:
  requires: []
  provides:
    - src/ui/contrastRatio.ts (contrastRatio export — imported by ThemeEditor plan 22-03)
    - index.html FOUC custom-theme branch (vibeStored.indexOf('custom:') === 0)
  affects:
    - index.html CSP meta tag (FOUC script hash updated)
tech_stack:
  added: []
  patterns:
    - WCAG 2.1 §1.4.3 relative luminance + contrast ratio (pure math, zero deps)
    - FOUC script custom-theme branch reading localStorage['vibe.customTheme.<name>']
    - CSP SHA-256 hash recompute in same commit as FOUC edit (invariant from Phase 14)
key_files:
  created:
    - src/ui/contrastRatio.ts
    - src/ui/contrastRatio.test.ts
  modified:
    - index.html
decisions:
  - contrastRatio returns null for non-hex values (rgba, gradients) rather than throwing
  - FOUC custom/built-in branches are mutually exclusive — no double-apply of vars
  - ES5 var declarations used throughout new FOUC branch (no let/const in inline script)
  - try/catch around JSON.parse with aurora fallback implements T-22-04 tamper mitigation
metrics:
  duration_minutes: 15
  completed_date: "2026-06-30"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 22 Plan 02: contrastRatio + FOUC Custom-Theme Branch Summary

Pure WCAG-2.1 contrastRatio utility (zero deps, 8 tests) plus atomic FOUC script extension for custom themes with CSP SHA-256 hash recomputed in the same commit.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | TDD contrastRatio pure WCAG-2.1 utility | e961e06 | src/ui/contrastRatio.ts, src/ui/contrastRatio.test.ts |
| 2 | FOUC atomic — extend index.html script + recompute CSP hash | fbe9b48 | index.html |

## What Was Built

### Task 1: contrastRatio (THEME-10)

`src/ui/contrastRatio.ts` exports a single function:

```typescript
export function contrastRatio(fg: string, bg: string): number | null
```

Implementation uses three private helpers:
- `linearize(c)` — WCAG 2.1 sRGB channel linearization
- `relativeLuminance(r255, g255, b255)` — `0.2126*R + 0.7152*G + 0.0722*B`
- `parseHex(value)` — matches `#rgb` or `#rrggbb`; returns null for anything else

Returns `(max(L1,L2)+0.05)/(min(L1,L2)+0.05)`. Returns null if either arg is not a hex color. ThemeEditor (plan 22-03) will call `contrastRatio(vars["--text"], vars["--b1"])` and show an advisory warning when ratio < 4.5.

TDD RED/GREEN cycle followed. 8 tests covering: black/white (21:1), symmetric, gray (4.48), rgba null, gradient null, empty string null, 3-char shorthand, Aurora theme pair.

### Task 2: FOUC Script Extension (THEME-09)

The inline first-paint `<script>` in `index.html` now handles `"custom:*"` theme names from `localStorage['marketplace.osTheme']`:

- When `vibeStored.indexOf('custom:') === 0`: reads `localStorage['vibe.customTheme.' + customName]`, parses JSON with try/catch, applies each var via `setProperty`
- Falls back to Aurora vars on malformed JSON or absent mirror (T-22-04 mitigation)
- When vibeStored is a built-in name: existing code path unchanged
- The two branches are mutually exclusive

CSP hash updated atomically: old `sha256-lbdl+fs2oGJ9PUrXbgMIg0tWiqh+N0sPwD/8u/894VQ=` replaced with `sha256-8Bk+Rf26odMnPYZdW1mOxS01ZIGzT+3Bfq5SfwHxtl0=` in the `script-src` directive of the CSP meta tag.

## Verification

```
npx vitest run src/ui/contrastRatio src/csp.test.ts src/frameCsp.test.ts
  17 tests pass (8 contrastRatio, 7 csp, 2 frameCsp)
npx tsc --noEmit → 0 errors
grep -c "custom:" index.html → 1 (custom branch present)
grep -c "sha256-lbdl" index.html → 0 (old hash gone)
grep -c "customThemeIndex" index.html → 0 (absent as required)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript noUncheckedIndexedAccess error on parseHex**
- **Found during:** Task 1, tsc verification after GREEN phase
- **Issue:** `m[1]` from `RegExpMatchArray` has type `string | undefined` under `noUncheckedIndexedAccess: true`; direct `.charAt()` calls on `s` failed to compile even after the charAt refactor because `s` itself remained `string | undefined`
- **Fix:** Added explicit `if (!s) return null;` guard after `const s = m[1];` to narrow `s` to `string`
- **Files modified:** src/ui/contrastRatio.ts
- **Commit:** e961e06

## Known Stubs

None — both deliverables are complete implementations with no stubs.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. The FOUC script reads only same-origin localStorage (no cross-origin access). T-22-04 (JSON.parse tampering) is mitigated by the try/catch with aurora fallback.

## Self-Check: PASSED
