# Phase 10: Widget Schema & Key Correctness - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss=true; decisions pre-resolved from REQUIREMENTS.md + codebase scout)

<domain>
## Phase Boundary

Close the two latent correctness gaps that gate safe widget activation (Phase 13), with **zero behavior change** for the shipped surface:

1. **WIDGET-07** — give the `widgets` and `handlers` registry records real typed interfaces (replacing the `Record<string, unknown> & LruMeta` placeholders), consistent with the typed `AppRecord`; and standardize their LRU-bookkeeping write parity.
2. **WIDGET-08** — guarantee (and prove by tests) that every cache-key *identity-derivation* site uses the structured `registryKey(kind, type, prompt?)`, so an activated widget can never collide with — or be served the cached artifact of — an app of the same type slug.

Out of scope: activating widget composition (Phase 13); any DB version bump; any change to the opaque-key hashing or normalization (the q08 `cacheKey`/`registryKey` contract stays byte-identical).
</domain>

<decisions>
## Implementation Decisions

### WIDGET-07 — typed records (mirror AppRecord convention)
- Replace the placeholders in `src/registry/db.ts` with explicit interfaces extending `LruMeta`, following the `AppRecord` pattern exactly (named required fields + `[key: string]: unknown` forward-compat catch-all):
  - `WidgetRecord extends LruMeta { cacheKey: string; type: string; source: string; transpiledJS: string; [key: string]: unknown }`
  - `HandlerRecord extends LruMeta { cacheKey: string; intent: string; source: string; transpiledJS: string; [key: string]: unknown }`
- These match the ACTUAL runtime shapes written today (scout-confirmed): widgets write `{cacheKey,type,source,transpiledJS}` (`widgetPrewarm.ts:99-103,156-160`); handlers write `{cacheKey,intent,source,transpiledJS,useCount,updatedAt}` (`handler.ts:214-225`).
- No `mode` field on widgets/handlers (single instantiation path each, unlike apps). Keep the `[key:string]: unknown` catch-all so old records and any future field still read cleanly.
- `RegistrySchema` (`db.ts`) and the `StoreValue<S>` helper (`src/services/registry.ts:15-20`) already reference these names — tightening the interfaces must keep `tsc` clean across all read/write sites.

### WIDGET-07d — LRU write parity (additive, minimal)
- Standardize the widget write sites (`widgetPrewarm.ts:99-103,156-160`) to include `useCount: 0, updatedAt: Date.now()` on first write, for parity with the handler and app write paths (which already do). This is purely additive (the fields were already optional via `LruMeta` and defaulted on read by the storage-pressure adapter) — it removes the documented inconsistency where widgets relied on read-time defaulting. Keep it minimal; do not touch eviction logic.

### WIDGET-08 — every identity site uses registryKey, proven by tests
- **Production needs no change** — scout confirms all identity-derivation sites already use `registryKey` with the correct kind: `resolver.ts:44` (`"app"`), `Marketplace.tsx:243` (`"app"`, tweak), `widgetPrewarm.ts:61,133` (`"widget"`), `handler.ts:189` (`"handler"`). Re-verify this during execution and treat any stray bare `cacheKey()` in an identity context as a bug to fix.
- **Test gap to close:** migrate the test doubles in `src/execution/loader.test.ts` (lines ~32,43,58,73,95,111,129,159,177) and `src/execution/loaderGuardrails.test.ts` (~61+) from bare `cacheKey(type)` to `registryKey("app", type)`, so the seeded key matches what production derives and the bare-key pattern no longer lingers in identity contexts. These are internally consistent (same var seeds and resolves), so the migration is mechanical and safe.
- **Add an audit test** (extend `cacheKey.test.ts` or a new `keyDerivation.test.ts`) that proves: apps derive via `registryKey("app", type, prompt?)`, widgets via `registryKey("widget", type, instruction?)`, handlers via `registryKey("handler", intent)`; and that an app and a widget sharing the same `type` slug get DISTINCT keys (the collision the requirement guards against). Prefer asserting via the real resolve paths (DI-injected registry/transport) where practical, plus a direct `registryKey` distinctness assertion.
- The opaque `cacheKey(input)` primitive legitimately remains INSIDE `registryKey` and in `cacheKey.test.ts` (testing the primitive) — those are NOT identity sites and stay.

### Claude's Discretion
Exact placement/naming of the audit test file, whether to fold the LRU-parity write into the same plan as the type change, and the precise assertion style (resolve-path vs direct) are at the planner/executor's discretion within the constraints above.
</decisions>

<code_context>
## Existing Code Insights (from codebase scout)

- Types: `src/registry/db.ts:26-63` — `LruMeta`, `AppRecord` (typed), `WidgetRecord`/`HandlerRecord` (placeholder `Record<string,unknown> & LruMeta`), `RegistrySchema`.
- Store-value helper: `src/services/registry.ts:15-20` (`StoreValue<S>`); typed `get`/`put` in `src/registry/registry.ts:57-78`.
- Widget writes: `src/execution/widgetPrewarm.ts:99-103,156-160` (no LRU fields written).
- Handler write: `src/execution/handler.ts:214-225` (writes `intent` + LRU fields).
- App write: `src/execution/loader.ts:310-325` (Phase 9 — full fields + LRU).
- Identity-derivation sites (all already `registryKey`): `resolver.ts:44`, `Marketplace.tsx:243`, `widgetPrewarm.ts:61,133`, `handler.ts:189`.
- Key contract: `src/registry/cacheKey.ts:18-60` (`RegistryKind`, `registryKey`, `cacheKey`, `normalizePart`, `PART_SEPARATOR`) — q08, do not alter.
- Tests: `cacheKey.test.ts` (contract), `widgetPrewarm.test.tsx:19,172,205` + `handler.test.ts:134,163,407` + `resolver.test.ts:25` (already use registryKey ✓); `loader.test.ts`/`loaderGuardrails.test.ts` (bare `cacheKey(type)` — migrate).

### Established Patterns
- Additive, read-tolerant typing: optional `LruMeta` fields + `[key:string]: unknown` catch-all (AppRecord precedent).
- IoC/DI: registry/transport injected via `Services` — assert resolve paths through the injected registry.

### Integration Points
- `db.ts` type change ripples through `StoreValue`/`get`/`put` and every widget/handler read/write — `tsc` is the guard.
- Widget write parity touches only `widgetPrewarm.ts` write literals.
</code_context>

<specifics>
## Specific Ideas

- The audit test's load-bearing assertion: `registryKey("app", "weather")` !== `registryKey("widget", "weather")` (same slug, different kind → distinct keys). This is the exact collision WIDGET-08 prevents and the gate for Phase 13.
- After tightening the types, run `tsc --noEmit` first — it will surface any site that relied on the old `Record<string,unknown>` looseness.
- Pure-typing/internal phase: no UI, no visual UAT needed. Acceptance = tsc 0, full suite green (≥393), build clean (no sourcemaps), hygiene green.
</specifics>

<deferred>
## Deferred Ideas

- Activating widget composition / wiring `useWidget` into the delegated scope — Phase 13 (WIDGET-06).
- Any broader registry refactor (e.g., a shared base record type) — only if it falls out naturally; do not force it (YAGNI).
</deferred>
