---
phase: 01-hygiene-foundation-storefront-shell
plan: 03
subsystem: foundation
tags: [cache-key, sha-256, web-crypto, anthropic, egress-stub, tdd, hygiene, opacity, headers]

# Dependency graph
requires:
  - 01-01: Vitest 4 + jsdom test infrastructure (vite.config.ts test block, src/test/setup.ts)
provides:
  - cacheKey(input) — deterministic, normalization-stable, 64-hex opaque SHA-256 cache-key derivation (LOOP-02)
  - modelClient single Anthropic egress stub — buildHeaders (4 mandatory headers) + ANTHROPIC_API_BASE + ANTHROPIC_MODEL + assertAnthropicTarget seam, no network call (HYGIENE-05)
  - src/test/setup.ts node-env guard so per-file `// @vitest-environment node` tests can load the shared setup
affects:
  - Phase 2/3: every registry read/write derives its key via cacheKey before cache hit/miss resolution
  - Phase 3: wires the real fetch into modelClient; buildHeaders + assertAnthropicTarget already locked
  - All future node-env tests: can rely on the matchMedia stub being skipped under node

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Opaque cache key: normalize (NFC -> toLowerCase -> trim -> collapse whitespace) -> crypto.subtle.digest SHA-256 -> 64-char lowercase hex; slug hashed INTO input, never prepended to output"
    - "Single egress chokepoint: only modelClient.ts names the external host; Phase 1 assembles headers but performs no I/O"
    - "Key-never-leaks: access key received at call time, returned only in the result object, never stored module-level, never logged (proven by console.* spy test)"
    - "Node-env per-file test pragma for Web Crypto: jsdom key-shim breaks crypto.subtle.digest, so cacheKey.test.ts runs under node"

key-files:
  created:
    - src/registry/cacheKey.ts
    - src/registry/cacheKey.test.ts
    - src/host/modelClient.ts
    - src/host/modelClient.test.ts
  modified:
    - src/test/setup.ts

key-decisions:
  - "cacheKey.test.ts runs under the node environment (`// @vitest-environment node` first line) — jsdom's ArrayBuffer key-shim makes crypto.subtle.digest throw (vitest #5365, closed not-planned). The function is pure/DOM-free so node is correct."
  - "Guarded the shared src/test/setup.ts matchMedia stub with `typeof window !== 'undefined'` so node-env test files can load the shared setup without a ReferenceError (Rule 3 blocking fix)."
  - "Used the dated model id claude-haiku-4-5-20251001 (not the floating alias) so cache-key determinism is not invalidated by an alias repoint."
  - "anthropic-dangerous-direct-browser-access: true is locked now (mandatory for browser CORS) even though no call is made until Phase 3."
  - "assertAnthropicTarget is a Phase-1 no-op seam — the call site exists and is wired; Phase 3 makes it enforce the origin. No fetch in Phase 1 (D-34)."

requirements-completed: [LOOP-02, HYGIENE-05]

# Metrics
duration: 3min
completed: 2026-06-24
---

# Phase 01 Plan 03: cacheKey + Anthropic Egress Stub Summary

**Opaque SHA-256 cache-key derivation over normalized input (LOOP-02) and the single Anthropic egress header stub with a proven key-never-leaks guarantee (HYGIENE-05) — both written test-first (RED→GREEN), 12 tests green, tsc clean.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-24T22:41:53Z
- **Completed:** 2026-06-24T22:45:20Z
- **Tasks:** 2 (each a RED→GREEN TDD pair)
- **Files created:** 4 · **Files modified:** 1

## Accomplishments

- `cacheKey(input)` derives a deterministic, normalization-stable, 64-char lowercase hex SHA-256 key. `"Weather "`, `"weather"`, `"WEATHER "`, and `"a   b"` vs `"a b"` all collapse to the same key; emoji/CJK input (`"weather ☀️ 天气"`) does not throw; the output is opaque (no readable type slug); `weather` ≠ `calculator`.
- `modelClient.ts` is the single Anthropic egress stub: `buildHeaders(apiKey)` returns exactly the 4 mandatory headers (`content-type`, `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`), exposes `ANTHROPIC_API_BASE` + dated `ANTHROPIC_MODEL`, and ships an `assertAnthropicTarget` origin-assert seam. It makes **no** network call in Phase 1.
- Key-never-leaks is **proven by test**: a spy over `console.log/info/warn/error/debug` asserts none fire during `buildHeaders`; the key is received at call time, returned only in the result object, and never retained module-level between calls.
- Both required test files run together correctly under their respective environments — `cacheKey.test.ts` under node, `modelClient.test.ts` under jsdom — 12 tests green; `npx tsc --noEmit` passes.

## Task Commits

Each task is an atomic TDD RED→GREEN pair:

1. **Task 1: cacheKey (opaque SHA-256 over normalized input, node env)**
   - RED: `30476de` — `test(01-03): add failing cacheKey tests`
   - GREEN: `26e5738` — `feat(01-03): implement opaque cacheKey`
