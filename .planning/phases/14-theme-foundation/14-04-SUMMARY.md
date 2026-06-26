---
phase: 14-theme-foundation
plan: 04
subsystem: ui
tags: [fouc, theming, css-variables, csp, sha256, first-paint]

# Dependency graph
requires:
  - phase: 14-theme-foundation (14-02)
    provides: STORAGE_KEY_OS_THEME ("marketplace.osTheme") constant
  - phase: 14-theme-foundation (14-03)
    provides: VIBE_THEMES map (aurora/aero/aqua/noir × 12 CSS custom properties) in src/ui/VibeThemeProvider.tsx — the runtime source of truth the inline script mirrors
provides:
  - FOUC-safe first paint of the named theme — the inline index.html script reads marketplace.osTheme and applies the matching VIBE_THEMES variables on document.documentElement synchronously before React mounts
  - CSP script-src sha256 source regenerated to authorize the extended inline script body (no flash, no 'unsafe-inline')
affects: [foucscript, csp, first-paint, phase-15-and-later-theme-switches]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline first-paint script mirrors the runtime provider's VIBE_THEMES values verbatim so first paint matches the React-mounted theme exactly"
    - "ES5-compatible (var / for-in) inline FOUC block — no const/let/imports — to match the existing script style and run before any module load"
    - "CSP authorizes the inline script by exact-bytes SHA-256 source (not 'unsafe-inline'); the hash is regenerated and embedded in the SAME commit as the script edit"

key-files:
  created: []
  modified:
    - index.html

key-decisions:
  - "VIBE_THEMES values in the inline script are copied verbatim from src/ui/VibeThemeProvider.tsx (e.g. aurora --accentA #9b7cff, noir --text #f5eeff) — first paint and the runtime provider must agree exactly, so the values are duplicated rather than imported (the inline script cannot import a module before React loads)"
  - "The named-theme block is appended AFTER the existing data-theme setAttribute logic; the light/dark data-theme mechanism is left entirely untouched (both mechanisms stay live and independent)"
  - "Hash regeneration and the script edit land in one atomic commit — csp.test.ts recomputes the hash from the live file, so a desynced commit would fail CI; keeping them together keeps the no-flash guarantee verifiable"

patterns-established:
  - "Pattern: when the inline FOUC script body changes, regenerate the CSP script-src sha256 source in the same commit via node one-liner over the <script>…</script> bytes, then let csp.test.ts assert the match"

requirements-completed: [THEME-03, THEME-04]

# Metrics
duration: ~6min
completed: 2026-06-26
---

# Phase 14 Plan 04: FOUC Script for Named Theme + CSP Hash Sync Summary

**The inline first-paint script in index.html now reads `marketplace.osTheme` and applies the matching VIBE_THEMES CSS custom properties to `document.documentElement` synchronously before React mounts — eliminating the flash of the default theme on reload (THEME-03) — with the CSP `script-src` SHA-256 source regenerated in the same commit so the inline script stays authorized and csp.test.ts stays green.**

## Performance

Single atomic edit to one file. The named-theme block is appended to the existing FOUC `(function(){…})()` IIFE after the `data-theme` setAttribute line, so first paint costs one extra localStorage read plus 12 `style.setProperty` calls — synchronous, before any module download, with no added network or parse cost.

## What Was Built

1. **Extended inline FOUC script** (`index.html`): after the existing light/dark `data-theme` logic, an appended self-contained block:
   - declares a `VIBE_THEMES` object literal with all four themes (aurora/aero/aqua/noir), each with the same 12 variables (`--text`, `--wall`, `--b1`–`--b4`, `--glass`, `--glass2`, `--bord`, `--hi`, `--accentA`, `--accentB`) — values copied verbatim from `src/ui/VibeThemeProvider.tsx`
   - reads `localStorage.getItem('marketplace.osTheme')`
   - selects that name if it is a key of `VIBE_THEMES`, else falls back to `'aurora'`
   - loops the selected theme's entries calling `document.documentElement.style.setProperty(k, vars[k])`
   - uses plain ES5-compatible `var` / `for…in` to match the existing script style; carries a neutral comment ("Named theme — apply CSS custom properties synchronously to avoid flash")
   - leaves the existing `data-theme` logic completely intact

2. **Regenerated CSP hash** (`index.html`): the `script-src` source was recomputed over the new `<script>…</script>` bytes and the old `'sha256-N+v/OMOSGIWhW6MiaeKgpUrhYfTwftAJZBpsRoTejkc='` replaced with `'sha256-lbdl+fs2oGJ9PUrXbgMIg0tWiqh+N0sPwD/8u/894VQ='`. `'unsafe-eval'` retained, `'unsafe-inline'` NOT added, `connect-src` untouched.

## Verification

| Check | Result |
|-------|--------|
| `grep -c "marketplace.osTheme" index.html` ≥ 1 | 1 ✓ |
| `grep -c "documentElement.style.setProperty" index.html` ≥ 1 | 1 ✓ |
| Old hash `N+v/OMOSGIWhW6MiaeKgpUrhYfTwftAJZBpsRoTejkc=` removed | 0 occurrences ✓ |
| New hash `lbdl+fs2oGJ9PUrXbgMIg0tWiqh+N0sPwD/8u/894VQ=` present | 1 occurrence ✓ |
| `npx vitest run src/csp.test.ts` | 7 passed (hash-match + no-unsafe-inline/retains-unsafe-eval + connect-src allowlist) ✓ |
| `npx vitest run src/hygiene.test.ts` | 2 passed (index.html in scan scope; no banned token) ✓ |
| `npx tsc --noEmit` | exit 0 ✓ |

## Deviations from Plan

None — plan executed exactly as written. No bugs, missing functionality, or blocking issues encountered.

## Known Stubs

None. The inline VIBE_THEMES literal carries real verbatim values (not placeholders) and is wired to `document.documentElement`.

## Commit

- `963c782` — feat(14-04): extend FOUC script for named theme + sync CSP sha256 hash (index.html: +67 / −1)

## Self-Check: PASSED

- FOUND: index.html (modified)
- FOUND: .planning/phases/14-theme-foundation/14-04-SUMMARY.md
- FOUND: commit 963c782
