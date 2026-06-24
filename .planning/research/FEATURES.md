# Feature Research

**Domain:** Client-side generative-UI app marketplace (on-demand React apps/widgets, BYOK, IndexedDB cache, "no visible AI")
**Researched:** 2026-06-24
**Confidence:** MEDIUM-HIGH

Confidence is HIGH on the comparable-product feature landscape and on the illusion/perceived-performance UX research (multiple credible sources agree). It is MEDIUM on the precise table-stakes/anti-feature line for *this specific* product, because no shipped competitor combines all three constraints at once — generative UI **and** a marketplace framing **and** a hard "no visible AI" rule. That combination is novel, so categorization below is reasoned from the blueprint plus analogous products, not copied from an existing one.

---

## Comparable Products Surveyed

| Product | Category | What it does | What this product borrows / rejects |
|---------|----------|--------------|--------------------------------------|
| **v0 (Vercel)** | "AI builds the UI" | Text → React + Tailwind + shadcn component; conversational refine loop ("make sidebar collapsible", "add a loading skeleton") | Borrows: incremental conversational tweak loop, live preview. Rejects: visible prompt-in/code-out UI, export-to-codebase flow. |
| **Claude Artifacts** | Generative-UI / canvas | Substantial output auto-renders live in a side panel; iterate in plain English in place; publish + **remix** (editable copy) | Borrows: render-in-place, plain-English in-place edit, remix == clone. Rejects: chat transcript visible, "this was AI-generated" framing. |
| **ChatGPT Canvas** | Generative-UI / canvas | Inline editable doc/code surface with targeted edits | Borrows: targeted in-place edit rather than full regenerate. Rejects: visible AI authorship. |
| **websim** | Generative web / simulated internet | NL prompt or fictive URL → live HTML/CSS/JS site in a simulated browser; dynamic content generated on navigation; Claude Sonnet under the hood | Closest analog to the *runtime* model (generate-on-navigate, interactive immediately). Rejects: websim *celebrates* the hallucinated-internet mechanic; this product hides it entirely. |
| **21st.dev / component marketplaces** | Component/widget marketplace | Storefront grid, search, categories, live preview, seamless install, ratings/usage analytics | Borrows: storefront grid, categories, live preview, "open and it just works." Rejects: install step, ratings/comments, creator monetization, hosting/CDN. |
| **Shopify Search & Discovery / app stores** | Storefront discovery | Search, filters, categories, recommendations, featured | Borrows: discovery surface conventions. Rejects: reviews, pricing tiers, accounts. |

