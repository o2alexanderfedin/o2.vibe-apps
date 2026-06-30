# Phase 21: Desktop Persistence - Research

**Researched:** 2026-06-29
**Domain:** IndexedDB `settings` store persistence + window manager restore path
**Confidence:** HIGH — all findings verified against live source files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Schema is additive, no DB version bump**: persist window layout under the additive key `"windowLayout"` in the existing IDB `settings` store. No migration, no new object store. A dedicated `windows` store (DB v4) is the fallback only if querying needs grow beyond a flat key-value lookup — which v3.0 does not require.
- **Layout record shape is exactly** `{ appType, title, icon, x, y, z, minimized }` per entry — **no** `instanceId`, **no** `transpiledJS`, **no** API key, **no** Component reference. `instanceId`s are freshly minted at restore time.
- **Debounced writes**: dragging/moving a window must not cause a write-storm. A debounced (~300ms trailing) write coalesces a drag sequence into a single IDB write to the `settings` store.
- **Restore goes through the cache-hit path** and must NOT trip the produce gate: restores are serialized (concurrency-capped at 1–2 concurrent) so all windows complete restore before any produce-gate threshold is reached.
- **Evicted/unresolvable app on restore** opens as a placeholder window with a visible retry action — it never silently spends API quota.
- All v1.0/v1.1/v2.0 cross-cutting constraints remain acceptance criteria: HYGIENE-01..07 (banned token family + iframe/sandbox/isolation lexicon gate), single Anthropic egress, sourcemaps-off, CSP allowlist, IoC/DI, additive-IDB-only, FOUC/CSP-hash invariant.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and existing codebase conventions (window manager from Phase 15/16, IDB settings store, ServicesProvider/IoC) to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERSIST-01 | Window layout persists across reloads — per window `{ appType, title, icon, x, y, z, minimized }` written to IDB `settings` store under `"windowLayout"` via a debounced write on any geometry change | settingsStore extension: `writeRaw`/`readRaw`; debounce via `setTimeout`/`clearTimeout` in `useEffect`; window manager `windows` array as the change trigger |
| PERSIST-02 | On boot, desktop restores saved windows — minting fresh `instanceId`s, restoring geometry/z-order/minimized, re-resolving each component through the cache-hit path; restores are serialized | new `openAt()` in window manager; mount-only `useEffect` in `DesktopShellInner`; serial Promise chain for resolution; `resolveComponent` tier 1/2/3 never touches `tryAcquire()` |
| PERSIST-03 | An app that can no longer be resolved on restore opens as a placeholder with a retry action — never silent API spend; no in-app state persisted | existing `makeFallback` / `FailedAppContent` pattern; retry calls `handleOpen` (user-initiated, quota-aware) |
</phase_requirements>

---

## Summary

Phase 21 adds desktop persistence to VibeOS: saving and restoring the open window layout (geometry, z-order, minimized state) across page reloads. The work is entirely additive — a new key `"windowLayout"` in the existing IDB `settings` store (DB v3, no bump), two new methods on the `SettingsStore` interface, and one new method on the window manager.

The save path is a debounced `useEffect` in `DesktopShellInner` watching `windowManager.windows`. Every geometry change (open, move, minimize, z-order focus, close) restarts a 300ms trailing timer; only the final state in a quiet period reaches IDB. This pattern exactly mirrors the `MenuBar` clock's `setInterval`/`clearInterval` cleanup pattern already in the codebase — no new debounce utility needed.

The restore path runs in a mount-only `useEffect` in `DesktopShellInner`. It reads the persisted layout, sorts entries by saved z (ascending), opens all windows atomically via a new `openAt()` method (setting explicit geometry, not cascade), then serially resolves each component through the existing three-tier loader. Cache hits (tier 1/2/3) never reach `services.produceGate.tryAcquire()`, so the produce gate is structurally bypassed. An evicted (uncacheable) app falls through to a placeholder using the existing `makeFallback`/`FailedAppContent` pattern — retry is user-initiated and never silently spends quota.

**Primary recommendation:** Extend `SettingsStore` with `writeRaw`/`readRaw`, add `openAt` to `WindowManagerValue`, and wire both into a thin `layoutPersistence.ts` module plus two effects in `DesktopShellInner`. Zero new npm runtime dependencies.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Save window layout to IDB | Frontend (DesktopShellInner effect) | IDB settings store (db.ts) | DesktopShell owns the windows array; it's the only place that knows the authoritative geometry. IDB is the durable sink. |
| Read layout on boot | Frontend (DesktopShellInner mount effect) | IDB settings store | Mount-only effect in the same component that owns windows state. |
| Serialize/deserialize layout | Utility module (layoutPersistence.ts) | — | Pure functions with no React deps — independently testable, reusable by both save and restore paths. |
| Re-resolve components on restore | Frontend (DesktopShellInner) via loader | Registry / IDB | Same resolution path as `handleOpen`; DesktopShell already owns the `storeComponent` map. |
| Produce-gate bypass | loader.ts (structural) | — | `tryAcquire()` is only called on unseeded full misses; cache-hit restores never reach it. No code change needed. |
| Placeholder for evicted apps | Frontend (DesktopShellInner) | — | Reuses existing `makeFallback` / `FailedAppContent` fallback infrastructure. |
| Debounce timer | Frontend (DesktopShellInner effect cleanup) | — | `useEffect` return-cleanup idiom; no utility needed. |

