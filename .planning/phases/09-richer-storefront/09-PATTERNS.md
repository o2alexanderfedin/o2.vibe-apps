# Phase 9: Richer Storefront — Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 6 (4 modified, 2 new test files)
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/registry/db.ts` | model | CRUD | `src/registry/db.ts` (Phase 7 LRU extension) | exact — extend same file |
| `src/execution/loader.ts` | service | CRUD | `src/execution/loader.ts` (Phase 7 touchRecord/put) | exact — extend same file |
| `src/ui/Marketplace.tsx` | component | request-response | `src/ui/Marketplace.tsx` (storefront grid, lines 276-299) | exact — extend same file |
| `src/data/appRegistry.ts` | config | — | `src/data/appRegistry.ts` (AppRegistryEntry, lines 1-60) | exact — extend same file |
| `src/registry/registry.test.ts` (new tests) | test | CRUD | `src/registry/registry.test.ts` lines 110-128 (v1-record compat) | exact analog |
| `src/registry/storagePressure.test.ts` (new sort test) | test | CRUD | `src/registry/storagePressure.test.ts` lines 66-98 (deterministic sort) | exact analog |

---

## Pattern Assignments

### `src/registry/db.ts` — add `displayName?`, `prompt?`, `createdAt?` to `AppRecord`

**Analog:** Same file, Phase 7 LRU extension (lines 20-36). The pattern is: declare an optional-field mixin interface, then intersect it into `AppRecord` via extension. New fields are optional so v1 records satisfy the interface without migration.

**Existing interface pattern** (`src/registry/db.ts` lines 20-36):
```typescript
/**
 * LRU bookkeeping shared by every stored record (Phase 7, RESIL-06). Optional on
 * the type so records written by the v1 schema (which lack them) still satisfy
 * the interface; the adapter defaults them to 0 on read.
 */
export interface LruMeta {
  /** Times this entry has been read (incremented on every cache hit). */
  useCount?: number;
  /** Epoch ms of the last write or hit — the LRU recency key. */
  updatedAt?: number;
}

