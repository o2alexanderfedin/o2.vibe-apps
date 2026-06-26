---
phase: 13-activate-widgets
plan: "01"
status: complete
requirements:
  - WIDGET-06
completed: 2026-06-26
commit: 409f19f
---

# Phase 13 Plan 01 — Summary

**WIDGET-06 shipped: widget composition activated for delegated apps.**

## What was built
- `instantiateDelegated(transpiledJS, useWidget = NULL_USE_WIDGET)` — `useWidget` threaded into the
  delegated module's `new Function` param list (both React/no-React branches), so the produced
  `view(state)` closes over it and can call `useWidget("<type>")`. (`src/execution/delegated.tsx`,
  `NULL_USE_WIDGET` exported from `src/execution/instantiate.ts`.)
- `instantiateDelegatedWithWidgets(source, transpiledJS, appType, services)` in `src/execution/loader.ts` —
  prewarms the delegated app's declared `@widget` deps, builds `makeUseWidget(map)`, injects it, and
  mounts via `DelegatedShell`. Mirrors the monolithic `instantiateWithWidgets`; used at BOTH delegated
  sites (primary mode:"delegated" branch + the reverse monolith→delegated self-heal fallback).
- `MAX_WIDGET_DEPTH = 8` composition-depth cap in `src/execution/widgetPrewarm.ts` — the worklist now
  carries per-type depth; a type beyond the cap is dropped (isolated like a resolve failure). Cycle
  guard + concurrency cap (≤2) unchanged.
- Isolation reused unchanged: `wrapWidget` (WidgetShell + WidgetErrorBoundary) already wraps every
  prewarmed widget; delegated widgets go through the same path.

## Tests
- `src/execution/delegatedWidgets.test.tsx` (3 cases): e2e render-a-declared-@widget through the real
  loader (asserts widget content + `.widget-shell`); throwing-widget isolation (neutral placeholder,
  parent survives, no mechanic leak); no-widget backward compat (useWidget → null, graceful fallback).
- `src/execution/widgetPrewarm.test.tsx` (+1): depth-cap — a chain past the cap resolves exactly
  `MAX_WIDGET_DEPTH` widgets; deeper types absent; transport not called for them.

## Verification
- tsc 0 · `npm test` **552 passed (64 files)** · build exit 0, **0 source maps** · hygiene + csp 9/9.
- No regression: all 49 pre-existing widget/delegated/loader tests pass.
- Browser no-regression smoke: seeded **Weather** (real conditions for Paris, 37°C; geocode+forecast 200)
  and **Currency** (real USD FX; frankfurter 200) still work end-to-end after the delegated-path change.

## Notes / deviations
- Implemented inline by the orchestrator: the planning subagent hit the account weekly usage limit
  before producing plans. Design was fully pre-resolved in 13-CONTEXT.md (3 threading points + depth cap).
- A live demo widget-using app was judged out of v1.1 scope; the capability is covered by the e2e tests.
