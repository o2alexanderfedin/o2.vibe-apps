# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.0 — Vibe OS   (Shipped: 2026-06-26 | Phases: 5 | Plans: 21)

**Verdict:** PASSED — 21/21 requirements satisfied, **727 tests** green (552→727), tsc 0, build clean (no source maps), hygiene + CSP green, tagged `v2.0`. Phases 14–18 each on a feature branch, `--no-ff` merged to develop. Zero new npm dependencies.

### What Was Built

- **Phase 14 — Theme Foundation.** `VibeThemeProvider` nested inside the existing `ThemeProvider` (additive — 552 prior tests unaffected). Four named themes (Aurora / Aero / Aqua / Noir) as CSS custom property sets applied to `document.documentElement`. FOUC-safe via synchronous `localStorage` read in `index.html` before React mounts; IDB `settings` store (DB v3, additive migration) for persistence. `:root` alias bridge keeps pre-v2.0 cached apps rendering. FOUC script + CSP hash updated atomically. ThemeSelector 4-pill switcher in AppBar (temporary home). Switch-path RTL test asserts `--text` on `documentElement`. (THEME-01..05.)
- **Phase 15 — Window Manager.** `useDrag` (setPointerCapture + rAF imperative `transform` + `clamp()` in `pointermove` handler, state only on `pointerup`). `useWindowManager` (WindowEntry state, bounded zTop z-order, open/focus/minimize/restore/close). `WindowFrame` glass chrome + traffic-light titlebar. Key architectural deviation: apps render in-tree as memoized `WindowBody` subtrees rather than detached `createRoot` roots (the detached approach caused test-environment hangs — self-updating fixture spun outside `act()` scope). `Marketplace` owns its own `WindowManagerProvider`; `App.tsx` mounts one at desktop level. `appBodyCount()` baseline invariant confirms no root leaks. (WIN-01..05.)
- **Phase 16 — Desktop Shell.** `DesktopShell` replaces flat storefront. Animated themed wallpaper (4 blob layers with `vibeFloat` keyframe). `Dock` with running-indicator dots + hover-scale + magnifier launcher icon. `MenuBar` with OS wordmark + active-app name + live clock (ThemeSelector relocated here from AppBar). `@media (prefers-reduced-motion: reduce)` disables blob animation; `display:none` for minimized windows (no compositor layer). Theme re-skin acceptance: aurora→noir changes both `--wall` and `--text` and matches VIBE_THEMES contract exactly. Viewed Aurora/Noir desktop screenshots confirmed. (WIN-06..08, PERF-01.)
- **Phase 17 — Search / Launcher Panel.** `SearchLauncherPanel` (text input + action button + pre-installed chips + app grid) replaces `MinimalLauncher`. `slugFromText` canonicalizes descriptions to stable cache keys. `handleDescribe` in `DesktopShell` routes through `registryKey("app", slug, text)` → `useWindowManager.open()`. Cache-hit test: 1 transport call across 2 same-text describes. Focus-not-stolen: panel focuses close button, not input. MinimalLauncher deleted (0 references in `src/`). Viewed panel with input + chips + grid screenshots. (CREATE-01..03.)
- **Phase 18 — Theme-Aware Generation.** All five produce-prompt branches mandate the CSS-var contract (`var(--accentA/--accentB/--text/--glass/--glass2/--bord/--hi)`). `colorCheck` post-transpile (44/44 tests): flags saturated/branded colors, allows grayscale + neutral-alpha shadows, embeds the literal in the error to avoid identical-error early-stop. `sanitizeDisplayName` in `useWindowManager.open()`: "AI Weather" → "Weather". Hygiene gate explicitly covers all new v2.0 surfaces. Phase executed as a single atomic commit (no per-plan SUMMARY.md files — 18-VERIFICATION.md is the exit artifact). Code review: 9/10 findings fixed; IN-02 fixture `:root` shim accepted (test-quality only). (TGEN-01..03, HYGIENE-06.)

