---
phase: 11-reliability-hardening
reviewed: 2026-06-26T05:01:00Z
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
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-06-26T05:01:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 11 adds a lenient-partial state-schema validation gate at the `DelegatedShell`
merge step so a produced handler that returns a known field with the wrong primitive
type can no longer blank or stick the app. The implementation is small, focused, and
matches the phase design intent:

- `deriveStateSchema` is correctly derived **once** in `makeDelegatedComponent`
  (not per-click, not per-render) and threaded through `DelegatedShellProps`.
- Validation failure is **silent** via the gated `logger.error` (no UI copy), and the
  reject path triggers **no additional handler/transport call** (verified by the
  spy-transport test asserting `extraCalls === 0`).
- The intentional leniency (partial/passthrough `looseObject`, `z.unknown()` fallback
  for object/null/array fields) is the documented "reliability paradox" design and is
  **not** flagged as a defect.
- The existing whole-result guard `if (next && typeof next === "object")`, the
  busy/finally UX, the outer catch, and the `stateRef` latest-state mirror are all
  preserved.
- **Devtools hygiene: clean.** No banned mechanic lexicon
  (`synthesi[sz]e`/`synthesized`/`synthesis`/`fake`/`mock`/`AI`/`llm`/`generat*`)
  appears in any of the four reviewed `src/**` surfaces. (`fake-indexeddb` in
  `package.json` is an upstream npm dependency name, not authored devtools-visible
  copy, and `package.json` is not part of the served bundle.)
- **No prototype-pollution risk:** the merge uses object spread `{ ...prev, ...next }`,
  which copies `__proto__`/`constructor` keys as plain own properties without invoking
  the prototype setter — verified empirically that `({}).polluted` stays `undefined`
  after merging a `__proto__`-bearing object.

Verification performed during review: `tsc --noEmit` passes (exit 0), the two
phase-11 test files pass (22/22), and the full suite passes (421/421). The findings
below are quality/robustness issues, not crashes or security holes — hence no
BLOCKERs.

## Warnings

### WR-01: "real calc flow" test asserts a *broken* equals result — the compute-path regression it claims to guard is not actually verified

**File:** `src/execution/delegatedValidation.test.tsx:241-257`
**Issue:**
The test is named `"real calc flow still works (1 + 2 = 3) through the validation path"`
and is the only test that purports to protect the calculator **compute** regression
called out in the phase context. It does not do what the name claims:

1. It never presses `2` (the `1 + 2 = 3` flow is never performed).
2. After pressing `1` then `+`, `state.expr` is `"1+"` — an **incomplete expression**.
   Pressing `=` routes to `EQUALS_HANDLER`, which evaluates
   `Function('"use strict"; return (1+)')()` → this **throws a `SyntaxError`**, so the
   handler returns `{ error }`, no state is merged, and the display stays `"1+"`.
3. The final assertion `await waitFor(() => expect(display).toHaveTextContent(/1\+/))`
   matches the *unchanged* `"1+"` display. It passes precisely because the equals
   computation **failed**. A correctly-computed result (`"3"`) would NOT match `/1\+/`
   and would fail the test.

Net effect: the equals/compute path is asserted in its broken state, giving false
confidence that "calculator compute still works through the validation path." Verified
by tracing the handler fixtures: `/^[\d+\-*/%().]+$/.test("1+")` is `true` (passes the
safety regex) but `Function('return (1+)')` throws.

**Fix:** Drive a complete expression and assert the computed numeric result, so the
equals merge path is genuinely exercised:
```ts
const press = (name: string) => user.click(screen.getByRole("button", { name }));
await press("1");
await waitFor(() => expect(display).toHaveTextContent("1"));
await press("+");
await waitFor(() => expect(display).toHaveTextContent("1+"));
// MODULE_SRC only exposes buttons ["1","+","=","bad"]; add a second operand
// (e.g. a "2" button + data-action) to MODULE_SRC, then:
await press("2");
await waitFor(() => expect(display).toHaveTextContent("1+2"));
await press("=");
await waitFor(() => expect(display).toHaveTextContent("3")); // assert the COMPUTED value
```
If MODULE_SRC cannot easily express a multi-digit flow, route this assertion through
the real `delegated-calculator.code.txt` fixture (which has full digit buttons) instead
of the trimmed `MODULE_SRC`, and assert the actual numeric output of a complete
expression.

### WR-02: Empty `data-action` attribute makes `busy` falsy — re-entrancy guard is bypassed while `aria-busy` reports `"true"` (latent, pre-existing)

**File:** `src/execution/delegated.tsx:179-180, 208-209`
**Issue:**
`const action = el.getAttribute("data-action") ?? "";` falls back to `""` only when the
attribute is *absent*, but `closest("[data-action]")` matches an element that has the
attribute **present with an empty value** (`data-action=""`). In that case `action`
is the empty string and `setBusy("")` is called. `busy === ""` is **falsy**, so:

