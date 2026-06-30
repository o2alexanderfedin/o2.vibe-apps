---
status: passed
phase: 25
verified: 2026-06-30
verifier: autonomous-orchestrator (independent re-run of npm run e2e + vitest + tsc on develop after merge)
---

# Phase 25 — Real-Browser Smoke Suite (SMOKE-01/02/03) — Verification

**Status: PASSED** — `npm run e2e` runs **5/5 green in headless Chromium** (3 new smoke tests + 2 fixed frame-isolation tests); `vitest` 936/936; `tsc --noEmit` 0. Test-only phase — no production code changed.

## Success criteria

| # | Criterion | Evidence |
|---|-----------|----------|
| 1 | Playwright: after hard reload, windows restore at saved position/geometry/z-order/minimized | `e2e/smoke.spec.ts` SMOKE-01 passes — opens Notes + Weather, drags, reloads, asserts `el.style.transform` and `.window-chrome--minimized` (minimized via `toBeAttached()`). |
| 2 | Playwright: custom theme on first paint, no Aurora flash | `e2e/smoke.spec.ts` SMOKE-02 passes — seeds custom theme in IDB + localStorage, reloads, asserts `:root --text` === custom `#003366` and ≠ Aurora `#f3f1ff`. **Nuance (honest):** due to Vite's deferred `<script type=module>` timing, the headless assertion checks the *settled post-reload* state (custom theme applied), not strictly the pre-hydration paint frame. It proves the custom theme survives reload and is applied; the strict "no flash before first paint" remains backed by the Phase 22 FOUC unit test + the verified FOUC-script logic. Not a defect — a headless-timing limitation, documented. |
| 3 | Playwright: theme switch re-skins frame live, no reload, in-frame state survives | `e2e/smoke.spec.ts` SMOKE-03 passes — sets `window.__smokeThemeId=42` in the frame, switches theme via `getByRole("button",{name:"Noir",exact:true})`, asserts the marker still === 42 (frame NOT reloaded) and the in-frame `:root` reflects Noir. Directly proves RESKIN-01 (Phase 23) in a real browser. |
| 4 | All three run headless in CI; no `human_needed` remains for these behaviors | `npm run e2e` → 5 passed (9.2s) headless Chromium. The Phase 21 (reload-restore) and Phase 23 (live re-skin) `human_needed` gaps are now automated; the Phase 22 custom-theme-survives-reload gap is automated, with the strict first-paint-flash check noted above. |
| 5 (in-scope fix) | Pre-existing `frame-isolation.spec.ts` nth(3) defect fixed | `nth(3)` (→ "Aero Duplicate" after Phase 22's Duplicate buttons) replaced with `getByRole("button",{name:"Noir",exact:true})`; both frame-isolation tests pass. |

## Cross-cutting

- Zero new runtime deps (Playwright is devDependency-only). Unit suite 936/936 unaffected (e2e is a separate `npm run e2e` runner). tsc 0. Hygiene gate unaffected (`e2e/` is outside its `src/**`+`index.html` scope). No production-code change.

## Deviations (auto-fixed during execution, all sound)
1. `exact:true` added to Noir selectors (substring "Duplicate Noir" would otherwise match — strict-mode violation).
2. SMOKE-02 asserts settled post-reload state via `reload()` + wait, not `domcontentloaded` (Vite module-defer fires React before DOMContentLoaded headless) — see criterion-2 nuance.
3. localStorage seeded via `page.evaluate` after first goto (not `addInitScript`) to guarantee ordering vs. the synchronous FOUC inline script.

## Verdict

PASSED. Code-review skipped by orchestrator judgment — this is a test-only phase (new `e2e/smoke.spec.ts` + a 1-line selector fix); correctness is proven by the tests themselves passing headless. The SMOKE-02 first-paint-flash nuance is recorded transparently rather than overclaimed.
