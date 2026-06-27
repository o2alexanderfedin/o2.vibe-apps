---
phase: 17-search-launcher
reviewed: 2026-06-27T03:14:08Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/ui/SearchLauncherPanel.tsx
  - src/ui/launcherUtils.ts
  - src/ui/DesktopShell.tsx
  - src/hygiene.test.ts
  - src/test/fixtures/load.ts
  - src/test/fixtures/pomodoro-timer.raw.txt
  - src/ui/SearchLauncherPanel.test.tsx
  - src/ui/launcherUtils.test.ts
  - src/ui/SearchLauncherPanel.integration.test.tsx
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: resolved
resolution:
  fixed: [WR-01, WR-02, WR-03, WR-04, IN-01]
  deferred: [IN-02, IN-03, IN-04]
  note: "All 4 Warnings fixed and committed (38e1c43, b5f5acf, 4225ff8, 58a45c2) plus IN-01 (91469c2). IN-02/03/04 are non-blocking quality observations (latent or documented-intentional). Full suite 669 green, tsc clean, build 0 source maps, hygiene clean."
---

# Phase 17: Code Review Report

**Reviewed:** 2026-06-27T03:14:08Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 17 adds the free-text describe→produce path: `SearchLauncherPanel` (the
overlay UI), `launcherUtils.slugFromText`/`EXAMPLE_CHIPS`, and `handleDescribe`
in `DesktopShell`, plus a `pomodoro-timer` fixture and three test files. The
implementation is solid on the dimensions the phase prioritized:

- **Devtools hygiene: PASS.** No banned tokens ("synthesize/synthesized/
  synthesis", "AI", "llm", "generate*", "fake", "mock") appear in any
  devtools-visible surface in the reviewed source. All user-facing copy
  ("Describe an app…", "Working…", "Open", the three fallback strings) is
  neutral and never reveals the on-demand mechanic. The hygiene gate
  (`hygiene.test.ts`) was extended to explicitly assert `SearchLauncherPanel.tsx`
  stays in the scan set (Pitfall 11). I ran the full suite — all 38 tests pass.
- **Input sanitization: PASS.** `slugFromText` strips everything outside
  `[a-z0-9-]`, so injection vectors collapse harmlessly (`<script>`→`script`,
  `../../etc`→`etc`). The cache key (`registryKey`) folds the full text and
  SHA-256-hashes it, so no user text is ever readable in a key and the slug is
  never the sole cache discriminator.
- **Focus safety (Pitfall 12): PASS.** The panel focuses the close button on
  mount, not the input — verified by two dedicated tests.
- **isWorking lifecycle: PASS.** `handleDescribe`'s `finally` always clears
  `launcherWorking` and closes the launcher on the happy path and the inner
  catch path.
- **Neutral error fallbacks: PASS.** Auth (`ProduceAuthError`) and throttle
  (`ProduceThrottledError`) both surface neutral copy, covered by integration
  tests.

The findings below are edge cases and quality issues, not correctness blockers.
The most material is **WR-01**: an exception thrown *before* `handleDescribe`'s
`try` block (e.g. `registryKey` rejecting) escapes the `finally`, leaving the
launcher stuck open with `isWorking` potentially never reset and an unhandled
rejection bubbling into the panel's `handleSubmit`. **WR-02** is a real
unhandled edge case: pure-punctuation input passes the empty-input guard but
produces an empty slug.

Note (per review instructions): the deliberate duplication of the produce
sequence between `handleDescribe` and `handleOpen` is documented as intentional
in the code comment (DesktopShell.tsx:271-280) and is NOT flagged as a must-fix.
See IN-04 for a non-blocking observation about it.

## Warnings

### WR-01: Exception before the `try` block escapes the `finally` — launcher can stick open with a dangling unhandled rejection

**File:** `src/ui/DesktopShell.tsx:281-335`
**Issue:** In `handleDescribe`, three awaited/throwing operations run *before*
the `try { … } finally { setLauncherWorking(false); setLauncherOpen(false); }`
block:

```js
const slug = slugFromText(text);
const displayName = deriveDisplayName(slug, text);
const cacheKey = await registryKey("app", slug, text);   // <-- can reject, OUTSIDE try
setLauncherWorking(true);
try { … } finally { setLauncherWorking(false); setLauncherOpen(false); }
```

`registryKey` calls `crypto.subtle.digest` (cacheKey.ts:33-39), which rejects
in any context where Web Crypto is unavailable or disabled (non-secure origin /
hardened CSP / certain embedded webviews). If it rejects:
- The `finally` never runs, so **the launcher never closes** and the user is
  stuck on the overlay with no feedback.
- The rejection propagates out of `handleDescribe` into the panel's
  `handleSubmit` (`await onDescribe(trimmed)`, SearchLauncherPanel.tsx:67-71),
  which has no `catch` → **an unhandled promise rejection**.

`handleOpen` does not have this exposure in the same way because its analogous
`resolveOpenApp`/`resolveComponent` calls are *inside* its `try` and it has no
launcher state to leave dangling. This is a `handleDescribe`-specific gap.

**Fix:** Move the pre-`try` work inside the try (it is already async), so the
`finally` always fires and the catch can surface a neutral fallback:

```js
const handleDescribe = useCallback(async (text: string) => {
  setLauncherWorking(true);
  try {
    const slug = slugFromText(text);
    const displayName = deriveDisplayName(slug, text);
    const cacheKey = await registryKey("app", slug, text);
    const wm = windowManagerRef.current;
    const instanceId = wm.open(slug, { title: displayName, icon: slug });
    // … existing inner try/catch …
  } finally {
    setLauncherWorking(false);
    setLauncherOpen(false);
  }
}, [services, storeComponent, handleClose]);
```

Note this also means a `registryKey` rejection closes the launcher cleanly
instead of stranding the user. (If you want a window to still appear on that
failure, mint it first and store a fallback — but at minimum the `finally` must
cover the key derivation.)

### WR-02: Pure-punctuation / stop-word input passes the empty guard but yields an empty slug

**File:** `src/ui/SearchLauncherPanel.tsx:67-71` and `src/ui/launcherUtils.ts:20-31`
**Issue:** `handleSubmit` guards only `trimmed.length === 0`. Input that is
non-empty but contains no `[a-z0-9]` characters (e.g. `"!!!"`, `"???"`,
`"   .  "`) passes the guard, but `slugFromText` reduces it to `""` (verified:
`slugFromText("!!!") === ""`). That empty slug then flows into:
- `wm.open("", …)` → `instanceId` becomes `"-<n>"` (a leading-hyphen id),
- the produce prompt `Build a React TSX module for a "" app…` (producer.ts:147),
- a window with an empty/degenerate title (`deriveDisplayName("", "!!!")`
  returns `""` because the suffix strips to empty and `titleCase("")` is `""`).

The app does not crash — the cache key still folds the full text and is unique —
but the user gets a blank-titled window built from a nonsensical empty-type
prompt, which is a poor and surprising outcome for what looks like valid input.

**Fix:** Validate the *slug*, not just the raw trim, before producing — either
in `handleSubmit` or at the top of `handleDescribe`. Example (panel side, keeps
the produce path clean):

```js
const handleSubmit = useCallback(async () => {
  const trimmed = inputText.trim();
  if (slugFromText(trimmed).length === 0) return; // reject symbol-only input
  await onDescribe(trimmed);
}, [inputText, onDescribe]);
```

Consider also disabling the Open button on the same condition for consistency
with the existing `inputText.trim().length === 0` disable (line 125), and/or
falling back to a neutral default type (e.g. `"app"`) inside `handleDescribe`
when the slug is empty so the produced window is at least coherent.

### WR-03: Tab-trap focusable query can let focus escape when only one control is laid out

**File:** `src/ui/SearchLauncherPanel.tsx:41-62`
**Issue:** The Tab trap computes `focusable` by filtering on
`el.offsetParent !== null`. When `isWorking` is true, the input and every chip/
app button is `disabled` and the close button is the only enabled control — so
`focusable.length === 1`, `first === last`, and the wrap branches
(`activeElement === first` / `=== last`) both reference the same node. With a
single focusable element, a forward Tab while focused on it satisfies
`activeElement === last` and re-focuses it (fine), but the logic relies on
`activeElement` being exactly that node; if focus has drifted to the dialog
container or the overlay (which is possible after a disabled control was focused
then disabled), neither branch fires and the browser's native Tab moves focus
*out of the dialog* to the underlying desktop — defeating the modal trap during
the working state. This mirrors a latent issue inherited from `KeyDialog`, but
the launcher's heavy use of `disabled` (whole grid + chips + input go disabled
together while working) makes the single-focusable state common rather than
theoretical.

**Fix:** When `focusable.length <= 1`, trap unconditionally — on any Tab, prevent
default and refocus the sole control (or the dialog):

