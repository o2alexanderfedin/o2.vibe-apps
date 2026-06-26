# Phase 9: Richer Storefront - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss=true; decisions pre-resolved from REQUIREMENTS.md + codebase scout)

<domain>
## Phase Boundary

Persist the metadata a real storefront needs and surface local usage, **additively** — without breaking existing apps, tests, the `tsc`/build/hygiene gates, or the on-demand illusion.

Delivers (STORE-01, STORE-02):
1. App records persist `displayName`, the producing `prompt`, and `createdAt`.
2. Storefront cards show the app's real `displayName` (not a raw type slug), tolerant of pre-existing records that lack the new fields.
3. A "popular" row of the most-opened apps, ranked by the existing `useCount`, hidden on cold start, with truthful local-only copy.

Out of scope: any cross-session/cross-device popularity (needs a backend — POP-01 deferred); changing the produce/cache loop; widget work.
</domain>

<decisions>
## Implementation Decisions

### Schema (additive, read-tolerant)
- Add three OPTIONAL fields to `AppRecord` (`src/registry/db.ts`): `displayName?: string`, `prompt?: string`, `createdAt?: number`.
- **No DB version bump** — the `apps` object store already exists; the upgrade stays purely additive (follows the Phase 7 LRU-field precedent and the `[key: string]: unknown` forward-compat catch-all). Old v1 records that lack the fields must read back and render correctly.
- Consumers default missing fields on read (the established read-tolerant pattern: `lruOf()` defaulting, `mode`→"app" legacy path).

### Producing prompt — HYGIENE-CRITICAL
- Store the **user's intent** (the `userPrompt` / app-type that produced the app), **NOT** the full model system-prompt built by `buildPrompt()`. The system prompt contains the banned mechanic lexicon (`generate`/`synthesi*`/`AI`/`llm`/…), and IndexedDB is devtools-visible (Application → IndexedDB), so persisting it raw would break the HYGIENE-01..05 hard rule. The user intent is what makes the app "re-produce faithfully" (combined with `type`) and is hygiene-safe.
- For plain seed/type opens with no user instruction, `prompt` may be empty/undefined.
- Tweak/clone variants are already keyed distinctly via `registryKey("app", type, instruction)`; persist their distinguishing instruction as `prompt` so they re-produce as the tweaked variant. Their `displayName` must be distinct from the base (e.g. base name + a short, hygiene-safe instruction-derived suffix — exact form at planner discretion, no mechanic lexicon).

### displayName
- Seeded apps: set an explicit `displayName` on write, matching the static `APP_REGISTRY` labels (e.g. "Counter", "Notes").
- Produced/delegated apps: derive a title-cased label from the `type` slug (e.g. `weather` → "Weather"). Simple, deterministic, no extra model round-trip (YAGNI on model-supplied names).
- Card render fallback chain: `record.displayName ?? APP_REGISTRY[id]?.displayName ?? titleCase(type)` — never a blank title.

### createdAt
- Set `createdAt: Date.now()` on the **fresh** record write (produce/seed path in the loader). On the LRU `touchRecord()` update, **preserve** the existing `createdAt` (never overwrite) — only `useCount`/`updatedAt` change on a hit.

### Popular row
- Ranking: existing `useCount` descending. Tie-break: `updatedAt` desc, then `cacheKey` asc — fully deterministic and stable across sessions.
- Membership: apps with `useCount >= 1`; cap the row at a small top-N (planner's discretion, ~4–6). Reuse the existing `.storefront-grid`/`.app-card` styling and theme vars (no new palette).
- Cold start: the entire row (and its header) is hidden when no app has `useCount >= 1`.
- Copy: truthful local-only framing — "Your most-opened" / "Frequently opened". NEVER "Popular across the platform" or any cross-user claim. No mechanic-revealing copy.
- Source of cards: read app records from the registry (`useCount`/`displayName`), joined with `APP_REGISTRY` for icon/description; this is the first place cards read from the persisted record rather than purely static data.

### Claude's Discretion
Exact top-N cap, the precise tweak-variant `displayName` suffix form, popular-row header wording, and section placement (after the main grid, before the opened-apps region) are at the planner/executor's discretion within the constraints above.
</decisions>

<code_context>
## Existing Code Insights (from codebase scout)

### Reusable Assets
- `AppRecord` + `LruMeta` types — `src/registry/db.ts:20-36` (has `cacheKey`, `type`, `source`, `transpiledJS`, `useCount?`, `updatedAt?`, `mode?`, `[key:string]: unknown`).
- IndexedDB: DB `MarketplaceRegistry`, `REGISTRY_DB_VERSION = 2`, stores `apps`/`widgets`/`handlers`, additive `upgrade()` — `src/registry/db.ts:13,46-56`.
- `get`/`put` typed wrappers (mem-fallback aware) — `src/registry/registry.ts:57-88`.
- `touchRecord()` LRU increment on tier-3 hit — `src/execution/loader.ts:46-68` (currently writes `useCount`/`updatedAt`; extend to carry `displayName`/preserve `createdAt`).
- Fresh-record write (produce/seed) — `src/execution/loader.ts:286-298` (where `createdAt`/`displayName`/`prompt` get set).
- Storefront grid + cards — `src/ui/Marketplace.tsx:276-299`; static labels from `APP_REGISTRY` (`src/data/appRegistry.ts:11-60`).
- `registryKey(kind, type, prompt?)` opaque key — `src/registry/cacheKey.ts:51-60`.
- Theme vars + `.app-card*` styles — `src/index.css:1-26,108-180`.

### Established Patterns
- Additive, read-tolerant schema: optional fields + default-on-read (Phase 7 RESIL-06; `storagePressure.ts` `lruOf()`; v1-record tests in `registry.test.ts:110-128`).
- BEM-ish class names (`block__element`), theme vars for all colors, inline `var(--color-*)`.
- IoC/DI: storage/registry/transport injected via `Services`.

### Integration Points
- Loader write paths (fresh + `touchRecord`) set the new fields.
- Marketplace storefront render adds the popular row + reads `displayName` from records.
- The producer (`src/execution/producer.ts:391-507`) returns only `{source, transpiledJS}` today — the user prompt to persist is already available at the loader call site (`userPrompt`), so no producer signature change is required to capture it.
</code_context>

<specifics>
## Specific Ideas

- Mirror the existing v1-record compatibility tests (`registry.test.ts:110-128`, `storagePressure.test.ts`) for the three new fields: a record lacking them must round-trip and render with a non-blank title.
- The popular row's deterministic ordering must be unit-testable (sort given fixed `useCount`/`updatedAt`/`cacheKey`).
- Verify the storefront visually (screenshot) — generated/record-driven UI per [[verify-ui-visually]].
</specifics>

<deferred>
## Deferred Ideas

- Cross-session/cross-device popularity (POP-01) — needs a backend; out of the client-only model.
- Model-supplied human display names for produced apps — title-case slug is sufficient for v1.1.
</deferred>
