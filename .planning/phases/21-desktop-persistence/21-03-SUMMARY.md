---
phase: 21-desktop-persistence
plan: "03"
subsystem: ui/desktop-shell
tags:
  - layout-persistence
  - debounce
  - restore
  - eviction-handling
  - persist-03
dependency_graph:
  requires:
    - "src/host/layoutPersistence.ts (LAYOUT_KEY, serializeLayout, deserializeLayout — Plan 21-01)"
    - "src/host/settingsStore.ts (writeRaw/readRaw on Services — Plan 21-01)"
    - "src/ui/useWindowManager.tsx (openAt method — Plan 21-02)"
    - "src/services/registry.ts (Registry.get('apps', key) for pre-IDB-check)"
    - "src/execution/loader.ts (resolveComponent, evictLiveComponent)"
    - "src/intent/resolver.ts (resolveOpenApp)"
  provides:
    - "Debounced layout save: 300ms trailing setTimeout/clearTimeout in DesktopShellInner"
    - "Mount-only restore: reads LAYOUT_KEY, sorts by z ascending, opens via openAt, serially resolves"
    - "PERSIST-03 eviction guard: registry.get pre-check before resolveComponent; placeholder for evicted apps"
  affects:
    - "Plan 21-04 (debounce test can now assert RecordingSettingsStore.rawWriteCount via fake timers)"
tech_stack:
  added: []
  patterns:
    - "setTimeout/clearTimeout debounce in useEffect cleanup — mirrors MenuBar clock setInterval idiom"
    - "mount-only useEffect([]) reading live refs (windowManagerRef, handleOpenRef) not stale closures"
    - "serial for...of with await — natural 1-concurrent loop, no semaphore/p-limit needed"
    - "registry.get pre-check pattern — structural barrier preventing tryAcquire() on evicted apps"
key_files:
  created: []
  modified:
    - src/ui/DesktopShell.tsx
decisions:
  - "LAYOUT_SAVE_DEBOUNCE_MS = 300 declared at module level — single source of truth for the debounce delay"
  - "Save effect dep array [windowManager.windows, services.settingsStore] — every geometry-changing op triggers a re-run, debounce coalesces into 1 write"
  - "Restore effect dep array [] is intentional — reads live refs (windowManagerRef, handleOpenRef) so no stale closures; same discipline as keyboard-shortcut effect"
  - "services.registry.get('apps', cacheKey) checked before resolveComponent — structural prevention of tryAcquire() on evicted apps (PERSIST-03); null → placeholder immediately"
  - "Both evicted-app branches (stored null + resolveComponent catch) call makeFallback identically — onRetry calls handleOpenRef.current (user-initiated, quota-aware)"
  - "isOpenByInstance guard checked at loop entry AND before storeComponent AND before placeholder — prevents storing a body for a window that was closed mid-resolution"
  - "All windows opened atomically via openAt BEFORE the async resolution loop — frames appear at persisted geometry immediately, no cascade flash during component resolve"
metrics:
  duration_minutes: 2
  completed_date: "2026-06-30"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 1
  tests_added: 0
  tests_total_after: 882
---

# Phase 21 Plan 03: DesktopShell Save and Restore Effects — Summary

**One-liner:** Debounced 300ms save effect + mount-only serial restore with pre-IDB-check eviction guard wired into DesktopShellInner, connecting Plans 21-01 and 21-02 primitives to the live desktop.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add debounced save effect in DesktopShellInner | 28e5d8f | src/ui/DesktopShell.tsx |
| 2 | Add mount-only restore effect with pre-IDB-check and eviction handling | 6841e74 | src/ui/DesktopShell.tsx |

## What Was Built

### Task 1: Debounced layout save effect (PERSIST-01)

Added to `src/ui/DesktopShell.tsx`:

**Module-level constant:** `LAYOUT_SAVE_DEBOUNCE_MS = 300` — the single source of truth for the trailing debounce delay.

**New import:** `LAYOUT_KEY, serializeLayout` from `../host/layoutPersistence`.

**New `useEffect`** inside `DesktopShellInner` after the keyboard-shortcut effect:
- Dependency array: `[windowManager.windows, services.settingsStore]`
- Body: `setTimeout(() => { void services.settingsStore.writeRaw(LAYOUT_KEY, serializeLayout(windowManager.windows)); }, LAYOUT_SAVE_DEBOUNCE_MS)`
- Cleanup: `clearTimeout(timer)`

Every geometry-changing window operation (open, close, move, focus, minimize, snap, maximize) changes the `windows` array reference, triggering a new effect run that restarts the timer. The previous timer is cancelled by the cleanup. Only the timer surviving a 300ms quiet period fires the IDB write — at most 1 write per drag sequence. Writing back the just-restored layout after mount is idempotent and safe.

