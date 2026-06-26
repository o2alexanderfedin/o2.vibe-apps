---
phase: 11-reliability-hardening
reviewed: 2026-06-26T05:12:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/execution/stateSchema.ts
  - src/execution/delegated.tsx
  - src/execution/delegatedValidation.test.tsx
  - src/execution/delegatedNoOp.test.tsx
  - package.json
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 11: Code Review Report (Re-Review)

**Reviewed:** 2026-06-26T05:12:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** clean

## Summary

This is a re-review after the `--fix --auto` pass. The prior review (3 WARNING + 2
INFO) is resolved. Each fix was traced against the actual code and verified
empirically — none were papered over or weakened. A fresh adversarial pass for
fix-introduced regressions surfaced no new BLOCKER or WARNING issues.

**Verification performed during this re-review:**
- `tsc --noEmit` passes (exit 0).
- The two phase-11 test files pass (**23/23** — one new compute-path test added).
- Full suite passes at **422/422** (the expected count).
- `zod/mini` behavior re-checked empirically (see WR-03 below).
- Devtools-hygiene lexicon scan across all four `src/**` surfaces returns **zero
  matches** (`synthesi[sz]e`/`synthesized`/`synthesis`/`fake`/`mock`/`AI`/`llm`/
  `generat(e|ed|ing|or)`). `fake-indexeddb` in `package.json` is an upstream npm
  dependency name, not authored devtools-visible copy.

**Prior-finding resolution (all confirmed genuinely fixed):**

- **WR-01 — RESOLVED (verified load-bearing).** `delegatedValidation.test.tsx:258-280`
  now drives a complete `1 + 2 =` expression through the *real* routed handlers and
  asserts the **computed** `"3"` (was asserting the broken `/1\+/`). A `"2"` button was
  added to `MODULE_SRC` (line 56: `["1", "2", "+", "=", "bad"]`). Traced the full path:
  `1`→`"1"`, `+`→`"1+"`, `2`→`"1+2"` (all via `KEY_HANDLER`, each a length-1 payload that
  passes the handler's `payload.length === 1` guard), then `=` routes to `EQUALS_HANDLER`
  (matches `/action '='/`), which evaluates `(1+2)` → `3`, passes `isFinite`, stringifies
  to `"3"`, and the string update passes the merge gate. The equals/compute merge path is
  now genuinely exercised; a non-computing path would fail the final
  `toHaveTextContent("3")`.

- **WR-02 — RESOLVED (no regression to existing behavior).** `delegated.tsx:178-181`
  now reads `const action = el.getAttribute("data-action")` and returns early on
  `if (!action) return;` **before** the busy guard and `setBusy`. The diff confirms the
  change is minimal: for every non-empty action (every real fixture button), behavior is
  byte-identical to before — `!action` is false, the busy guard and `setBusy(action)` run
  unchanged. `setBusy("")` can no longer occur, so the busy lock can no longer be defeated
  by a literal `data-action=""`, and the previously-divergent `aria-busy`/`data-busy`
  signals can no longer disagree. Strictly safer; no existing path altered.

- **WR-03 — RESOLVED (wrong-type rejection preserved).** `stateSchema.ts:24` now maps a
  numeric field to `z.custom<number>((v) => typeof v === "number")` instead of
  `z.number()`, with a clear comment explaining that non-finite numbers are legitimate
  `number` values. Re-verified empirically against `zod/mini`: `NaN`, `Infinity`,
  `-Infinity`, and `42` all parse `true`; a string (`"nope"`) parses `false`.
  Critically, the leniency change is scoped *only* to non-finite numbers — the
  wrong-typed-known-field rejection still works: a string field receiving a number is
  STILL rejected (`{ display: 42 }` → `success: false`), and a number field receiving a
  string is STILL rejected. Covered by the new test at lines 99-111 and the existing
  rejection tests at 87-97. This honors the documented "type-check known fields only,
  nothing stricter" contract without re-introducing the stuck-state failure for numeric
  fields.

- **IN-01 — RESOLVED (assertion is now observed, not tautological).** The dead
  `spyTransport`/`void spyTransport` scaffolding is gone. The injected `runHandler` at
  `delegatedValidation.test.tsx:307-310` IS the counting spy (`handlerCalls++`) and is
  actually wired into the component via `makeDelegatedComponent`. It returns a
  type-mismatched `{ display: 99 }` so the merge validation rejects it; `display` stays
  `"0"` and `expect(handlerCalls).toBe(1)` (line 329) is now a real observation of
  production behavior — the validation reject path makes no extra round-trip. If it did,
  the count would exceed 1.

- **IN-02 — RESOLVED.** All bare `setTimeout(50/100ms)` sleeps are gone (grep confirms
  none remain). The no-op tests now settle deterministically via
  `waitFor(() => expect(container.querySelector("[data-busy]")).toBeNull())` (lines 159,
  214, 232, 321), matching the sibling `delegatedNoOp.test.tsx` pattern. No flake window.

**Design-constraint compliance re-confirmed:**
- `deriveStateSchema` is still derived **once** in `makeDelegatedComponent`
  (`delegated.tsx:227`), threaded as a prop — not per-click, not per-render.
- Validation failure stays **silent** via gated `logger.error("Delegated: state update
  skipped")` with no UI copy and no extra handler call.
- Intentional leniency (`z.optional`, `looseObject`, `z.unknown()` fallback,
  `z.array(z.unknown())`) is the documented reliability-paradox design — not flagged.
- Object-spread merge `{ ...prev, ...next }` copies `__proto__`/`constructor` as plain
  own properties without invoking the prototype setter — no pollution risk.
- No debug artifacts, no `eval`/`innerHTML`, no empty catch blocks. The `new Function()`
  instantiation is the documented architecture (with its eslint-disable), not a defect.

All prior findings are resolved and no new blocking or warning issues remain.

---

_Reviewed: 2026-06-26T05:12:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
