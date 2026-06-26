# Phase 10: Widget Schema & Key Correctness - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 5
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/registry/db.ts` (modify `WidgetRecord`, `HandlerRecord`) | model/schema | CRUD | `src/registry/db.ts` `AppRecord` (lines 37-55) | exact — same file, same pattern |
| `src/execution/widgetPrewarm.ts` (add LRU fields to write sites) | service | CRUD | `src/execution/handler.ts` lines 211-225 (LRU write) | exact — identical write structure |
| `src/execution/loader.test.ts` (migrate bare `cacheKey` to `registryKey`) | test | request-response | `src/execution/widgetPrewarm.test.tsx` lines 19,172,205 (uses `registryKey`) | exact — same migration target |
| `src/execution/loaderGuardrails.test.ts` (migrate bare `cacheKey` to `registryKey`) | test | request-response | `src/execution/handler.test.ts` lines 27,134,163 (uses `registryKey`) | exact — same migration target |
| `src/registry/keyDerivation.test.ts` (new audit test) OR extend `cacheKey.test.ts` | test | request-response | `src/registry/cacheKey.test.ts` lines 52-112 (`registryKey` describe block) | exact — same test file/style |

---

## Pattern Assignments

### `src/registry/db.ts` — Replace `WidgetRecord` and `HandlerRecord` placeholders

**Analog:** `AppRecord` in the same file (`src/registry/db.ts` lines 37-55)

**Current placeholder** (lines 56-57, to be replaced):
```typescript
export type WidgetRecord = Record<string, unknown> & LruMeta;
export type HandlerRecord = Record<string, unknown> & LruMeta;
```

**Target pattern — copy `AppRecord`'s interface shape** (lines 37-55):
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

**Replacement interfaces to write** (mirroring the `AppRecord` pattern, fields per CONTEXT.md decisions):
```typescript
// Phase 10 (WIDGET-07): replace Record<string,unknown> placeholders with
// explicit interfaces that mirror AppRecord. Named required fields map to the
// ACTUAL runtime write shapes; [key:string]:unknown keeps forward-compat.
export interface WidgetRecord extends LruMeta {
  cacheKey: string;
  type: string;
  source: string;
  transpiledJS: string;
  [key: string]: unknown; // forward-compat catch-all (no mode field — single instantiation path)
}

export interface HandlerRecord extends LruMeta {
  cacheKey: string;
  intent: string;
  source: string;
  transpiledJS: string;
  [key: string]: unknown; // forward-compat catch-all
}
```

**Key rules from the analog:**
- `extends LruMeta` (not `& LruMeta`) — `interface extends` is the pattern
- Required fields listed first, all named, no optional markers (they are always written)
- `[key: string]: unknown` catch-all at the end
- No comment-based `AppRecord` specifics (e.g., no `displayName`/`prompt`/`createdAt` on widgets/handlers — CONTEXT.md is explicit: "no mode field on widgets/handlers")
- `LruMeta` fields (`useCount?`, `updatedAt?`) remain optional via the `LruMeta` base — backward-compatible with stored v1 records that lack them

---

### `src/execution/widgetPrewarm.ts` — Add LRU fields to widget write sites

**Analog:** `src/execution/handler.ts` lines 211-225 (the handler write with full LRU bookkeeping)

**Handler write analog** (lines 214-225):
```typescript
await services.registry.put(
  "handlers",
  {
    cacheKey: key,
    intent,
    source: produced.source,
    transpiledJS: produced.transpiledJS,
    useCount: 0,
    updatedAt: Date.now(),
  },
  key,
);
```

**Also cross-reference:** `src/execution/loader.ts` lines 310-325 (app write):
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
    createdAt: Date.now(),
    displayName: staticEntry?.displayName ?? deriveDisplayName(appType, userPrompt),
    prompt: userPrompt ?? undefined,
  },
  appCacheKey,
);
```

**Current widget write sites to modify** (widgetPrewarm.ts lines 99-103 and 156-160):

Site 1 — `resolveWidget` (lines 99-103):
```typescript
// BEFORE:
await services.registry.put(
  "widgets",
  { cacheKey: key, type: widgetType, source, transpiledJS },
  key,
);

// AFTER (add useCount + updatedAt, mirroring handler.ts:214-225):
await services.registry.put(
  "widgets",
  { cacheKey: key, type: widgetType, source, transpiledJS, useCount: 0, updatedAt: Date.now() },
  key,
);
```

