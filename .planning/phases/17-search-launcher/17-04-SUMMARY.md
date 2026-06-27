---
phase: 17-search-launcher
plan: "04"
subsystem: ui
tags: [search-launcher, cleanup, verification, hygiene, phase-acceptance]
dependency_graph:
  requires:
    - phase: 17-03
      provides: [describe-produce-integration-tests, pomodoro-timer-fixture, cache-hit-proof]
    - phase: 17-02
      provides: [DesktopShell-describe-wiring, hygiene-gate-SearchLauncherPanel-coverage]
    - phase: 17-01
      provides: [SearchLauncherPanel-component, slugFromText-utility, panel-unit-tests]
  provides:
    - MinimalLauncher-removed
    - phase-17-acceptance-confirmed
    - full-suite-green-664
  affects:
    - phase-18-theme-aware-generation
tech_stack:
  added: []
  patterns:
    - dead-file-deletion-after-zero-import-audit
    - full-suite-acceptance-gate-as-final-plan
    - targeted-t-filter-checks-with-nonzero-run-count-guard
key_files:
  created:
    - .planning/phases/17-search-launcher/17-04-SUMMARY.md
  modified:
    - src/hygiene.test.ts
    - src/ui/SearchLauncherPanel.tsx
    - src/ui/desktopShellTestKit.tsx
  deleted:
    - src/ui/MinimalLauncher.tsx
    - src/ui/MinimalLauncher.test.tsx
key-decisions:
  - "Cleaned three stale MinimalLauncher COMMENT references (hygiene.test.ts, SearchLauncherPanel.tsx, desktopShellTestKit.tsx) in the same Task 1 commit so the acceptance criterion `grep MinimalLauncher src/ == 0` is satisfied — the plan's pre-deletion audit only gated against IMPORTS, but the 0-lines acceptance criterion requires the comments go too"
  - "Used `git rm` to delete both files (stages the deletion atomically); the comment edits were amended into the same commit because `git add fileA fileB...` aborts the whole batch if any pathspec (the just-deleted MinimalLauncher.tsx) no longer matches"
  - "Each -t filter check (focus/cache/transport) was validated for a NON-ZERO run count (4 / 1 / 2 tests respectively) so a renamed-or-missing test fails loudly instead of a vitest zero-match false pass"
patterns-established:
  - "Final-plan-of-phase pattern: a deletion + a no-source-change full-suite acceptance gate (test + tsc + build + hygiene + targeted -t confirmations) as the phase exit"
requirements-completed: [CREATE-01, CREATE-02, CREATE-03]
duration: ~6min
completed: 2026-06-26
---

# Phase 17 Plan 04: Final Verification — Delete MinimalLauncher, Full Suite Green Summary

**Deleted the now-dangling MinimalLauncher.tsx + its 7-test file (superseded by SearchLauncherPanel), scrubbed every stale `MinimalLauncher` reference from `src/` to zero, and confirmed the Phase 17 acceptance gate: 664 tests green (81 files), tsc 0 errors, a clean build with no source maps, hygiene 3/3, and the focus / cache / transport behaviors each proven by a non-empty `-t` run.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-26T20:06:00Z
- **Completed:** 2026-06-26T20:08:30Z
- **Tasks:** 2
- **Files modified:** 5 (3 edited, 2 deleted)

## Accomplishments

