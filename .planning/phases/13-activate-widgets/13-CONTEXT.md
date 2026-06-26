# Phase 13: Activate Widget Composition - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss=true; decisions pre-resolved from REQUIREMENTS.md + codebase scout). FINAL phase; HIGHEST regression risk.

<domain>
## Phase Boundary

Activate the dormant widget-composition machinery for the DELEGATED render path so a delegated app can declare and render `@widget` sub-widgets — `useWidget` wired into the delegated `view` scope, each widget isolated by the existing shell + error boundary, with a composition-depth cap — WITHOUT regressing any existing delegated app (all unseeded apps + the Phase 12 seeded Weather/Currency mount through this path).

Delivers WIDGET-06. This is "activate, don't build": `parseWidgetDeps`, `prewarmWidgets` (cycle guard + concurrency cap ≤2), `makeUseWidget`, and `wrapWidget` (WidgetShell + WidgetErrorBoundary) already exist and are tested — they just aren't threaded into the delegated path.

Out of scope: building new widget infra; changing the monolithic widget path (works today); recursive/unbounded trees (capped); the network-data path (Phase 12, done).
</domain>

<decisions>
## Implementation Decisions

### The three threading points (the whole gap)
1. **`instantiateDelegated` (`src/execution/delegated.tsx:60`)** — add an optional `useWidget: UseWidget = NULL_USE_WIDGET` param and thread it into the module's `new Function` param list (alongside React: `["module","exports","React","useWidget","require"]`, in BOTH the injectReact and the non-React fallback param lists, so the extracted `view` closure always captures `useWidget`). The delegated module's `view(state)` then calls `useWidget("type")` from its enclosing scope. Positional args must match the param order exactly.
2. **`makeDelegatedComponent` (`src/execution/delegated.tsx:~240`)** — already receives the instantiated module; no widgetMap param needed IF `useWidget` is injected at `instantiateDelegated` time (the view closes over it). Keep `makeDelegatedComponent`'s signature stable; the widget wiring lives in `instantiateDelegated`. (If the planner finds the view must be re-bound separately, thread a `widgetMap`/`useWidget` through — but the closure-capture approach in #1 is preferred and simplest.)
3. **Loader `instantiateApp` delegated branch (`src/execution/loader.ts:148-171`)** — BEFORE `instantiateDelegated`, prewarm: `const widgetMap = await prewarmWidgets(source, services); const useWidget = makeUseWidget(widgetMap);` then `instantiateDelegated(transpiledJS, useWidget)`. Mirror the monolithic `instantiateWithWidgets` (loader.ts:123-138). The `source` is available at this call site. This closes the prewarm gap for all three cache tiers (all route through `instantiateApp`); Tier-1 live instances already carry bound widgets (no re-prewarm).