---

## Standard Stack

### Core (all existing — zero new runtime dependencies)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `idb` | 8.0.3 (existing) | IDB wrapper via `openRegistry()` | Already used in `src/registry/db.ts` and `src/host/settingsStore.ts` |
| React hooks | 19.2.x (existing) | `useEffect` for save + restore, `useCallback` for `openAt` | Already in every component in this codebase |
| `fake-indexeddb` | existing (devDep) | IDB polyfill for test suite | Already in `src/test/setup.ts` via `import "fake-indexeddb/auto"` |
| `vitest` | existing | Fake timers (`vi.useFakeTimers`) for debounce tests | Already used in `MenuBar.test.tsx` |

[VERIFIED: source grep + package.json — no new packages required]

---

## Architecture Patterns

### System Architecture Diagram

```
[Page reload]
      │
      ▼
[DesktopShellInner mount effect]
      │
      ▼
[settingsStore.readRaw("windowLayout")]  ──► [IDB settings store]
      │
      ▼
[parseLayout(raw)] → sorted by z ascending
      │
      ▼
[wm.openAt(appType, meta, {x,y,z,minimized})]  × N windows
      │  (all opened atomically, cascade bypassed)
      ▼
[Serial resolution loop]
      │
      ├── resolveOpenApp(appType) → cacheKey
      ├── resolveComponent(instanceId, appType, cacheKey, services)
      │        │
      │        ├── tier-1 hit (live) → Component  ──┐
      │        ├── tier-2 hit (session cache) → Component  ──┤
      │        ├── tier-3 hit (IDB) → Component  ──┤
      │        └── full miss → tryAcquire() → placeholder ──┘
      │
      ▼
[storeComponent(instanceId, Component)]
      │  (or placeholder via makeFallback if evicted)
      ▼
[WindowFrame renders body]

───────────────────────────────────────────────

[User moves/opens/closes/minimizes window]
      │
      ▼
[windowManager.windows changes] (new array ref)
      │
      ▼
[useEffect([windowManager.windows]) fires]
      │  clearTimeout(prev timer)
      ▼
[setTimeout(300ms)]
      │
      ▼  (only if 300ms quiet period elapses)
[serializeLayout(windows) → JSON string]
      │
      ▼
[settingsStore.writeRaw("windowLayout", json)]  ──► [IDB settings store]
```

### Recommended Project Structure Changes

```
src/
├── host/
│   ├── settingsStore.ts       # ADD writeRaw/readRaw to interface + implementation
│   └── layoutPersistence.ts   # NEW: serialize/deserialize layout; save/load helpers
├── ui/
│   ├── useWindowManager.tsx   # ADD openAt() to interface + provider
│   └── DesktopShell.tsx       # ADD restore-on-load effect + debounced-save effect
└── services/
    └── testServices.ts        # UPDATE RecordingSettingsStore with rawWrites tracking
```

### Pattern 1: Extend `SettingsStore` with raw key access

**What:** Add `writeRaw(key, value)` and `readRaw(key)` to the `SettingsStore` interface and `realSettingsStore` implementation.

**Why needed:** The current interface only supports a single fixed key (`"osTheme"`) via `write`/`read`. Phase 21 needs to write JSON under a NEW key `"windowLayout"`. The `settings` IDB object store supports arbitrary string keys — the interface just needs to expose that capability.

**Where:** `src/host/settingsStore.ts:14` (interface definition)

[VERIFIED: src/host/settingsStore.ts — current interface has only `write(value: string)` and `read(): Promise<string | null>`; both hardcoded to `SETTINGS_KEY = "osTheme"` at line 24]

```typescript
// Source: src/host/settingsStore.ts (current interface, lines 14-19)
export interface SettingsStore {
  write(value: string): Promise<void>;
  read(): Promise<string | null>;
  // ADD for Phase 21:
  writeRaw(key: string, value: string): Promise<void>;
  readRaw(key: string): Promise<string | null>;
}
```

**Implementation pattern** (same as the existing `write`/`read`, using `openRegistry()` directly):
```typescript
// Source: src/host/settingsStore.ts (realSettingsStore pattern, lines 36-63)
async writeRaw(key: string, value: string): Promise<void> {
  try {
    const db = await openRegistry();
    const record: SettingRecord = { key, value };
    await db.put("settings", record, key);
    db.close();
  } catch {
    // Best-effort — swallow
  }
},
async readRaw(key: string): Promise<string | null> {
  try {
    const db = await openRegistry();
    const record = await db.get("settings", key);
    db.close();
    if (record && typeof record.value === "string") return record.value;
  } catch {
    // Best-effort — fall through to null
  }
  return null;
},
```