**Cross-cutting finding:** Every generative product surveyed makes the AI mechanic *the headline feature* (a prompt box, a "Generate" button, a visible chat, version history of attempts). **This product is the inverse** — the same engine, the mechanic deliberately invisible. So competitor *features* are useful, but their *UX chrome* (prompt boxes, generation progress, "AI is thinking", regenerate buttons, model pickers) is the exact set of things this product must NOT copy. That inversion is the single most important framing for the table below.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these and either the core loop fails or the "apps just exist" illusion breaks.

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| **Storefront grid of app types** | Every marketplace opens on a browsable storefront; without it there's nothing to "exist on the platform" | LOW | Static catalog of known app types maps to intent classifier's static map. No dynamic discovery needed for v1. |
| **Open-and-render loop (resolve→cache→produce→compile→render)** | This *is* the product. Click an app, it renders and works | HIGH | The core engine. Depends on registry (cache), Haiku call (produce), Babel (compile), `new Function()`+ReactDOM (render). Everything else hangs off this. |
| **Instant re-open on cache hit** | Once "installed" feeling, an app must reopen with zero perceptible delay or the illusion of a real installed app collapses | MEDIUM | Depends on IndexedDB registry + session in-memory transpiled cache. "Compile once, never recompile twice in a session" is the load-bearing rule. |
| **Skeleton / "Opening…" state on cache miss** | A blank screen during a multi-second model call reads as "broken." Skeletons are the proven perceived-performance technique (users rate a 3s skeleton ≈ a 1.5s spinner) | LOW-MEDIUM | Must mirror the app/widget shape and be neutral-colored with subtle motion. Copy must be neutral ("Opening…", "Just a moment…") — never "Generating…". Depends on the shell. |
| **App shell with contextual `⋮` menu** | Apps need a frame, a name, and an affordance to act on them; standard app-window convention | LOW | Wraps every top-level app. Hosts the contextual-prompt entry point. |
| **Contextual natural-language tweak** | The "change anything by asking" affordance is the headline interaction of every generative tool (v0, Artifacts) | MEDIUM | Free-form prompt → new cache key → resolve → replace in place. Depends on the loop + registry. |
| **Clone / duplicate** | Marketplace + artifact convention (Artifacts "remix"); users expect to fork a working thing | LOW | Resolved client-side, **no model call** — copy the stored record under a new key. Depends on registry only. |
| **Remove / close** | Basic window management; can't have apps you can't dismiss | LOW | Client-side, no model call. Unmount root + drop from open set. |
| **Widget composition inside an app** | Real apps are composed of parts (charts, tables); a flat single-blob app feels toy-like | HIGH | App declares `@widget` deps → pre-warm before mount → `useWidget()` returns synchronously at render. Pre-warm depends on dep parsing; `useWidget` sync depends on pre-warm. |
| **Per-widget shell + independent `⋮`** | Once widgets compose, users expect to tweak a chart without touching the whole app | MEDIUM | Each widget gets its own shell, error boundary, and contextual menu. Depends on widget composition. |
| **Error boundary with retry (render errors)** | Generated code *will* sometimes throw; one bad component must not white-screen the page | MEDIUM | Boundary per app AND per widget. A failing widget shows a placeholder, parent keeps rendering. Copy must be neutral ("Couldn't load this app. Try again."). |
| **Self-heal retry on produce/compile failure** | First-shot generation isn't reliable; a single bad attempt should not surface as a dead app | MEDIUM | Bounded (~3) retries feeding the **compiler** error (not runtime error) back into the next attempt. Depends on the produce + compile steps. |
| **API-key onboarding (set / change / clear)** | Without a key nothing renders; this is the unavoidable BYOK gate | MEDIUM | The hardest table-stakes UX problem here (see Pitfalls). Key in `localStorage`, sent only to `api.anthropic.com`. Must be framed as account/activation, not "paste your AI key." |
| **Graceful degradation on key/rate/storage failure** | 401, 429, and IndexedDB-unavailable are guaranteed to occur; each must degrade without revealing the mechanic | MEDIUM | 401 → reconfigure key inline; 429 → backoff then neutral error; no IndexedDB → in-memory Map fallback. All copy neutral. Depends on the loop + key store. |
| **Theming (light / dark / system) via CSS variables** | Baseline modern-app expectation; also required so generated apps look native to the platform | LOW | CSS vars on `:root`; generated code instructed to consume `var(--color-*)`. Theme consistency is what makes disparate generated apps feel like one platform. |

### Differentiators (Competitive Advantage)

What makes THIS product compelling versus v0/Artifacts/websim. The unifying differentiator is **the absence of the AI surface** — it's the only product in the space that hides the mechanic, which is what lets it feel like a *real* marketplace of real apps rather than a "look what the AI made" demo.

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| **The "no visible AI" illusion (cross-cutting)** | Apps *exist*; there's no prompt box, no "Generate", no model picker, no chat, no "AI is thinking." This is the entire differentiation and the product's identity | HIGH | Not a feature you build once — a constraint enforced across naming, logs, IndexedDB keys, network payloads, comments, CSS, error copy, and the literal banned word "synthesize." Touches every other feature. |
| **Determinism-at-the-interface (cache the first good output forever)** | Industry-recognized way to make a non-deterministic generator *feel* like stable software: normalize prompt → stable key → store first success → serve it identically forever | MEDIUM | This is *why* an "installed" app reopens identically. Stable cache-key construction is load-bearing; same type+normalized prompt must always hash the same. Depends on registry + key normalization. |
| **Transparent backend handlers** | Apps can "export CSV", "fetch stats", "save form" and a data handler is produced/cached on first need — apps feel full-stack with zero backend | MEDIUM-HIGH | `runHandler(intent,input)` hides cache→produce→execute. Optional layer; depends on the same engine. Defer past first vertical slice. |
| **In-place tweak that replaces, not re-chats** | v0/Artifacts show a growing transcript; here a tweak just *becomes* the new app, in place, no history clutter — reinforces "this is the app now" | LOW (given the loop) | Differentiator is the *framing*, not new tech. Depends on contextual tweak + registry. |
| **Widget-level pre-warm (no render waterfalls)** | Composed apps appear fully-formed instead of popping widgets in one by one — critical to the "it just exists" feel | MEDIUM | Parse `@widget` deps, resolve all, then mount. Depends on widget composition + dep parser. This is what separates "feels native" from "feels generated." |
| **Use-count / implicit popularity surfacing** (later) | `useCount` already tracked; could power a "popular on the platform" storefront row, deepening the marketplace illusion cheaply | LOW | Pure read of existing data. Pure cosmetic differentiator; defer. |