2. **Task 2: modelClient (Anthropic egress stub, key-never-leaks)**
   - RED: `d63e463` — `test(01-03): add failing modelClient header tests`
   - GREEN: `492085c` — `feat(01-03): implement Anthropic egress header stub`

## Files Created/Modified

- `src/registry/cacheKey.ts` (created) — `async cacheKey(input)`: NFC→lower→trim→collapse normalization (exact D-25 order) → `crypto.subtle.digest("SHA-256", …)` → 64-hex; no base64, no slug prefix.
- `src/registry/cacheKey.test.ts` (created) — first line `// @vitest-environment node`; 7 behaviors: determinism, normalization equivalence, whitespace collapse, 64-hex format, opacity (no slug leak), unicode/emoji safety, collision distinctness.
- `src/host/modelClient.ts` (created) — `buildHeaders`, `ANTHROPIC_API_BASE`, `ANTHROPIC_MODEL`, `assertAnthropicTarget` (Phase-1 no-op). No fetch.
- `src/host/modelClient.test.ts` (created) — 5 behaviors: constants, exact 4-header object, console-spy key-safety, no module-level key retention, no-op seam.
- `src/test/setup.ts` (modified) — guarded the `window.matchMedia` stub with `typeof window !== "undefined"` so node-env tests can load the shared setup.

## Decisions Made

- **cacheKey test runs under node, not jsdom.** jsdom's ArrayBuffer key-shim makes `crypto.subtle.digest` throw a TypeError (vitest #5365, closed not-planned). `cacheKey` is pure and DOM-free, so the node environment is correct; the per-file pragma is the documented escape hatch.
- **Dated model id, not the alias.** `claude-haiku-4-5-20251001` is used so a future alias repoint cannot silently invalidate cache-key determinism downstream.
- **`anthropic-dangerous-direct-browser-access: true` locked now.** It is mandatory for the browser→Anthropic CORS path (Phase 3); locking it in Phase 1 keeps the header set correct. It reveals nothing beyond the request URL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Guarded shared test setup for the node environment**
- **Found during:** Task 1 (first RED run of the node-env test)
- **Issue:** `src/test/setup.ts` (shared `setupFiles`, authored in Plan 01) calls `Object.defineProperty(window, "matchMedia", …)` unconditionally. Under the node environment that `cacheKey.test.ts` requires, `window` is undefined, so the setup threw `ReferenceError: window is not defined` before any cacheKey assertion could run — masking the true RED.
- **Fix:** Wrapped the `matchMedia` stub in `if (typeof window !== "undefined") { … }`. Under jsdom `window` exists and the stub installs exactly as before (no behavior change for existing jsdom tests); under node it is correctly skipped.
- **Files modified:** `src/test/setup.ts`
- **Commit:** `30476de` (included in the Task 1 RED commit, since the fix is required for the node-env test to load at all)

## Authentication Gates

None — Phase 1 makes no Anthropic call; no API key is required to complete this plan.

## TDD Gate Compliance

Gate sequence verified in git log for each module: a `test(01-03)` RED commit precedes its `feat(01-03)` GREEN commit (`30476de`→`26e5738`, `d63e463`→`492085c`). Both modules confirmed RED before implementation (cacheKey failed on missing `./cacheKey`; modelClient failed on missing `./modelClient`). No REFACTOR commit was needed. No test passed unexpectedly during RED.

## Known Stubs

- `src/host/modelClient.ts` — `assertAnthropicTarget` is an **intentional** Phase-1 no-op seam (D-34/D-36). The call site is wired now; Phase 3 makes it enforce `new URL(url).origin === ANTHROPIC_API_BASE`. This is documented in CONTEXT.md and the plan's threat register (T-01-13) as the deliberate egress seam, and does not block the plan's goal — Phase 1 explicitly performs no I/O.

## Threat Flags

None — no security-relevant surface beyond the plan's `<threat_model>` was introduced. The two boundaries (Anthropic network edge, cache-key opacity) are exactly the ones the plan mitigates: T-01-11 (no slug in key output — tested), T-01-12 (key never logged — tested via console spy), T-01-13 (no fetch in Phase 1 — verified), T-01-14 (native SHA-256, no hand-rolled hash).

---

## Self-Check

- [x] `src/registry/cacheKey.ts` exists
- [x] `src/registry/cacheKey.test.ts` exists with `// @vitest-environment node` as line 1
- [x] `src/host/modelClient.ts` exists
- [x] `src/host/modelClient.test.ts` exists
- [x] `src/test/setup.ts` modified (matchMedia stub guarded for node)
- [x] Commits 30476de, 26e5738, d63e463, 492085c exist in git log
- [x] `npx vitest run src/registry/cacheKey.test.ts src/host/modelClient.test.ts` → 12/12 passing
- [x] `npx tsc --noEmit` exits 0
- [x] `cacheKey.ts` contains `crypto.subtle.digest("SHA-256"` and does NOT contain the `btoa` token
- [x] `modelClient.ts` contains the 4 mandatory headers + dated model id and no `fetch(`/`axios`

## Self-Check: PASSED

*Phase: 01-hygiene-foundation-storefront-shell*
*Completed: 2026-06-24*
