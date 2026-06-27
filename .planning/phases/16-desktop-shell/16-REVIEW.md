---
phase: 16-desktop-shell
reviewed: 2026-06-26T00:00:00Z
depth: standard
iteration: 2
files_reviewed: 5
files_reviewed_list:
  - src/ui/DesktopShell.tsx
  - src/ui/MinimalLauncher.tsx
  - src/ui/WindowFrame.tsx
  - src/ui/iconForApp.tsx
  - src/index.css
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Phase 16: Code Review Report (Iteration 2 — fix verification)

**Reviewed:** 2026-06-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** clean

## Summary

Iteration-2 re-review of the five Warnings (WR-01..WR-05) raised against Phase 16
(Desktop Shell). Each fix was verified against the changed source AND traced for
regressions the fix itself could introduce (broken cleanup, focus-trap bugs,
stale-cache eviction, icon resolution edge cases). The full UI + execution test
suite was run as a regression gate.

**All five fixes are correct and complete. No new Critical or Warning issues.**

**Verification results:**

- **WR-01 (tweak live-component leak) — FIXED, no regression.** The tweak branch
  (`DesktopShell.tsx:309-317`) now calls `evictLiveComponent(instanceId)` then
  re-resolves under the window's OWN `instanceId` (no synthetic `-tweak-…` id).
  Traced the loader interaction: post-evict, tier-1 misses; the differing
  `tweakKey` drives a tier-2/tier-3/produce path; the fresh component lands back
  under the same `instanceId` (`loader.ts:374`). `handleClose` evicts exactly
  that one key (`DesktopShell.tsx:157`) — single key per window, zero leak.
  Checked the failure path: a tweak that throws stores a fallback under the same
  `instanceId` (`:331`); the prior live entry was already evicted, so no stale
  reference survives. The `components` map dependency on `handleModify`
  (`:334`) means the clone path reads a current snapshot — no staleness. Grep
  confirms no `-tweak-` synthetic id remains in source (only in test fixtures,
  which use the id purely as an instance label).

- **WR-02 (dead `openingId` state + 300ms timer) — FIXED, no regression.** Grep
  for `openingId`/`setOpeningId`/`timeoutRef`/`app-card__opening` returns zero
  source hits. The associated unmount-cleanup effect is gone; the only remaining
  `useEffect` is the reduced-motion seam (`:342-355`), which cleans up its
  listener correctly (modern `removeEventListener` + legacy `removeListener`
  fallback). The dead `.app-card__opening` CSS rule is also removed.

- **WR-03 (launcher dialog a11y) — FIXED, no regression.** `MinimalLauncher` now
  has `aria-modal="true"` (`:77`), Escape-to-close with `stopPropagation`
  (`:35-39`), initial focus on the close control via a mount effect (`:28-30`),
  and a Tab focus trap (`:40-62`) that mirrors `KeyDialog` exactly — same
  focusable-selector query, same `disabled`/`offsetParent` filtering, same
  shift-Tab/Tab wrap. The empty-`focusable` guard (`:53`) prevents a crash if the
  panel ever renders no focusable controls. Seven launcher tests (incl. the three
  new a11y assertions) pass.

- **WR-04 (titlebar rendered raw appType) — FIXED, no regression.** `WindowFrame`
  now resolves `const TitleIcon = iconForAppType(icon)` (`:106`) and renders
  `<TitleIcon size={14} />` (`:155`), matching how `Dock` resolves its glyphs.
  `iconForAppType` falls back to `Cloud` for an unknown type (`iconForApp.tsx:42`),
  so an on-demand app not in `APP_REGISTRY` still renders a glyph rather than
  crashing or showing a raw key. The titlebar icon stays `aria-hidden`, so no a11y
  change.

- **WR-05 (orphaned AppBar.tsx) — FIXED.** The file is deleted (`ls` errors). The
  only remaining `AppBar` references are comments/doc-strings in unrelated files
  (`App.tsx`, `ThemeProvider.tsx`, `ThemeSelector.tsx`, `MenuBar.tsx`, CSS section
  headers) — no live import. The shared `.app-bar__icon-btn` CSS class is
  correctly retained (still used by AppShell, KeyDialog, MenuBar, MinimalLauncher).

**Devtools-hygiene: PASS.** Grep across the five changed files for
`synthesi*` / `\bAI\b` / `\bllm\b` / `generate` / `fake` / `\bmock` returns no
runtime-visible hit (the only matches are `matchMedia` and the source-comment word
`mockable`, both stripped by the prod `sourcemap:false` + minify config). All user
copy, aria-labels, and class names remain neutral.

**Regression gate: PASS.** `tsc --noEmit` is clean. The full UI + execution suite
(`src/ui/`, `src/execution/`) is **53 files / 358 tests, all passing**.

## Info

### IN-01: WindowFrame block comment still documents the removed `mountApp`/detached-root design

**File:** `src/ui/WindowFrame.tsx:9-13`
**Issue:** The header comment narrates a prior `mountApp` separate-root architecture
that no longer exists in this file. The historical rationale is useful but, as
written, reads as current behavior and can mislead a future reader. This was
flagged as IN-03 in iteration 1 and was outside the WR-01..WR-05 fix scope, so it
correctly persists; re-surfaced here because `WindowFrame.tsx` is in this
iteration's review set. Low priority, comment-only, no functional impact.
**Fix:** Trim to a one-line note ("apps render in-tree; no separate managed root")
or move the rationale to a design doc.

---

_Reviewed: 2026-06-26T00:00:00Z (iteration 2)_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