### Anti-Features (Deliberately NOT Built)

These break either the illusion or the client-only model. Each is something a comparable product *has* and that an unguided contributor would reflexively add. Documenting them is the point.

| Feature | Why Requested / Tempting | Why Problematic Here | Instead |
|---------|--------------------------|----------------------|---------|
| **Visible prompt box / "Generate" button / model picker** | Every generative tool has one; feels like the obvious primary UI | Directly destroys the core illusion — apps must *exist*, not be summoned | The contextual `⋮` tweak is the *only* NL surface; no global "create an app" prompt. |
| **Visible "AI is thinking / generating…" progress** | Honest feedback during a slow call | Names the mechanic; "Generating" is a banned concept in visible surfaces | Neutral skeleton + "Opening…" / "Just a moment…". |
| **Generation/version history, attempt log, "regenerate" button** | v0/Artifacts show versions; useful for iteration | Exposes that output is produced and non-deterministic; reveals retries/failures | Self-heal retries happen invisibly; a tweak silently *replaces* via a new cache key. No surfaced history. |
| **Streaming the code into view / typewriter render** | Looks impressive, common in AI demos | Reveals code is being authored live — the opposite of "this app already exists" | Render only the finished component, behind a skeleton. |
| **Server-side anything (backend app server, API proxy)** | "Just proxy Anthropic to hide the key / add a real DB" | Breaks the zero-infra client-only model and creates key-handling liability; explicitly out of scope | Direct browser→`api.anthropic.com`; handlers run in-browser on mock/local data. |
| **Accounts / auth / billing / subscriptions (real)** | Marketplace narrative implies a subscription | No backend to host auth; the only credential is the user's own key | Subscription is *narrative only*; the API-key gate is the sole "activation." |
| **Multi-user sync / publish / share generated apps** | Artifacts publish + share; feels expected for a marketplace | Registry is local IndexedDB per browser; no cloud registry in v1; sharing would expose the mechanic and need infra | Local-only registry. Sharing deferred indefinitely. |
| **Ratings / reviews / comments / creator monetization** | Standard component-marketplace features | There are no third-party creators — every app is produced on demand; ratings imply human authors and a backend | Optional implicit popularity from `useCount` only. |
| **Devtools-visible diagnostics ("synthesizing widget…", `data-generated`, `.generated-widget`)** | Normal debugging instinct | A single leak via F12 (symbols, IndexedDB keys, console, network body, source-map comments, CSS, attributes) breaks the illusion permanently | Neutral naming everywhere; logs off unless `localStorage.debug`; opaque hash keys; banned word "synthesize" nowhere visible. |
| **Re-compiling from storage on every load / storing compiled functions** | Simpler mental model | Functions aren't serializable; recompiling twice in a session kills the "instant" feel | Store the transpiled JS *string*; re-instantiate via `new Function()`; session in-memory `transpiledCache`. |
| **Exposing the prompt/type slug in IndexedDB keys or error text** | Easier debugging / readable keys | Readable keys + error copy ("weather-app generation failed") reveal the mechanic | Opaque hashed keys; neutral error copy ("This app couldn't load. Try again."). |
| **`<iframe sandbox>` isolation in v1** | Correct security posture | Adds postMessage plumbing and complexity that would slow the first vertical slice | `new Function()` constrained scope for v1; iframe flagged as production hardening, not v1 scope. |

---

## Feature Dependencies

```
[Storefront grid]
    └──feeds──> [Intent resolver / static action→type map]

[Open-and-render loop]  ← the spine; everything below sits on it
    ├──requires──> [IndexedDB registry]            (cache hit/miss)
    ├──requires──> [Haiku produce call + BYOK key] (cache miss)
    ├──requires──> [Babel compile (once)]
    ├──requires──> [new Function() instantiate + ReactDOM render]
    └──requires──> [App shell]

[Instant re-open]
    └──requires──> [IndexedDB registry] + [session in-memory transpiled cache]
                       └──requires──> [stable cache-key normalization]

[Skeleton / loading state] ──enhances──> [Open-and-render loop]   (covers the miss latency)

[Widget composition]
    └──requires──> [@widget dep parser]
                       └──requires──> [pre-warm before mount]
                                          └──enables──> [useWidget() synchronous at render]
    └──requires──> [WidgetShell + per-widget error boundary]

[Contextual tweak]
    └──requires──> [contextual ⋮ popover] + [open-and-render loop] + [registry]
[Clone] ──requires──> [registry]            (no model call)
[Remove] ──requires──> [mounted-root tracking]  (no model call)

[Self-heal retry] ──requires──> [Haiku produce] + [Babel compile]  (feeds COMPILER error back)
[Error boundary + retry] ──wraps──> [every app] AND [every widget]

[Transparent handlers] ──requires──> [registry] + [Haiku produce]   (optional layer)

[Theming] ──enables──> [generated apps look native]   (CSS vars on :root consumed by generated code)

[No-visible-AI illusion] ──CONSTRAINS──> EVERY feature above
    (naming, logs, IndexedDB keys, network payload, comments, CSS, error copy)
```