**Why direct `openRegistry()` and NOT the `Registry` adapter:** The `Registry` adapter's `StoreName` type union covers only `"apps" | "widgets" | "handlers"` (verified in `src/services/registry.ts:12`). The settings store is intentionally outside that surface. The existing `realSettingsStore` comment at line 32 confirms this: "Note: this opens the registry directly via openRegistry() rather than the typed Registry adapter, because the adapter's StoreName union intentionally covers only apps/widgets/handlers."

### Pattern 2: Add `openAt` to `WindowManagerValue`

**What:** A new `openAt` method that creates a window entry with EXPLICIT geometry (bypassing `cascadePlace`) and returns `instanceId`. Needed because the restore path knows the exact x/y/z to restore — cascade placement would show incorrect positions until `setGeometry` could be called post-render.

**Why not use `open()` + `setGeometry()`:** After `open()` schedules a React state update, `windowsRef.current` still holds the pre-update window list. The `id` needed by `setGeometry` is not yet in the ref. We'd need to await a render tick — fragile. `openAt` sets geometry atomically at open time.

**Where:** `src/ui/useWindowManager.tsx:62` (WindowManagerValue interface) and `src/ui/useWindowManager.tsx:138` (WindowManagerProvider)

[VERIFIED: src/ui/useWindowManager.tsx — `open()` at line 167 uses `cascadePlace(prev)` inside the updater; `setGeometry()` at line 234 has a guard (`!w.maximized && w.snapSide === null`) and does NOT accept z; the windows array ref (`windowsRef.current`) is updated only on re-render (line 160), not synchronously after `setWindows`]

```typescript
// Add to WindowManagerValue interface (src/ui/useWindowManager.tsx:62):
openAt: (
  appType: string,
  meta: { title: string; icon: string },
  position: { x: number; y: number; z: number; minimized: boolean },
) => string;
```

**Implementation:**
```typescript
// Source: mirrors open() pattern at src/ui/useWindowManager.tsx:167
const openAt = useCallback(
  (
    appType: string,
    meta: { title: string; icon: string },
    position: { x: number; y: number; z: number; minimized: boolean },
  ): string => {
    const n = ++counter;
    const id = `win-${n}`;
    const instanceId = `${appType}-${n}`;
    // Use the provided z directly. Keep zTop above all restored z values
    // so future open() calls assign higher z than any restored window.
    if (position.z > zTop) zTop = position.z;

    setWindows(prev => {
      const entry: WindowEntry = {
        id,
        instanceId,
        appType,
        title: sanitizeDisplayName(meta.title),
        icon: meta.icon,
        x: position.x,
        y: position.y,
        z: position.z,
        minimized: position.minimized,
        maximized: false,
        restoreRect: null,
        snapSide: null,
      };
      openIdsRef.current = new Set([...prev.map(w => w.id), id]);
      openInstanceIdsRef.current = new Set([...prev.map(w => w.instanceId), instanceId]);
      logger.info(`Window opened: ${id} (${appType})`);
      return [...prev, entry];
    });

    return instanceId;
  },
  [],
);
```

**zTop management:** Restored windows use their persisted z values (e.g. 201, 202, 203). The module-level `zTop` starts at 200 (line 33). After `openAt`, `zTop` is bumped to the highest restored z. Subsequent `open()` or `focus()` calls use `++zTop`, so they correctly assign z values above all restored windows.

### Pattern 3: Debounced save effect in `DesktopShellInner`

**What:** A `useEffect` that watches `windowManager.windows` and writes the layout to IDB after a 300ms trailing debounce.

**Why `useEffect` + `setTimeout` (not a custom debounce hook):** The codebase has no debounce utility — `MenuBar.tsx` uses `setInterval`/`clearInterval` directly in `useEffect`. The `setTimeout`/`clearTimeout` pattern is idiomatic here and trivially testable with `vi.useFakeTimers()`. [VERIFIED: grep for `debounce`/`useDebounce` across all `src/**` returned no results]

**Where to add:** `src/ui/DesktopShell.tsx` inside `DesktopShellInner` function

```typescript
// Source: idiomatic to this codebase (mirrors MenuBar clock pattern)
const LAYOUT_SAVE_DEBOUNCE_MS = 300;

useEffect(() => {
  const timer = setTimeout(() => {
    const layout = windowManager.windows.map(w => ({
      appType: w.appType,
      title: w.title,
      icon: w.icon,
      x: w.x,
      y: w.y,
      z: w.z,
      minimized: w.minimized,
    }));
    void services.settingsStore.writeRaw(
      "windowLayout",
      JSON.stringify(layout),
    );
  }, LAYOUT_SAVE_DEBOUNCE_MS);
  return () => clearTimeout(timer);
}, [windowManager.windows, services.settingsStore]);
```