Site 2 — `resolveWidgetTweak` (lines 156-160):
```typescript
// BEFORE:
await services.registry.put(
  "widgets",
  { cacheKey: key, type: widgetType, source, transpiledJS },
  key,
);

// AFTER (same additive change):
await services.registry.put(
  "widgets",
  { cacheKey: key, type: widgetType, source, transpiledJS, useCount: 0, updatedAt: Date.now() },
  key,
);
```

**Rule:** `useCount: 0` (no hits yet on first write), `updatedAt: Date.now()` (epoch ms of the write). No `createdAt` on widgets (not in the decided schema). This is purely additive.

---

### `src/execution/loader.test.ts` — Migrate bare `cacheKey(type)` to `registryKey("app", type)`

**Analog:** `src/execution/widgetPrewarm.test.tsx` (uses `registryKey` for all widget key derivations) and `src/execution/handler.test.ts` (uses `registryKey` for all handler key derivations)

**Pattern from widgetPrewarm.test.tsx** (lines 19, 172, 205):
```typescript
// Import:
import { registryKey } from "../registry/cacheKey";

// Usage:
const key = await registryKey("widget", "seeded-widget");
const key = await registryKey("widget", "fresh-widget");
```

**Pattern from handler.test.ts** (lines 27, 134, 163, 407):
```typescript
// Import:
import { registryKey } from "../registry/cacheKey";

// Usage:
const key = await registryKey("handler", "persist me");
const key = await registryKey("handler", "lru handler");
const key = await registryKey("handler", "pre-seeded");
```

**Migration to apply in loader.test.ts:**

Import change (line 31 area — currently imports `cacheKey`):
```typescript
// BEFORE:
const { cacheKey } = await import("../registry/cacheKey");
const key = await cacheKey("counter");

// AFTER:
const { registryKey } = await import("../registry/cacheKey");
const key = await registryKey("app", "counter");
```

Apply this substitution to ALL bare `cacheKey(type)` calls used as identity keys (~lines 32, 43, 58, 73, 95, 111, 129, 159, 177). Each dynamic import of `cacheKey` becomes `registryKey`, and each `cacheKey("some-type")` becomes `registryKey("app", "some-type")`.

**Note:** The `cacheKey` import at the top of some tests (`from "../registry/cacheKey"`) used for identity derivation must be replaced. The in-file references to `cacheKey` as a primitive (if any) that are NOT identity-derivation stay — but in loader.test.ts all uses are identity derivation for app types, so all migrate.

---

### `src/execution/loaderGuardrails.test.ts` — Migrate bare `cacheKey(type)` to `registryKey("app", type)`

**Analog:** Same pattern as `loader.test.ts` migration above. All `cacheKey(type)` calls in identity contexts (lines ~61+) use app-type slugs and must become `registryKey("app", type)`.

**Pattern** (from loaderGuardrails.test.ts lines 61, 78, 86-88, 106, 118, 134, 143, 155, 175):
```typescript
// BEFORE (all occurrences):
const { cacheKey } = await import("../registry/cacheKey");
const key = await cacheKey("miss-type-a");
const key = await cacheKey("recover-a");
const key = await cacheKey("hot-type");
const key = await cacheKey("lru-type");
// etc.

// AFTER:
const { registryKey } = await import("../registry/cacheKey");
const key = await registryKey("app", "miss-type-a");
const key = await registryKey("app", "recover-a");
const key = await registryKey("app", "hot-type");
const key = await registryKey("app", "lru-type");
// etc.
```

---

### `src/registry/keyDerivation.test.ts` (new) OR extend `src/registry/cacheKey.test.ts`

**Analog:** `src/registry/cacheKey.test.ts` — existing `registryKey` describe block (lines 52-112)

**File header pattern** (cacheKey.test.ts lines 1-5):
```typescript
// @vitest-environment node
// Node environment is required: the jsdom key-shim replaces global ArrayBuffer,
// which makes crypto.subtle.digest throw a TypeError (vitest #5365, closed not-planned).
// cacheKey is a pure function with no DOM dependency, so Node is the correct env.
import { describe, expect, it } from "vitest";
```

