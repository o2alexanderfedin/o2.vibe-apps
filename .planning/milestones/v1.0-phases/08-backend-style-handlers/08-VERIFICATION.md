---
phase: 08-backend-style-handlers
verified: 2026-06-25T00:00:00Z
status: passed
score: 3/3 must-haves verified
overrides_applied: 0
mode: mvp
re_verification: false
---

# Phase 8: Backend-Style Handlers — Verification Report

**Phase Goal:** A generated app or widget that needs a data operation gets one transparently — resolved from cache or produced on first need — without any visible "backend" and without ever reaching the network or the API key.
**Verified:** 2026-06-25T00:00:00Z
**Status:** passed
**Re-verification:** No — initial (backfill) verification
**Mode:** mvp

## Backfill Note

This phase was built in a streamlined flow and shipped functionally complete (full suite GREEN 368/368, `tsc --noEmit` 0 errors) with no VERIFICATION.md. This report backfills goal-backward verification by reading the implementation source and the existing tests, citing `file:line` evidence for each of the three requirements as ORIGINALLY scoped (HANDLER-01..03). Per the instruction, the full suite was NOT re-run; verification is by code reading + citing the named tests that already exist and pass in the green suite.

**Extended post-milestone (verified but out of original HANDLER-01..03 scope):** handlers are now produced as TypeScript with a require-purity guard (`producer.ts:471-476`), and `runHandler` is also reused by the delegated thin-shell path (`loader.ts:139-141`, `instantiateApp`). These extensions are present in the codebase and covered by `handlerTyped.test.ts`; they are noted here but the pass/fail decision below is made strictly against the three original requirements.

## MVP-Mode Note

The phase is `mode: mvp`. The ROADMAP Phase 8 goal is descriptive rather than a strict `As a …, I want to …, so that ….` User Story, so strict MVP UAT framing cannot be auto-derived from the goal. Verification proceeded against the three concrete, fully-testable ROADMAP Success Criteria (the roadmap contract) and the HANDLER-01..03 requirements, each of which maps to code with file:line evidence and an existing passing test.

## User Flow Coverage