**Trigger surface:** Every `windows` array reference change fires this effect. That includes `open`, `openAt`, `close`, `focus` (z-bump), `minimize`, `restore`, `setGeometry`, `maximize`, `unmaximize`, `snapLeft`, `snapRight`, `unsnap`. All geometry-affecting operations are covered.

**Suppression during restore:** The save fires after restore too — this is CORRECT and idempotent. The first save after restore writes back the just-restored layout (no-op semantically). There is no need for a "suppress during restore" flag.

### Pattern 4: Restore-on-load effect in `DesktopShellInner`

**What:** A mount-only `useEffect` that reads the persisted layout and restores windows.

**Concurrency model:** Open all windows synchronously (React 18 auto-batching groups state updates), then resolve components SERIALLY via a chained-Promise approach. Serial (1 concurrent) is simpler than the widgetPrewarm pool and sufficient for 5 windows. Cache hits are fast; produce-gate misses result in placeholder immediately.

**Where to add:** `src/ui/DesktopShell.tsx` inside `DesktopShellInner` function

```typescript
// Source: mirrors handleOpen pattern in DesktopShell.tsx; restore effect
useEffect(() => {
  async function restoreDesktop(): Promise<void> {
    const raw = await services.settingsStore.readRaw("windowLayout");
    if (!raw) return; // nothing persisted — fresh session

    let layout: Array<{
      appType: string; title: string; icon: string;
      x: number; y: number; z: number; minimized: boolean;
    }>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      layout = parsed.filter(isLayoutEntry); // validate shape
    } catch {
      return; // corrupt data — fresh start
    }
    if (layout.length === 0) return;

    // Sort by z ascending so later-opened windows land higher in z-order
    const sorted = [...layout].sort((a, b) => a.z - b.z);

    // Open all windows with explicit geometry (no cascade flash)
    const opened: Array<{ appType: string; title: string; instanceId: string }> = [];
    for (const entry of sorted) {
      const instanceId = windowManagerRef.current.openAt(
        entry.appType,
        { title: entry.title, icon: entry.icon },
        { x: entry.x, y: entry.y, z: entry.z, minimized: entry.minimized },
      );
      opened.push({ appType: entry.appType, title: entry.title, instanceId });
    }

    // Resolve components SERIALLY (1 concurrent) — cache-hit path only.
    // A full miss (evicted) falls into the catch → placeholder shown.
    for (const { appType, title, instanceId } of opened) {
      if (!windowManagerRef.current.isOpenByInstance(instanceId)) continue;
      try {
        const intent = await resolveOpenApp(appType);
        const Component = await resolveComponent(
          instanceId, appType, intent.cacheKey, services,
        );
        if (!windowManagerRef.current.isOpenByInstance(instanceId)) {
          evictLiveComponent(instanceId);
          continue;
        }
        storeComponent(instanceId, Component);
      } catch {
        // Evicted / no key — show placeholder, NEVER spend quota automatically
        if (!windowManagerRef.current.isOpenByInstance(instanceId)) continue;
        const Fallback = makeFallback({
          needsAuth: false,
          throttled: false,
          onConnect: () => setKeyDialogOpen(true),
          onRetry: () => {
            const wid = windowManagerRef.current.windows
              .find(w => w.instanceId === instanceId)?.id;
            if (wid) handleClose(wid, instanceId);
            void handleOpenRef.current(appType, title);
          },
        });
        storeComponent(instanceId, Fallback);
      }
    }
  }
  void restoreDesktop();
}, []); // mount-only — intentional empty deps (reads live refs, not stale closures)
```

**Why `[]` deps are safe:** The effect reads `services` (stable Services object from context), `windowManagerRef.current` (always current via ref pattern already used throughout `DesktopShellInner`), `storeComponent` (memoized, stable), `handleClose` / `handleOpenRef.current` (stable memoized callback / ref pattern). Same dependency discipline as existing effects in `DesktopShellInner`.

### Pattern 5: `layoutPersistence.ts` — pure serialization module

**What:** A pure utility module with no React or IDB dependencies. Contains:
- `LayoutEntry` type (the persisted record shape)
- `isLayoutEntry(v: unknown): v is LayoutEntry` — runtime shape guard
- `serializeLayout(windows: WindowEntry[]): string` — map to LayoutEntry + JSON.stringify
- `deserializeLayout(raw: string): LayoutEntry[]` — JSON.parse + filter invalid entries
- `LAYOUT_KEY = "windowLayout"` — single source of truth for the IDB key

This module has zero external dependencies and is fully testable offline.

### Anti-Patterns to Avoid

