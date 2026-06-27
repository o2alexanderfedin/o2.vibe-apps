---
phase: 17-search-launcher
plan: "02"
subsystem: ui
tags: [search-launcher, describe-produce, hygiene, integration]
dependency_graph:
  requires: [17-01, phase-16-desktop-shell]
  provides: [handleDescribe, SearchLauncherPanel-wired, launcherWorking-state]
  affects: [src/ui/DesktopShell.tsx, src/hygiene.test.ts]
tech_stack:
  added: []
  patterns: [free-text-describe-to-produce, prompt-folded-cacheKey, contained-duplication-of-open-path]
key_files:
  created: []
  modified:
    - src/ui/DesktopShell.tsx
    - src/hygiene.test.ts
decisions:
  - "handleDescribe deliberately inlines the mint->resolve->fallback sequence rather than refactoring handleOpen into a shared helper — keeps all 7 handleOpen integration tests at zero regression risk; the one real difference (registryKey folds the prompt, resolveOpenApp does not) is exactly why naive reuse won't work"
  - "Free-text describe builds the cache key directly via registryKey('app', slug, text) and calls resolveComponent with userPrompt=text, bypassing resolveOpenApp (which cannot fold a prompt) — documented accept disposition T-17-05"
  - "launcherWorking is set true before resolve and cleared in finally (also closes the launcher), so a failed describe never leaves the panel stuck working — T-17-06 mitigation"
  - "hygiene Pitfall-11 explicit list now names SearchLauncherPanel.tsx and drops MinimalLauncher.tsx; the recursive walk stays the primary gate, the explicit list is the loud-fail regression guard. Plan 02 removing it from the array BEFORE Plan 04 deletes the file is the correct ordering"
metrics:
  duration: "~6 minutes"
  completed: "2026-06-26"
  tasks: 2
  files: 2
---

# Phase 17 Plan 02: Wire SearchLauncherPanel + handleDescribe Summary

**One-liner:** DesktopShell swaps MinimalLauncher for SearchLauncherPanel and gains `handleDescribe` — a free-text describe path that derives a slug, folds the full text into the cache key, and routes through the existing windowing machinery to find-or-produce the app, with a `launcherWorking` indicator and neutral auth/throttle fallbacks.

## What Was Built

### src/ui/DesktopShell.tsx

**Imports changed:**
- Removed `import { MinimalLauncher } from "./MinimalLauncher";`
- Added `import { SearchLauncherPanel } from "./SearchLauncherPanel";`
- Added `import { slugFromText } from "./launcherUtils";`
- Added `deriveDisplayName` to the existing `../execution/loader` import (joined with `resolveComponent`, `evictLiveComponent`)
- `registryKey` was already imported from `../registry/cacheKey`

**State added:**
- `const [launcherWorking, setLauncherWorking] = useState(false);` — drives the panel's `isWorking` prop. Seeded picks never set it (they resolve instantly from cache); only a real describe latency window flips it true.

**`handleDescribe` callback (the new integration, for Plan 03 test reference):**

```
handleDescribe(text):
  1. slug        = slugFromText(text)                      // "a pomodoro timer" -> "pomodoro-timer"
  2. displayName = deriveDisplayName(slug, text)           // "Pomodoro Timer (a pomodoro timer)"
  3. cacheKey    = await registryKey("app", slug, text)    // SHA-256 folds the prompt -> per-description key
  4. setLauncherWorking(true)
  5. try:
       wm.open(slug, { title: displayName, icon: slug })   // mint window FIRST (neutral "Preparing…" placeholder)
       Component = await resolveComponent(instanceId, slug, cacheKey, services, text)   // userPrompt = full text
       if window still open: storeComponent(instanceId, Component)
       else: evictLiveComponent(instanceId)               // mid-produce-close guard (Pitfall 9)
     catch err:
       needsAuth  = err instanceof ProduceAuthError
       throttled  = err instanceof ProduceThrottledError
       if window still open: store makeFallback(...)       // neutral auth/throttle/generic fallback + retry
  6. finally:
       setLauncherWorking(false)
       setLauncherOpen(false)
```

A `handleDescribeRef` (mirroring the existing `handleOpenRef` pattern) lets the fallback retry handler and the panel's `onDescribe` prop re-invoke the latest closure without dependency churn.

**Key difference from `handleOpen` (intentional, contained duplication):** `handleOpen` calls `resolveOpenApp(appType)` to get a cache key that does NOT fold a prompt. `handleDescribe` builds the key itself via `registryKey("app", slug, text)` and calls `resolveComponent` directly with `userPrompt=text`, so each free-text description caches as its own app and the producer tailors the component to the description. `handleOpen` was left untouched so its 7 integration tests carry zero regression risk.