### Dependency Notes

- **Instant re-open requires stable cache-key normalization:** if the same type+prompt doesn't hash to the same key every time, the cache never hits, every open is a slow produce, and the "installed app" illusion is gone. Normalize (lowercase, trim, collapse whitespace) before hashing. This is the quiet linchpin of the whole experience.
- **`useWidget()` synchronous-at-render requires pre-warm:** React render must not trigger async work. Pre-warming all `@widget` deps before mount is what lets `useWidget(type)` return a component immediately. Skip pre-warm and you get render-time waterfalls (widgets popping in one by one) — which itself reveals the mechanic.
- **Self-heal must feed the compiler error, not the runtime error:** Babel errors carry line/token information the model can act on; runtime errors are far less actionable. This ordering materially changes retry success rate.
- **Per-widget error boundary is what makes composition safe:** without an independent boundary per widget, one bad generated chart white-screens the whole app, and the user sees a broken "real app."
- **The illusion constraint is orthogonal to every feature, not a feature itself:** it has no single implementation phase — it's an acceptance criterion attached to every other feature's "done" definition (symbols, logs, keys, network, comments, CSS, errors, copy).

---

## MVP Definition

### Launch With (v1 — the vertical slice that proves the loop + illusion)

- [ ] **IndexedDB registry (`apps`/`widgets`/`handlers`)** — without cache there's no instant, and the illusion fails.
- [ ] **API-key onboarding (set/change/clear, localStorage)** — nothing renders without it; the activation gate.
- [ ] **Storefront grid + static intent map** — the surface users land on; defines what "exists."
- [ ] **Open-and-render loop (resolve→cache→produce→compile→render)** — the product itself.
- [ ] **Stable cache-key normalization + compile-once / session transpiled cache** — makes re-open instant and deterministic-at-interface.
- [ ] **Skeleton/"Opening…" state with neutral copy** — covers miss latency without revealing generation.
- [ ] **App shell + contextual `⋮` popover** — frame + the only NL surface.
- [ ] **Prompt router (remove / clone / tweak)** — remove+clone client-side, tweak via new key.
- [ ] **Error boundary + retry per app** — generated code will throw.
- [ ] **Self-heal retry (~3, compiler error fed back)** — makes a cache miss likely to still yield a working app.
- [ ] **Theme switcher (light/dark/system) via `:root` CSS vars** — generated apps must look native.
- [ ] **Graceful degradation (missing/invalid key, 429, no IndexedDB) with neutral copy** — guaranteed failure modes.
- [ ] **No-visible-AI hygiene applied to all of the above** — acceptance criterion, not a separate task.

### Add After Validation (v1.x — once the single-app loop is proven)

- [ ] **Widget composition + `@widget` dep parser + pre-warm + `useWidget`** — the highest-value upgrade from "toy app" to "real composed app"; deferred only because it's HIGH complexity and the single-blob loop validates the core illusion first. **Trigger:** loop proven instant and illusion-tight on flat apps.
- [ ] **Per-widget shell + independent `⋮` + per-widget error boundary** — pairs with composition. **Trigger:** composition shipped.
- [ ] **Transparent backend handlers (`runHandler`)** — makes apps feel full-stack. **Trigger:** an app type clearly needs a data op (export/fetch/save).

### Future Consideration (v2+ — explicitly deferred)