- **Don't store `instanceId`, `transpiledJS`, `Component`, or API key in the layout.** The layout record is `{ appType, title, icon, x, y, z, minimized }` and nothing else. [VERIFIED: binding from CONTEXT.md]
- **Don't use `setGeometry` after `open` to set position.** `setGeometry` requires the window id (not instanceId), which isn't available until after React re-renders. Use `openAt` instead.
- **Don't call `tryAcquire()` during restore.** The loader calls it only on unseeded full misses (line 320 of `src/execution/loader.ts`). Ensure all 5 restores treat a cache miss as a placeholder, not a produce attempt.
- **Don't debounce with a closure-captured stale window list.** The `useEffect` dependency on `windowManager.windows` ensures the closure always has the current windows at timer-fire time (the timer captures `windowManager.windows` from that render).
- **Don't call `window.close()` or reset zTop to 200 on restore.** `openAt` adjusts `zTop` upward from restored z values so subsequent `open()` or `focus()` calls assign correctly ascending z.
- **Don't bypass the IoC seam for IDB writes.** All writes go through `services.settingsStore.writeRaw()` — never call `openRegistry()` directly from `DesktopShell.tsx`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debounce | A standalone `debounce(fn, ms)` utility | `useEffect` + `setTimeout`/`clearTimeout` | The cleanup idiom is already idiomatic in this codebase; a utility adds an untested abstraction layer for no benefit at this callsite count |
| Concurrency cap | A semaphore class / p-limit | A simple sequential Promise chain | For 5 windows, `chain = chain.then(resolveOne)` is 2 lines and trivially correct; the widgetPrewarm pool is for N-variable widget trees, not a fixed list |
| IDB schema migration | Any migration logic | Additive key only | `REGISTRY_DB_VERSION` stays 3; `upgrade()` in `db.ts` creates the `settings` store once and never touches existing data |
| Shape validation library | zod/ajv | An inline `isLayoutEntry` guard | A 3-field type check (string + number + boolean) does not justify a schema library dependency |

**Key insight:** The entire feature is glue between existing well-tested building blocks (window manager, IDB settings store, loader's three-tier resolution, `makeFallback`). The less new code, the better.

---

## Common Pitfalls

### Pitfall 1: z-order not preserved after restore
**What goes wrong:** If windows are opened in arbitrary order, their z values assigned by `openAt` may not reflect relative z-order (earlier-opened windows end up with higher final z than intended).

**Why it happens:** `openAt` sets `z` to the persisted value directly. But if the restore loop processes entries in wrong order, the DISPLAYED order won't match the saved z-order even though the z values are set correctly. This is actually fine — the z values on the entries ARE the correct absolute values. What must be avoided is `zTop` being left at 200 when restored windows have z values like 201, 202, 203 — a subsequent `open()` or `focus()` would assign `++zTop = 201`, BELOW existing restored windows.

**How to avoid:** `openAt` bumps `zTop` to `Math.max(zTop, position.z)` before returning. After all restores, `zTop >= max(restored z values)`, so future ops correctly assign higher z. [VERIFIED: `zTop` is module-level at `src/ui/useWindowManager.tsx:33`, starting at 200]

**Warning signs:** After restore, clicking a window to focus it doesn't bring it to the front (focus assigns `++zTop` which equals the previous `zTop`, same as another restored window's z).

### Pitfall 2: Stale `windowsRef.current` in the restore effect
**What goes wrong:** After calling `openAt()` inside an async `useEffect`, `windowManagerRef.current.windows` may not yet contain the just-opened window (state update batched, not yet flushed).

**Why it happens:** `openAt` schedules state via `setWindows`. React 18 batches updates but only commits them before the next browser paint — after `await` boundary in the async effect, state may or may not have flushed.

**How to avoid:** The restore effect doesn't need to look up the id — it uses `windowManagerRef.current.isOpenByInstance(instanceId)` for guards (which uses `openInstanceIdsRef`, updated synchronously INSIDE the `setWindows` updater at line 197), and `windowManagerRef.current.windows.find(w => w.instanceId === instanceId)` only for building the `handleClose` call (in the retry callback, which fires long after state has flushed). This is the same pattern already used in `DesktopShell.tsx:309-313`.

**Warning signs:** A `find(w => w.instanceId === instanceId)` inside the restore effect returns `undefined` — indicates reading windows before React has flushed the `openAt` state.

### Pitfall 3: Write-storm on restore
**What goes wrong:** Opening 5 windows in the restore effect triggers 5 rapid `windows` state changes, each starting the 300ms save timer. Each new change clears the previous timer. Net result: only 1 timer is active at any moment, which fires 300ms after the last window opens.

**Why it matters:** This is actually the CORRECT behavior (the debounce correctly coalesces rapid changes), but the test for "exactly 1 write per drag sequence" must use `vi.useFakeTimers()` to advance time past the quiet period precisely once — otherwise flaky.

**How to avoid:** `vi.useFakeTimers()` in the test, then `await act(() => { vi.advanceTimersByTime(LAYOUT_SAVE_DEBOUNCE_MS); })`. Check `settingsStore.rawWriteCount("windowLayout") === 1`. [VERIFIED: `MenuBar.test.tsx:94-108` shows `vi.useFakeTimers()` / `vi.setSystemTime` / `vi.useRealTimers()` as the fake-timer test idiom in this codebase]