### What Worked

- **In-tree window rendering (the Phase 15 deviation) was the right call.** Detached `createRoot` roots ran outside `act()` scope in tests — a self-updating fixture spun unthrottled and produced mid-render unmount races. In-tree memoized `WindowBody` eliminated both the test-environment problem and the root-leak class entirely. The deviation was surfaced and fixed within Phase 15 before exit; the `appBodyCount()` invariant locks it in.
- **Screenshot-per-phase visual UAT discipline held.** All three UI phases (15, 16, 17) were verified by viewed screenshots before exit — not just DOM/a11y assertions. Phase 16's Aurora→Noir desktop comparison confirmed the themed-wallpaper + glass-chrome re-skin was visually correct, not just technically passing.
- **`colorCheck` + `sanitizeDisplayName` as pure functions (not hooked into the model path) made testing easy.** 44 tests run entirely offline — no fixtures, no captured outputs. The pure-function pattern also made the self-heal loop integration clean: `colorCheck` returns a compiler-style error string, which the existing retry machinery treats identically to a Babel compile error.
- **Zero new npm dependencies held cleanly.** Research pre-work (framer-motion bundle size + react-draggable React 19 breakage) made the hand-roll decision crisp. `useDrag` + `VibeThemeProvider` + all desktop components stay within the zero-infra constraint.
- **Additive-only DB migrations (v2→v3 settings store)** continued the v1.x pattern without incident — the upgrade path test passes in CI.

### What Was Inefficient / What to Improve

- **REQUIREMENTS.md traceability table not updated at phase exit.** 17 of 21 requirements stayed "Pending" in the traceability table even though all 5 VERIFICATION.md files reported `status: passed`. The audit at close was what surfaced the staleness. Fix: update checkboxes and traceability Status column as part of each phase's exit commit (not at milestone close).
- **Phase 18 produced no per-plan SUMMARY.md files.** The executor ran Phase 18 as a single atomic commit — the 18-VERIFICATION.md is the exit artifact, but there's no per-plan trail. Acceptable for the shipped state; a future executor run should commit plan SUMMARYs atomically with each plan.
- **Phase 15 SUMMARY.md files have no `requirements-completed` frontmatter field** (unlike Phases 14, 16, 17). Minor inconsistency — should be standardized across all phases in a future template update.
- **SearchLauncherPanel CSS gap (visual-only).** Phase 17 added 6 new interior classes but never extended `index.css` for them. Functional tests (ARIA/role/label queries) all passed; only the visual treatment was missing. Caught by the integration checker post-close; fixed in the audit-debt commit (`8f0e601`). Lesson: CSS class coverage should be a phase exit criterion (verify new classes have at least a stub rule in `index.css`).
- **3 stale forward-reference comments (Dock.tsx, ThemeSelector.tsx, index.css)** referenced phases that had already shipped. Found by the audit. Fixed in the audit-debt commit. Lesson: search for `Phase NN` comment patterns on phase exit to catch forward-ref comments.

### Patterns Established

- **CSS custom property theming on `document.documentElement`** — the only pattern that reaches both in-tree React subtrees and independently-mounted app nodes without React context threading.
- **FOUC guard: synchronous `localStorage` read in `index.html` script before React mounts** + IDB settings store as authoritative persistence + CSP hash same-commit invariant.
- **In-tree memoized `WindowBody` for app rendering** — avoids detached-root test-environment issues; `WindowManagerProvider` owned by `Marketplace` (testable standalone) AND `App.tsx` (desktop-level consumers).
- **Pure post-compile checker (`colorCheck`) feeding existing self-heal loop** — the function returns a compiler-style error string; no new retry machinery needed; the loop's identical-error early-stop avoided by embedding the offending literal in the message.
- **`slugFromText` canonical form for user-described apps** — stable cache key from free-form text; feeds `registryKey("app", slug, text)` symmetrically for reads and writes.
- **Final-plan-of-phase pattern (Phase 17-04)**: deletion + zero-source-change full-suite acceptance gate (test + tsc + build + hygiene + targeted `-t` confirmations with non-zero-count guard).