- **Removed the dead launcher surface:** `src/ui/MinimalLauncher.tsx` and `src/ui/MinimalLauncher.test.tsx` deleted. DesktopShell already routed through `SearchLauncherPanel` (Plan 02), so the deletion is purely subtractive — the only importer of `MinimalLauncher` was its own test file, which is gone with it.
- **`grep -rn "MinimalLauncher" src/` now returns 0 lines** — beyond deleting the two files, scrubbed three remaining *comment-only* references (the plan's pre-deletion audit gated against imports; the 0-lines acceptance criterion additionally required the stale comments be neutralized).
- **Phase 17 acceptance gate confirmed green** with no source changes in Task 2 (verification-only):
  - `npm run test` → **664 passed / 81 files / 0 failures** (≥ 636 floor; exactly 671 − 7 deleted MinimalLauncher tests = 664, the expected arithmetic).
  - `npx tsc --noEmit` → exit 0, 0 errors.
  - `npm run build` → succeeds; `dist/` contains **0** `.map` files (glob and recursive `find` both 0).
  - `npx vitest run src/hygiene.test.ts` → **3/3** pass (the explicit Pitfall-11 list now references `SearchLauncherPanel.tsx`, not the deleted file).
  - Focus-not-stolen (`-t "focus"`): **4 run, all pass**. Cache-hit (`-t "cache"`): **1 run, passes**. Describe→produce (`-t "transport"`): **2 run, passes** — each a non-zero run count, so a rename could not silently drop the behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete MinimalLauncher + scrub stale references** — `e570ea8` (refactor) — removes both MinimalLauncher files (211 lines) and cleans 3 comment references in hygiene.test.ts, SearchLauncherPanel.tsx, desktopShellTestKit.tsx.
2. **Task 2: Full suite verification** — no commit (verification-only; no source changes — the work product is the confirmed-green suite).

**Plan metadata:** committed separately with SUMMARY + ROADMAP update.

## Files Created/Modified

- `src/ui/MinimalLauncher.tsx` — **DELETED** (superseded by SearchLauncherPanel.tsx).
- `src/ui/MinimalLauncher.test.tsx` — **DELETED** (7 tests; behavior migrated to SearchLauncherPanel.test.tsx in Plan 01).
- `src/hygiene.test.ts` — updated two comments (docstring + explicit-list inline comment) to drop the `MinimalLauncher` name; the explicit list itself already pointed at `SearchLauncherPanel.tsx` (Plan 02).
- `src/ui/SearchLauncherPanel.tsx` — updated two focus/Tab-trap comments to reference only `KeyDialog` (dropped the `MinimalLauncher` cross-reference).
- `src/ui/desktopShellTestKit.tsx` — updated the `openApp` docstring to say "search/launcher panel" instead of "MinimalLauncher".
- `.planning/phases/17-search-launcher/17-04-SUMMARY.md` — this file.
- `.planning/ROADMAP.md` — Phase 17 marked complete (4/4 plans), all four plan checkboxes ticked, progress table row updated.

## Decisions Made

- **Scrub comments, not just imports.** The plan's pre-deletion audit explicitly gated only against another file *importing* `MinimalLauncher` (none did — only its own test). But Task 1's acceptance criterion `grep -rn "MinimalLauncher" src/ → 0 lines` is stricter, so the three remaining comment references had to be neutralized. Done in the same commit to keep deletion + cleanup atomic.
- **`git rm` + amend for the batch-staging footgun.** `git rm` staged both deletions atomically. The follow-up `git add <5 files>` aborted with `fatal: pathspec ... did not match` because the just-deleted `MinimalLauncher.tsx` pathspec no longer resolves — and a failed `git add` batch stages *nothing*. Re-staged the three surviving edited files and `--amend`ed them into the Task 1 commit so the deletion and the comment cleanup ship as one logical change.
- **Non-zero run-count guard on every `-t` check.** Each targeted filter (`focus` / `cache` / `transport`) reported a concrete passing count (4 / 1 / 2) plus skipped siblings — confirming the named behaviors actually exist and pass, not a vitest "0 matched → exit 0" false pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Scrub three stale `MinimalLauncher` comment references**
- **Found during:** Task 1 (pre-deletion audit)
- **Issue:** After deleting the two files, `grep -rn "MinimalLauncher" src/` still returned 5 lines: stale comments in `hygiene.test.ts` (2), `SearchLauncherPanel.tsx` (2), and `desktopShellTestKit.tsx` (1). These are not imports (the plan's audit passed), but they violate Task 1's `0 lines` acceptance criterion and leave a dead-name dangling.
- **Fix:** Rewrote each comment to drop the `MinimalLauncher` name while preserving its meaning (e.g. "consistent with KeyDialog", "search/launcher panel", "the search/launcher surface").
- **Files modified:** src/hygiene.test.ts, src/ui/SearchLauncherPanel.tsx, src/ui/desktopShellTestKit.tsx
- **Verification:** `grep -rn "MinimalLauncher" src/ | wc -l` → 0; full suite still 664 green; hygiene 3/3.
- **Committed in:** e570ea8 (Task 1 commit, via amend)

**2. [Rule 3 - Blocking] Re-stage + amend after `git add` batch abort**
- **Found during:** Task 1 (commit)
- **Issue:** The first commit (19aa50b) captured only the two deletions because the `git add fileA..fileE` batch aborted on the no-longer-existing `MinimalLauncher.tsx` pathspec, silently staging none of the three comment edits.
- **Fix:** Staged the three surviving files individually and `git commit --amend`ed them into the Task 1 commit.
- **Files modified:** (staging only — same three files as Issue 1)
- **Verification:** `git show --stat HEAD` lists all 5 files; working tree clean of `.ts/.tsx` modifications.
- **Committed in:** e570ea8 (amended Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking). Both were necessary to satisfy the plan's own acceptance criteria (0 grep lines, atomic task commit). No scope creep — no production behavior changed; only dead comments and the commit's file set.

## Issues Encountered

None beyond the two auto-fixed blocking items above. The verification suite passed on the first run for every step.

## TDD Gate Compliance

Not applicable — this plan's frontmatter is `type: execute` (not `type: tdd`). Task 1 is a deletion + comment cleanup; Task 2 is verification-only. No new behavior was added, so no RED→GREEN gate sequence applies.

## Threat Model Compliance

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-17-10 (Tampering — deletion of MinimalLauncher) | accept | Pre-deletion audit confirmed the only importer was the file's own test (now deleted); git history preserves both files (commit e570ea8 parent) if rollback is ever needed. |
| T-17-11 (Info disclosure — dist/ source maps) | mitigate | `npm run build` verified to emit **0** `.map` files (glob + recursive `find`); `build.sourcemap: false` in vite.config.ts holds. |

## Threat Surface Scan

No new network endpoints, auth paths, file-access patterns, or schema changes. This plan only DELETES code and edits comments — it strictly reduces the source surface. No threat flags.

## Known Stubs

None. The deleted MinimalLauncher was a complete (now-superseded) component, not a stub; SearchLauncherPanel — the live launcher — was fully wired and tested in Plans 01–03 (664 tests green, including the describe→produce integration tests that exercise the real resolve→produce path end to end).

## Phase 17 Acceptance Criteria — ALL SATISFIED

1. ✅ `npm run test` passes with 664 tests (≥ 636), 0 failures.
2. ✅ `npx tsc --noEmit` passes with 0 errors.
3. ✅ `npm run build` completes with 0 source maps in dist/.
4. ✅ `hygiene.test.ts` passes 3/3; explicit list covers `SearchLauncherPanel.tsx`.
5. ✅ `MinimalLauncher.tsx` and `MinimalLauncher.test.tsx` deleted from `src/` (and 0 residual references anywhere in `src/`).
6. ✅ `SearchLauncherPanel` is the launcher rendered by `DesktopShell` (import line 40 + JSX line 515).
7. ✅ Focus-not-stolen test passes (panel focuses the close button, not the input).
8. ✅ Cache-hit-instant test passes (transport call count stays 1 across two same-text describes).
9. ✅ Describe→produce path tested offline with the captured pomodoro-timer fixture (transport test: 1 model call, delegated body mounts).

**CREATE-01, CREATE-02, CREATE-03 requirements are closed.**

## Next Phase Readiness

- **Phase 17 is COMPLETE** (4/4 plans). The dock-launched search/launcher panel describes-or-picks an app, routes through the real resolve→produce→cache→mount loop, opens results as windows, and names no mechanic — proven by 664 green tests offline.
- **Ready for Phase 18 (Theme-Aware Generation):** the windows-on-the-desktop end-to-end path now exists (the precondition Phase 18 depends on for verifying live re-skin). No blockers carried forward.

---
*Phase: 17-search-launcher*
*Completed: 2026-06-26*