- [ ] **Implicit popularity storefront row (from `useCount`)** — cheap polish; defer until there's enough usage to populate it.
- [ ] **`<iframe sandbox>` isolation of generated code** — correct security hardening; deferred because it adds postMessage complexity and isn't needed to validate the concept.
- [ ] **Anything multi-user (sync/share/publish)** — needs infra and risks exposing the mechanic; out of the client-only model.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Open-and-render loop | HIGH | HIGH | P1 |
| IndexedDB registry + stable cache key | HIGH | MEDIUM | P1 |
| Instant re-open (compile-once + session cache) | HIGH | MEDIUM | P1 |
| Skeleton/loading state (neutral copy) | HIGH | LOW | P1 |
| API-key onboarding (illusion-preserving) | HIGH | MEDIUM | P1 |
| Storefront grid + static intent map | HIGH | LOW | P1 |
| App shell + contextual `⋮` tweak | HIGH | MEDIUM | P1 |
| Clone / remove (client-side, no model) | MEDIUM | LOW | P1 |
| Error boundary + retry | HIGH | MEDIUM | P1 |
| Self-heal retry (compiler error fed back) | HIGH | MEDIUM | P1 |
| Theming via CSS vars | MEDIUM | LOW | P1 |
| Graceful degradation (key/rate/storage) | HIGH | MEDIUM | P1 |
| No-visible-AI hygiene (cross-cutting) | HIGH | HIGH | P1 |
| Widget composition + pre-warm + `useWidget` | HIGH | HIGH | P2 |
| Per-widget shell + boundary | MEDIUM | MEDIUM | P2 |
| Transparent backend handlers | MEDIUM | MEDIUM-HIGH | P2 |
| Implicit popularity row | LOW | LOW | P3 |
| iframe sandbox isolation | LOW (v1) / HIGH (prod) | HIGH | P3 |

**Priority key:** P1 = must have for launch · P2 = should have, add when possible · P3 = future / hardening

---

## Competitor Feature Analysis

| Feature | v0 / Artifacts / websim | Component marketplaces (21st.dev, etc.) | Our Approach |
|---------|-------------------------|------------------------------------------|--------------|
| Create surface | Visible prompt box / chat / "Generate" | "Browse → install" | **No create surface.** Apps exist; only `⋮` tweak is NL. |
| Iteration | Conversational transcript, version history | Re-install newer version | **In-place replace** via new cache key; no visible history. |
| Output framing | "Look what the AI made" | "Copy this code into your project" | **"This is an app on the platform."** Mechanic hidden. |
| Loading feedback | "Generating…", streaming code | Spinner | **Neutral skeleton** mirroring shape; "Opening…". |
| Composition | Single artifact / page | Per-component | **App composes pre-warmed widgets**, each independently tweakable. |
| Persistence/instant | Re-runs the model | CDN-served static asset | **IndexedDB cache → instant identical re-open**; produce only on true miss. |
| Backend/data | Client demo data or real backend | N/A | **On-demand cached in-browser handlers**, transparent to apps. |
| Sharing | Publish link, remix | Marketplace listing | **Local-only**; clone == local remix, no publish. |
| Key handling | Vendor-hosted inference | N/A | **BYOK direct to api.anthropic.com**, no proxy. |
| Discovery | Search/templates | Search, categories, ratings | **Storefront grid + categories**; no ratings/reviews (no human authors). |

---

## Sources

- v0 / generative UI — https://vercel.com/blog/announcing-v0-generative-ui ; https://www.mindstudio.ai/blog/what-is-vercel-v0
- Claude Artifacts (render-in-place, in-place edit, remix/publish) — https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them ; https://www.mindstudio.ai/blog/what-is-claude-interactive-visualization-generative-ui
- websim (generate-on-navigate, simulated apps, Claude under the hood) — https://www.tomsguide.com/how-to-use-websim ; https://grokipedia.com/page/websim
- Component marketplaces (storefront, categories, preview, install, ratings) — https://www.components.build/marketplaces ; https://www.adalo.com/features/component-marketplace/
- Storefront discovery conventions — https://apps.shopify.com/search-and-discovery
- Skeleton / perceived-performance UX (3s skeleton ≈ 1.5s spinner; neutral, motion, mirror-shape) — https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/ ; https://www.onething.design/post/skeleton-screens-vs-loading-spinners
- Error/retry UX & circuit-breaker / Haiku-fallback patterns — https://www.developersdigest.tech/blog/claude-api-reliability-error-handling
- BYOK onboarding UX (and why it's "usually fatal for consumer apps" if framed as raw key paste) — https://www.rilna.net/blog/bring-your-own-api-key-byok-tools-guide-examples
- Determinism-at-the-interface (cache first success, serve identically; temp=0 ≠ deterministic) — https://www.aiqnahub.com/same-ai-prompt-produces-inconsistent-results/ ; https://medium.com/@mail2mhossain/the-generative-ui-spectrum-controlled-declarative-and-open-ended-ai-interfaces-explained-2663335cdbdb
- Project blueprint & requirements — `docs/vibeappstore.md`, `.planning/PROJECT.md`

---
*Feature research for: client-side generative-UI app marketplace*
*Researched: 2026-06-24*