- The re-entrancy guard `if (busy) return;` (line 178) does **not** block a concurrent
  press while that action is in flight — the busy lock is defeated for empty-action
  elements, allowing overlapping handler runs against `stateRef.current`.
- Meanwhile `aria-busy={busy !== null ? "true" : undefined}` (line 208) reports
  `"true"` (because `"" !== null`), while `data-busy={busy ?? undefined}` (line 209)
  renders `data-busy=""`. The two busy signals disagree.

This is a pre-existing edge (these lines are unchanged by the Phase 11 diff) and
requires a produced view to emit an interactive element with a literal empty
`data-action`. It is not triggered by any current fixture (all calculator buttons carry
non-empty actions), so severity is bounded — but a small model emitting
`data-action=""` is plausible, and the failure mode (defeated busy lock + inconsistent
ARIA) undermines the busy UX this phase relies on.

**Fix:** Treat an empty/missing action as "no actionable element" and use a non-state
sentinel that is never confused with falsy:
```ts
const action = el.getAttribute("data-action");
if (!action) return;            // empty or missing → not an actionable target
if (busy) return;
setBusy(action);                // action is now guaranteed non-empty
```

### WR-03: `z.number()` rejects `NaN` — a numeric known-field update of `NaN` would be silently dropped (forward-looking)

**File:** `src/execution/stateSchema.ts:19`
**Issue:**
`validatorFor` maps a numeric `initialState` field to `z.number()`. In zod 4,
`z.number().safeParse(NaN)` returns `{ success: false }` (verified empirically). For a
future delegated module whose state has a numeric field (e.g. `{ result: 0 }`), a
handler that legitimately computes `NaN` (e.g. `0/0`, an overflow, or an
`Infinity`-derived result) would have its **entire** state update rejected by the
merge gate, silently keeping prior state — the exact "stuck app" failure mode this
phase exists to prevent, re-introduced for numeric fields.

No current delegated fixture uses a numeric state field (the calculator stores
`display`/`expr` as strings, and its equals handler guards `isFinite(result)` before
stringifying), so this is **not** an active bug today — hence WARNING, not BLOCKER. But
it is an undocumented sharp edge in a validator that is meant to be deliberately
lenient: `NaN`/`Infinity` are valid `number` values in JS and rejecting them is
stricter than the stated "type-check known fields only" contract.

**Fix:** If the intent is "is this still a number," accept non-finite numbers
explicitly so the validator does not over-reject:
```ts
if (typeof value === "number") return z.number().check(z.refine(Number.isFinite.bind(null) ? () => true : () => true));
// simpler with zod/mini: accept any JS number including NaN/Infinity
if (typeof value === "number") return z.unknown().check(
  z.refine((v) => typeof v === "number"),
);
```
At minimum, document in the `validatorFor` comment that numeric fields reject
`NaN`/`Infinity`, so a future numeric-state module author is not surprised by silently
dropped updates.

## Info

### IN-01: Dead reference kept solely to satisfy the type-checker reads as confusing test scaffolding

**File:** `src/execution/delegatedValidation.test.tsx:282-285, 311`
**Issue:**
`spyTransport` is defined, never passed into the component, and then `void spyTransport;`
is used at line 311 to keep it "in scope." The RELY-03 assertion that matters is
`expect(extraCalls).toBe(0)` — but because `spyTransport` is never wired into the
component, `extraCalls` is *structurally* guaranteed to be 0 regardless of the
production code's behavior. The test therefore proves "I never called the spy I never
connected," which is closer to tautological than to verifying that the validation
reject path makes no extra round-trip. The intent ("the runHandler and validation paths
are independent of the transport layer") is reasonable, but the spy adds no real signal.

**Fix:** Either delete the `spyTransport`/`void spyTransport` scaffolding (the
`display` staying `"0"` plus a single-call assertion already covers the no-extra-merge
behavior), **or** make the spy load-bearing by injecting it as the actual `runHandler`
transport and asserting it was invoked exactly once — so the count is observed, not
assumed.

### IN-02: Several no-op tests use bare `setTimeout(50ms)` instead of a deterministic `waitFor`, risking flake

**File:** `src/execution/delegatedValidation.test.tsx:144, 198, 216, 233, 301`
**Issue:**
Several assertions wait via `await new Promise((r) => setTimeout(r, 50))` (and one at
100ms) and then assert state is unchanged. Fixed sleeps are timing-fragile under CI
load and assert "nothing happened yet" rather than "the action has fully settled." The
sibling file `delegatedNoOp.test.tsx` already demonstrates the deterministic pattern:
`await waitFor(() => expect(container.querySelector('[data-busy]')).toBeNull())`.

**Fix:** Replace the fixed sleeps with a `waitFor` keyed on the busy indicator clearing,
then assert the unchanged state:
```ts
await waitFor(() => expect(screen.getByRole("button", { name: "bad" }))
  .not.toHaveAttribute("aria-busy"));
expect(display).toHaveTextContent("0");
```
This makes the no-op tests settle-driven and removes the 50/100ms flake window.

---

_Reviewed: 2026-06-26T05:01:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
