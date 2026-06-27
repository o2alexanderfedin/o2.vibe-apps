---
phase: 17-search-launcher
plan: "03"
subsystem: ui
tags: [search-launcher, describe-produce, fixtures, integration, tdd, offline]
dependency_graph:
  requires: [17-02, 17-01, phase-16-desktop-shell]
  provides: [pomodoro-timer-fixture, SearchLauncherPanel-integration-tests, describe-produce-proof]
  affects:
    - src/test/fixtures/load.ts
    - src/test/fixtures/pomodoro-timer.raw.txt
    - src/ui/SearchLauncherPanel.integration.test.tsx
tech_stack:
  added: []
  patterns:
    - captured-delegated-module-fixture
    - counting-transport-wrapper-for-call-assertions
    - tier2-cache-hit-proven-via-unchanged-call-count
    - deterministic-auth-and-throttle-fallback-assertions
key_files:
  created:
    - src/test/fixtures/pomodoro-timer.raw.txt
    - src/ui/SearchLauncherPanel.integration.test.tsx
  modified:
    - src/test/fixtures/load.ts
decisions:
  - "Tests assert the EXACT fallback copy the real DesktopShell renders (verified against source): NeedsAuthContent 'Connect your account to open this app.' and ThrottledAppContent 'give it a moment' + 'Try again' — no guessed strings, no dead 'OR KeyDialog' branch (the KeyDialog only opens on a user click, so the fallback copy is the single deterministic auth outcome)"
  - "The fixture is captured as a DELEGATED module (initialState + view(state) + actionSpec + export block), because the unseeded describe path in loader.ts ALWAYS produces in 'delegated' mode — a monolithic App-export fixture would mount via the reverse fallback but the delegated shape is the true contract for this path"
  - "Cache-hit proof uses a counting transport (wraps cannedTransport, increments on every call) rather than unusedTransport on the second describe — the same DesktopShell instance keeps its tier-2 transpiledCache across two opens, so re-describing the identical text (identical registryKey) reuses the cached pieces and the count stays 1; unusedTransport would also work but the single counter cleanly asserts '1 total call across two opens'"
  - "Test titles carry the literal substrings Plan 04's -t filters target: 'transport' (Test 1), 'cache' (Test 2), 'account' (Test 3), 'throttle'+'moment' (Test 4) — so a future rename can never silently drop a test from the filter"
metrics:
  duration: "~3 minutes"
  completed: "2026-06-27"
  tasks: 2
  files: 3
---

# Phase 17 Plan 03: Describe→Produce Integration + Pomodoro Fixture Summary

**One-liner:** A captured delegated-module pomodoro fixture plus four offline RED→GREEN integration tests that prove the PRIMARY RISK scenario — the free-text describe→produce→window loop calls the model exactly once on a miss, is a zero-call tier-2 cache hit on a repeat, and degrades to neutral, mechanic-free fallbacks for a missing key and a throttled produce.

## What Was Built

### src/test/fixtures/pomodoro-timer.raw.txt (created)

