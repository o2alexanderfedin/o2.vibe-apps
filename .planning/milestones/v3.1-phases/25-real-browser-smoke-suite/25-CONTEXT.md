# Phase 25: Real-Browser Smoke Suite - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Permanently close the Phase 21 and Phase 22 `human_needed` gaps with automated Playwright tests that run headless in CI.

Requirements: SMOKE-01, SMOKE-02, SMOKE-03.
</domain>

<decisions>
## Implementation Decisions

### Settled (binding)
- **Extend the EXISTING Playwright harness** — `playwright.config.ts` + `e2e/` (Phase 20 added `e2e/frame-isolation.spec.ts`; `npm run e2e` = `playwright test`). Add the smoke tests there; do not invent a new harness or runner.
- **Playwright is devDependency-only** (`@playwright/test`, already present). ZERO new runtime deps. These tests are NOT part of the vitest unit suite — they run via `npm run e2e`.
- **Three smoke tests, one per requirement:**
  - SMOKE-01 (Phase 21): open windows → move → hard reload → all windows reappear at saved position/geometry/z-order/minimized state (desktop not blank).
  - SMOKE-02 (Phase 22): activate a custom theme → hard reload → custom theme colors on first paint, NO Aurora/default flash before React hydrates.
  - SMOKE-03 (Phase 23): switch theme while an app is open → the frame is NOT reloaded and the new theme colors appear in the frame within ~1 animation frame; in-frame state survives.
- **No production-code change is expected** — this phase is test-only. If a test reveals a real defect, fix it (and note the deviation); otherwise touch only `e2e/` (+ config if strictly needed).
- Cross-cutting: hygiene lexicon gate stays green (e2e spec text must not narrate the on-demand mechanic / banned tokens / iframe-sandbox-isolation in user-visible-style copy — but test code is not a devtools-visible surface; still avoid banned tokens in any srcdoc/UI assertions per the gate's scope); zero new runtime deps; the existing vitest suite (936) stays green and is unaffected.

### Claude's Discretion
- How each test seeds state (drive the real UI via Playwright actions vs. pre-seed IDB/localStorage via `page.evaluate`/`addInitScript`) — at Claude's discretion, simplest reliable approach. For SMOKE-02's "first paint / no flash", prefer asserting the FOUC script's effect before hydration (e.g., check `:root` computed vars immediately after `goto`, or that the default theme's signature color never appears) using the established Playwright patterns from `frame-isolation.spec.ts`.
- Whether SMOKE tests need an API key / live generation — prefer the in-tree/seeded path used by the existing e2e spec so tests are deterministic and keyless.

</decisions>

<code_context>
## Existing Code Insights

`e2e/frame-isolation.spec.ts` (Phase 20) is the reference for: launching the app, the Playwright config (`playwright.config.ts` — likely a `webServer` block running the dev/preview server), how it seeds/asserts inside opaque frames, and origin/storage handling. The planner's research will pin the exact harness shape (webServer command, baseURL, how state is seeded, how frame contents are asserted) so the 3 new specs follow the same patterns.

</code_context>

<specifics>
## Specific Ideas

Success criteria (binding):
1. Playwright: after hard reload, all open windows reappear at saved position/geometry/z-order/minimized — desktop not blank.
2. Playwright: with a custom theme active, hard reload shows custom theme on first paint — no Aurora flash before hydration.
3. Playwright: theme switch while an app open → frame NOT reloaded, new colors appear within ~1 frame, in-frame state survives.
4. All three run in headless Chromium (CI); no `human_needed` annotations remain for these three behaviors.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.
</deferred>
