# Phase 21: Desktop Persistence - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

When a user reloads the page, the desktop they left is restored — every open window appears at its saved position, geometry, and z-order, and previously opened apps come back through the cache-hit path without triggering the produce gate.

Requirements: PERSIST-01, PERSIST-02, PERSIST-03.

</domain>

<decisions>
## Implementation Decisions

### Settled (from v3.0 roadmap / STATE.md — binding)
- **Schema is additive, no DB version bump**: persist window layout under the additive key `"windowLayout"` in the existing IDB `settings` store. No migration, no new object store. A dedicated `windows` store (DB v4) is the fallback only if querying needs grow beyond a flat key-value lookup — which v3.0 does not require.
- **Layout record shape is exactly** `{ appType, title, icon, x, y, z, minimized }` per entry — **no** `instanceId`, **no** `transpiledJS`, **no** API key, **no** Component reference. `instanceId`s are freshly minted at restore time.
- **Debounced writes**: dragging/moving a window must not cause a write-storm. A debounced (~300ms trailing) write coalesces a drag sequence into a single IDB write to the `settings` store.
- **Restore goes through the cache-hit path** and must NOT trip the produce gate: restores are serialized (concurrency-capped at 1–2 concurrent) so all windows complete restore before any produce-gate threshold is reached.
- **Evicted/unresolvable app on restore** opens as a placeholder window with a visible retry action — it never silently spends API quota.
- All v1.0/v1.1/v2.0 cross-cutting constraints remain acceptance criteria: HYGIENE-01..07 (banned token family + iframe/sandbox/isolation lexicon gate), single Anthropic egress, sourcemaps-off, CSP allowlist, IoC/DI, additive-IDB-only, FOUC/CSP-hash invariant.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and existing codebase conventions (window manager from Phase 15/16, IDB settings store, ServicesProvider/IoC) to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Codebase context (window manager, IDB `settings` store wrapper, ServicesProvider DI seam, WindowFrame from Phase 19) will be gathered during plan-phase research. Phase 21 depends only on Phase 19 (WindowFrame structure); it is independent of Phase 20 at the data-model level.

</code_context>

<specifics>
## Specific Ideas

Success criteria (from ROADMAP, binding acceptance tests):
1. Open 3 apps, move them, reload → all 3 reappear at saved positions, correct z-order and minimized state, using fresh `instanceId`s minted at restore time.
2. Dragging a window 50+ times lands only 1 debounced (~300ms trailing) write in the `settings` store per drag sequence — a test confirms no write-storm.
3. An evicted, un-re-resolvable app opens as a placeholder with a visible retry action — never silently spends API quota.
4. Restoring 5 windows does not throw a produce-gate error — restores serialized (1–2 concurrent), all complete before any produce-gate threshold.
5. The `"windowLayout"` record contains exactly `{ appType, title, icon, x, y, z, minimized }` per entry — nothing else.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