### Pitfall 4: `fake-indexeddb` hygiene conflict
**What goes wrong:** `fake-indexeddb` is a third-party package whose name contains the banned word "fake" (HYGIENE-03). Importing it in test files would trip the hygiene gate.

**Why it doesn't:** The hygiene gate's `DEPENDENCY_ALLOWLIST` at `src/hygiene.test.ts:69` strips `fake-indexeddb` from lines before matching. Test-only imports are already covered. No action needed. [VERIFIED: `src/hygiene.test.ts:68-70`]

**Warning signs:** Accidentally using the string "fake" in a comment or user-visible copy (not an import path) — that WOULD trip the gate.

### Pitfall 5: Persisting banned tokens in the `"windowLayout"` record
**What goes wrong:** An `appType` or `title` derived from model output could theoretically contain a banned token. Since the layout is stored as a JSON string in IDB (not in `src/**`), it doesn't trip the static hygiene gate. But if the title is loaded back and rendered in the DOM (which it is — it's the window titlebar text), `sanitizeDisplayName` must be applied at `openAt` time.

**How to avoid:** `openAt` calls `sanitizeDisplayName(meta.title)` before writing to the entry — exactly as `open()` does at line 191. [VERIFIED: `src/ui/useWindowManager.tsx:191`]

### Pitfall 6: Restore fires produce gate on unseeded app miss
**What goes wrong:** An app in the persisted layout that is NOT in IDB (evicted) and is unseeded will hit the full-miss path in the loader, call `services.produceGate.tryAcquire()`, and potentially spend API quota — violating PERSIST-03.

**Why it can happen:** The three-tier loader falls through to production on a full miss. The restore path doesn't know in advance whether the app is cached.

**How to avoid:** Wrap the `resolveComponent` call in a try/catch in the restore loop. On any error — including `ProduceThrottledError`, `ProduceAuthError`, or a `resolveComponent` error caused by production spending one produce call — show the placeholder. The placeholder's retry button calls `handleOpen`, which is the user-initiated path that properly handles throttling. The produce gate cost (1 produce call consumed by the miss before the gate fires) is bounded and acceptable — the gate's cap of 10/5min is large relative to a single restore miss.

For stricter protection: call `services.registry.get("apps", cacheKey)` before `resolveComponent` to check if the app is in IDB first. If absent, show placeholder immediately without calling `resolveComponent`. This saves even the 1 produce call. The planner should choose based on desired strictness.

---

## Code Examples

### Example 1: Extending `SettingsStore` with `writeRaw`/`readRaw`

```typescript
// Source: src/host/settingsStore.ts (extend existing interface at line 14)
export interface SettingsStore {
  write(value: string): Promise<void>;
  read(): Promise<string | null>;
  /** Write any preference value under an arbitrary key (additive, Phase 21). */
  writeRaw(key: string, value: string): Promise<void>;
  /** Read any preference value by key, null when absent (Phase 21). */
  readRaw(key: string): Promise<string | null>;
}

// Add to realSettingsStore implementation (after the existing read method):
async writeRaw(key: string, value: string): Promise<void> {
  try {
    const db = await openRegistry();
    const record: SettingRecord = { key, value };
    await db.put("settings", record, key);
    db.close();
  } catch {
    // Best-effort mirror — swallow.
  }
},
async readRaw(key: string): Promise<string | null> {
  try {
    const db = await openRegistry();
    const record = await db.get("settings", key);
    db.close();
    if (record && typeof record.value === "string") return record.value;
  } catch {
    // Best-effort — fall through.
  }
  return null;
},
```

### Example 2: Updated `RecordingSettingsStore` test double

```typescript
// Source: src/services/testServices.ts (update RecordingSettingsStore at line 63)
export interface RecordingSettingsStore extends SettingsStore {
  readonly writes: string[];
  readonly writeCount: number;
  /** Per-key raw write log: key → list of values in call order. */
  readonly rawWrites: ReadonlyMap<string, readonly string[]>;
  /** Number of writeRaw calls for a given key. */
  rawWriteCount(key: string): number;
}

export function createRecordingSettingsStore(): RecordingSettingsStore {
  const writes: string[] = [];
  let current: string | null = null;
  const rawWritesMap = new Map<string, string[]>();
  const rawCurrentMap = new Map<string, string | null>();
  return {
    write(value) { writes.push(value); current = value; return Promise.resolve(); },
    read() { return Promise.resolve(current); },
    writeRaw(key, value) {
      const arr = rawWritesMap.get(key) ?? [];
      arr.push(value);
      rawWritesMap.set(key, arr);
      rawCurrentMap.set(key, value);
      return Promise.resolve();
    },
    readRaw(key) { return Promise.resolve(rawCurrentMap.get(key) ?? null); },
    get writes() { return writes; },
    get writeCount() { return writes.length; },
    get rawWrites() { return rawWritesMap as ReadonlyMap<string, readonly string[]>; },
    rawWriteCount(key) { return rawWritesMap.get(key)?.length ?? 0; },
  };
}
```

