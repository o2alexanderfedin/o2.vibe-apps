---
phase: 01-hygiene-foundation-storefront-shell
verified: 2026-06-24T23:02:38Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
mode: mvp
re_verification: false
human_verification:
  - test: "Full F12 devtools audit of the running app (Network + Console + Elements + Application tabs)"
    expected: "No authored surface (symbols, IndexedDB store/key names, console output, CSS classes, data-* attrs, copy, localStorage keys) narrates the on-demand mechanic. Note: the shipped JS bundle contains the substring 'generating' from React-internal SSR code (react-dom); this is third-party library text, unrelated to this project's mechanic, and outside the HYGIENE-03 gate's authored-source scope."
    why_human: "Visual/devtools inspection across multiple browser panels cannot be fully automated; SC4 explicitly calls for a 'repo-wide F12 audit'."
  - test: "User-flow walk-through in a real browser (npm run dev): land on storefront, click a card, open Account dialog, set/change/clear an sk-ant- key, cycle theme light→dark→system, reload to confirm theme + key persist"
    expected: "8-card grid renders; clicking a card shows inline 'Opening…' for ~800ms then resets; Account dialog set/change/disconnect flows work; invalid key shows the neutral format error and is not saved; theme toggle cycles and applies data-theme on :root; reload preserves theme (FOUC) and key"
    why_human: "Interactive UI behavior, visual rendering, ~800ms timing, and persistence-across-reload are user-observable behaviors that automated unit tests approximate but do not fully prove end-to-end in a real browser."
  - test: "(MVP-mode goal format) ROADMAP Phase 1 goal is descriptive, not in strict 'As a …, I want to …, so that ….' User-Story form"
    expected: "For full MVP-mode UAT framing, run /gsd mvp-phase 1 to reformat the goal as a User Story. Verification proceeded against the 4 explicit Success Criteria (the roadmap contract) and the per-plan User-Story goals, all of which are fully testable — so this is a recommendation, not a blocker."
    why_human: "Goal-format reformatting is a human/workflow decision; it does not affect whether the phase deliverables exist and work."
---

# Phase 1: Hygiene Foundation & Storefront Shell — Verification Report

**Phase Goal:** A user lands on a real marketplace storefront, can activate the platform with their own key and pick a theme, while every foundational hygiene, key-handling, and security control is baked in before any data is stored or any model is called.
**Verified:** 2026-06-24T23:02:38Z
**Status:** human_needed
**Re-verification:** No — initial verification
**Mode:** mvp

## MVP-Mode Note

The phase is `mode: mvp`. The ROADMAP goal is descriptive rather than a strict User Story (`user-story.validate` → `false`), so strict MVP UAT framing cannot be auto-derived from the goal. However, each PLAN ships a proper `<phase_goal>` User Story (e.g. 01-02: "As a visitor, I want to browse the storefront, connect my account with my own key, and pick a theme, so that the platform looks native to me and is ready to open apps.") and the ROADMAP defines four concrete, fully-testable Success Criteria. Verification proceeded against those Success Criteria (the roadmap contract). Reformatting the goal via `/gsd mvp-phase 1` is recommended but is not a blocker — see human_verification.

## User Flow Coverage

