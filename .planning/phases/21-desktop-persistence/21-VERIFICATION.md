---
phase: 21-desktop-persistence
verified: 2026-06-30T23:41:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open 3+ apps, move them to different positions, then perform a hard browser reload (Ctrl+Shift+R / Cmd+Shift+R)"
    expected: "All windows reappear at their exact saved positions, correct z-order (last-opened on top), and App D (if minimized) remains minimized. Each window displays its app content, not a placeholder."
    why_human: "JSDOM tests verify the restore logic using a pre-seeded RecordingSettingsStore (in-memory). The real round-trip — write to live IndexedDB, browser discards page memory, new page load reads from IDB, restores windows — requires an actual browser. No mock can replicate IndexedDB persistence across a real page reload."
  - test: "Open an app, drag its titlebar continuously for several seconds (simulate a rapid drag storm), wait 300ms idle, then inspect what was written to IDB (DevTools > Application > IndexedDB > MarketplaceRegistry > settings > 'windowLayout')"
    expected: "Only a single write event is visible (the record's value matches the post-drag position). No write-storm of 50+ records."
    why_human: "The test suite verifies debounce via vi.useFakeTimers() with a RecordingSettingsStore. Real-browser IDB write timing and RAF loop interaction cannot be validated in JSDOM."
  - test: "Open apps, trigger an IndexedDB quota-exceeded scenario or manually delete an app's IDB record (DevTools), then reload the page"
    expected: "The evicted app restores as a window with a 'Try again' button visible inside its frame. No infinite spinner, no blank window, no console error about API quota."
    why_human: "The eviction guard (registry.get pre-check) is verified in JSDOM against an empty in-memory registry. The actual IDB eviction path and its interaction with the real registry store requires a browser."
---

# Phase 21: Desktop Persistence Verification Report