```js
if (focusable.length === 0) return;
if (focusable.length === 1) {
  e.preventDefault();
  focusable[0]!.focus();
  return;
}
const first = focusable[0]!;
const last = focusable[focusable.length - 1]!;
// … existing wrap logic …
```

### WR-04: Tab-trap behavior is not actually verified by tests (jsdom `offsetParent` is always null)

**File:** `src/ui/SearchLauncherPanel.test.tsx:230-283`
**Issue:** Both "Tab trap" tests acknowledge in their own comments that jsdom
reports `offsetParent === null` for every element, so the implementation's
`offsetParent !== null` filter yields an **empty** focusable list and the trap
**early-returns without exercising any wrap logic**. The tests then assert only
that `fireEvent.keyDown(...)` "does not throw" — they re-query elements with a
*different* selector (without the offsetParent filter) and never drive the real
code path. As written, these two tests would still pass if the wrap logic were
deleted entirely, so they give false confidence in the focus trap (and would not
catch WR-03). This is a test-reliability defect, which is in scope.

**Fix:** Stub `offsetParent` so the real filter passes, e.g. define a getter on
`HTMLElement.prototype` returning a truthy node for the test, or inject the
focusable-collection step behind a seam so the wrap logic can be unit-tested
directly against a known element list. At minimum, assert that after a forward
Tab from the last control, `document.activeElement === first` (the actual
contract), not merely that no throw occurred.

## Info

### IN-01: Empty-slug case has no dedicated test coverage

**File:** `src/ui/launcherUtils.test.ts:4-24`
**Issue:** `slugFromText` is tested for the five documented happy-path examples,
but not for inputs that reduce to an empty string (`"!!!"`, `"???"`, `"   .  "`,
`"the"` with no following word) — the exact inputs behind WR-02. Adding these
would lock in the chosen behavior and prevent regressions once WR-02 is fixed.
**Fix:** Add cases asserting `slugFromText("!!!") === ""` and
`slugFromText("the") === "the"` (the trailing-space article-strip boundary).

### IN-02: `displayName` is computed but never used on the produce-failure branches

**File:** `src/ui/DesktopShell.tsx:284,293`
**Issue:** `displayName` is derived once and passed only to `wm.open(slug, {
title: displayName, … })`. That is correct, but note the retry handler in the
inner catch re-invokes `handleDescribeRef.current(text)` (line 324), which
recomputes `slug`/`displayName`/`cacheKey` from scratch — harmless, but a minor
duplication of the derivation. No action required; flagging for awareness.
**Fix:** None required; optionally hoist the derivation into the retry closure's
captured values if a future refactor consolidates the paths.

### IN-03: `void handleSubmit()` swallows rejections from `onDescribe`

**File:** `src/ui/SearchLauncherPanel.tsx:117,124`
**Issue:** Both the Enter-key handler and the Open button call
`void handleSubmit()`. `handleSubmit` awaits `onDescribe(trimmed)` but has no
`try/catch`, and the `void` discards the returned promise — so if `onDescribe`
rejects (see WR-01, or any future change where `handleDescribe` can reject), the
rejection is unhandled at the panel boundary with no user-visible feedback. Today
`handleDescribe`'s inner try/catch absorbs most failures, so this is latent
rather than active, but it is fragile coupling: the panel trusts that
`onDescribe` never rejects.
**Fix:** Wrap the await in `handleSubmit` with a `try/catch` that at minimum logs
via the gated logger (or surfaces a neutral inline message), so the panel is
self-protecting regardless of the parent's contract.

### IN-04: Intentional handleDescribe/handleOpen duplication noted (not a defect)

**File:** `src/ui/DesktopShell.tsx:281-335` vs `193-264`
**Issue:** Per the review instructions and the in-code comment
(DesktopShell.tsx:271-280), `handleDescribe` deliberately duplicates
`handleOpen`'s mint→resolve→store→catch sequence to keep `handleOpen` untouched
and its integration tests green. This is documented and accepted; recording it
here only so a future maintainer knows the duplication is by design and that the
two paths must be kept in sync (e.g. the mid-produce-close guard, the
`isOpenByInstance` check, and the auth/throttle fallback mapping should evolve
together). A later phase extracting a shared free-text helper, as the comment
anticipates, would also let WR-01's `finally` fix apply to both paths at once.
**Fix:** None required for this phase. When the shared helper is extracted, fold
in the WR-01 finally-scope fix so both paths get it.

---

_Reviewed: 2026-06-27T03:14:08Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