### Task 2: Mount-only restore effect with pre-IDB-check (PERSIST-02/03)

**Additional import:** `deserializeLayout` added to the layoutPersistence import.

**New mount-only `useEffect([], ...)`** inside `DesktopShellInner` after the save effect:

The async `restoreDesktop()` function:
1. Reads `services.settingsStore.readRaw(LAYOUT_KEY)` — returns early if null (fresh session)
2. Calls `deserializeLayout(raw)` — returns early if empty (corrupt data → fresh desktop start, T-21-08)
3. Sorts entries by z ascending so the highest-z window is opened last and appears on top
4. Opens ALL windows atomically via `windowManagerRef.current.openAt(...)` — frames appear immediately at persisted geometry before any async resolution
5. Serial resolution loop (for...of with await — natural 1-concurrent):
   - `isOpenByInstance` guard: skip if window was closed before resolution
   - `resolveOpenApp(appType)` → cacheKey (derives the key without producing)
   - **PERSIST-03 critical path:** `services.registry.get("apps", intent.cacheKey)` checked BEFORE `resolveComponent`
     - `stored != null` → call `resolveComponent` (three-tier cache; tier-1/2/3 hits never reach `tryAcquire()`) → `storeComponent`
     - `stored == null` → evicted app → `makeFallback` placeholder immediately, `resolveComponent` NEVER called, zero quota spend
   - `catch` block: `resolveOpenApp` failures or `resolveComponent` failures → same `makeFallback` placeholder
   - All placeholder paths: `onRetry` calls `handleOpenRef.current(appType, title)` — user-initiated, quota-aware

## Verification

```
npx tsc --noEmit                           → 0 errors
npx vitest run src/ui/DesktopShell.test.tsx → 24/24 pass
npx vitest run                             → 90 files, 882 tests, 0 failures
grep -c "LAYOUT_SAVE_DEBOUNCE_MS" src/ui/DesktopShell.tsx → 2 (constant + setTimeout call)
grep "readRaw|writeRaw" src/ui/DesktopShell.tsx | wc -l   → 2 (one per effect)
grep "registry.get" src/ui/DesktopShell.tsx | grep "apps" → pre-IDB-check present
resolveComponent called only after stored != null guard    → confirmed
```

## Deviations from Plan

None — plan executed exactly as written.

The only minor simplification: all three imports (LAYOUT_KEY, serializeLayout, deserializeLayout) were grouped into one multi-line import statement in Task 1 rather than adding a separate import for deserializeLayout in Task 2. The plan mentions "alongside LAYOUT_KEY and serializeLayout already added in Task 1" for the Task 2 import — this is equivalent and cleaner.

## Threat Model Coverage

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-21-08 | mitigated | `deserializeLayout` wraps JSON.parse in try/catch, filters via isLayoutEntry; corrupt IDB data yields [] → fresh start; the effect returns early on empty layout |
| T-21-09 | mitigated | `services.registry.get("apps", cacheKey)` returns null for evicted apps; restore effect shows placeholder WITHOUT calling resolveComponent, so tryAcquire() at loader.ts:320 is never reached |
| T-21-10 | mitigated | `serializeLayout` from Plan 21-01 picks exactly 7 geometric fields; API key, instanceId, transpiledJS never appear in the written JSON |
| T-21-11 | mitigated | setTimeout/clearTimeout debounce: each new windows array change cancels the previous timer; exactly 1 write per 300ms quiet period |
| T-21-12 | mitigated | `handleOpenRef.current(appType, title)` routes through the standard handleOpen which sanitizes via sanitizeDisplayName; appType is passed to resolveOpenApp which derives a cacheKey via registryKey — no exec path treats appType as executable |

## Known Stubs

None — the save and restore effects are fully wired. `services.settingsStore.writeRaw` and `readRaw` are backed by the real IDB settings store in production and by `RecordingSettingsStore` in tests. `windowManagerRef.current.openAt` is fully implemented (Plan 21-02).

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. Both effects route all IDB writes through `services.settingsStore` (IoC seam), and all resolution calls go through the existing `resolveComponent` / `resolveOpenApp` paths.

## Self-Check: PASSED

Files exist:
- src/ui/DesktopShell.tsx: FOUND (modified)

Commits exist:
- 28e5d8f (Task 1 save effect): FOUND
- 6841e74 (Task 2 restore effect): FOUND

Test results: 882/882 passing, 0 failures.
TypeScript: 0 errors.
Verification checks:
- LAYOUT_SAVE_DEBOUNCE_MS occurrences: 2 (constant + setTimeout call)
- readRaw/writeRaw lines: 2
- registry.get("apps", ...) pre-check: FOUND
- resolveComponent called only after stored != null: CONFIRMED
