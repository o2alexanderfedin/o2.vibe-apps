---
phase: 22-theme-editor-custom-themes
plan: "01"
subsystem: theme-engine
tags: [custom-themes, VibeThemeProvider, settingsStore, TDD, context-extension]
dependency_graph:
  requires: [phase-21-layout-persistence]
  provides: [custom-theme-context, deleteRaw-seam, AnyThemeName-type]
  affects: [ThemeSelector, ThemeEditor, DesktopShell, SandboxFrame]
tech_stack:
  added: []
  patterns:
    - "index key enumeration (customThemeIndex IDB key) for custom theme listing"
    - "useMemo currentVars pattern for context-exposed resolved theme vars"
    - "useCallback refreshCustomThemes for IDB reload on demand"
    - "try/catch per JSON.parse entry (T-22-01 malformed IDB data defence)"
key_files:
  created: []
  modified:
    - src/host/settingsStore.ts
    - src/services/testServices.ts
    - src/ui/VibeThemeProvider.tsx
    - src/ui/VibeThemeProvider.test.tsx
    - src/host/settingsStore.raw.test.ts
    - src/ui/DesktopShell.tsx
decisions:
  - "deleteRaw uses identical best-effort open/catch/finally pattern as writeRaw (no new pattern)"
  - "refreshCustomThemes uses useCallback([settingsStore]) — stable ref prevents mount-effect loop"
  - "setTheme resolves broadcastTheme vars in priority order: explicit vars > customThemesState lookup > VIBE_THEMES lookup > aurora fallback"
  - "currentVars useMemo depends on [theme, customThemesState] — recomputes on both theme switch and IDB reload"
  - "rawDeletes getter returns new Set(rawDeletedSet) snapshot (same immutable pattern as rawWrites)"
metrics:
  duration: "13m"
  completed: "2026-06-30"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 6
  tests_added: 28
  tests_total: 902
---

# Phase 22 Plan 01: VibeThemeProvider Custom Theme Foundation Summary

Extended the VibeThemeProvider to carry `currentVars`, `customThemes`, and `refreshCustomThemes` on the context, added `CustomThemeName`/`AnyThemeName` types, fixed the `setTheme` broadcast path for `"custom:*"` names, and added `deleteRaw` to `SettingsStore` and `RecordingSettingsStore`.

## Tasks Completed

### Task 1: Add deleteRaw to SettingsStore, realSettingsStore, RecordingSettingsStore
**Commits:** `153287c` (RED), `8feb5fe` (GREEN)

- `deleteRaw(key: string): Promise<void>` added to `SettingsStore` interface with JSDoc
- `realSettingsStore.deleteRaw`: opens IDB via `openRegistry()`, calls `db.delete("settings", key)`, swallows errors in catch/finally — identical best-effort pattern to `writeRaw`
- `RecordingSettingsStore.rawDeletes: ReadonlySet<string>` added to interface
- `createRecordingSettingsStore()`: `deleteRaw` removes key from `rawCurrentMap` and adds to `rawDeletedSet`; `rawDeletes` getter returns `new Set(rawDeletedSet)` snapshot
- 8 new tests in `settingsStore.raw.test.ts` (3 real-IDB, 5 recording double)

### Task 2: Extend VibeThemeProvider with custom theme support
**Commits:** `c36e480` (RED), `41c1633` (GREEN)

- `CustomThemeName = \`custom:${string}\`` and `AnyThemeName = VibeThemeName | CustomThemeName` exported
- `VibeThemeContextValue` extended: `theme: AnyThemeName`, `currentVars: Record<string,string>`, `setTheme: (name: AnyThemeName, vars?: ...) => void`, `customThemes: ReadonlyMap`, `refreshCustomThemes: () => Promise<void>`
- `readStoredOsTheme()` now accepts `"custom:*"` localStorage values (returns them as `CustomThemeName`)
- `refreshCustomThemes` reads `customThemeIndex` from IDB, loads per-theme keys, wraps each `JSON.parse` in try/catch (T-22-01 defence)
- `currentVars` useMemo: built-in to `VIBE_THEMES[name]`; custom to `customThemesState.get(name.slice(7)) ?? VIBE_THEMES["aurora"]`
- `setTheme` resolves `broadcastTheme` vars in three-tier priority order (explicit vars > state lookup > VIBE_THEMES)
- 7 new tests covering all 7 behavior points; 14 total VibeThemeProvider tests pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DesktopShell.tsx:842 VIBE_THEMES[AnyThemeName] type error**
- **Found during:** Task 2 GREEN (tsc --noEmit after implementation)
- **Issue:** `VIBE_THEMES[themeCtx?.theme ?? "aurora"]` where `theme: AnyThemeName` — TypeScript error TS7053 because `AnyThemeName` is not assignable to `VibeThemeName` (the index type of `VIBE_THEMES`). At runtime this would silently return `undefined` for custom themes, passing `undefined` to `SandboxFrame` as `themeVars`.
- **Fix:** Changed line 842 to `themeCtx?.currentVars ?? VIBE_THEMES["aurora"]`, using the newly-added `currentVars` context field. This is exactly the fix documented in RESEARCH.md §Pitfall 2.
- **Files modified:** `src/ui/DesktopShell.tsx:842`
- **Commit:** `41c1633`

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| Task 1 RED (test) | `153287c` | 5 tests fail |
| Task 1 GREEN (feat) | `8feb5fe` | 20 tests pass |
| Task 2 RED (test) | `c36e480` | 5 tests fail |
| Task 2 GREEN (feat) | `41c1633` | 14 tests pass |

## Verification Results

```
npx tsc --noEmit          -> 0 errors
npx vitest run            -> 902/902 tests passed
  settingsStore.raw       -> 20/20
  VibeThemeProvider       -> 14/14
  ThemeSelector           -> 3/3 (no regressions)
  services/injection      -> 14/14 (no regressions)
```

## Known Stubs

None — all stubs from TDD RED commits were replaced in GREEN commits. No partial features in shipped code.

## Threat Surface Scan

No new surfaces beyond the plan's threat_model. `deleteRaw` accesses the same `settings` IDB store as `writeRaw` (existing surface, same trust boundary). No new network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

Files exist:
- src/host/settingsStore.ts found
- src/services/testServices.ts found
- src/ui/VibeThemeProvider.tsx found
- src/ui/VibeThemeProvider.test.tsx found
- src/host/settingsStore.raw.test.ts found
- src/ui/DesktopShell.tsx found

Commits exist:
- 153287c (test RED task 1) found
- 8feb5fe (feat GREEN task 1) found
- c36e480 (test RED task 2) found
- 41c1633 (feat GREEN task 2) found