export interface AppRecord extends LruMeta {
  cacheKey: string;
  type: string;
  source: string;
  transpiledJS: string;
  [key: string]: unknown; // allow forward-compat extra fields
}
```

**New fields to add** — follow the exact comment/optional/JSDoc style above:
```typescript
export interface AppRecord extends LruMeta {
  cacheKey: string;
  type: string;
  source: string;
  transpiledJS: string;
  /** Human-readable title shown on storefront cards (Phase 9, STORE-01). */
  displayName?: string;
  /**
   * The user's intent that produced this app (Phase 9, STORE-01).
   * Stores the userPrompt / instruction only — never the model system-prompt
   * (which contains mechanic lexicon visible via devtools → IndexedDB).
   */
  prompt?: string;
  /** Epoch ms when the record was first written (Phase 9, STORE-01). Never overwritten on touch. */
  createdAt?: number;
  [key: string]: unknown; // allow forward-compat extra fields
}
```

**No DB version bump** — the `upgrade()` function at lines 51-55 already creates stores unconditionally with `if (!db.objectStoreNames.contains(...))`. The `[key: string]: unknown` catch-all on `AppRecord` already tolerates the new fields in stored records. The comment block at lines 7-9 establishes the precedent for documenting this pattern — add a "Phase 9" line to that block.

---

### `src/execution/loader.ts` — extend `touchRecord` (lines 46-68) and fresh-record write (lines 286-298)

**Analog:** Same file. Two write sites to extend, both following the same spread-then-override pattern.

**`touchRecord` — current pattern** (`src/execution/loader.ts` lines 46-68):
```typescript
async function touchRecord(
  services: Services,
  cacheKey: string,
  record: { source: string; transpiledJS: string } & Record<string, unknown>,
  type: string,
): Promise<void> {
  try {
    const useCount =
      typeof record.useCount === "number" ? record.useCount + 1 : 1;
    await services.registry.put(
      "apps",
      {
        ...record,
        cacheKey,
        type,
        useCount,
        updatedAt: Date.now(),
      },
      cacheKey,
    );
  } catch (err) {
    logger.error("Loader: failed to refresh LRU bookkeeping: " + String(err));
  }
}
```

**`touchRecord` — what to extend:** The `...record` spread already carries `displayName`, `prompt`, and `createdAt` forward from the stored record. The only change is that `updatedAt` must NOT be applied to `createdAt` (createdAt is not touched on hit — the spread handles this automatically since `Date.now()` only overrides `updatedAt`, not `createdAt`). No signature change is needed.

**Fresh-record write — current pattern** (`src/execution/loader.ts` lines 284-298):
```typescript
// Persist both pieces to the registry — next open is an instant cache hit (GEN-04).
// Fresh LRU bookkeeping: useCount 0 (no hits yet), updatedAt = now (RESIL-06).
await services.registry.put(
  "apps",
  {
    cacheKey: appCacheKey,
    type: appType,
    source,
    transpiledJS,
    mode,
    useCount: 0,
    updatedAt: Date.now(),
  },
  appCacheKey,
);
```

**Fresh-record write — what to add:**
```typescript
await services.registry.put(
  "apps",
  {
    cacheKey: appCacheKey,
    type: appType,
    source,
    transpiledJS,
    mode,
    useCount: 0,
    updatedAt: Date.now(),
    createdAt: Date.now(),           // Phase 9: first-write timestamp, never overwritten
    displayName: deriveDisplayName(appType, userPrompt), // Phase 9: title-cased slug or static label
    prompt: userPrompt ?? undefined, // Phase 9: user intent only (hygiene-safe); undefined for plain opens
  },
  appCacheKey,
);
```

**`deriveDisplayName` helper** — implement as a pure function in the same file or a shared utility. Pattern:
```typescript
/** Title-case a type slug: "weather" → "Weather", "my-app" → "My App" */
function deriveDisplayName(type: string, userPrompt?: string): string {
  const base = type
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  // For tweak variants, append a short hygiene-safe suffix derived from the instruction.
  // Keep it brief and mechanic-free. Exact form at executor's discretion.
  if (userPrompt) {
    const suffix = userPrompt.trim().slice(0, 20).replace(/[^a-zA-Z0-9 ]/g, "").trim();
    return suffix ? `${base} (${suffix})` : base;
  }
  return base;
}
```

---

### `src/ui/Marketplace.tsx` — add popular row; read `displayName` from records

**Analog:** Same file. The storefront grid (lines 276-299) is the direct pattern for the popular row — reuse `.storefront-grid` and `.app-card` classes, same `button` + aria-label + `onClick` structure.

**Existing card render pattern** (`src/ui/Marketplace.tsx` lines 276-299):
```tsx
<div className="storefront-grid">
  {APP_REGISTRY.map((app) => {
    const Icon = ICONS[app.icon] ?? Cloud;
    return (
      <button
        key={app.id}
        type="button"
        className="app-card"
        aria-label={`${app.displayName} — ${app.description}`}
        onClick={() => void handleOpen(app.id, app.displayName)}
      >
        <span className="app-card__icon">
          <Icon size={32} aria-hidden="true" />
        </span>
        <span className="app-card__name">{app.displayName}</span>
        <span className="app-card__description">{app.description}</span>
        {openingId === app.id && (
          <span className="app-card__opening" role="status">
            Opening…
          </span>
        )}
      </button>
    );
  })}
</div>
```

**Popular row additions — what to add:**

1. **State:** `const [popularApps, setPopularApps] = useState<AppRecord[]>([]);` — loaded from registry on mount via `useEffect`.

2. **Effect to load popular apps:**
```tsx
useEffect(() => {
  void (async () => {
    try {
      const allKeys = await services.registry.keys("apps");
      const records = await Promise.all(
        allKeys.map((k) => services.registry.get("apps", k)),
      );
      const ranked = records
        .filter((r): r is AppRecord => !!r && typeof r.useCount === "number" && r.useCount >= 1)
        .sort((a, b) => {
          // useCount desc, then updatedAt desc, then cacheKey asc (deterministic)
          const ucDiff = (b.useCount ?? 0) - (a.useCount ?? 0);
          if (ucDiff !== 0) return ucDiff;
          const uaDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
          if (uaDiff !== 0) return uaDiff;
          return a.cacheKey < b.cacheKey ? -1 : 1;
        })
        .slice(0, 5); // cap: planner's discretion, ~4–6
      setPopularApps(ranked);
    } catch (err) {
      logger.error("Marketplace: failed to load popular apps: " + String(err));
    }
  })();
}, [services]);
```

3. **Render — popular row** (hidden on cold start via length guard):
```tsx
{popularApps.length > 0 && (
  <section aria-label="Frequently opened">
    <h2 className="storefront-section__heading">Your most-opened</h2>
    <div className="storefront-grid">
      {popularApps.map((record) => {
        const entry = APP_REGISTRY.find((a) => a.id === record.type);
        const name = record.displayName ?? entry?.displayName ?? titleCase(record.type);
        const description = entry?.description ?? "";
        const Icon = (entry ? ICONS[entry.icon] : undefined) ?? Cloud;
        return (
          <button
            key={record.cacheKey}
            type="button"
            className="app-card"
            aria-label={`${name}${description ? " — " + description : ""}`}
            onClick={() => void handleOpen(record.type, name)}
          >
            <span className="app-card__icon">
              <Icon size={32} aria-hidden="true" />
            </span>
            <span className="app-card__name">{name}</span>
            {description && (
              <span className="app-card__description">{description}</span>
            )}
          </button>
        );
      })}
    </div>
  </section>
)}
```

4. **`displayName` fallback chain on existing APP_REGISTRY cards** — the `handleOpen` call already passes `app.displayName` from the static registry. No change needed for seeded cards. For the popular row, use the fallback chain above.

5. **Import addition:** Add `type AppRecord` from `../registry/db` and `useState`/`useEffect` are already imported.

---

### `src/data/appRegistry.ts` — no structural change; static labels are the source for `displayName` on seeded records

**Analog:** Same file (lines 1-60). `AppRegistryEntry.displayName` values are the authoritative human labels for the 8 seeded apps. These must be copied verbatim to `displayName` on the fresh-record write in the loader (e.g., `displayName: "Counter"` for `type: "counter"`).

**Pattern for lookup in loader:**
```typescript
// At the fresh-record write site, map type → displayName for seeded apps.
// Import from the static registry:
import { APP_REGISTRY } from "../data/appRegistry";