A captured-Haiku-style raw model response (wrapped in a ` ```tsx ` markdown fence, exactly as the producer's `extractCode` expects) for a **delegated** pomodoro-timer module. Module shape:

- `const initialState = { phase, minutesLeft, secondsLeft, rounds }` — the complete SSOT.
- `function view(state)` — a PURE render: a Focus/Break heading, a `mm:ss` countdown (`String(...).padStart(2,"0")`), a Start/Pause toggle + Reset, and a rounds counter. Every interactive element carries a `data-action="start|pause|reset"` attribute and has **NO** `onClick`/handler (behavior is added on demand by the DelegatedShell runtime).
- `const actionSpec = "..."` — one precise string describing the exact state shape and what each action (`start`/`pause`/`reset`/`tick`) does.
- `export { initialState, view, actionSpec };`

Styling is entirely inline `style={{ ... }}` using the host CSS vars `var(--color-surface)`, `var(--color-text)`, `var(--color-accent)` (no className/stylesheet, no `<style>`). No `import` statements. The fixture compiles cleanly via Babel-standalone classic runtime and mounts through `instantiateDelegated → makeDelegatedComponent` — proven authoritatively by Test 1's `appBodyCount() === 1` assertion (the produced module actually transpiled and mounted, not just a placeholder).

The file is `.txt`, so the lexicon hygiene gate (which scans `.ts/.tsx/.css/.html`) skips it by design — and the inline copy ("Focus", "Break", "Start", "Pause", "Reset", "Rounds completed") contains no banned tokens regardless.

### src/test/fixtures/load.ts (modified)

- Extended the `FixtureName` union: added `"pomodoro-timer"` (reformatted to a multi-line union for readability).
- Added a coverage comment near the existing fixture-coverage block noting the Phase 17 / CREATE-02 describe→produce fixture and its consumer test.
- No other change — the existing `rawFixture(name)` already reads `${name}.raw.txt` from `FIXTURE_DIR`.

### src/ui/SearchLauncherPanel.integration.test.tsx (created)

Four offline integration tests rendering the REAL `DesktopShell` (via `renderDesktopShell` from the test kit) with injected test doubles. A local `describeApp(user, text)` helper opens the launcher, types into the describe input (`getByRole("textbox")`), and clicks the panel's **Open** button (whose `aria-label` is `"Open"`). A `singleFrameBody()` helper returns the lone window's `.window-chrome__body` for fallback-copy assertions.

| # | Title substring | What it proves |
|---|-----------------|----------------|
| 1 | **transport** | `describeApp("a pomodoro timer")` with a counting transport → one window frame appears, `appBodyCount() === 1` (produced delegated body mounted), and `callCount === 1` (a full miss produces exactly once). |
| 2 | **cache** | First describe → 1 call + window; close the window; second describe with the SAME text → window reopens but `callCount` is STILL `1` — the tier-2 transpiled cache (same `registryKey`, prompt folded) serves the repeat with no model call. |
| 3 | **account** | `apiKey: null` → `produceComponent` throws `ProduceAuthError` synchronously → `handleDescribe`'s catch stores the `NeedsAuthContent` fallback. The launcher dialog closes (the `finally` block), a window opens, and its body shows the exact neutral copy **"Connect your account to open this app."** (single deterministic path — no KeyDialog branch). |
| 4 | **throttle** / **moment** | A `ProduceGate` whose `tryAcquire()` throws `ProduceThrottledError` (with `unusedTransport`, never called) → the window body shows the neutral **/give it a moment/** copy plus a **"Try again"** retry button. |

`beforeEach`/`afterEach` clear the loader caches (`_clearCachesForTesting`) and unmount all roots (`unmountAll`) so each test starts and ends clean.

## Test Counts (after this plan)

| Scope | Tests | Status |
|-------|-------|--------|
| src/ui/SearchLauncherPanel.integration.test.tsx (new) | 4 | pass (offline) |
| src/hygiene.test.ts | 3 | pass (fixture `.txt` skipped) |
| src/ui/DesktopShell.test.tsx | 7 | pass (zero regression) |
| Full suite (82 files) | 671 | pass (+4 vs plan 17-02's 667) |

`npx tsc --noEmit` exits 0.

## Acceptance Criteria

- `src/test/fixtures/pomodoro-timer.raw.txt` exists — valid delegated module (initialState + view + actionSpec exports) wrapped in ` ```tsx ` fences.
- `grep "pomodoro-timer" src/test/fixtures/load.ts` → 2 lines (FixtureName entry + coverage comment).
- `npx vitest run src/ui/SearchLauncherPanel.integration.test.tsx` exits 0, all 4 tests pass.
- Test 1: transport call count === 1; `frames().length === 1`; `appBodyCount() === 1`.
- Test 2: transport call count === 1 after TWO describe calls with the same text.
- Test 3: window body contains the exact neutral copy "Connect your account to open this app."
- Test 4: window body contains "give it a moment" + a "Try again" button.
- `npx tsc --noEmit` exits 0.
- `grep -nE 'synthesi[sz]|\bfake\b|\bmock\b|\bAI\b|\bllm\b|\bgenerat(e|ed|ing)\b' src/test/fixtures/load.ts` → 0 matches.
- The fixture compiles AND mounts — verified authoritatively by Test 1's `appBodyCount() === 1` (the real Babel-classic produce path + DelegatedShell mount), not by any out-of-band `node -e` require.

## TDD Gate Compliance

The plan is `type: tdd`; the RED→GREEN gate sequence is present in git log:
1. **RED** — `8a3b12f` `test(17-03): add failing describe→produce integration tests` (3 of 4 tests fail on the missing fixture; Test 4 — throttle, fixture-independent — already passed, which is the correct partial-RED for a fixture-gated suite).
2. **GREEN** — `5d40994` `feat(17-03): add pomodoro-timer fixture, make integration tests green` (all 4 pass).

No REFACTOR commit was needed — the fixture + one-line type extension were the minimal change to go green.

## Deviations from Plan

None — plan executed as written. Three contained adaptations within the plan's intent, all explicitly anticipated by the `<important_grounding>` block:

1. **Open button selector** — the panel's submit button exposes `aria-label="Open"` (and `aria-label="Working…"` while busy), so `getByRole("button", { name: "Open" })` matches it directly, exactly as the plan's `describeApp` snippet assumed. No adaptation needed beyond confirming against `SearchLauncherPanel.tsx`.
2. **Cache-hit transport** — used a counting transport on BOTH opens of Test 2 (rather than swapping to `unusedTransport` for the second open) because the SAME `DesktopShell` instance retains its tier-2 cache across the two describes; one persistent counter asserting "1 total call" is cleaner and matches the plan's `countingTransport` snippet. `unusedTransport` is still used in Test 4 (the throttle path, where the gate short-circuits before any model call).
3. **Auth-copy assertion** — confirmed the literal string `"Connect your account to open this app."` against `DesktopShell.tsx`'s `NeedsAuthContent` (lines 69-84) before asserting; the plan's expected string matched the real code exactly, so no real-string substitution was required.

## Threat Model Compliance

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-17-07 (Tampering — fixture file) | accept | Fixture is committed source; it does not execute at build time, only compiles at test runtime in a constrained `new Function` scope via the real produce path. |
| T-17-08 (Info disclosure — `.txt` extension) | mitigate | Fixture is `.txt`, so the hygiene gate skips it intentionally; `src/hygiene.test.ts` still passes after the change. |
| T-17-09 (DoS — cache-hit test) | mitigate | Test 2 proves the tier-2 cache is populated correctly (call count stays 1); a broken cache would loudly fail the count assertion. Test 4 uses `unusedTransport`, which throws if the throttle gate fails to short-circuit. |

## Threat Surface Scan

No new network endpoints, auth paths, file-access patterns, or schema changes. The new files are a committed `.txt` fixture, a one-line type extension, and a `*.test.tsx` file — none ships in the production bundle (test-only `load.ts` and the `.integration.test.tsx` are pruned). No new trust boundary beyond the one plan 17-02's threat model already covers (free text → slug → SHA-256 → IDB).

## Known Stubs

None. The fixture is a complete, real delegated module; the integration tests exercise the real `resolveComponent` produce path end-to-end (no mock data source). The "fallback" bodies asserted in Tests 3 and 4 are the production `NeedsAuthContent` / `ThrottledAppContent` components, not placeholders.

## Self-Check: PASSED

- `src/test/fixtures/pomodoro-timer.raw.txt` — FOUND (created)
- `src/test/fixtures/load.ts` — FOUND (modified)
- `src/ui/SearchLauncherPanel.integration.test.tsx` — FOUND (created)
- Commit `8a3b12f` (test 17-03 RED integration tests) — FOUND
- Commit `5d40994` (feat 17-03 fixture + load.ts GREEN) — FOUND
- 671 tests pass (82 files), `tsc --noEmit` exit 0, zero banned tokens in `load.ts`