**JSX replaced:** the `{launcherOpen && <MinimalLauncher .../>}` block became `{launcherOpen && <SearchLauncherPanel onOpen={...} onDescribe={(text) => handleDescribeRef.current(text)} onClose={...} isWorking={launcherWorking} />}`. Pre-installed picks still route through the ported `handleOpen`. The block's comment was updated to reference Phase 17 CREATE-01/02 and the resolve→produce→cache→mount loop. The file-header comment ("minimal launcher chrome") was updated to "search launcher chrome".

### src/hygiene.test.ts

Three targeted edits to the Pitfall-11 coverage test:
- `it(...)` title: "Phase-16" → "Phase-16 and Phase-17 desktop-shell source files".
- Body comment updated to "search/launcher panel" + note that Phase 17 added SearchLauncherPanel replacing MinimalLauncher.
- Explicit coverage array: added `"src/ui/SearchLauncherPanel.tsx"`, removed `"src/ui/MinimalLauncher.tsx"`.

The recursive `walk(SRC_DIR)` remains the primary enforcement; the explicit list is the loud-fail regression guard. Removing MinimalLauncher.tsx from the array now (before Plan 04 deletes the file) is the correct ordering — the assertion no longer pins a file that will disappear.

## Test Counts (after this plan)

| Scope | Tests | Status |
|-------|-------|--------|
| src/ui/DesktopShell.test.tsx | 7 | pass (zero regression) |
| src/hygiene.test.ts | 3 | pass |
| Full suite (81 files) | 667 | pass |

`npx tsc --noEmit` exits 0.

## Acceptance Criteria

- `grep "MinimalLauncher" src/ui/DesktopShell.tsx` → 0 lines (import + JSX both gone)
- `grep "SearchLauncherPanel" src/ui/DesktopShell.tsx` → 2 lines (import + JSX usage)
- `grep "handleDescribe" src/ui/DesktopShell.tsx` → 6 lines
- `grep "launcherWorking" src/ui/DesktopShell.tsx` → 2 lines (useState + isWorking prop)
- `grep -nE 'synthesi[sz]|\bfake\b|\bmock\b|\bAI\b|\bllm\b|\bgenerat(e|ed|ing)\b' src/ui/DesktopShell.tsx` → 0 lines
- `grep "SearchLauncherPanel.tsx" src/hygiene.test.ts` → 1 line; `grep '"src/ui/MinimalLauncher.tsx"' src/hygiene.test.ts` → 0 lines
- `desktopShellTestKit.openApp` helper still works (dialog name "Open an app" + app buttons by displayName preserved in SearchLauncherPanel; full suite green confirms)

## Deviations from Plan

None — plan executed exactly as written. The plan's `handleDescribe` action snippet matched the actual DesktopShell symbols (`windowManagerRef`, `handleClose`, `services`, `storeComponent`, `evictLiveComponent`, `resolveComponent`, `ProduceAuthError`, `ProduceThrottledError`, `makeFallback`, `setKeyDialogOpen`, `logger`, `setLauncherOpen`, `isOpenByInstance`) one-to-one, so no signature adaptation was needed. `deriveDisplayName` was already exported from loader.ts.

The only non-substantive addition beyond the literal action block: updated the stale file-header comment ("minimal launcher chrome" → "search launcher chrome") for consistency — this is documentation cleanup of a now-inaccurate comment, contains no banned tokens, and is covered by the plan's intent to remove MinimalLauncher framing from the file.

## Threat Model Compliance

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-17-04 (info disclosure — comment tokens) | mitigate | `grep -nE` banned-token scan on DesktopShell.tsx → 0 matches; verified before each commit |
| T-17-05 (describe path bypasses resolveOpenApp) | accept | `registryKey("app", slug, text)` is the documented prompt-folded key path; bypassing resolveOpenApp is the correct, intended behavior |
| T-17-06 (describe error leaves panel working) | mitigate | `finally` block always clears `launcherWorking` and `setLauncherOpen(false)`; user retries from a clean panel |

## Threat Surface Scan

No new network endpoints, auth paths, file-access patterns, or schema changes. `handleDescribe` reuses the existing `resolveComponent` produce path and the existing `ProduceAuthError`/`ProduceThrottledError` handling already present in `handleOpen` — no new trust boundary beyond the one the threat model already covers (free text → slug → SHA-256 → IDB; only the hash reaches storage).

## Known Stubs

None. `handleDescribe` is fully wired to the real `resolveComponent` produce path (no mock/placeholder data source); `launcherWorking` reflects real produce latency.

## Self-Check: PASSED

- `src/ui/DesktopShell.tsx` — FOUND (modified)
- `src/hygiene.test.ts` — FOUND (modified)
- Commit `27a8753` (feat 17-02 DesktopShell wiring) — FOUND
- Commit `512f6cf` (test 17-02 hygiene list) — FOUND
- 667 tests pass, tsc exit 0, zero banned tokens in DesktopShell.tsx
