# CONSULT — Thin shell + on-demand behavior handlers (state-protocol drift)

**Source:** Google AI Mode (browser), 2026-06-25
**Driver:** User direction — stop generating whole apps at once (the 12 KB monolith is
unreliable). Generate a MINIMAL control + ONE generic event handler that has enough context
to produce the real behavior on demand and cache it. (Maps onto the existing `runHandler`
resolve-or-produce-then-exec machinery.)
**Question (open/unbiased):** How to keep independently generated, cached reducer functions
(keyed by action) agreeing on a shared state shape and avoid drift — patterns and pitfalls.

## What the model said (distilled)

Enforce a **machine-readable Single Source of Truth (SSOT) that sits OUTSIDE the generation
loop.** Don't let the model invent state structures per action.

- **Schema-first generation.** Define the full app state shape once; force every produced
  reducer to conform.
- **Context injection.** Inject the ENTIRE current state shape into the prompt for each
  produced reducer as an immutable constraint.
- **Runtime gatekeeping.** Validate the reducer's returned state against the shape before
  committing; on drift, roll back to the prior safe state.
- **State-delta isolation.** Prefer reducers that return partial slices the shell MERGES,
  rather than mutating root state.
- (Optional) have the model emit the reducer + a deterministic test against a standard mock.

**Pitfalls:** hallucinated property names (`display` vs `value`), cache stale-out when the
shape changes (old cached reducers write deprecated shapes), implicit type coercion
(number→string), and state-bloat from undocumented temp keys.

## Decisions applied to the prototype (calculator)

The **shell is the SSOT.** Concretely, the produced thin shell must:
1. Hold the COMPLETE state in one `React.useState` with an explicit, named initial shape.
2. Route every interaction through one async `dispatch(action, payload)` →
   `await runHandler(intent, { state, payload })`.
3. Write a **STABLE intent** (no live state values, so the cache key is stable per action)
   that **embeds the exact state shape** + the contract: input `{ state, payload }`, return
   `{ data: { state } }` with the SAME shape (context injection).
4. **Merge + gatekeep:** `setState(prev => ({ ...prev, ...res.data.state }))` only when
   `res.data.state` is present; keep prior state on `{ error }` (rollback).
5. Contain ZERO business logic — `runHandler` returns the next state.

This realizes the user's "single hardcoded handler that generates handlers on demand" with NO
new infra: the dispatcher is `runHandler`; each `(app, action)` is a stable intent; produced
handlers are tiny, sandboxed (pure compute over state — the denylist scope already forbids
network/storage), and cached so only the first press of each key pays. Latency UX: lazy +
per-action busy state (chosen). Drift is contained by shape-in-intent + merge/gatekeep; the
worst case (a drifting handler) degrades to "keep prior state", never a corrupt app.

## Validation plan

Gated real-Haiku end-to-end: produce the shell, bind a REAL `runHandler` (real transport +
in-memory registry), render in jsdom, press `1 + 2 =`, assert the display shows `3` — proving
real Haiku produces a working shell AND working behavior handlers. Then a committed
deterministic RTL test (real captured shell + a protocol-conforming handler) locks the shell
wiring without network.