### Key Lessons

1. **Test-environment context matters for React root strategy.** `createRoot` into a detached container is invisible to `act()` — any self-updating component inside it will spin forever in tests. In-tree rendering is both safer and simpler.
2. **CSS class coverage is a phase-exit criterion.** If new JSX classes aren't in `index.css`, they'll pass all ARIA/role tests and look broken visually. Add a grep-or-style check to the phase exit checklist.
3. **Forward-reference comments accumulate technical debt.** `Phase N will replace X` comments outlive their use immediately after Phase N ships. Search and neutralize them on phase exit.
4. **The pure-function pattern for cross-cutting checks is the right default.** `colorCheck` and `sanitizeDisplayName` as pure functions are trivially testable, composable, and require no fixtures — hook them at the call site (not in the model path or the test harness).

### Cost Observations

- **Model mix:** Orchestration/planning in Sonnet/Opus; execution subagents in Sonnet. The *product's* runtime model is Claude Haiku (`claude-haiku-4-5-20251001`).
- **Sessions:** multi-session (Jun 26–27); 5 phases across 2 active development days.
- **Notable:** all 21 VERIFICATION.md gates ran offline — no live API key used during execution; visual phases verified by screenshots in the dev environment (hot reload, key available). The only live path left unverified is the full produce→theme-switch visual loop (requires user's key post-ship).

---

## Milestone: v1.1 — Real & Robust   (Shipped: 2026-06-26 | Phases: 5 | Plans: 13)

**Verdict:** PASSED — 12/12 requirements satisfied, **552 tests** green (378→552), tsc 0, build clean (no source maps), hygiene + CSP green, tagged `v1.1`. Phases 9–13 each on a feature branch, `--no-ff` merged to develop.

### What worked
- **The visual-UAT discipline earned its keep.** The Phase 12 live browser smoke caught **two** integration bugs that all 542 unit tests passed over: seeded *delegated* apps were routed to the *monolithic* instantiator (ErrorBoundary in the live app), and the `DelegatedShell` never captured `[data-field]` inputs (so Weather could never search a location). Both got regression tests that fail pre-fix. Lesson reaffirmed: unit tests exercising a module in isolation do **not** prove the seeded→loader→instantiate→render path; smoke the real thing.
- **CONTEXT-first + a focused codebase scout per phase** kept the planning subagents non-interactive and fast (`--skip-research` with the design pre-resolved), and made inline fallback possible when a subagent died.
- **Dependency-ordered phases held:** RELY (11) before DATA (12) meant the validate-at-merge gate was already guarding state when live network data first flowed through it; WIDGET typing (10) before activation (13) meant widgets landed on real typed records.
- **The reliability paradox steer** (lenient, not strict, validation) was load-bearing — partial + passthrough + type-check-known-fields catches corruption without over-rejecting the small model's valid-but-partial output.

### What to improve
- **Plan/execute overlap (Phase 9):** dispatching the execute delegate before the planning delegate's nested revision loop fully terminated caused the planner to overstep into implementation on a shared branch. Fix applied from Phase 10 on: **wait for the explicit `PLANS_READY` report before dispatching execute.** No recurrence.
- **Subagent quota is a real constraint at this scale.** The Phase 13 planning subagent hit the account weekly limit; the orchestrator implemented + verified Phase 13 inline. Future large autonomous runs should budget for it (fewer, fatter delegations; or inline the cheaper phases).

### Carried forward (deferred by design / user steer)
- Anthropic-key-exfil hardening + `<iframe sandbox>` (HARD-01) — the user owns the key story post-v1.1; the host-brokered keyless broker sits behind the same seam for a contained later move.
- A live seeded widget-composition demo app — capability is test-covered; demo out of v1.1 scope.

---

## Milestone: v1.0 — MVP   (Shipped: 2026-06-26 | Phases: 8 | Plans: 4)

**Shipped:** 2026-06-26
**Phases:** 8 | **Plans:** 4 (+5 streamlined single-plan phases) | **Sessions:** multi-session (Jun 24–25)
**Verdict:** PASSED — 42/42 active requirements satisfied, 368 tests green at milestone close (378 after the post-milestone G1 fix), `tsc --noEmit` 0, build clean, released `v0.1.0`.

### What Was Built

The milestone shipped as a **vertical MVP** — eight end-to-end, user-visible slices rather than horizontal technical layers — culminating in the project's core value loop: open → resolve → produce → compile → render → interact.

- **Phase 1 — Hygiene Foundation & Storefront Shell.** A real marketplace storefront (8-card grid), light/dark/system `ThemeProvider` (`data-theme` + `matchMedia`), a three-flow `KeyDialog` (`sk-ant-` validation, neutral "Connect your account" framing), an IndexedDB registry (`apps`/`widgets`/`handlers`) with a probe-write + in-memory `Map` fallback, opaque SHA-256 `cacheKey` over normalized input, the single Anthropic egress chokepoint (`modelClient`), a gated `[Marketplace]` logger, a CSP meta tag, sourcemaps-off production build, and the **CI lexicon-grep hygiene gate** (`src/hygiene.test.ts`) that bans the on-demand lexicon across `src/**` + `index.html`. (SHELL-01..04, LOOP-02/03, HYGIENE-01..05, SEC-04.)
- **Phase 2 — Static Open-One-App Loop.** The resolve → compile → instantiate → render core with **model risk removed**: a static intent resolver, a three-tier loader (component `Map` → transpiled-string `Map` → IndexedDB), classic-runtime Babel transpile (`React.createElement`, no `react/jsx-runtime`), a `new Function` instantiator sharing one React instance, and a per-instance `createRoot` map (no double-call). Seeded counter/notes apps proved hooks work. (LOOP-01/04..08, SHELL-05; SEC-01/02/03 deferred by user.)
- **Phase 3 — Cache-Miss Generation (Core Value).** The model joined to the loop: a single browser `fetch` to `api.anthropic.com/v1/messages` (all four headers incl. `anthropic-dangerous-direct-browser-access`, dated model `claude-haiku-4-5-20251001`), robust code extraction from prose/markdown-fenced output, a bounded **self-heal retry (≤3) that feeds the Babel compiler error** back into the next prompt with identical-error early-stop, truncation (`stop_reason === "max_tokens"`) handled as a retryable produce failure, and dual-cache persistence (`source` + `transpiledJS`) so the next open is instant. **This phase met the project's core value.** (GEN-01..05.)
- **Phase 4 — Widget Composition.** A `// @widget <type>` parser, transitive pre-warm (cycle guard + concurrency cap ≤2), a synchronous `useWidget(type)` (pure `Map.get`, never async at render), per-widget `WidgetShell` + `WidgetErrorBoundary` isolation, and a DRY `instantiateWithWidgets` path. (WIDGET-01..05.)
- **Phase 5 — Contextual Modification.** A shared `⋮` `ContextualPrompt` popover on both app and widget shells, a client-side `routeModification` router, **remove/clone with zero model call**, and in-place tweak (new `(type+instruction)` key → resolve-or-produce → re-render through the existing root, no surfaced history, no double `createRoot`). (MOD-01..04.)
- **Phase 6 — API Error Degradation.** Typed `ModelHttpError`/`parseRetryAfter`, a shared `TokenBucket` + exponential-backoff-with-jitter `createResilientTransport` honoring `retry-after` (neutral `ModelUnavailableError` on exhaustion), a global async backstop (`window.onerror` + `unhandledrejection` + React `onUncaughtError`, NAME-only summaries, console suppression), a 401 → inline `KeyDialog` reconfigure path, and per-app/per-widget retry boundaries. (RESIL-01..04.)
- **Phase 7 — Storage & Cost Guardrails.** A sliding-window `createProduceGate` (N=10 misses / 5-min window, injected `Clock`, neutral `ProduceThrottledError`), `useCount`/`updatedAt` LRU bookkeeping (DB schema v2, additive upgrade, default-on-read), `evictUnderPressure` (LRU eviction under a 0.9 usage/quota threshold, run *before* produce writes), and an injectable storage-pressure seam guarding `navigator.storage.persist`/`estimate`. (RESIL-05/06.)
- **Phase 8 — Backend-Style Handlers.** A single `runHandler(intent, input)` resolve-or-produce-then-exec helper, dual-cached in the `handlers` store with `useCount`/`updatedAt`, executing in a constrained `new Function` scope (denylist-shadows `fetch`/`XMLHttpRequest`/`localStorage`/`sessionStorage`/`indexedDB`/`window`/`document` to `undefined`, hostile `require`, no key in scope), returning a neutral `{ data?, error? }` and never throwing. (HANDLER-01..03.)
- **Post-v1.0 — Delegated thin-shell pivot (v1.1-level).** After real-Haiku testing, unseeded apps were re-shaped from monolithic single-call components into behavior-free **delegated modules** (`initialState` + a markup-only `view(state)` whose interactive elements carry `data-action` but no handlers + a precise `actionSpec`). A permanent `DelegatedShell` mounts the module with **one container `onClick` delegate** that produces each action's handler on demand via `runHandler` and caches it per `(appType, action)` — so re-pressing a button is an O(1) hit ("attached forever"). This made handlers the *primary* behavior mechanism. Built, integration-checked PASS, and merged to `develop` after the milestone (branch `feature/enable-widgets-handlers`); a separate quick task (`q08`) folded `kind`+`prompt` into the cache key (the G1 fix).

### What Worked

- **Vertical-MVP slicing.** Each phase shipped a user-visible slice, so the core loop was reachable and demonstrable early rather than after a long horizontal build-out. The ROADMAP's explicit "core value is met at Phase 3" framing kept the highest-value work front-loaded.
- **Hygiene-first, enforced by a CI gate.** Establishing opaque keys, neutral naming, the gated logger, sourcemaps-off, the CSP, and the lexicon-grep gate (`hygiene.test.ts`) in **Phase 1** — before any data was stored or any model called — meant the devtools-hygiene hard rule was a passing test on every subsequent phase, not a retrofit. The gate even self-verifies (goes RED on an injected banned token, GREEN after revert).
- **De-risking the novel mechanics with a STATIC loop first.** Phase 2 proved `new Function` + classic-runtime Babel + per-instance `createRoot` against **seeded** apps with model nondeterminism removed, so Phase 3 only had to add the model call to an already-proven render path — isolating two hard problems instead of debugging them together.
- **Real captured-Haiku fixtures for deterministic tests.** Capturing actual Haiku component/handler outputs (`*.raw.txt`/`*.code.txt`) gave deterministic, replayable tests of the model path (extraction, transpile, render-failure, truncation) without flakey live calls — and surfaced the truncation/`MAX_TOKENS` problem that a synthetic fixture would have hidden.
- **IoC/DI throughout.** Injecting the transport, registry, key getter, produce gate, and clock let RTL integration tests substitute the model and registry, drive the real Marketplace open flow through the DOM, and prove invariants (single egress, no off-path `localStorage`/`indexedDB` access) — the independent integration check confirmed the *only* real `fetch` is the injected chokepoint.
- **Visually verifying generated UI.** Screenshotting and viewing produced apps (not just checking the DOM/a11y tree) caught a Tailwind-collapse bug where generated markup rendered structurally but looked broken — a class of failure invisible to assertion-only tests, leading to the rule that produced layout must inline-style and fit its type.

### What Was Inefficient

- **`VERIFICATION.md` artifacts skipped in the streamlined MVP flow, then backfilled.** Phases 3–8 shipped functionally (green suite, `tsc` 0, live validation) without per-phase verification artifacts; the milestone audit flagged this as process debt and all six were **backfilled 2026-06-25** (goal-backward against code + tests, each `status: passed`). Functionally fine, but it forced a later reconstruction pass and briefly put the audit verdict in "artifact gaps" territory.
- **Requirements-traceability checkboxes left stale.** The audit noted REQUIREMENTS.md traceability for phases 1–3 still read "Pending" though delivered (4–8 read "Complete") — bookkeeping drift between the working code and the planning ledger.
- **Monolithic generation had to be pivoted to delegated thin-shells.** The blueprint assumed one model call → a complete `<400`-line app. Real-Haiku testing showed that approach was fragile (truncation, state-machine quirks, layout collapse); the **delegated thin-shell + on-demand cached handlers** model replaced it post-milestone. The right end state, but it arrived as a pivot after v1.0 rather than as the original design — and it contradicts the doc's `<400`-line constraint, requiring a blueprint reconciliation.
- **Network-dependent apps can't fetch in the sandboxed handler scope.** By design, handlers run with `fetch`/`XMLHttpRequest`/storage shadowed to `undefined`, so genuinely network-dependent apps (Weather, Currency) degrade to fallback/mock data rather than live results — an inherent constraint of the no-network-no-key handler safety model, now known tech debt for a future networked-handler story.
- **The cacheKey contract was initially too narrow.** v1.0 keyed on `SHA-256(type)` only, dropping `kind` and `prompt` — a latent correctness gap (app/widget collisions if widgets activate; tweak variants forced through the model instead of cached distinctly). Caught at the post-milestone gap-check (G1) and fixed in quick task `q08`.

### Patterns Established

- **Real-fixture-driven testing of the model path** — capture actual Haiku outputs once, replay them deterministically through extract → transpile → instantiate → render, including the failure variants (truncated, garbage, throwing).
- **The produce → cache → compile → render loop** as the spine — three-tier resolve (component `Map` → transpiled-string `Map` → IndexedDB), store the `transpiledJS` *string* (never a `Function`), re-instantiate via `new Function`, single session-scoped compile.
- **Delegated thin-shell + on-demand cached handlers** — markup-only views with `data-action` hooks, one container-level event delegate, per-`(appType, action)` handler production cached for O(1) re-press; handlers as the primary behavior mechanism.
- **Git-flow with `.githooks`** — feature branches per phase/worktree → `develop`, with `--no-verify` merges reserved for *after* verification has already passed (avoiding redundant gate runs on the merge commit).
- **Quick-task lane for post-milestone fixes** — small, traceable corrections (e.g., `q08` cacheKey G1) handled outside the phased roadmap with their own doc trail and blueprint reconcile.
- **Single egress chokepoint + IoC/DI** — the only real `fetch` lives in one injected transport; every business module takes its dependencies as parameters so tests substitute the model, registry, clock, and key getter.

### Key Lessons

1. **Small, precise on-demand units beat monolithic generation for a cheap model.** A single Haiku call asked to emit a whole working app is fragile (truncation, layout collapse, reducer quirks); decomposing into a markup-only shell plus tiny per-action handlers, each produced and cached independently, is far more reliable — and turns each unit into something deterministically testable.
2. **Intent precision and handler purity govern reliability.** Tight, neutral prompts and a strict handler contract (pure, no network, no key, denylist-shadowed scope, require-purity guard) keep produced behavior predictable and contained; ambiguity in the prompt or impurity in the scope is where on-demand systems break.
3. **Verify generated UI visually, not just via DOM/a11y.** The DOM and accessibility tree can pass while the rendered result is visually broken (the Tailwind-collapse bug); screenshotting and *looking* is a required check for any generated-UI surface.
4. **Establish cross-cutting constraints (hygiene, single egress) as enforced gates in the first phase.** Baking the lexicon gate, CSP, sourcemaps-off, and the egress chokepoint into Phase 1 made them free-to-maintain invariants instead of expensive retrofits.

### Cost Observations

- **Model mix:** Opus for orchestration/planning + Sonnet/Haiku for execution sub-agents (rival/worktree working style, dialed back for the MVP race). The *product's* runtime model is Claude Haiku (`claude-haiku-4-5-20251001`) — the cheap on-demand generator the whole architecture is tuned around.
- **Sessions:** multi-session across Jun 24–25 (97 commits; phases 1–8 built Jun 24, audited + verification-backfilled + G1 fix Jun 25), released `v0.1.0`.
- **Notable methodology:** **real-Haiku capture** — rather than burning live tokens on every test run, actual Haiku component/handler outputs were captured once into fixtures and replayed deterministically, which both contained test cost and made the model path reproducible. This same capture step is what surfaced the truncation and layout-collapse failures that drove the `MAX_TOKENS` raise and the delegated pivot.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Plans | Key Change |
|-----------|----------|--------|-------|------------|
| v1.0 | multi (Jun 24–25) | 8 | 4 (+5 streamlined) | First milestone — vertical-MVP slicing, hygiene-first CI gate, static-loop de-risking, real-fixture model testing, IoC/DI everywhere. Streamlined MVP flow (no per-phase VERIFICATION.md) required audit-time backfill. |
| v1.1 | multi (Jun 26) | 5 | 13 | Introduced VERIFICATION.md per phase; subagent quota hit (Phase 13 inline); live browser smoke caught 2 integration bugs unit tests missed. |
| v2.0 | multi (Jun 26–27) | 5 | 21 | Screenshot-per-phase visual UAT; in-tree memoized WindowBody (key architectural deviation); pure-function post-compile checks; zero new npm deps; REQUIREMENTS.md traceability staleness (17/21) remains a recurring gap to fix. |

### Cumulative Quality

| Milestone | Tests | Verdict | Notable Tech Additions |
|-----------|-------|---------|------------------------|
| v1.0 | 378 | PASSED | idb, classic-Babel transpile, real-Haiku fixtures, delegated thin-shell, on-demand cached handlers |
| v1.1 | 552 | PASSED | zod/mini validate-at-merge, host-brokered dataBroker, TTL cache, typed WidgetRecord/HandlerRecord, widget composition wiring |
| v2.0 | 727 | PASSED | VibeThemeProvider, useDrag, useWindowManager, WindowFrame, DesktopShell, Dock, MenuBar, SearchLauncherPanel, colorCheck, sanitizeDisplayName — zero new npm deps |

*(v1.0: 333 at v0.1.0 tag → 378 post-G1 fix. v1.1: 378→552. v2.0: 552→727.)*

### Top Lessons (Verified Across Milestones)

1. **Enforce cross-cutting constraints as first-phase CI gates.** (v1.0 + confirmed v1.1 + v2.0) The lexicon gate, CSP, sourcemaps-off, and egress chokepoint set up in Phase 1 stayed green across 18 phases. Retrofitting them is far more expensive.
2. **Small, precise on-demand units beat monolithic generation for a cheap model.** (v1.0 + confirmed v1.1) Decomposing into a markup-only shell plus tiny per-action handlers raises reliability and makes each unit deterministically testable.
3. **Verify generated and composed UI visually — DOM/a11y tests miss it.** (v1.0 + v2.0) Screenshots of actual rendered output catch CSS collapse and visual styling gaps that all role/label assertions pass through. Phase 16/17 screenshots caught the themed re-skin; Phase 17 CSS gap was missed (caught by integration checker post-close).
4. **In-tree rendering beats detached `createRoot` for app subtrees in a test environment.** (v2.0) Detached roots run outside `act()` scope — self-updating fixtures spin forever. In-tree memoized subtrees are simpler and safer, and eliminate the root-leak class entirely.
5. **Pure functions for cross-cutting checks are the right default.** (v2.0) `colorCheck` and `sanitizeDisplayName` as pure functions are trivially testable with no fixtures, composable, and hook cleanly at the call site.