### Composition-depth cap (RELY-style safeguard)
- Add `MAX_WIDGET_DEPTH` (default 8) to `prewarmWidgets` (`src/execution/widgetPrewarm.ts`). Track depth per enqueued type (root deps = depth 1; a widget's transitive deps = parent depth + 1). Do NOT enqueue a type whose depth would exceed the cap; log a gated warning and ISOLATE (the over-deep type stays absent from the map → `useWidget` returns null → host renders around it, same as a resolve failure). Keep the existing cycle guard (`seen` Set) and concurrency cap (≤2) intact.

### Isolation (already built — verify, don't rebuild)
- `wrapWidget` (`src/ui/widgetWrap.tsx`) already wraps every prewarmed widget in `WidgetShell` + `WidgetErrorBoundary`. Delegated widgets go through the SAME `prewarmWidgets` → `wrapWidget` path, so isolation is automatic. Do NOT change the wrapping. Add a test asserting a throwing widget inside a delegated host shows the neutral "Unavailable right now." placeholder and does NOT crash the parent app.

### Backward compatibility — THE dominant constraint
- Existing delegated apps that declare NO `@widget` must mount byte-identically: `prewarmWidgets` on a source with no declarations returns an empty map; `useWidget` returns null; the view never calls it; the extra `useWidget` param is unused. Default `useWidget` to `NULL_USE_WIDGET` so any direct `instantiateDelegated(js)` call (tests) still works.
- The Phase 12 seeded **Weather** and **Currency** apps (delegated, no widgets) MUST still mount and fetch real data unchanged — this is part of the acceptance smoke.
- The monolithic widget path (`instantiate` + `instantiateWithWidgets`) is UNCHANGED.

### Demonstrability (recommended for the live smoke)
- So widget composition is demonstrably live (not just test-covered), PREFER adding a minimal seeded demonstration: one tiny seeded `@widget` (e.g. a "clock" or "stat" widget) plus a small seeded delegated app whose `view` declares `// @widget <type>` and renders `useWidget("<type>")`. This gives the orchestrator a real browser smoke (open the app → the isolated widget renders in its WidgetShell). If the planner judges this out of scope, the end-to-end integration test below is the minimum bar; flag the decision.

### Claude's Discretion
The exact `MAX_WIDGET_DEPTH` value, whether to thread `useWidget` via closure-capture (preferred) vs an explicit param on `makeDelegatedComponent`, the demo widget/app specifics, and the depth-tracking data structure are at the planner/executor's discretion within the constraints above.
</decisions>

<code_context>
## Existing Code Insights (from codebase scout)

- `@widget` parser: `src/execution/widgetParse.ts:25-50` (`// @widget <type>` line comments, kebab+digits, deduped).
- Prewarm: `src/execution/widgetPrewarm.ts:225-312` — `prewarmWidgets(rootSource, services) → Map<type, Component>`; cycle guard `seen` (line ~236); concurrency `WIDGET_CONCURRENCY=2`; transitive enqueue; `wrapWidget(type, raw, services)` on each (line ~270). ADD depth cap here.
- `makeUseWidget`: `src/execution/instantiate.ts:41-45` → sync `(type) => widgetMap.get(type) ?? null`. `NULL_USE_WIDGET` default.
- Monolithic injection (the working analog): `instantiate.ts:106-119` (`new Function("module","exports","React","useWidget","runHandler","require", js)`).
- DELEGATED GAP: `src/execution/delegated.tsx:60-127` `instantiateDelegated` — `new Function` params `["module","exports","React","require"]`, NO useWidget. `makeDelegatedComponent` `:~240`.
- Loader delegated branch (no prewarm): `src/execution/loader.ts:148-171`; monolithic prewarm analog `instantiateWithWidgets` `:123-138`.
- Isolation (done): `src/ui/widgetWrap.tsx:41-80` (WidgetShell + WidgetErrorBoundary), `src/ui/WidgetErrorBoundary.tsx:25-68` ("Unavailable right now." + Try again), `src/ui/WidgetShell.tsx`.

### Established Patterns
- `useWidget` is SYNCHRONOUS (pure Map.get) — prewarm happens before mount so render never awaits.
- Isolation by wrap-at-prewarm; failed/over-deep widgets are absent → null → host renders around.
- IoC/DI services; real captured fixtures; gated logging; HYGIENE lexicon ban.

### Integration Points (all on the delegated path — load-bearing)
- `delegated.tsx` (instantiateDelegated param), `loader.ts` (delegated-branch prewarm), `widgetPrewarm.ts` (depth cap). Possibly `seeds.ts` (demo widget/app).

### Tests + fixtures
- Widget: `widgetPrewarm.test.tsx`, `widgetParse.test.ts`, `useWidget.test.tsx`. Delegated: `delegated.test.tsx`, `loaderSeededDelegated.test.tsx`, `delegatedFields.test.tsx`, `delegatedReal.test.tsx`, etc. NO fixture declares `@widget` in a delegated module yet.
- `thinShellCalculator.test.tsx` has a documented intermittent flake under full-parallel load — re-run in isolation, don't weaken.
</code_context>

<specifics>
## Specific Ideas

- MANDATORY end-to-end regression lock (new `src/execution/delegatedWidgets.test.tsx`): a delegated module whose source declares `// @widget <type>` and whose `view` calls `useWidget("<type>")`; prewarm a stub widget via injected services; mount through the REAL loader `instantiateApp` (delegated branch); assert the widget renders wrapped in `WidgetShell` (displayName `Widget(<type>)`). This must FAIL pre-change and PASS post-change.
- Isolation test: a stub widget that throws → assert the neutral placeholder renders and the delegated app does NOT crash.
- Depth-cap test: a chain A→B→C→…past the cap → assert resolution stops at `MAX_WIDGET_DEPTH`, the over-deep type is absent, no infinite loop.
- Backward-compat test: a delegated app with NO `@widget` mounts unchanged (empty widgetMap, useWidget→null never called).
- Acceptance: tsc 0, full suite green (≥548 + new), build clean (no sourcemaps), hygiene green. **Orchestrator browser smoke:** (a) NO REGRESSION — seeded Weather still shows real conditions, Currency still shows real FX; (b) if a demo widget-app was seeded, open it and confirm the isolated widget renders in its WidgetShell.
</specifics>

<deferred>
## Deferred Ideas

- Recursive/unbounded widget trees — capped at MAX_WIDGET_DEPTH (out by design).
- Widget composition for monolithic apps — already works; no change.
- Richer widget-to-app data flow / props contracts beyond the current `useWidget(type)` accessor — out for v1.1.
</deferred>
