---
phase: 21-desktop-persistence
reviewed: 2026-06-29T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/host/settingsStore.ts
  - src/host/layoutPersistence.ts
  - src/host/layoutPersistence.test.ts
  - src/host/settingsStore.raw.test.ts
  - src/services/testServices.ts
  - src/ui/useWindowManager.tsx
  - src/ui/useWindowManager.test.tsx
  - src/ui/DesktopShell.tsx
  - src/ui/DesktopShell.test.tsx
findings:
  critical: 0
  warning: 4
  info: 1
  total: 5
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-06-29
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 21 adds debounced layout persistence and mount-time restore to the desktop shell, wired through the existing `SettingsStore` IoC seam via two new methods (`writeRaw`/`readRaw`), a pure `layoutPersistence` module (serialization, type guard, constant), and an `openAt` extension on the window manager for geometry-exact restore. The security constraints — only 7 fields persisted, no `instanceId`/`transpiledJS`/API key, IDB access exclusively through `services.settingsStore`, no DB version bump, produce-gate/quota fully guarded — are all correctly implemented and well-tested.

Four weaknesses were found: an IndexedDB connection handle is leaked whenever an IDB operation throws inside any of the four `settingsStore` methods; `logger.info` calls inside `setWindows` updaters violate React Strict Mode purity and cause duplicate log entries in dev; the `isLayoutEntry` trust-boundary guard accepts `NaN`/`Infinity` for coordinate fields; and the mount-time save effect schedules a write of `"[]"` on first render that can race against the async restore read and clobber the persisted layout under storage pressure.

No critical/blocker issues were found. No banned tokens, no secrets, no source maps, no new runtime dependencies.

## Warnings

### WR-01: IDB connection handle leaked when operation throws

**File:** `src/host/settingsStore.ts:49-98`

**Issue:** All four methods (`write`, `read`, `writeRaw`, `readRaw`) open a database connection with `openRegistry()` then call `db.close()` in the happy path only. If the subsequent `db.put()` or `db.get()` call throws, the exception is caught by the outer `catch {}` but `db.close()` is never reached — leaving the `IDBDatabase` connection open until garbage collection. An open connection without close flags the browser's IDB engine to hold that connection alive, which blocks any concurrent `versionchange` event (e.g., a parallel tab upgrading the schema) and can delay file-handle release under heavy test teardown. The pattern appears in all four methods identically.

**Fix:** Wrap the operation in `try/finally` so the connection is always released:
```typescript
async writeRaw(key: string, value: string): Promise<void> {
  let db: IDBPDatabase<RegistrySchema> | null = null;
  try {
    db = await openRegistry();
    const record: SettingRecord = { key, value };
    await db.put("settings", record, key);
  } catch {
    // Best-effort mirror — caller-supplied key, same swallow pattern as write().
  } finally {
    db?.close();
  }
},
```
Apply the same `let db = null; try { db = await openRegistry(); ... } finally { db?.close(); }` pattern to `write`, `read`, and `readRaw`.

---

### WR-02: `logger.info` called inside `setWindows` updaters — fires twice under React Strict Mode

**File:** `src/ui/useWindowManager.tsx:217, 266, 420`

**Issue:** The `open()`, `openAt()`, and `close()` callbacks each call `logger.info(...)` inside the `setWindows(prev => { ... })` updater. React 19 Strict Mode double-invokes every state updater (with the same `prev`) to surface impure updaters. The `zTop` mutation was explicitly moved outside the updater with a comment explaining this exact hazard, but the logger calls were not given the same treatment. As a result every "Window opened" and "Window closed" entry appears twice in the dev log per user action, which confuses debugging of the open/close lifecycle (and will confuse any future log-based diagnostics tied to these events).

The `openIdsRef` and `openInstanceIdsRef` mutations inside the updaters are similarly impure, but their idempotency (same `prev`, same result) prevents a correctness bug — only the logger produces a visible symptom.

**Fix:** Hoist the logger call outside the `setWindows` updater, immediately after the function body computes the id — the same location the `zTop` mutation lives:
```typescript
// In open():
const z = ++zTop;
logger.info(`Window opened: ${id} (${appType})`);  // ← outside updater
setWindows(prev => {
  const { x, y } = cascadePlace(prev);
  const entry: WindowEntry = { ... };
  openIdsRef.current = new Set([...prev.map(w => w.id), id]);
  openInstanceIdsRef.current = new Set([...prev.map(w => w.instanceId), instanceId]);
  // logger removed from here
  return [...prev, entry];
});
```
Apply the same hoist in `openAt()` and `close()`.

---

### WR-03: `isLayoutEntry` accepts `NaN` and `Infinity` for numeric coordinate fields

**File:** `src/host/layoutPersistence.ts:73-78`

