---
phase: 06-api-error-degradation
verified: 2026-06-25T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
mode: mvp
re_verification: false
---

# Phase 6: API Error Degradation — Verification Report

**Phase Goal:** When the key is missing/invalid, the API rate-limits, or generated code throws asynchronously, the user sees neutral, non-revealing recovery rather than a crash or a leak of the mechanic.
**Verified:** 2026-06-25T00:00:00Z
**Status:** passed
**Re-verification:** No — initial backfill verification (built in a streamlined flow; no PLAN/SUMMARY in phase dir — verified directly against code + existing tests)
**Mode:** mvp

## MVP-Mode Note

The phase is `mode: mvp`. The ROADMAP goal is descriptive rather than a strict User Story (`As a …, I want to …, so that ….`), so strict MVP-UAT framing cannot be auto-derived from the goal. Verification proceeded against the three concrete ROADMAP Success Criteria (the roadmap contract) and the four RESIL requirement IDs mapped to this phase. Reformatting the goal via `/gsd mvp-phase 6` is recommended for full UAT framing but is not a blocker — the Success Criteria are fully testable and all are verified in code.

**Requirement-label note:** The verification task brief labeled the requirements slightly differently from `.planning/REQUIREMENTS.md`. This report follows the authoritative REQUIREMENTS.md mapping: RESIL-01 = per-app/per-widget error boundary with neutral retry; RESIL-02 = global async backstop; RESIL-03 = 401 inline key-reconfiguration; RESIL-04 = 429 backoff + token bucket. All four capabilities are verified regardless of label.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | A render error is caught by a per-app/per-widget boundary offering a neutral retry without taking down the page | ✓ VERIFIED | `WidgetErrorBoundary.tsx:31-67` (`getDerivedStateFromError`, neutral "Unavailable right now." + working `handleRetry` re-render); wraps each widget at `widgetWrap.tsx:72-74`. Per-app: each opened app wrapped in `ErrorBoundary` keyed per instance at `Marketplace.tsx:305-333`; `ErrorBoundary.tsx:20-54` neutral "Something went wrong / Try again" retry. Technical detail swallowed (`ErrorBoundary.tsx:24-27`, `WidgetErrorBoundary.tsx:35-40` → gated logger only) |
| 2 | A throwing onClick / async effect is routed by a global async backstop (`window.onerror` + `unhandledrejection` + React `onUncaughtError`) to the same neutral handling | ✓ VERIFIED | `globalErrorBackstop.ts:69-100` installs `error`+`unhandledrejection` listeners, neutral `summarize()` (NAME only, never message), `preventDefault()` suppresses console dump; `makeReactUncaughtHandler` (102-114) feeds the SAME sink. Wired in `main.tsx:28` (`installGlobalErrorBackstop({ target: window, … })`) and `main.tsx:30-32` (`createRoot(… { onUncaughtError })`). Report sink logs only `source + summary` to the gated logger (`main.tsx:25-27`) |
| 3 | A missing/invalid key (401) degrades to an inline key-reconfiguration prompt with neutral copy and no crash; storefront stays browsable | ✓ VERIFIED | `producer.ts:399-404` (no key → `ProduceAuthError`) and `producer.ts:423-427` (401/403 via `ModelHttpError.isAuth` → `ProduceAuthError`, key never echoed). `Marketplace.tsx:175` `needsAuth = err instanceof ProduceAuthError`; renders `NeedsAuthContent` (`Marketplace.tsx:315-316`) with `onConnect` opening the existing `KeyDialog` (`Marketplace.tsx:340`). Failure is caught (try/catch `Marketplace.tsx:165-188`) into a per-app fallback region — storefront and other apps stay mounted/browsable |
| 4 | Rate limiting (429) handled with exponential backoff + jitter honoring `retry-after`, shared via a token bucket at the single egress; neutral user-visible error if exhausted | ✓ VERIFIED | `modelClient.ts:83-105` typed `ModelHttpError{status,retryAfter,body}` + `isRateLimited`; `parseRetryAfter` (118-135) handles delta-seconds AND HTTP-date. `backoff.ts:34-50` `base*2^(attempt-1)` capped, full jitter `rng()*capped`, `retry-after` override wins. `tokenBucket.ts:35-127` shared limiter (lazy refill, injected Clock, FIFO concurrency). `resilientTransport.ts:69-103` retries only 429 (`isRateLimited`), sleeps `computeBackoffDelay`, throws neutral `ModelUnavailableError` ("The service is busy right now. Please try again.") after `maxRetries`. Assembled ONCE at the single egress: `services.ts:72-80` (`TokenBucket` + `createResilientTransport`) |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/host/modelClient.ts` | `ModelHttpError{status,retryAfter,body}`, `isAuth`/`isRateLimited`, `parseRetryAfter`, typed `defaultTransport` | ✓ VERIFIED | Lines 83-105, 97-104, 118-135, 154-161 |
| `src/host/tokenBucket.ts` | Token bucket with injected Clock, lazy refill, concurrency cap | ✓ VERIFIED | `TokenBucket` class 35-127; injected `Clock` 47,52; FIFO `acquireSlot`/`releaseSlot` 81-99 |
| `src/host/backoff.ts` | Exponential backoff + full jitter, retry-after override, injected rng | ✓ VERIFIED | `computeBackoffDelay` 34-50; retry-after override 40-42; jitter 48-49 |
| `src/host/resilientTransport.ts` | `createResilientTransport` (injected Clock), `ModelUnavailableError`, 429-only retry | ✓ VERIFIED | `ModelUnavailableError` 39-46; `createResilientTransport` 69-103; non-429 propagates unchanged 87-89 |
| `src/host/globalErrorBackstop.ts` | `installGlobalErrorBackstop` + `makeReactUncaughtHandler`, injected target+sink | ✓ VERIFIED | 69-100, 108-114; `preventDefault` suppression 77-79,88-90; NAME-only summaries 57-62 |
| `src/ui/ErrorBoundary.tsx` | Per-app neutral boundary with retry | ✓ VERIFIED | Class 14-55; neutral copy + `handleRetry` 29-49 |
| `src/ui/WidgetErrorBoundary.tsx` | Per-widget neutral boundary with retry | ✓ VERIFIED | Class 25-68; per-widget isolation; retry 45-47 |
| `src/execution/producer.ts` | `ProduceAuthError` on 401/403 + missing key | ✓ VERIFIED | Class 362-367; raised 401-403, 424-427 |
| `src/ui/Marketplace.tsx` | `needsAuth` → inline `KeyDialog` reconfigure; per-app `ErrorBoundary` wrap | ✓ VERIFIED | `needsAuth` 175,181; `NeedsAuthContent`→`KeyDialog` 315-316,340; per-app wrap 305-333 |
| `src/ui/KeyDialog.tsx` | Reused inline reconfiguration dialog | ✓ VERIFIED | Imported `Marketplace.tsx:17`, rendered conditionally `Marketplace.tsx:340` |
| `src/main.tsx` | Backstop install + `onUncaughtError` wiring | ✓ VERIFIED | `installGlobalErrorBackstop` 28; `createRoot({onUncaughtError})` 30-32 |
| `src/services/services.ts` | Resilient transport assembled at single egress | ✓ VERIFIED | `createModelTransport` 72-80 (single `TokenBucket` + `createResilientTransport`) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `services.ts` | `resilientTransport.ts` | `createResilientTransport({inner,limiter,clock})` | ✓ WIRED | `services.ts:79`; single limiter instance `services.ts:73-78` |
| `resilientTransport.ts` | `tokenBucket.ts` | `opts.limiter.run(() => inner(…))` | ✓ WIRED | `resilientTransport.ts:83` |
| `resilientTransport.ts` | `backoff.ts` | `computeBackoffDelay(attempt,backoff,retryAfterSec)` | ✓ WIRED | `resilientTransport.ts:98` |
| `defaultTransport` | `ModelHttpError`/`parseRetryAfter` | throw typed on `!res.ok` | ✓ WIRED | `modelClient.ts:156-159` |
| `producer.ts` | `ProduceAuthError` | `ModelHttpError.isAuth` → throw | ✓ WIRED | `producer.ts:423-427` |
| `Marketplace.tsx` | `KeyDialog` | `needsAuth` → `NeedsAuthContent.onConnect` → `setKeyDialogOpen(true)` | ✓ WIRED | `Marketplace.tsx:175,315-316,340` |
| `Marketplace.tsx` | `ErrorBoundary` (per app) | `<ErrorBoundary key={instanceId}>` around each app | ✓ WIRED | `Marketplace.tsx:305-333` |
| `widgetWrap.tsx` | `WidgetErrorBoundary` (per widget) | `<WidgetErrorBoundary widgetType={…}>` | ✓ WIRED | `widgetWrap.tsx:72-74` |
| `main.tsx` | `globalErrorBackstop.ts` | `installGlobalErrorBackstop` + `makeReactUncaughtHandler` → gated logger | ✓ WIRED | `main.tsx:28,30-32` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| TypeScript strict typecheck | `npx tsc --noEmit` | exit 0, zero errors | ✓ PASS |
| Resilient transport (429 backoff/retry-after/exhaustion) | `npx vitest run src/host/resilientTransport.test.ts` | 7/7 passing | ✓ PASS |
| Marketplace resilience (401 → inline KeyDialog, browsable) | `npx vitest run src/ui/MarketplaceResilience.test.tsx` | 6/6 passing | ✓ PASS |
| Producer auth (no key + 401/403 → ProduceAuthError) | `npx vitest run src/execution/producerAuth.test.ts` | 4/4 passing | ✓ PASS |
| Named phase-6 tests combined | (3 files above, one run) | 3 files / 17 tests, all passing | ✓ PASS |

Per the task constraint, the full 368-test suite was NOT re-run (reported GREEN by the streamlined flow). The three named test files for this phase were run in isolation and are green; `tsc --noEmit` is clean. The named files are part of the same suite, so their green status is consistent with the reported 368/368.

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` exist and no PLAN declares probe scripts (the phase dir contains no PLAN/SUMMARY — streamlined backfill). Verification used the Vitest suite + `tsc` as the runnable checks (see Behavioral Spot-Checks). Status: N/A (no probes declared).