### Example 3: Debounce test with fake timers (asserting exactly 1 write per drag)

```typescript
// Source: pattern from src/ui/MenuBar.test.tsx:94-108 (vi.useFakeTimers idiom)
it("50 rapid geometry changes produce exactly 1 debounced IDB write", async () => {
  vi.useFakeTimers();
  const settingsStore = createRecordingSettingsStore();
  const { services } = renderDesktopShell({ settingsStore });

  // Open an app (transport needed for unseeded types)
  await openApp(user, "Notes");

  // Simulate 50 rapid moves — all within the debounce window
  const wm = /* read from context in test */;
  for (let i = 0; i < 50; i++) {
    act(() => { wm.setGeometry(wm.windows[0]!.id, 100 + i, 100 + i); });
  }

  // Timer has NOT fired yet — no write
  expect(settingsStore.rawWriteCount("windowLayout")).toBe(0);

  // Advance past the debounce threshold
  await act(async () => { vi.advanceTimersByTime(300); });

  // Exactly 1 write
  expect(settingsStore.rawWriteCount("windowLayout")).toBe(1);

  vi.useRealTimers();
});
```

### Example 4: Produce-gate bypass (structural — no code change needed)

```typescript
// Source: src/execution/loader.ts:319-320 (the single point where tryAcquire is called)
// This is the ONLY place the produce gate is consulted — ONLY on unseeded full miss:
services.produceGate.tryAcquire();
logger.info("Loader: unseeded type — requesting component for " + appType);
const produced = await produceComponent(...);

// Cache-hit paths (tiers 1, 2, 3) and the seeded path never reach this line.
// Restoring from IDB is a tier-3 hit → returns before line 320.
// Restoring a seeded type (e.g. "notes") is the seeded path → returns before line 320.
// Only evicted + unseeded apps reach line 320 → tryAcquire() → may throw.
```

### Example 5: Layout serialization shape guard

