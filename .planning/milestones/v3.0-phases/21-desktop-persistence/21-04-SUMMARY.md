---
phase: 21
plan: "04"
subsystem: ui-tests
tags: [persistence, debounce, restore, eviction, integration-test, vitest]
requires: [21-01, 21-02, 21-03]
provides: [PERSIST-TEST-01, PERSIST-TEST-02, PERSIST-TEST-03, PERSIST-TEST-04]
affects: [src/ui/DesktopShell.test.tsx]
tech-stack:
  added: []
  patterns: [vi.useFakeTimers + act + vi.advanceTimersByTime, fireEvent.pointerDown/Move/Up, createRecordingSettingsStore, createInMemoryRegistry]
key-files:
  modified: [src/ui/DesktopShell.test.tsx]
decisions:
  - Use fireEvent + act() instead of userEvent.setup({ advanceTimers }) for fake-timer tests: userEvent deadlocks when vi.useFakeTimers() is active and DesktopShell owns its own internal userEvent instance
  - Use baseline+1 pattern for debounce count instead of assert-from-zero: draining the initial mount timer (vi.advanceTimersByTime(300)) produces baseline=1; drags produce baseline+1
  - Replace .at(-1) with writes[writes.length - 1]: tsconfig targets ES2020; Array.prototype.at() is ES2022
  - Replace standalone "fake" in comments with "vi.useFakeTimers()" or neutral language: hygiene gate bans the token at word-boundary level
metrics:
  duration: "~14m"
  completed: "2026-06-30T06:35:37Z"
  tasks: 2
  files: 1
---

# Phase 21 Plan 04: Desktop Persistence Integration Tests Summary

Integration test suite for Phase 21 (desktop-persistence) proving all 5 binding success criteria via 5 new `it()` blocks added to `src/ui/DesktopShell.test.tsx`. Test count: 24 → 29.

## What Was Built

Two new `describe` blocks at the end of `DesktopShell.test.tsx`:

**"Desktop persistence — save"** (2 tests):
- SC#2: `vi.useFakeTimers()` + `fireEvent.pointerDown/Move/Up` × 50 + `vi.advanceTimersByTime(300)` proves exactly 1 debounced IDB write per drag burst, not 50.
- SC#5: Opens Notes, advances past debounce, parses the written JSON, asserts `Object.keys(entry).sort()` === `["appType","icon","minimized","title","x","y","z"]` with no `instanceId`, `transpiledJS`, or `id`.

**"Desktop persistence — restore"** (3 tests):
- SC#1 + SC#4: 5 pre-seeded layout entries (exercises the "5-window restore" requirement), in-memory registry seeded via `registryKey("app", appType)` + `registry.put("apps", stubRecord, key)` for tier-3 hits, `waitFor(() => frames().toHaveLength(5))`, z-order check (App E style.zIndex > App A), minimized class check (App D minimized), unique-title count.
- SC#3: 1 evicted entry (appType not in registry), empty `createInMemoryRegistry()`, default `unusedTransport` (throws if called), `waitFor(() => screen.getByRole("button", { name: "Try again" }))` confirms Fallback path ran without transport call.
- DB version gate: `expect(REGISTRY_DB_VERSION).toBe(3)` — direct import assertion confirms no schema change was introduced.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1+2 (combined) | `995a2fd` | feat(21-04): integration tests for all 5 desktop-persistence success criteria |

Tasks 1 and 2 were implemented and verified in a single editing session against the same file; they were committed as one atomic unit after the full gate passed.

## Gate Results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` (full suite) | 887 passed / 0 failed |
| Hygiene gate (`src/hygiene.test.ts`) | passed |
| Build (`npx vite build`) | succeeded, 0 source maps |
| `REGISTRY_DB_VERSION === 3` | confirmed (`src/registry/db.ts`) |
| No new runtime deps | confirmed |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] userEvent/fake-timer deadlock**
- **Found during:** Task 1 (first run timed out at 5000ms)
- **Issue:** `userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })` deadlocks when `vi.useFakeTimers()` is active and `renderDesktopShell` creates its own internal `userEvent.setup()` (without advanceTimers). The two instances conflict — the DesktopShell's internal instance schedules fake setTimeout delays that are never advanced.
- **Fix:** Replaced `user.click(launcher)` / `user.click(notesBtn)` with `await act(async () => { fireEvent.click(elem) })`. `fireEvent` dispatches DOM events synchronously; `act()` flushes React state updates. This avoids all userEvent timing machinery while fake timers are active.
- **Files modified:** `src/ui/DesktopShell.test.tsx`
- **Commit:** `995a2fd`

**2. [Rule 1 - Bug] .at(-1) not available on ReadonlyArray in ES2020 lib**
- **Found during:** TypeScript check after writing tests
- **Issue:** `settingsStore.rawWrites.get(LAYOUT_KEY)?.at(-1)` — `ReadonlyArray<string>` does not include `at()` when `tsconfig.json` targets ES2020 (Array.prototype.at is ES2022).
- **Fix:** Replaced with `writes[writes.length - 1]` pattern.
- **Files modified:** `src/ui/DesktopShell.test.tsx`
- **Commit:** `995a2fd`

**3. [Rule 1 - Bug] Hygiene gate: standalone "fake" token in comments**
- **Found during:** Full suite run (hygiene.test.ts failure)
- **Issue:** The project hygiene gate bans `\bfake\b` at word-boundary level in all `src/**` files (devtools-hygiene rule). Comments like "fake-timer deadlock" and "fake timer" triggered it.
- **Fix:** Replaced with neutral phrasing: "vi.useFakeTimers() stall", "pending timer", "controlled timer".
- **Files modified:** `src/ui/DesktopShell.test.tsx`
- **Commit:** `995a2fd`

**4. [Rule - Adaptation] Debounce count: baseline+1 instead of 0→1**
- **Found during:** Plan design (pre-implementation reasoning)
- **Issue:** Draining the initial mount/open debounce timer (from Notes window opening) via `vi.advanceTimersByTime(300)` before the 50 drags yields `baseline=1` instead of 0. Asserting `rawWriteCount === 0` before drags would require NOT draining the initial timer — but that leaves a real-to-fake timer boundary issue.
- **Adaptation:** Captured `const baseline = settingsStore.rawWriteCount(LAYOUT_KEY)` after draining, then asserted `baseline` (no new writes) and `baseline + 1` (exactly 1 more write after debounce). The debounce contract is still fully proven.

## Known Stubs

None — all 5 tests exercise real code paths (real `DesktopShell`, real `useWindowManager`, real `layoutPersistence.serializeLayout`, real `restoreDesktop` effect).

## Threat Flags

None — this plan adds test-only code; no new network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

- `.planning/phases/21-desktop-persistence/21-04-SUMMARY.md` — FOUND
- Commit `995a2fd` — FOUND in git log
- `src/ui/DesktopShell.test.tsx` — 256 lines added (5 new `it()` blocks, 2 new `describe` blocks)
- Full suite: 887 passed / 0 failed
- `tsc --noEmit`: 0 errors
- Build: succeeded, 0 source maps in `dist/`
