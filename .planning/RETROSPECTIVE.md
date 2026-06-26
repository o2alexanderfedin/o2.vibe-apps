# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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
| v1.0 | multi (Jun 24–25) | 8 | 4 (+5 streamlined) | First milestone — established vertical-MVP slicing, hygiene-first CI gate, static-loop de-risking before model nondeterminism, real-fixture model testing, and IoC/DI everywhere. Streamlined MVP flow (no per-phase VERIFICATION.md) later required an audit-time backfill. |

### Cumulative Quality

| Milestone | Tests | Coverage | Verdict | Zero-Dep / Notable Additions |
|-----------|-------|----------|---------|------------------------------|
| v1.0 | 378 | not formally measured | PASSED | idb, classic-Babel transpile, real-Haiku fixtures, delegated thin-shell + on-demand cached handlers (post-milestone) |

*(Test count: 333 at the `v0.1.0` release tag → 368 at milestone audit close → 378 after the post-milestone G1 cacheKey fix.)*

### Top Lessons (Verified Across Milestones)

1. *(Awaiting a second milestone to cross-validate.)* From v1.0: small/precise on-demand units beat monolithic generation for a cheap model — decomposition both raises reliability and makes each unit deterministically testable.
2. *(Awaiting a second milestone to cross-validate.)* From v1.0: enforce cross-cutting constraints (devtools hygiene, single egress) as first-phase CI gates so they stay cheap invariants rather than expensive retrofits.