const staticEntry = APP_REGISTRY.find((a) => a.id === appType);
const displayName = staticEntry?.displayName ?? deriveDisplayName(appType, userPrompt);
```

No change to `appRegistry.ts` itself is required — the static data is already correct.

---

### New tests in `src/registry/registry.test.ts` — v1-record compat for Phase 9 fields

**Analog:** `src/registry/registry.test.ts` lines 110-128 — the v1-record compatibility test written for Phase 7. Copy this pattern exactly: write a minimal record without the new optional fields, round-trip it, assert the fields are `undefined`, and assert original fields survive.

**Pattern to copy** (`src/registry/registry.test.ts` lines 110-128):
```typescript
it("a v1-style record missing useCount/updatedAt reads back without the fields (migration default path)", async () => {
  const { dbReady, put, get } = await import("./registry");
  await dbReady;
  const v1Record = {
    cacheKey: "legacy",
    type: "legacy",
    source: "s",
    transpiledJS: "j",
  };
  await put("apps", v1Record as never, "legacy");
  const result = await get("apps", "legacy");
  expect(result?.useCount).toBeUndefined();
  expect(result?.updatedAt).toBeUndefined();
  // The original fields survive the upgrade untouched.
  expect(result?.source).toBe("s");
});
```

**New tests to add** (mirror the exact structure above):
```typescript
it("a record missing displayName/prompt/createdAt reads back without those fields (Phase 9 additive migration)", async () => {
  const { dbReady, put, get } = await import("./registry");
  await dbReady;
  const legacyRecord = {
    cacheKey: "v2-legacy",
    type: "counter",
    source: "s",
    transpiledJS: "j",
    useCount: 3,
    updatedAt: 1000,
  };
  await put("apps", legacyRecord as never, "v2-legacy");
  const result = await get("apps", "v2-legacy");
  expect(result?.displayName).toBeUndefined();
  expect(result?.prompt).toBeUndefined();
  expect(result?.createdAt).toBeUndefined();
  // Existing fields survive untouched.
  expect(result?.useCount).toBe(3);
  expect(result?.source).toBe("s");
});

it("round-trips displayName, prompt, and createdAt on an AppRecord", async () => {
  const { dbReady, put, get } = await import("./registry");
  await dbReady;
  const rec = appRecord({
    cacheKey: "rich",
    displayName: "Weather",
    prompt: "show celsius",
    createdAt: 99999,
  });
  await put("apps", rec, "rich");
  const result = await get("apps", "rich");
  expect(result?.displayName).toBe("Weather");
  expect(result?.prompt).toBe("show celsius");
  expect(result?.createdAt).toBe(99999);
});
```

---

### New sort/ranking test — popular row determinism

**Analog:** `src/registry/storagePressure.test.ts` lines 66-98. The pattern is: construct fixed records with known `useCount`/`updatedAt`/`cacheKey`, apply the sort, assert the order. Pure sort logic can be extracted into a helper and tested without React.

**Pattern to copy** (`src/registry/storagePressure.test.ts` lines 66-83):
```typescript
it("evicts the OLDEST updatedAt first", async () => {
  const registry = createInMemoryRegistry();
  await registry.put("apps", appRecord("old", 100, 5), "old");
  await registry.put("apps", appRecord("mid", 200, 5), "mid");
  // ... assert order after eviction
});
```

**New test pattern for popular row sort:**
```typescript
// Pure sort: extract the rank comparator from Marketplace or a utility, test it directly.
import { rankPopular } from "../ui/marketplaceUtils"; // or inline comparator