**Phase Goal:** When a user reloads the page, the desktop they left is restored — every open window reappears at its saved position, geometry, and z-order, and previously opened apps come back through the cache-hit path without triggering the produce gate.
**Verified:** 2026-06-30T23:41:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 3+ apps restore at saved positions, correct z-order + minimized state, fresh instanceIds minted at restore | VERIFIED | `DesktopShell.test.tsx:889-953` — 5-window restore test: App E (z=205) zIndex > App A (z=201), App D has `window-chrome--minimized`, 5 unique titles confirm 5 fresh instanceIds. `openAt` in `useWindowManager.tsx:226-273` mints `appType-N` never restoring a persisted UUID. |
| 2 | Dragging produces exactly 1 debounced (~300ms) IDB write per drag sequence | VERIFIED | `DesktopShell.test.tsx:783-843` — 50 pointerDown/Move/Up events + `vi.advanceTimersByTime(300)` produces exactly `baseline + 1` write. `LAYOUT_SAVE_DEBOUNCE_MS = 300` at `DesktopShell.tsx:63`. setTimeout/clearTimeout at `DesktopShell.tsx:683-691`. |
| 3 | Evicted app opens as placeholder with retry; pre-IDB-check prevents resolveComponent/tryAcquire; zero quota spend | VERIFIED | `DesktopShell.test.tsx:956-997` — empty in-memory registry, unusedTransport (throws if called); test asserts "Try again" button without transport invocation. `DesktopShell.tsx:744` — `services.registry.get("apps", intent.cacheKey)` before `resolveComponent`; `stored == null` path at line 758-773 stores Fallback directly. |
| 4 | Restoring 5 windows does not throw a produce-gate error; all complete before any threshold | VERIFIED | `DesktopShell.test.tsx:889-953` — 5-entry restore with in-memory registry (tier-3 hits, no produce calls). Serial `for...of` with `await` in `restoreDesktop()` at `DesktopShell.tsx:737-793` = natural 1-concurrent. `REGISTRY_DB_VERSION === 3` at `DesktopShell.test.tsx:999-1003`. |
| 5 | `windowLayout` record contains EXACTLY {appType,title,icon,x,y,z,minimized} — nothing else | VERIFIED | `DesktopShell.test.tsx:845-885` — asserts `Object.keys(entry).sort()` equals `["appType","icon","minimized","title","x","y","z"]`, asserts `instanceId`/`transpiledJS`/`id` absent. `serializeLayout` at `layoutPersistence.ts:90-101` does explicit 7-field pick. `isLayoutEntry` at `layoutPersistence.ts:62-81` enforces `Object.keys(v).length === 7` + Set membership. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/host/layoutPersistence.ts` | LAYOUT_KEY, LayoutEntry, isLayoutEntry, serializeLayout, deserializeLayout | VERIFIED | 120 lines, pure module, zero external deps. LAYOUT_KEY="windowLayout". isLayoutEntry enforces exact 7-key count. serializeLayout picks fields explicitly. |
| `src/host/settingsStore.ts` | writeRaw(key,value)/readRaw(key) on SettingsStore interface + realSettingsStore | VERIFIED | Interface at lines 24-31. realSettingsStore.writeRaw at lines 75-84, readRaw at lines 85-97. Same best-effort try/catch swallow pattern as write()/read(). |
| `src/ui/useWindowManager.tsx` | openAt(appType, meta, position) on WindowManagerValue | VERIFIED | Interface at lines 110-124. Implementation at lines 226-273. zTop bumped outside updater (Strict-Mode purity). Returns fresh `appType-N` instanceId. |
| `src/ui/DesktopShell.tsx` | Debounced save effect + mount-only restore effect with pre-IDB-check | VERIFIED | Save effect at lines 683-691 (deps: [windowManager.windows, services.settingsStore]). Restore effect at lines 706-796 (empty dep array, reads live refs). Pre-IDB-check at line 744. |
| `src/services/testServices.ts` | RecordingSettingsStore with rawWrites/rawWriteCount | VERIFIED | Lines 63-122. rawWritesMap tracks per-key write history. rawWriteCount(key) convenience accessor for SC#2 assertion. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `DesktopShell.tsx` save effect | `settingsStore.writeRaw(LAYOUT_KEY, ...)` | `serializeLayout(windowManager.windows)` | WIRED | Line 685-687. Fires on every `windowManager.windows` reference change. |
| `DesktopShell.tsx` restore effect | `settingsStore.readRaw(LAYOUT_KEY)` | `deserializeLayout(raw)` + `openAt` | WIRED | Lines 708-731. Reads, deserializes, sorts ascending by z, opens all atomically. |
| Restore effect | `services.registry.get("apps", cacheKey)` | `resolveOpenApp(appType)` first | WIRED | Line 744. resolveComponent is called ONLY when stored != null. |
| `openAt` | `zTop` module variable | Outside `setWindows` updater | WIRED | Lines 239-242. `if (position.z > zTop) { zTop = position.z; }` in useCallback body, not inside updater. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `DesktopShell.tsx` save effect | `windowManager.windows` | React state from `useWindowManager` — every geometry-changing operation mutates this array | Yes — live window entries with committed x/y from setGeometry | FLOWING |
| `DesktopShell.tsx` restore effect | `layout` (LayoutEntry[]) | `services.settingsStore.readRaw(LAYOUT_KEY)` → `deserializeLayout` | Yes — reads persisted JSON, validates, filters | FLOWING |
| `openAt` result `instanceId` | Window entry in `windows` array | `setWindows` updater with explicit position | Yes — exact x/y/z/minimized from LayoutEntry | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| LAYOUT_KEY constant = "windowLayout" | `grep -n "LAYOUT_KEY" src/host/layoutPersistence.ts` | `export const LAYOUT_KEY = "windowLayout"` at line 25 | PASS |
| LAYOUT_SAVE_DEBOUNCE_MS = 300 | `grep -n "LAYOUT_SAVE_DEBOUNCE_MS" src/ui/DesktopShell.tsx` | `const LAYOUT_SAVE_DEBOUNCE_MS = 300` at line 63; used at line 689 | PASS |
| REGISTRY_DB_VERSION = 3 | `grep -n "REGISTRY_DB_VERSION" src/registry/db.ts` | `export const REGISTRY_DB_VERSION = 3;` at line 24 | PASS |
| registry.get pre-check before resolveComponent | `grep -n "registry.get" src/ui/DesktopShell.tsx` | Lines 744 (pre-check); resolveComponent at 747 only inside `if (stored != null)` | PASS |
| Full test suite 887/887 | `npx vitest run` | 90 test files, 887 tests, 0 failures | PASS |
| TypeScript clean | `npx tsc --noEmit` | Exit code 0, no output | PASS |
| No source maps in dist | `find dist -name "*.map"` | 0 files found | PASS |
| Hygiene gate | `npx vitest run src/hygiene.test.ts` | 9/9 tests pass | PASS |
| CSP hash invariant | `npx vitest run src/csp.test.ts` | 7/7 tests pass | PASS |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` files exist and this phase has no declared probes.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PERSIST-01 | 21-01-PLAN, 21-03-PLAN | Window layout persists per-window {appType,title,icon,x,y,z,minimized} via writeRaw, debounced | SATISFIED | settingsStore.writeRaw + LAYOUT_KEY + serializeLayout + 300ms debounce in DesktopShell; RecordingSettingsStore in testServices |
| PERSIST-02 | 21-02-PLAN, 21-03-PLAN | On boot, restores saved windows via openAt, fresh instanceIds, geometry/z-order/minimized, cache-hit path, serialized | SATISFIED | openAt in useWindowManager; restoreDesktop() in DesktopShell; serial for-await loop; tier-3 cache hits in tests |
| PERSIST-03 | 21-03-PLAN, 21-04-PLAN | Evicted/unresolvable app shows placeholder with retry; never silent API quota spend; no in-app state persisted | SATISFIED | registry.get pre-check at DesktopShell.tsx:744; stored == null → makeFallback() with "Try again"; serializeLayout excludes all runtime state |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | Phase 21 files contain no TBD/FIXME/XXX markers, no empty stubs, no console.log-only implementations, no hardcoded empty returns in production paths |