### Requirements Coverage

| Requirement | Description (REQUIREMENTS.md) | Status | Evidence |
| ----------- | ----------------------------- | ------ | -------- |
| RESIL-01 | Every app and widget wrapped in an error boundary that catches render errors and offers a neutral retry without taking down the page | ✓ SATISFIED | `WidgetErrorBoundary.tsx:25-68` (per-widget) wired `widgetWrap.tsx:72-74`; `ErrorBoundary.tsx:14-55` (per-app) wired `Marketplace.tsx:305-333` |
| RESIL-02 | Global async backstop (`window.onerror` + `unhandledrejection` + React `onUncaughtError`) routes uncaught async/event-handler errors to neutral handling, no revealing message surfaces | ✓ SATISFIED | `globalErrorBackstop.ts:69-114` + `main.tsx:28,30-32`; NAME-only summaries + `preventDefault` console suppression |
| RESIL-03 | Missing/invalid key (401) degrades to an inline key-reconfiguration prompt, neutral copy, no crash | ✓ SATISFIED | `producer.ts:399-404,423-427` `ProduceAuthError`; `Marketplace.tsx:175,315-316,340` inline `KeyDialog`; storefront stays mounted |
| RESIL-04 | Rate limiting (429) handled with exponential backoff + jitter honoring `retry-after`, shared via token bucket at single egress, then neutral error if exhausted | ✓ SATISFIED | `modelClient.ts:83-135` + `backoff.ts:34-50` + `tokenBucket.ts:35-127` + `resilientTransport.ts:39-103` + `services.ts:72-80` single egress; neutral `ModelUnavailableError` |