User story (from plan 01-02): «As a visitor, I want to browse the storefront, connect my account with my own key, and pick a theme, so that the platform looks native to me and is ready to open apps.»

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Land on storefront | Grid of 8 app-type cards renders | `src/ui/Marketplace.tsx:48-74` maps `APP_REGISTRY` (8 entries, `src/data/appRegistry.ts:11-60`) to `.storefront-grid` `.app-card` buttons | ✓ |
| Click a card | Inline "Opening…" affordance ~800ms then resets (SHELL-02 stub) | `src/ui/Marketplace.tsx:37-46,65-69` (`OPENING_RESET_MS=800`, `setTimeout` reset, `role="status"`) | ✓ |
| Open Account dialog | AppBar Account button opens KeyDialog | `src/ui/AppBar.tsx:29-37` (Account button) → `src/App.tsx:26,30-32` (lifts open state, renders `KeyDialog`) | ✓ |
| Set/change/clear key | 3 flows; `sk-ant-` validation; neutral error; persists under `marketplace.apiKey`; key never echoed/logged | `src/ui/KeyDialog.tsx` (`set`/`status`/`confirm-clear` views, `isValidKeyFormat` line 16, `FORMAT_ERROR` literal line 13, `STORAGE_KEY_API` r/w lines 91,102) | ✓ |
| Pick a theme | Cycle light→dark→system; applies `data-theme` on `:root`; persists under `marketplace.theme`; system tracks `prefers-color-scheme` | `src/ui/ThemeProvider.tsx` (`applyTheme`/`setAttribute("data-theme")` line 47, `nextMode` cycle 51-60, matchMedia `addEventListener("change")` 72-75, persist 82) | ✓ |
| Outcome | Platform looks native and is ready to open apps; foundation (storage, hygiene, key-handling, security) baked in | Registry probe+Map fallback, gated logger, CSP, sourcemaps-off, opaque cacheKey, egress stub, lexicon gate — all verified below | ✓ (human UAT pending) |

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Storefront renders a grid of 8 fixed-width app-type cards | ✓ VERIFIED | `Marketplace.tsx` renders `.storefront-grid` over `APP_REGISTRY` (8 ids: weather/calculator/notes/timer/currency/recipes/calendar/budget verified in `appRegistry.ts`) |
| 2 | Clicking a card shows inline "Opening…" ~800ms then resets (SHELL-02 stub, no real loop) | ✓ VERIFIED | `Marketplace.tsx:30,42-45` 800ms setTimeout reset; neutral `logger.info("Opening "+id)`; no real resolve loop (correct for Phase 1) |
| 3 | User can set/change/clear API key from Account dialog, persisted under `marketplace.apiKey` | ✓ VERIFIED | `KeyDialog.tsx` three flows; `STORAGE_KEY_API="marketplace.apiKey"` (`storage.ts:3`) used for read/write/remove |
| 4 | Invalid key (not `sk-ant-`) shows neutral inline error, not saved, never echoed | ✓ VERIFIED | `isValidKeyFormat=/^sk-ant-/`; fixed `FORMAT_ERROR` literal never interpolates input; save guarded behind validation (`KeyDialog.tsx:84-89`) |
| 5 | Theme cycles light→dark→system, applies `data-theme` on `:root`, persists under `marketplace.theme` | ✓ VERIFIED | `ThemeProvider.tsx` `setAttribute("data-theme",…)`, `nextMode` cycle, `STORAGE_KEY_THEME` persist; `theme.test.tsx` 6/6 green |
| 6 | System theme mode tracks `prefers-color-scheme` via matchMedia | ✓ VERIFIED | `ThemeProvider.tsx:39,72-75` `matchMedia("(prefers-color-scheme: dark)")` + `addEventListener("change")`; test "re-applies … when change listener fires" green |
| 7 | Registry performs real IndexedDB probe write+delete at startup, resolves `dbReady` | ✓ VERIFIED | `registry.ts:29-47` opens DB, `put("apps",{__probe:true},"__probe__")` + `delete`; `db.ts` creates apps/widgets/handlers stores; test "probe key does NOT remain" green |
| 8 | When storage unavailable, registry degrades to in-memory Map via identical async interface | ✓ VERIFIED | `registry.ts:14-26,51-83` `storageAvailable` flag + per-store Maps; callers never branch; fallback test (openRegistry rejects → Map round-trip) green |
| 9 | `npm run build` → no `.map` in dist (sourcemaps off); `vite.config.ts` `sourcemap:false`; `tsc --noEmit` passes | ✓ VERIFIED | `vite.config.ts:8` `sourcemap:false`; build succeeded, `find dist -name '*.map'` = 0; `tsc --noEmit` exit 0 |
| 10 | Gated logger silent unless `localStorage.debug` truthy at load; `[Marketplace]` prefix when on; key never logged | ✓ VERIFIED | `logger.ts` gate read once at load, `[Marketplace]` prefix; no `console.*` outside logger; `logger.test.ts` 7/7 green; key never passed in |
| 11 | cacheKey opaque 64-hex SHA-256 over NFC→lower→trim→collapse normalized input; modelClient builds 4 Anthropic headers, key never leaks | ✓ VERIFIED | `cacheKey.ts` exact normalization + `crypto.subtle.digest("SHA-256")`, no btoa/slug; `modelClient.ts` 4 headers + dated model + no fetch; 12 tests green incl. console-spy key-safety |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `vite.config.ts` | sourcemap:false + Vitest block | ✓ VERIFIED | `sourcemap:false`, minify, es2020, jsdom + setup.ts |
| `index.html` | CSP + FOUC script + #root | ✓ VERIFIED | exact `connect-src 'self' https://api.anthropic.com`; FOUC reads `marketplace.theme`, sets `data-theme`; `'unsafe-eval'` reserved (neutral comment) |
| `src/registry/db.ts` | idb DBSchema + 3 stores | ✓ VERIFIED | `"MarketplaceRegistry"` v1; creates apps/widgets/handlers |
| `src/registry/registry.ts` | init+probe+fallback, dbReady, get/put/del | ✓ VERIFIED | probe write+delete, guarded `navigator.storage.persist()`, Map fallback, unified async interface |
| `src/lib/logger.ts` | gated logger, `[Marketplace]` | ✓ VERIFIED | gate read once at load; off by default; key never passed |
| `src/lib/storage.ts` | neutral key constants | ✓ VERIFIED | `STORAGE_KEY_API="marketplace.apiKey"`, `STORAGE_KEY_THEME="marketplace.theme"` |
| `src/ui/Marketplace.tsx` | grid + Opening… stub | ✓ VERIFIED | `.storefront-grid`, 8 cards, 800ms stub |
| `src/ui/ThemeProvider.tsx` | data-theme + matchMedia listener | ✓ VERIFIED | setAttribute + addEventListener('change'); default system |
| `src/ui/KeyDialog.tsx` | set/change/clear + sk-ant- validation | ✓ VERIFIED | 3 flows; `^sk-ant-`; key never echoed/logged |
| `src/ui/AppBar.tsx` | wordmark + Account + theme toggle | ✓ VERIFIED | "Marketplace" wordmark, Account button, Sun/Moon/Monitor toggle |
| `src/data/appRegistry.ts` | static APP_REGISTRY (8 types) | ✓ VERIFIED | 8 neutral entries with exact copy |
| `src/ui/ErrorBoundary.tsx` | neutral error container (Phase-1 stub) | ✓ VERIFIED | class component, neutral copy, swallows technical detail |
| `src/ui/SkeletonCard.tsx` | loading-state stub (Phase-3) | ✓ VERIFIED | a11y affordances, neutral "Opening…", compiles |
| `src/registry/cacheKey.ts` | opaque SHA-256 derivation | ✓ VERIFIED | normalize→digest→64-hex; no btoa/slug-prefix |
| `src/host/modelClient.ts` | egress header stub (no fetch) | ✓ VERIFIED | 4 headers, dated model, no-op assert seam, no I/O |
| `src/hygiene.test.ts` | lexicon-grep CI gate | ✓ VERIFIED | fs walk + per-line regex; self-excludes; banned set per D-39; passes green; self-verified RED on injection |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `App.tsx` | `registry/registry.ts` | `await dbReady` in useEffect | ✓ WIRED | `App.tsx:2,17-21` imports + awaits `dbReady` |
| `index.html` | `localStorage marketplace.theme` | FOUC script sets data-theme pre-mount | ✓ WIRED | `index.html:14-21` reads `marketplace.theme`, sets `data-theme` |
| `KeyDialog.tsx` | `localStorage marketplace.apiKey` | `STORAGE_KEY_API` from storage.ts | ✓ WIRED | imports constant; r/w/remove at lines 91,102,20-26 |
| `ThemeProvider.tsx` | `:root data-theme` | setAttribute + matchMedia change | ✓ WIRED | lines 47,72-75 |
| `App.tsx` | `ThemeProvider/AppBar/Marketplace` | component tree | ✓ WIRED | `App.tsx:24-34` full tree wired |
| `AppBar.tsx` | `KeyDialog` (open) | `onOpenAccount` callback | ✓ WIRED | AppBar button → App lifts state → renders KeyDialog |
| `cacheKey.ts` | `crypto.subtle.digest` | SHA-256 over TextEncoder(normalized) | ✓ WIRED | `cacheKey.ts:15` |
| `modelClient.ts` | Anthropic headers | buildHeaders 4-header set | ✓ WIRED | `modelClient.ts:24-31` |
| `hygiene.test.ts` | `src/** + index.html` | fs walk + regex scan | ✓ WIRED | `readdirSync`/`readFileSync`, scans >5 files |
| `cacheKey` → consumer | (none yet) | — | ⏳ DEFERRED | Phase 2 consumer (by design — "before any data is stored") |
| `modelClient` → consumer | (none yet) | — | ⏳ DEFERRED | Phase 3 consumer (by design — "before any model is called") |
| registry `get/put/del` → consumer | (none yet, only `dbReady`) | — | ⏳ DEFERRED | Phase 2 consumer (foundation primitive) |