Capability story (from the phase goal): «A produced app/widget that needs a data operation calls `runHandler(intent, input)`; it is transparently resolved from cache or produced on first need, executed in a constrained scope, and returns `{ data?, error? }` — with no visible backend and without ever reaching the network or the API key.»

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| App calls `runHandler(intent, input)` | 2-arg helper in produced-app scope, services bound by loader | `instantiate.ts:118-119` (`runHandler` param in `new Function`), `loader.ts:116-118` (`boundRunHandler` closes over `services`); `handlerWiring.test.tsx:55-79` renders an app that calls it and shows "Hello World" | ✓ |
| Resolve from cache (hit) | Stored `transpiledJS` reused, NO model call, useCount bumped | `handler.ts:191-197` (`resolveHandlerJS` cache-hit branch + `touchHandler`); `handler.test.ts:143-155` ("second call REUSES — NO further transport call", `calls()===1`) | ✓ |
| Produce on first need (miss) | Cost-gated single model call via shared `produceComponent` (`kind:"handler"`), dual-cached | `handler.ts:199-228`; `handler.test.ts:76-85` (MISS produces, `calls()===1`, returns `{data}`) | ✓ |
| Execute in constrained scope | Denied globals shadowed to `undefined`, hostile `require`, no key in scope | `handler.ts:100-148` (`executeHandler`, `DENIED_GLOBALS` params + `undefined` args + throwing `requireShim`); `handler.test.ts:193-208` (per-global `typeof === "undefined"`) | ✓ |
| Returns `{ data?, error? }`, never throws, mechanic hidden | Any throw → neutral `{ error }`; handler's own `{error}` passed through | `handler.ts:249-272` (two try/catch → `NEUTRAL_HANDLER_ERROR`); `handler.test.ts:87-117` (throw, no-key both neutral, never throws) | ✓ |
| No visible backend / no network or key reached | Denylist blocks `fetch`/storage; no key parameter exists in handler scope | `handler.ts:69-77,116-122`; `handler.test.ts:210-263` (network blocked, storage blocked, key unreachable, all neutral) | ✓ |

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | A single `runHandler(intent, input)` helper resolves-or-produces a handler, executes it, returns `{ data?, error? }`, NEVER throws, NEVER reveals the mechanic | ✓ VERIFIED | `handler.ts:249-272` resolve-then-exec with two guarded try/catch mapping every failure to `NEUTRAL_HANDLER_ERROR` ("This operation could not be completed.", line 84); 2-arg form injected into app scope at `instantiate.ts:118-119` and bound at `loader.ts:116-118`. Tests: `handler.test.ts:75-118` + `handlerWiring.test.tsx:54-90` |
| 2 | A produced handler is dual-cached in the `handlers` store and reused with NO further model call; a hit bumps `useCount`/`updatedAt` | ✓ VERIFIED | `handler.ts:185-228` keys by opaque `cacheKey("handler\n"+intent)` (line 189), cache-hit returns stored `transpiledJS` with no model call (191-197) and `touchHandler` bumps useCount + stamps updatedAt (156-172); miss writes `{source, transpiledJS, useCount:0, updatedAt}` (214-225). Tests: `handler.test.ts:124-187` (write shape, reuse `calls()===1`, useCount 0→1→2, distinct opaque keys) |
| 3 | Handler executes in a CONSTRAINED scope — denied globals undefined, no fetch/storage, no key, hostile require; any throw → neutral `{ error }` | ✓ VERIFIED | `handler.ts:69-77` `DENIED_GLOBALS` = fetch/XMLHttpRequest/localStorage/sessionStorage/indexedDB/window/document; shadowed as `new Function` params (113-122) and passed `undefined` positionally (138-139); `requireShim` always throws (109-111); no key parameter in the list. Tests: `handler.test.ts:193-287` (per-global undefined, network/storage/key/require all blocked → neutral, built-ins still reachable) |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/execution/handler.ts` | runHandler + resolve-or-produce + DENIED_GLOBALS + executeHandler denylist + touchHandler + NEUTRAL_HANDLER_ERROR + executeHandlerSource | ✓ VERIFIED | All present: `runHandler` 249-272, `resolveHandlerJS` 185-228, `DENIED_GLOBALS` 69-77, `executeHandler` 100-148 (new Function denylist + hostile require), `touchHandler` 156-172, `NEUTRAL_HANDLER_ERROR` 84, `executeHandlerSource` 280-286 |
| `src/execution/transpile.ts` | `transpileHandler` TS-strip only, NO react preset | ✓ VERIFIED | `transpileHandler` 90-111: `presets: [["typescript", { isTSX:false, allExtensions:true }]]` (line 96), NO react preset, keeps `transform-modules-commonjs` |
| `src/execution/producer.ts` | `kind:"handler"` path + require-purity guard (extended) | ✓ VERIFIED | `ProduceKind` includes "handler" (57); handler prompt 92-107; transpile selected by kind at 460-463 (`transpileHandler` for handler); require-purity guard rejects `require(` in handler output 471-476 (post-milestone extension) |
| `src/execution/instantiate.ts` | `runHandler` param injected into produced-app scope | ✓ VERIFIED | `RunHandler` type 59-62, `NULL_RUN_HANDLER` neutral default 65-66, injected as `new Function` param both passes (118-119, 138-147) |
| `src/execution/loader.ts` | `instantiateWithWidgets` binds 2-arg runHandler to services | ✓ VERIFIED | `boundRunHandler = (intent, input) => runHandler(intent, input, services)` 116-118; also reused on delegated path 139-141 (post-milestone) |
| `src/execution/handler.test.ts` | DI unit tests for HANDLER-01..03 | ✓ VERIFIED | 422 lines; named suites for HANDLER-01 (75), HANDLER-02 (124), HANDLER-03 (193), cost gate (293), real fixtures (330), hygiene-safe prompt (381) |
| `src/execution/handlerWiring.test.tsx` | end-to-end app→runHandler RTL test | ✓ VERIFIED | 90 lines; produced app calls injected 2-arg runHandler, renders `{data}` "Hello World" (54-79); no-binding default → neutral error branch (81-89) |
| `src/execution/handlerTyped.test.ts` | typed-handler strip + run (extension) | ✓ VERIFIED | 67 lines; `transpileHandler` strips TS, stripped handler honors `{state,payload}→{data:{state}}`, malformed type → TranspileError |
| handler test fixtures | real captured Haiku handler outputs | ✓ VERIFIED | `handler-filter-tasks.{raw,code}.txt` + `handler-summarize-list.{raw,code}.txt` present in `src/test/fixtures/`; loader `load.ts` exposes `rawHandlerFixture`/`codeHandlerFixture` |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| produced app | `runHandler` | injected `new Function` param | ✓ WIRED | `instantiate.ts:118-119,145-147` adds `runHandler` to param list both passes; `handlerWiring.test.tsx` proves an app calls it and renders the result |
| `loader.instantiateWithWidgets` | `handler.runHandler` | `boundRunHandler` closing over `services` | ✓ WIRED | `loader.ts:29` imports `runHandler`; `loader.ts:116-118` binds 2-arg form so the app never sees `services` |
| `runHandler` | `handlers` store | `services.registry.get/put` keyed by opaque cacheKey | ✓ WIRED | `handler.ts:192` get, `214` put, key `cacheKey("handler\n"+intent)` 189; `handler.test.ts:124-187` round-trip |
| `resolveHandlerJS` (miss) | `produceComponent` | `kind:"handler"` | ✓ WIRED | `handler.ts:204-209` calls `produceComponent(intent, transport, getApiKey, "handler")`; producer transpiles via `transpileHandler` (`producer.ts:460-463`) |
| `resolveHandlerJS` (miss) | `produceGate` | `tryAcquire()` before model call | ✓ WIRED | `handler.ts:202`; `handler.test.ts:293-323` proves the (N+1)th distinct produce is blocked and a cache hit never consults the gate |
| `executeHandler` | constrained scope | `new Function(...DENIED_GLOBALS, "input")` + undefined args + hostile require | ✓ WIRED | `handler.ts:116-139`; per-global `typeof === "undefined"` proof `handler.test.ts:193-208` |

### Data-Flow Trace (Level 4)

`runHandler` is an async data helper, not a rendering component, so Level-4 dynamic-render tracing applies to its consumer (the produced app). The end-to-end flow is exercised by `handlerWiring.test.tsx`: a real produced app calls `runHandler` in `useEffect`, receives `{ data: { greeting } }` from a canned-transport-produced handler executed in the constrained scope, and renders "Hello World" — confirming real data (not a hardcoded empty value) flows from handler resolution through the constrained-scope execution into the app's rendered output.

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `handlerWiring.test.tsx` app | `text` | `runHandler('compute a greeting', {name:'World'})` → handler exec → `{data:{greeting}}` | Yes — renders "Hello World" via `waitFor` | ✓ FLOWING |
| `handler.test.ts` filter-tasks fixture | `result.data` | real captured Haiku handler over local sample data | Yes — `{count:3, status:"completed"}` | ✓ FLOWING |

### Behavioral Spot-Checks

Per the verification instruction the full suite was NOT re-run (it is already GREEN at 368/368, `tsc --noEmit` 0). The checks below cite the existing green-suite evidence and the named tests that prove each requirement; each was read in source and maps to a passing assertion.

| Behavior | Command / Source | Result | Status |
| -------- | ---------------- | ------ | ------ |
| TypeScript strict typecheck | `npx tsc --noEmit` (reported by builder) | 0 errors | ✓ PASS (reported green) |
| Full Vitest suite | `npx vitest run` (reported by builder) | 368/368 passing | ✓ PASS (reported green) |
| HANDLER-01 resolve/produce/neutral | `handler.test.ts:75-118` (MISS produces `calls()===1`; throw→neutral; own `{error}` passes through; no-key→neutral, never throws) | assertions present + green | ✓ PASS (read) |
| HANDLER-02 dual-cache + reuse + LRU bump | `handler.test.ts:124-187` (write shape useCount 0; reuse `calls()===1`; hit bumps 0→1→2; distinct opaque keys) | assertions present + green | ✓ PASS (read) |
| HANDLER-03 constrained scope | `handler.test.ts:193-287` (each DENIED_GLOBAL `typeof === "undefined"`; fetch/storage/key/require blocked → neutral; built-ins reachable) | assertions present + green | ✓ PASS (read) |
| End-to-end app→runHandler wiring | `handlerWiring.test.tsx:54-90` (app renders "Hello World" from injected 2-arg runHandler; no-binding default → neutral error) | assertions present + green | ✓ PASS (read) |
| Real captured handler fixtures | `handler.test.ts:330-374` (filter-tasks runs→`{data}`; summarize-list reaching a module BLOCKED→`{error}`) | assertions present + green | ✓ PASS (read) |
| Cost gate reuse on produce miss | `handler.test.ts:293-323` (N+1th produce throttled, hit never gated, recovers as window slides) | assertions present + green | ✓ PASS (read) |
| Hygiene-safe handler prompt | `handler.test.ts:381-402` (prompt body has no synthesi[sz]/generat/mock/AI/llm; is a real `handler(input)` prompt) | assertions present + green | ✓ PASS (read) |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` exist and the Phase 8 plan declares no probe scripts. The project's Vitest suite + `tsc` serve as the runnable checks (see Behavioral Spot-Checks). Status: N/A (no probes declared).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| HANDLER-01 | 08-01 | Single `runHandler(intent, input)` resolve-or-produce-then-exec, returns `{data?,error?}`, never throws, never reveals mechanic; wired into produced-app scope (2-arg, services bound by loader) | ✓ SATISFIED | `handler.ts:249-272`; `instantiate.ts:118-119`; `loader.ts:116-118`; tests `handler.test.ts:75-118` + `handlerWiring.test.tsx` |
| HANDLER-02 | 08-01 | Dual-cache (source+transpiledJS) in `handlers` store under opaque key, `useCount:0`/`updatedAt:now` on write, bump on hit, reuse with no model call | ✓ SATISFIED | `handler.ts:185-228` (resolve/cache) + `156-172` (touch); tests `handler.test.ts:124-187` |
| HANDLER-03 | 08-01 | Constrained scope — denylist shadows fetch/XMLHttpRequest/localStorage/sessionStorage/indexedDB/window/document to undefined, hostile require, no key in scope, neutral `{error}` on any throw | ✓ SATISFIED | `handler.ts:69-77,100-148`; tests `handler.test.ts:193-287` |

**All 3 Phase 8 requirement IDs accounted for; no orphaned requirements** — REQUIREMENTS.md maps exactly HANDLER-01/02/03 to Phase 8 (lines 63-65, 158-160), all marked Complete, and each appears in the 08-01 plan and is satisfied in the codebase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `handler.ts` | 138, 147 | `.map(() => undefined)` / wrap-as `{ data: result }` | ℹ️ Info | Intentional: one `undefined` per denied global is the HANDLER-03 mechanism (shadowing), and the wrap normalizes a bare handler return to the `{data?,error?}` contract. Not a stub — real values flow (proven by `handlerWiring.test.tsx`). |
| `handler.ts` / `instantiate.ts` | 84 / 66 | literal `"This operation could not be completed."` | ℹ️ Info | Neutral, mechanic-free error copy (by design, HYGIENE). Asserted neutral by tests that grep the message for banned tokens. |

**No TBD/FIXME/XXX/TODO/HACK debt markers** in any Phase 8 source file. No empty-return or hardcoded-empty-data stubs in the data path: the `NULL_RUN_HANDLER` default (`instantiate.ts:65-66`) and `NULL_USE_WIDGET` are deliberate stable-signature no-ops for unbound test instantiation (the loader always binds the real `runHandler`), not orphaned dead code — and the no-op path is itself asserted at `handlerWiring.test.tsx:81-89`. No `synthesi[sz]`/`generat`/`AI`/`llm` tokens in the handler prompt (asserted at `handler.test.ts:381-402`).

### Human Verification Required

None. The three Success Criteria are fully provable programmatically and are covered by existing passing tests (DI-injected canned transport + in-memory registry → no real network/storage/IndexedDB needed). The constrained-scope security property (HANDLER-03) is the kind of behavior that is BEST verified by automated assertion (per-global `typeof === "undefined"`, blocked network/storage/key/require), which the suite does — so no human spot-check is added.

### Gaps Summary

No gaps. All 3 observable truths are VERIFIED against the codebase with file:line evidence; all required artifacts exist, are substantive, and are wired (app→`runHandler` via injected scope; `runHandler`→`handlers` store; miss→cost-gated `produceComponent`; exec→constrained denylist scope); all 3 requirement IDs (HANDLER-01/02/03) are SATISFIED; and each is backed by a named test that passes in the already-green 368/368 suite with `tsc --noEmit` clean. The phase goal — a produced app/widget gets a data operation transparently, resolved-or-produced, executed in a scope that cannot reach the network or the API key, returning a neutral `{data?,error?}` — is achieved.

Status is **passed**: all must-haves verified, no blockers, and no human-verification items were surfaced.

---

_Verified: 2026-06-25T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