**Debt marker gate:** Zero unreferenced debt markers found across all Phase 21 files (`src/host/layoutPersistence.ts`, `src/host/settingsStore.ts`, `src/ui/DesktopShell.tsx` save/restore effects, `src/ui/useWindowManager.tsx` openAt). Gate: PASSED.

### Human Verification Required

#### 1. Real Browser Reload with Persisted Desktop

**Test:** Open 3 or more apps in the Vibe OS desktop, drag them to different positions (one minimized). Navigate away (or close the DevTools panel) to let the 300ms debounce fire. Perform a hard reload (Cmd+Shift+R on macOS / Ctrl+Shift+R on other).

**Expected:** All windows reappear at their exact saved positions and z-order (last-focused window on top). The minimized window reappears as minimized in the dock. Each app renders its content (not a loading placeholder) because it was cached in IDB. The menu bar shows no evidence of the reload having occurred.

**Why human:** JSDOM tests verify the restore logic using a pre-seeded `RecordingSettingsStore` (in-memory Map). The real round-trip — 300ms debounce fires a real IDB `put`, browser discards page memory on reload, new page load calls `openRegistry()` and `readRaw(LAYOUT_KEY)` from the live IndexedDB — requires an actual browser environment. No mock can replicate IndexedDB persistence across a true page reload.

#### 2. Debounce Write-Storm Prevention in Real Browser

**Test:** Open an app, drag its titlebar rapidly for 5 seconds (simulating >50 pointer events). Stop and wait 400ms. Open DevTools > Application > IndexedDB > MarketplaceRegistry > settings > `windowLayout` and observe the record's `value` field.

**Expected:** The record reflects the final resting position of the window after the drag sequence. No more than ~2 writes are visible in the DevTools network timeline (or IDB inspector) for the entire drag sequence.

**Why human:** The debounce is verified in JSDOM with `vi.useFakeTimers()` and synthetic pointer events. Real browser RAF loop timing, native pointer event delivery, and IDB write timing cannot be validated without a real browser.

#### 3. Evicted App Placeholder with Real Cache

**Test:** Open an app (triggers a produce call if uncached, or a cache hit if previously opened). After the app renders, open DevTools > Application > IndexedDB > MarketplaceRegistry > apps, manually delete the record for that app type. Then reload the page.

**Expected:** The desktop restores and shows the app's window frame at its saved position, but inside the frame is a "Try again" button (the FailedAppContent placeholder) — not a blank frame and not a new produce attempt. Clicking "Try again" then triggers a fresh produce (quota-aware, user-initiated).

**Why human:** The registry.get pre-check is tested in JSDOM against an empty in-memory registry. Real IDB record deletion and the interaction with the actual `openRegistry()` + `db.get("apps", key)` call chain requires a real browser.

### Gaps Summary

No gaps. All 5 success criteria are fully implemented and verified by passing tests. The `human_needed` status reflects that the core user-visible behavior — "user reloads the page and the desktop is restored" — requires a real browser for the IDB round-trip verification. This is expected and inherent to the phase goal; it is not evidence of implementation gaps.

---

_Verified: 2026-06-30T23:41:00Z_
_Verifier: Claude (gsd-verifier)_