All 4 phase-6 requirement IDs (RESIL-01..04) are SATISFIED with code evidence. No orphaned requirements — REQUIREMENTS.md maps exactly these 4 IDs to Phase 6.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | — | — | No `TBD`/`FIXME`/`XXX`/`HACK` debt markers in any phase-6 source file (grep clean). No forbidden lexicon (`synthesi[sz]`) in phase-6 source. No empty-return / hardcoded-empty rendering stubs. Errors swallowed to the gated logger by design, not silently dropped. |

### Human Verification Required

None required for goal achievement. (Optional UAT, not blocking: in a real browser, confirm a 429 storm surfaces "The service is busy right now." after retries, a 401 shows the inline "Connect your account" prompt while the storefront stays browsable, and a throwing onClick produces no revealing console output. These are exercised by the green automated tests and are recommendations only.)

### Gaps Summary

No gaps. All 3 ROADMAP Success Criteria and all 4 RESIL requirements are satisfied with concrete file:line evidence. The 429 path (typed error → token bucket → backoff/jitter/retry-after → neutral exhaustion error) is assembled once at the single egress (`services.ts:72-80`); the 401 path degrades to the inline reused `KeyDialog` while the storefront stays mounted; per-app and per-widget error boundaries each offer a working neutral retry; and the global async backstop (window listeners + React `onUncaughtError`) routes uncaught async/event-handler errors to NAME-only gated logging with console suppression. `tsc --noEmit` is clean and the three named test files pass (17/17), consistent with the reported GREEN 368-suite. Status is `passed`.

---

_Verified: 2026-06-25T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