it("ranks by useCount descending", () => {
  const records = [
    { cacheKey: "b", useCount: 1, updatedAt: 100 },
    { cacheKey: "a", useCount: 5, updatedAt: 100 },
    { cacheKey: "c", useCount: 3, updatedAt: 100 },
  ];
  const ranked = rankPopular(records);
  expect(ranked[0].cacheKey).toBe("a");
  expect(ranked[1].cacheKey).toBe("c");
  expect(ranked[2].cacheKey).toBe("b");
});

it("breaks useCount tie by updatedAt descending", () => {
  const records = [
    { cacheKey: "old", useCount: 3, updatedAt: 100 },
    { cacheKey: "new", useCount: 3, updatedAt: 500 },
  ];
  const ranked = rankPopular(records);
  expect(ranked[0].cacheKey).toBe("new");
});

it("breaks updatedAt tie by cacheKey ascending (fully deterministic)", () => {
  const records = [
    { cacheKey: "z", useCount: 2, updatedAt: 200 },
    { cacheKey: "a", useCount: 2, updatedAt: 200 },
  ];
  const ranked = rankPopular(records);
  expect(ranked[0].cacheKey).toBe("a");
});
```

---

## Shared Patterns

### Additive optional-field schema (no version bump)
**Source:** `src/registry/db.ts` lines 20-36 (LruMeta + AppRecord); comment block lines 7-9
**Apply to:** `AppRecord` type extension
- Declare optional fields on the interface (not required).
- The `[key: string]: unknown` catch-all already handles forward-compat reads.
- No `upgrade()` change — stores already exist; additive fields need no migration step.
- Consumers default missing fields on read (never assume presence).

### Default-on-read for optional fields
**Source:** `src/registry/storagePressure.ts` lines 52-57 (`lruOf()`)
**Apply to:** Any code that reads `displayName`, `prompt`, or `createdAt` from a record
```typescript
function lruOf(record: LruMeta | undefined): { updatedAt: number; useCount: number } {
  return {
    updatedAt: typeof record?.updatedAt === "number" ? record.updatedAt : 0,
    useCount: typeof record?.useCount === "number" ? record.useCount : 0,
  };
}
```
For Phase 9 string fields, the pattern is: `record?.displayName ?? fallback` (never assume the field exists, always provide a fallback).

### Best-effort write with swallowed error
**Source:** `src/execution/loader.ts` lines 46-68 (`touchRecord`)
**Apply to:** Popular-row registry read in `Marketplace.tsx` (the `useEffect`)
```typescript
try {
  // ... registry operation
} catch (err) {
  logger.error("Loader: failed to refresh LRU bookkeeping: " + String(err));
}
```
A failed popular-row load must never break the storefront — swallow to logger, leave `popularApps` empty.

### IoC/DI via injected `services`
**Source:** `src/execution/loader.ts` lines 46-68; `src/ui/Marketplace.tsx` line 132 (`useServices()`)
**Apply to:** All new registry reads in `Marketplace.tsx`
```typescript
const services = useServices();
// ... use services.registry.keys("apps"), services.registry.get("apps", key)
```
Never import the registry singleton directly. Tests supply `createTestServices({ registry: inMemoryRegistry })`.

### CSS class reuse (BEM-ish, theme vars)
**Source:** `src/index.css` lines 108-186 (`.storefront-grid`, `.app-card`, `.app-card__*`)
**Apply to:** Popular row HTML
- Reuse `.storefront-grid` and `.app-card` classes unchanged.
- All colors via `var(--color-*)` — no hardcoded hex in JSX.
- Add only a `.storefront-section__heading` class for the section label if a style is needed.

### Hygiene-safe copy constraint
**Source:** CONTEXT.md §Producing prompt — HYGIENE-CRITICAL; `src/hygiene.test.ts` (banned token test)
**Apply to:** `prompt` field value, `displayName` suffix, popular-row header text
- The `prompt` field stores **user intent only** — never the model system prompt.
- Popular-row copy: "Your most-opened" / "Frequently opened" — no cross-platform claims, no mechanic lexicon.
- `displayName` suffix for tweak variants: derive from the user instruction, strip special chars, keep short.

### Test double naming convention
**Source:** `src/ui/Marketplace.test.tsx` lines 1-7; `src/registry/storagePressure.test.ts` lines 7-8
**Apply to:** All new test files
```
// Test doubles are named "canned"/"stub"/"testTransport" (never the banned hygiene tokens).
```

---

## No Analog Found

None. All files to be modified have direct existing analogs in the same file or a closely related test file.

---

## Metadata

**Analog search scope:** `src/registry/`, `src/execution/`, `src/ui/`, `src/data/`, `src/index.css`
**Files read:** 9 source files + 3 test files
**Pattern extraction date:** 2026-06-26