**Existing `registryKey` describe block as model** (cacheKey.test.ts lines 52-112):
```typescript
describe("registryKey — structured opaque key over (kind, type, prompt)", () => {
  it("folds in kind: app, widget, and handler with the same type slug all differ", async () => {
    const app = await registryKey("app", "weather");
    const widget = await registryKey("widget", "weather");
    const handler = await registryKey("handler", "weather");
    expect(app).not.toBe(widget);
    expect(app).not.toBe(handler);
    expect(widget).not.toBe(handler);
  });
  // ...
});
```

**The new audit test to add** (either new file or new `describe` block in `cacheKey.test.ts`):

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { registryKey } from "./cacheKey";

describe("key-derivation audit — WIDGET-08: identity sites use registryKey, no cross-kind collision", () => {
  it("an app and a widget sharing the same type slug get DISTINCT keys", async () => {
    const appKey = await registryKey("app", "weather");
    const widgetKey = await registryKey("widget", "weather");
    expect(appKey).not.toBe(widgetKey);
  });

  it("an app and a handler sharing the same slug get DISTINCT keys", async () => {
    const appKey = await registryKey("app", "weather");
    const handlerKey = await registryKey("handler", "weather");
    expect(appKey).not.toBe(handlerKey);
  });

  it("a widget and a handler sharing the same slug get DISTINCT keys", async () => {
    const widgetKey = await registryKey("widget", "weather");
    const handlerKey = await registryKey("handler", "weather");
    expect(widgetKey).not.toBe(handlerKey);
  });

  it("apps derive via registryKey('app', type, prompt?) — baseline and prompted differ", async () => {
    const base = await registryKey("app", "weather");
    const tweaked = await registryKey("app", "weather", "dark mode");
    expect(tweaked).not.toBe(base);
  });

  it("widgets derive via registryKey('widget', type, instruction?) — baseline and instructed differ", async () => {
    const base = await registryKey("widget", "weather");
    const tweaked = await registryKey("widget", "weather", "compact layout");
    expect(tweaked).not.toBe(base);
  });

  it("handlers derive via registryKey('handler', intent) — distinct intents get distinct keys", async () => {
    const a = await registryKey("handler", "get weather data");
    const b = await registryKey("handler", "get stock price");
    expect(a).not.toBe(b);
  });
});
```

**Placement decision:** Extend `src/registry/cacheKey.test.ts` with the new `describe` block (preferred — keeps all key-contract tests co-located, no new file). Only add a new `keyDerivation.test.ts` if the planner explicitly decides to separate the audit concerns.

---

## Shared Patterns

### LruMeta fields on first write
**Source:** `src/execution/handler.ts` lines 211-225
**Apply to:** Both widget write sites in `widgetPrewarm.ts`
```typescript
useCount: 0,        // no hits yet on first write
updatedAt: Date.now(), // epoch ms of the write instant
```

### `registryKey` as the ONLY identity-derivation function
**Source:** `src/registry/cacheKey.ts` lines 51-60
**Apply to:** All test files that seed or resolve by app/widget/handler type (never use bare `cacheKey` for identity)
```typescript
// Identity derivation — always use registryKey with the explicit kind:
const key = await registryKey("app", appType);          // app identity
const key = await registryKey("widget", widgetType);    // widget identity
const key = await registryKey("handler", intent);       // handler identity

// cacheKey is ONLY legitimate inside registryKey itself and in tests of the primitive
```

### `interface extends LruMeta` (not `type` alias with `&`)
**Source:** `src/registry/db.ts` lines 37-55 (`AppRecord`)
**Apply to:** `WidgetRecord` and `HandlerRecord` replacement interfaces
```typescript
// Pattern: interface declaration, not type alias
export interface WidgetRecord extends LruMeta {
  // ...named fields...
  [key: string]: unknown;
}
// NOT: export type WidgetRecord = { ... } & LruMeta;
```

### Vitest node environment for crypto-dependent tests
**Source:** `src/registry/cacheKey.test.ts` line 1
**Apply to:** New audit test file (or the extended describe block in cacheKey.test.ts)
```typescript
// @vitest-environment node
```

---

## No Analog Found

All files in scope have close analogs in the existing codebase. No entries.

---

## Metadata

**Analog search scope:** `src/registry/`, `src/execution/`
**Files scanned:** 8 (db.ts, cacheKey.ts, cacheKey.test.ts, widgetPrewarm.ts, widgetPrewarm.test.tsx, handler.ts, loader.ts, loader.test.ts, loaderGuardrails.test.ts)
**Pattern extraction date:** 2026-06-26