**Note on deferred links:** `cacheKey`, `modelClient`, and registry `get/put/del` are intentionally not yet consumed. The phase goal explicitly bakes these in "before any data is stored or any model is called." They are tested, substantive, exported modules awaiting their declared Phase 2/3 consumers — NOT orphaned stubs.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `Marketplace.tsx` | `APP_REGISTRY` | `src/data/appRegistry.ts` (static catalog of 8) | Yes — real static data rendered into grid | ✓ FLOWING |
| `ThemeProvider.tsx` | `mode` | `readStoredMode()` localStorage + matchMedia | Yes — drives data-theme on :root | ✓ FLOWING |
| `KeyDialog.tsx` | `hasKey`/`keyInput` | localStorage `marketplace.apiKey` | Yes — real persistence round-trip | ✓ FLOWING |
| `AppBar.tsx` | `mode` | `useTheme()` context | Yes — real theme state | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| TypeScript strict typecheck | `npx tsc --noEmit` | exit 0, zero errors | ✓ PASS |
| Full test suite (Vitest) | `npx vitest run` | 6 files / 36 tests, all passing | ✓ PASS |
| Production build | `npx vite build` | built in 185ms, succeeded | ✓ PASS |
| No sourcemaps in dist | `find dist -name '*.map'` | 0 files | ✓ PASS |
| Hygiene gate green on real source | `npx vitest run src/hygiene.test.ts` | 2/2 passing | ✓ PASS |
| Hygiene gate self-verifies (RED on inject) | inject `/* synthesize */` into `src/index.css`, run gate | gate FAILED (detected `synthesi[sz]`), then reverted clean (git diff empty), re-ran green | ✓ PASS |
| Babel runtime dep + jsdom devdep | `node -e` package.json check | babel in deps (not devDeps); jsdom in devDeps | ✓ PASS |
| No console.* outside logger | grep `console.` in src (excl. logger/tests/setup) | none | ✓ PASS |
| Key never logged | grep logger ref in KeyDialog | only a comment stating key is NOT passed | ✓ PASS |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` exist and no PLAN declares probe scripts. Verification used the project's Vitest suite + build pipeline as the runnable checks (see Behavioral Spot-Checks). Status: N/A (no probes declared).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SHELL-01 | 01-02 | Marketplace storefront grid of app types | ✓ SATISFIED | `Marketplace.tsx` + `appRegistry.ts` (8 cards) |
| SHELL-02 | 01-02 | Open an app from the grid | ✓ SATISFIED | Card click → "Opening…" stub (Phase-1 scope, real loop is Phase 2) |
| SHELL-03 | 01-02 | Set/change/clear own key, stored locally, framed as activation | ✓ SATISFIED | `KeyDialog.tsx` 3 flows, `marketplace.apiKey`, neutral "Connect your account" copy |
| SHELL-04 | 01-02 | Light/dark/system theme via CSS vars on :root | ✓ SATISFIED | `ThemeProvider.tsx` + `index.css` variable contract |
| LOOP-02 | 01-03 | SHA-256 cache keys over normalized input, opaque | ✓ SATISFIED | `cacheKey.ts` + 7 tests (opacity, normalization, unicode) |
| LOOP-03 | 01-01 | Single IndexedDB (apps/widgets/handlers) + probe + Map fallback | ✓ SATISFIED | `db.ts` 3 stores + `registry.ts` probe + Map fallback; 9 tests |
| HYGIENE-01 | 01-01/02/04 | No devtools-visible surface narrates the mechanic | ✓ SATISFIED (authored source) | Neutral naming throughout; gate green on `src/**`+`index.html`. See INFO on React-internal "generating" in bundle + human F12 audit |
| HYGIENE-02 | 01-01/04 | "synthesize" family appears nowhere | ✓ SATISFIED | gate `/synthesi[sz]/i` green on real source; `sourcemap:false` |
| HYGIENE-03 | 01-04 | CI lexicon-grep gate fails banned tokens | ✓ SATISFIED | `hygiene.test.ts` wired into `npm run test`; self-verified RED on injection |
| HYGIENE-04 | 01-01 | Logging off by default, gated behind localStorage.debug, neutral | ✓ SATISFIED | `logger.ts` gate; `logger.test.ts` 7/7 |
| HYGIENE-05 | 01-03 | Anthropic request neutral; key only to api.anthropic.com, never logged/proxied | ✓ SATISFIED | `modelClient.ts` single chokepoint, 4 headers, key never logged (console-spy test) |
| SEC-04 | 01-01 | CSP restricts connect-src to 'self' https://api.anthropic.com | ✓ SATISFIED | `index.html` exact CSP clause |

**All 12 phase requirement IDs accounted for. No orphaned requirements** — REQUIREMENTS.md maps exactly these 12 IDs to Phase 1 (SHELL-01..04, LOOP-02, LOOP-03, HYGIENE-01..05, SEC-04), and every one appears in a plan's `requirements` frontmatter and is satisfied in the codebase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `dist/assets/index-*.js` | — | substring "generating" (from React/react-dom internals) | ℹ️ Info | Third-party bundled library text, NOT authored source; unrelated to this project's mechanic; outside HYGIENE-03 gate scope (authored `src/**`+`index.html`). Confirmed absent from authored source. Worth confirming in the human F12 audit but not a project hygiene violation. |
| `src/ui/SkeletonCard.tsx` | 1 | comment "placeholder for a future loading state" | ℹ️ Info | Documented intentional Phase-3 stub (UI-SPEC §4); neutral copy; not a debt marker |
| `src/ui/KeyDialog.tsx` | 152 | `placeholder=` HTML attribute | ℹ️ Info | Legitimate input UX copy ("Paste your access key"), not a stub indicator |

**No TBD/FIXME/XXX/TODO/HACK debt markers** in any phase-modified source file. No empty-return or hardcoded-empty-data stubs in rendering paths. Registry `get/put/del`, `cacheKey`, and `modelClient` are unconsumed by design (foundation primitives for Phase 2/3), not orphaned dead code.

### Human Verification Required

1. **Full F12 devtools audit** — Inspect Network, Console, Elements, and Application tabs of the running app. Confirm no authored surface narrates the on-demand mechanic. INFO: the shipped JS bundle contains "generating" from React-internal SSR code — third-party text, not this project's mechanic, and outside the gate's authored-source scope.

2. **User-flow walk-through (`npm run dev`)** — Land on storefront → 8-card grid; click a card → "Opening…" ~800ms then reset; open Account → set/change/disconnect an `sk-ant-` key (invalid key shows neutral error, not saved); cycle theme light→dark→system (applies `data-theme` on `:root`); reload → theme + key persist.

3. **(Recommendation) MVP goal format** — The ROADMAP Phase 1 goal is descriptive, not a strict User Story. Consider `/gsd mvp-phase 1` to reformat for full MVP UAT framing. Not a blocker — the 4 Success Criteria are fully testable and all verified.

### Gaps Summary

No gaps. All 11 observable truths are VERIFIED against the codebase, all 16 required artifacts exist/are substantive/are wired (or deferred by design), all 9 active key links are WIRED, all 12 requirement IDs are SATISFIED, the hard checkpoints (tsc, vitest, build, no .map, CSP, neutral keys, key-never-logged, sourcemap:false) all pass, and the hygiene gate self-verifies (red on banned-token injection, green after revert).

Status is **human_needed** (not `passed`) solely because the verification process surfaced human-verification items: the SC4-mandated repo-wide F12 audit and the interactive user-flow/persistence walk-through are user-observable behaviors that automated unit tests approximate but cannot fully prove end-to-end. Per the status decision tree, any non-empty human-verification section forces `human_needed` even when the score is N/N. No blocking gaps exist; awaiting human confirmation of the two UAT items.

---

_Verified: 2026-06-24T23:02:38Z_
_Verifier: Claude (gsd-verifier)_
