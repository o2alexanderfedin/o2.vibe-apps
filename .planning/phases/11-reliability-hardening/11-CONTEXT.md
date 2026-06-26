# Phase 11: Reliability Hardening - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss=true; decisions pre-resolved from REQUIREMENTS.md + codebase scout)

<domain>
## Phase Boundary

Make produced delegated apps behave correctly more often, at the `DelegatedShell` merge/dispatch seam, with **no extra model round-trips** and **zero mechanic-revealing UI**:

1. **RELY-01** — validate the produced state at the merge step against the module's `initialState` shape; a mis-shaped/invalid result is rejected and the **prior state kept** (never blank/stuck).
2. **RELY-02** — an action with no produced handler, or an unknown/unhandled action, is a **no-op** (never throws, never hangs).
3. **RELY-03** — shape validation uses a single lightweight schema layer (`zod/mini`) derived from `initialState`; failures are **silent** (gated log only, no UI copy) and trigger **no extra model round-trips** (the compile-error self-heal budget, RESIL-04, is untouched).

Out of scope: any new runtime-error self-heal round-trip; network data (Phase 12); widget composition (Phase 13); changing the handler produce/exec path or the denylist.
</domain>

<decisions>
## Implementation Decisions

### The merge seam (RELY-01)
- The validation hook goes at `src/execution/delegated.tsx:183` — immediately before `setState((prev) => ({ ...prev, ...next }))`. Today `next = res?.data?.state` is merged blind.
- Derive a `zod/mini` schema ONCE from `module.initialState` at instantiation (`instantiateDelegated`/`makeDelegatedComponent` in `delegated.tsx`), store it on the module (or pass to the shell), and validate `next` against it at every merge.

### Validation semantics — LENIENT (the reliability paradox is load-bearing)
> Per the v1.1 research + STATE concern: over-strict validation makes the small model fail MORE often. The schema must catch corruption WITHOUT over-rejecting valid-but-partial output.
- **Partial:** merges are partial updates (`{...prev, ...next}`), so the schema must NOT require all `initialState` keys — every field is optional/partial.
- **Loose / passthrough:** unknown extra keys in `next` are ALLOWED (the view ignores them; a partial merge keeps prior known fields). Do not reject on extra keys.
- **Type-checked known fields:** reject (→ keep prior) ONLY when a field that EXISTS in `initialState` is present in `next` with a value whose type mismatches the `initialState`-inferred type. This is the corruption that breaks `view(state)` (e.g. `display` becomes a number/null).
- **Whole-result guard (already present, keep):** if `next` is undefined/null/not a plain object → no merge (no-op). Keep this.
- Net effect: known-field type corruption → reject + keep prior (app never blanks/sticks); benign extra keys → tolerated; valid partial update → merged.

### Schema derivation from initialState (RELY-03)
- Infer each TOP-LEVEL field's validator from its `initialState` value: string→`z.string()`, number→`z.number()`, boolean→`z.boolean()`, array→`z.array(z.unknown())` (lenient on elements), plain object→lenient (`z.looseObject`/`z.record`-style or `z.unknown()`), null/undefined→`z.unknown()` (ambiguous → lenient). One level deep is sufficient — real modules are flat primitive objects (e.g. calculator `{display, expr}`); deeper nesting stays lenient to honor the reliability paradox. Exact nested handling at planner discretion.
- Import from `zod/mini` (tree-shaken ~2KB), not the full `zod` surface, for bundle discipline.

### Unknown / unhandled actions (RELY-02)
- Scout confirms this is ALREADY a no-op: missing `data-action` → early return; handler returns `{ error }` (no `{ data }`) → `next` undefined → no merge; handler throws → caught + gated-logged → state unchanged. Keep this behavior; make the no-op path explicit/obvious in code, and ADD the missing TESTS proving no-op for: (a) action with no produced handler, (b) unknown/unhandled action, (c) handler `{ error }`, (d) handler throw/timeout.

### Hygiene + no extra round-trips (RELY-03)
- Validation failures are SILENT: reuse the existing gated `logger.error` pattern (`delegated.tsx:185-187`); never surface validation details to the view; no banned mechanic lexicon in any new code/comment/string (devtools-visible).
- Validation is purely client-side. On failure → keep prior; do NOT re-call the model. The compile-error self-heal loop (RESIL-04) is the ONLY model round-trip and stays unchanged.