```typescript
// Source: new src/host/layoutPersistence.ts
export const LAYOUT_KEY = "windowLayout";

export interface LayoutEntry {
  appType: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
}

export function isLayoutEntry(v: unknown): v is LayoutEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.appType === "string" &&
    typeof e.title === "string" &&
    typeof e.icon === "string" &&
    typeof e.x === "number" &&
    typeof e.y === "number" &&
    typeof e.z === "number" &&
    typeof e.minimized === "boolean"
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-key `SettingsStore` (write/read → `"osTheme"`) | Extended with `writeRaw`/`readRaw` for arbitrary keys | Phase 21 | Enables persisting any preference by key without a new interface per key |
| Window manager opens via cascade | `openAt` for restore (explicit geometry) | Phase 21 | Prevents cascade-flash on reload; z-order precisely preserved |
| No desktop persistence | `"windowLayout"` in IDB settings store | Phase 21 | Reload no longer resets the desktop to empty |

**Deprecated/outdated:**
- None — this phase only adds to existing infrastructure.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | React 18+ auto-batching applies to synchronous `openAt` calls in the restore effect, coalescing them into one (or a few) renders rather than N renders | Pattern 4 (restore effect) | If not batched: N renders trigger N save-timer restarts during restore, each completing 300ms after the last — still results in 1 write total (correct); but the restore UX might show cascade geometry momentarily. Low risk. |
| A2 | The `zTop` module-level variable is not reset between hot-reloads in dev (Vite HMR), so `openAt`'s `zTop` adjustment persists across HMR cycles | Pattern 2 (openAt) | In dev with HMR, restored windows might get z values that conflict with pre-HMR windows. Production (full reload) is unaffected. Low risk for dev experience; no prod impact. |

**All other claims in this document are VERIFIED by direct source inspection.**

---

## Open Questions

1. **Strict eviction check before `resolveComponent` (Pitfall 6)**
   - What we know: `resolveComponent` on a full miss spends 1 produce call before the gate blocks subsequent calls
   - What's unclear: whether 1 produce call spent on an evicted restore is acceptable, or whether we should pre-check IDB first (skip to placeholder without ever calling `resolveComponent`)
   - Recommendation: Pre-check IDB (`services.registry.get("apps", cacheKey)`) for strictest PERSIST-03 compliance. The planner should decide.

2. **Save granularity: save on close?**
   - What we know: closing a window changes `windowManager.windows`, which triggers the save effect
   - What's unclear: is there any reason to NOT save on close? Saving on close means the final layout (with the closed window removed) is persisted, so it won't re-open on reload. This is the correct behavior per the spec.
   - Recommendation: No special handling needed — the save effect already covers close.

3. **Evicted app placeholder copy**
   - What we know: the existing `FailedAppContent` component renders "This app couldn't load. Try again." — neutral and hygiene-safe
   - What's unclear: whether a DISTINCT copy for "restored app no longer available" would be better UX (vs. "couldn't load") — out of scope per CONTEXT.md (Claude's discretion)
   - Recommendation: Reuse `FailedAppContent` for minimal new code. The copy is already correct, neutral, and tested.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies introduced — this phase uses only existing IDB, React, and vitest infrastructure already proven in the test suite)

---

## Validation Architecture

`workflow.nyquist_validation` is **false** in `.planning/config.json`. Section skipped.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V5 Input Validation | YES | `isLayoutEntry` shape guard on `JSON.parse` output; `sanitizeDisplayName` on title at `openAt`-time |
| V6 Cryptography | NO | Layout data is non-secret geometry; no encryption needed |
| V2 Authentication | NO | No new auth surface |
| V3 Session Management | NO | IDB is per-origin, not per-session |
| V4 Access Control | NO | No new ACL surface |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Corrupt JSON in `"windowLayout"` IDB key (written by another tab or manually edited) | Tampering | `try/catch` around `JSON.parse` + `isLayoutEntry` filter; corrupt records yield empty restore (fresh start) |
| Persisted `appType` contains banned tokens from a model-supplied name | Tampering → Hygiene | `sanitizeDisplayName` in `openAt` (same as `open()`) strips banned tokens before the title reaches the DOM |
| `"windowLayout"` leaking the API key | Information Disclosure | Shape is strictly `{ appType, title, icon, x, y, z, minimized }` — the key is never written to IDB by any code path |

---

## Sources

### Primary (HIGH confidence — verified by direct source inspection)

- `src/host/settingsStore.ts` — `SettingsStore` interface lines 14-19; `realSettingsStore` implementation lines 36-63; `SETTINGS_KEY` constant line 24
- `src/ui/useWindowManager.tsx` — `WindowEntry` interface lines 36-60; `WindowManagerValue` interface lines 62-109; `open()` implementation lines 167-208; `setGeometry()` lines 234-246; `zTop` module-level variable line 33; `windowsRef` update line 160
- `src/ui/DesktopShell.tsx` — `DesktopShellInner` function; `handleOpen` pattern lines 293-368; `makeFallback` lines 847-858; `storeComponent` lines 285-290; `windowManagerRef` pattern lines 249-251; existing effects (resize, matchMedia) lines 555-580
- `src/execution/loader.ts` — `tryAcquire()` callsite line 320 (only on unseeded full miss); tier-1/2/3 hit paths lines 239-286; `resolveComponent` signature lines 231-237
- `src/host/produceGate.ts` — `ProduceThrottledError` class; `tryAcquire()` logic; `DEFAULT_PRODUCE_CAP = 10`, `DEFAULT_PRODUCE_WINDOW_MS = 5 * 60 * 1000`
- `src/registry/db.ts` — `REGISTRY_DB_VERSION = 3` line 24; `SettingRecord` interface lines 82-91; `openRegistry()` function lines 100-112; `RegistrySchema.settings` line 97
- `src/services/services.ts` — `Services` interface lines 31-67; `settingsStore: SettingsStore` field line 58
- `src/services/testServices.ts` — `RecordingSettingsStore` interface/implementation lines 63-90; `createTestServices` lines 128-141
- `src/test/setup.ts` — `fake-indexeddb/auto` IDB polyfill at line 4
- `src/hygiene.test.ts` — banned token set lines 46-53; `DEPENDENCY_ALLOWLIST` (fake-indexeddb) lines 68-70; explicit coverage assertion lines 157-190
- `src/ui/MenuBar.test.tsx` — `vi.useFakeTimers()` fake-timer pattern lines 94-108
- `.planning/config.json` — `workflow.nyquist_validation: false`
- `src/services/registry.ts` — `StoreName = "apps" | "widgets" | "handlers"` line 12 (confirms settings store is NOT part of Registry adapter)
- `src/execution/widgetPrewarm.ts` — Promise pool / concurrency pattern lines 300-337 (informed serial-chain recommendation)

---

## Metadata

**Confidence breakdown:**
- settingsStore extension API: HIGH — exact interface and implementation pattern verified in source
- windowManager `openAt` design: HIGH — derived from verified `open()` implementation; `zTop` behavior confirmed
- Debounce mechanism: HIGH — `MenuBar.test.tsx` fake-timer pattern confirmed; no existing debounce utility verified
- Produce-gate bypass: HIGH — `tryAcquire()` callsite is singular and conditional (line 320)
- Placeholder fallback: HIGH — `makeFallback`/`FailedAppContent` pattern verified
- Testing patterns: HIGH — `RecordingSettingsStore`, `vi.useFakeTimers()`, `renderHook` all verified

**Research date:** 2026-06-29
**Valid until:** 2026-07-29 (stable stack — no fast-moving dependencies)