**Issue:** The type guard uses `typeof obj["x"] !== "number"` to validate the three coordinate fields. `typeof NaN === "number"` is `true`, and `typeof Infinity === "number"` is `true`, so objects with `{x: NaN, y: 0, z: Infinity, ...}` pass the guard. Through `serializeLayout → JSON.stringify`, these values become `null` (JSON encodes `NaN`/`Infinity` as `null`), and `null` correctly fails the `typeof` check on re-parse. However, the guard is documented as a trust-boundary check against arbitrary IDB data (T-21-01). Any code path that writes coordinates to IDB without going through the JSON serialization round-trip (e.g., direct IDB writes in a future migration script or test fixture) could introduce non-finite values that pass the guard and reach `openAt()`, producing `translate(NaNpx, Ypx)` CSS — an invalid transform that silently places the window at an undefined position.

**Fix:** Replace `typeof` checks with `Number.isFinite` for the three numeric coordinate fields:
```typescript
// Replace:
if (typeof obj["x"] !== "number") return false;
if (typeof obj["y"] !== "number") return false;
if (typeof obj["z"] !== "number") return false;

// With:
if (!Number.isFinite(obj["x"] as number)) return false;
if (!Number.isFinite(obj["y"] as number)) return false;
if (!Number.isFinite(obj["z"] as number)) return false;
```
`Number.isFinite` rejects `NaN`, `Infinity`, `-Infinity`, and non-number types (unlike the global `isFinite` it does not coerce). The `minimized` check is already correct (`typeof ... !== "boolean"` has no NaN analogue).

---

### WR-04: Mount-time save effect schedules a `"[]"` write that races the async restore read

**File:** `src/ui/DesktopShell.tsx:683-796`

**Issue:** On first mount, React runs effects in declaration order. The save effect (line 683) fires before the restore effect (line 706) and immediately schedules:
```
setTimeout(() => writeRaw(LAYOUT_KEY, serializeLayout([])), 300)
```
because `windowManager.windows` is `[]` at that moment. The restore effect then starts an async IDB read (`await services.settingsStore.readRaw(LAYOUT_KEY)`). Under normal conditions that read completes in well under 300ms, `openAt` calls fire, `windows` changes, React re-renders, the save effect cleanup cancels the timer, and a new timer is scheduled to write the correct layout. The race is harmless.

Under storage pressure, on a first page open with a cold IDB handle, or in environments with slow persistent storage (low-end devices, certain PWA storage backends), the IDB read can exceed 300ms. When it does, the timer fires first and writes `"[]"` to IDB — clobbering the persisted layout. The restore continues from its already-resolved in-memory buffer, re-opens the windows, and the save effect eventually writes the correct layout back approximately 300ms later. However, if the browser is closed or the page crashes in the window between the `"[]"` clobber and the recovery write (~300ms–600ms after mount), the entire layout is permanently lost — the next reload finds `"[]"` and starts with an empty desktop.

**Fix:** Gate the save effect writes behind a ref that the restore effect sets after all `openAt` calls complete:
```typescript
// In DesktopShellInner, alongside other refs:
const restoredRef = useRef(false);

// Save effect — skip the first write until restore has run:
useEffect(() => {
  if (!restoredRef.current) return; // restore not yet complete on first mount
  const timer = setTimeout(() => {
    void services.settingsStore.writeRaw(
      LAYOUT_KEY,
      serializeLayout(windowManager.windows),
    );
  }, LAYOUT_SAVE_DEBOUNCE_MS);
  return () => clearTimeout(timer);
}, [windowManager.windows, services.settingsStore]);

// In restoreDesktop(), after all openAt calls but before the component-resolve loop:
restoredRef.current = true;
// Trigger the save effect for the first time by updating a piece of state,
// or simply accept that the next windows-change (from storeComponent) will
// trigger the effect with restoredRef.current already true.
```
An alternative with fewer moving parts: move the layout save to fire only when `windowManager.windows.length > 0`, which naturally skips the initial empty-array write but still needs the restore-complete signal to handle an all-windows-closed save correctly. The ref approach is the most explicit.

---

## Info

### IN-01: `RecordingSettingsStore.rawWrites` exposes internal mutable arrays through `ReadonlyMap`

**File:** `src/services/testServices.ts:118-121`

**Issue:** The `rawWrites` getter returns `rawWritesMap` (a `Map<string, string[]>`) typed as `ReadonlyMap<string, readonly string[]>`. The values in the map are direct references to the internal `string[]` arrays — not copies. A consumer that casts away the `readonly` modifier can mutate the store's internal write history:
```typescript
(store.rawWrites.get("windowLayout") as string[]).push("injected");
store.rawWriteCount("windowLayout"); // now returns stale count
```
This is test-only code with no security impact, but the type annotation implies value immutability that the implementation does not enforce.

**Fix:** Return a snapshot with frozen entries:
```typescript
get rawWrites(): ReadonlyMap<string, readonly string[]> {
  return new Map(
    [...rawWritesMap.entries()].map(([k, v]) => [k, Object.freeze([...v])]),
  );
},
```
Or document the exposed mutability explicitly in the interface comment.

---

_Reviewed: 2026-06-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