### Dependency
- Add `zod` to production dependencies (latest stable v3.25+/v4, which ships `zod/mini`). No other new deps. The delegate runs `npm install zod` and commits the lockfile change.

### Claude's Discretion
Exact schema-derivation helper name/location, whether the derived schema lives on `DelegatedModule` vs a shell-side memo, the precise zod/mini object API used (loose object vs record), and nested/array strictness within the "lenient" envelope are at the planner/executor's discretion.
</decisions>

<code_context>
## Existing Code Insights (from codebase scout)

- `DelegatedShell` + state: `src/execution/delegated.tsx:162-205` (`useState<DelegatedState>(module.initialState)` + `stateRef`; container `onClick` delegate lines 170-193).
- **Merge step (the hook point):** `delegated.tsx:178-184` — `const next = res?.data?.state; if (next && typeof next === "object") setState((prev) => ({ ...prev, ...next }))`. Blind merge today.
- Types: `delegated.tsx:37-45` — `DelegatedState = Record<string, unknown>`; `DelegatedModule { initialState, view, actionSpec }`.
- `runHandler`: `src/execution/handler.ts:250-273` → `Promise<HandlerResult>` = `{ data?, error? }`; errors always swallowed to `NEUTRAL_HANDLER_ERROR` ("This operation could not be completed."), never throws. Denylist scope at `handler.ts:70-149`.
- Instantiation: `makeDelegatedComponent`/`instantiateDelegated` in `delegated.tsx` (~line 118, 212) — where the derived schema should be built once.
- Gated logger: `src/lib/logger.ts` (localStorage.debug); failure path `delegated.tsx:185-187`.
- `package.json`: NO `zod` yet; no validation lib in use (first-time introduction, no precedent to match).

### Established Patterns
- Errors swallowed → neutral/silent, gated logging only (HYGIENE). IoC/DI via `Services`. Real captured-Haiku fixtures for tests.

### Integration Points
- Schema built at instantiation; validation called at the merge step before setState.
- Only `delegated.tsx` (+ a small schema helper, maybe `src/execution/stateSchema.ts`) and `package.json` change; `handler.ts` likely untouched.

### Tests + fixtures
- `delegated.test.tsx`, `delegatedShell.test.tsx`, `delegatedReal.test.tsx`, `thinShellCalculator.test.tsx`, `handler.test.ts` — mechanism proven; NO bad-output/keep-prior/no-op tests yet (Phase 11 adds them).
- Captured fixtures: `fixtures/delegated-calculator.code.txt`, `delegated-calc-reducer.code.txt`, `handler-calc-*.code.txt`. Use REAL fixtures for the keep-prior/no-op tests.
- NOTE: `thinShellCalculator.test.tsx` had a documented intermittent timeout under full-parallel load (pre-existing flake, not a regression) — don't be alarmed if it flakes once; it passes on re-run.
</code_context>

<specifics>
## Specific Ideas

- Load-bearing tests (use real fixtures, inject services): (1) handler returns a known field with the WRONG type → state is KEPT (prior), app still renders; (2) handler returns extra unknown keys → merge succeeds, known fields intact; (3) valid partial update → merges; (4) unknown action / no handler / `{error}` / throw → no-op, no crash, button re-enables. Assert NO model round-trip occurs on a validation-reject (spy the injected transport — 0 calls beyond the original produce).
- Validation must be O(1)-ish per click and synchronous; do not block the click delegate on anything async beyond the existing `runHandler` await.
- Internal/logic phase — no new UI surface. Acceptance: tsc 0, full suite green (≥399 + new tests), build clean (no sourcemaps), hygiene green. A quick browser smoke (calculator still computes; a deliberately-corrupt fixture keeps prior) is nice-to-have, not required.
</specifics>

<deferred>
## Deferred Ideas

- Runtime-error self-heal round-trips — explicitly OUT (burns the produce cap for little gain; only compile errors feed self-heal).
- Deep/recursive schema validation of nested objects — keep lenient for v1.1 (reliability paradox); revisit only if real modules show deep state.
- Surfacing any "couldn't update" affordance to the user — OUT (must stay silent/hygiene-safe).
</deferred>
