# Feature Research

**Domain:** Client-only generative app marketplace (Vibe App Store) — milestone v1.1 "Real & Robust"
**Researched:** 2026-06-25
**Confidence:** HIGH (general UX domains are well-established; client-only/devtools-hygiene constraints applied from PROJECT.md)

> **Scope note.** This file researches the *expected user-facing behavior* of four NEW v1.1 capabilities layered on a shipped v1.0:
> **A.** Network-data path (Weather/Currency fetch real data) · **B.** Reliability hardening (produced behavior correct more often) · **C.** Richer storefront (persist displayName/prompt + "popular" row) · **D.** Activate widget composition (`@widget` first-class).
>
> Throughout, "table stakes" means *what a user of a polished weather/currency/dashboard app already assumes works* — not what the v1.0 store currently does. The hard non-negotiable on top of every row: **nothing the user sees may reveal that the app was made on demand** (HYGIENE-01..05, enforced by the CI lexicon gate).
>
> *(Supersedes the v1.0 FEATURES.md for this milestone; v1.0 version preserved in git history.)*

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = the app feels broken or "fake."

| # | Feature | Why Expected | Complexity | Notes / Dependency on existing v1.0 |
|---|---------|--------------|------------|-------------------------------------|
| **A1** | **Loading state on first data fetch** (skeleton/spinner, not a blank panel) | Every data app shows *something* while the first request is in flight | LOW | Reuses SHELL-02 neutral loading affordance. Must read as "loading data," not "generating app" (HYGIENE-01). |
| **A2** | **Error state with retry** (network fail / non-200 / bad shape → message + "Try again") | A weather app that silently shows nothing on a dropped request feels broken | LOW–MEDIUM | New egress needs typed errors mirroring RESIL-01's pattern. Retry must not re-produce the app — only re-run the fetch. |
| **A3** | **Empty / "no data" state** (e.g. unknown city, no rates for a pair) | Distinct from error: the request succeeded but returned nothing useful | LOW | A produced view must distinguish empty vs error or it looks buggy. |
| **A4** | **Real data, correctly shaped** (actual temp/conditions, actual FX rate) | The entire point of the network-data path; a fallback constant reads as fake | MEDIUM | **Depends on the sanctioned network-data path** — the v1.0 handler scope is `fetch`-denied, so today these degrade to a fallback. This is the milestone's keystone. |
| **A5** | **Client-side cache of fetched data with sane freshness** (don't re-hit the API on every keystroke/open) | Polished weather/currency apps reuse recent data; instant re-open | MEDIUM | Norm: **weather ~10 min TTL**, **currency/FX ~daily** (most free FX feeds update once/day; daily is honest and rate-limit-friendly). Separate store from the compiled-code cache. |
| **A6** | **Manual refresh affordance** (a refresh control re-fetches now) | Users expect to force-update time-sensitive data | LOW | Refresh re-runs the *fetch*, not the produce loop. Should show A1 again (or a subtle stale-overlay, see A8). |
| **A7** | **Rate-limit friendliness** (no hammering; backoff on 429) | A BYOK client app that burns a free-API quota gets the user blocked | LOW–MEDIUM | Reuse RESIL-02 backoff/token-bucket *concept* as a separate limiter for the data egress (the model token-bucket is a different budget). Prefer no-key/CORS APIs (Open-Meteo, Frankfurter/ExchangeRate-API open) so there's no quota to exhaust and no key to leak. |
| **B1** | **Correct increments / state transitions** (a +1 button adds exactly 1; a toggle toggles) | The single most basic trust signal; off-by-one or no-op buttons scream "broken" | MEDIUM | Core of reliability hardening. Stronger action-spec contract + reducer validation on produced delegated handlers (HANDLER-01..03). |
| **B2** | **No stuck states** (a button press always resolves to a visible result or a clean error — never a permanent spinner) | A control that "does nothing" or hangs is the worst failure mode | MEDIUM | Action handlers must always settle. On a mishandled action, fall through to a safe no-op + (silent) self-heal rather than freeze. Bounded like RESIL-04 (~3). |
| **B3** | **Graceful handling of an action the reducer mishandles** (unknown/invalid action → previous state preserved, app stays usable) | Generated reducers will sometimes emit a bad transition; the app must not crash or corrupt | MEDIUM | FSM best practice: **guard transitions; unknown action returns current state unchanged (no-op), never throws.** Pair with RESIL-03 error boundary as the last line. |
| **B4** | **Persisted state survives re-open** (a counter/notes app remembers its value) | Users assume their data sticks | LOW | Already largely covered by the registry/IndexedDB; reliability hardening must not regress it. |
| **C1** | **Faithful re-produce / stable identity** (an app keeps its name and behaves the same after reload) | An app that renames itself or drifts on reload reads as unstable | LOW | **Depends on G5** — persist `displayName` + `prompt` (+ `widgetDeps`/`createdAt`). Today these are trimmed. |
| **C2** | **Human-readable app name on cards** | A storefront of slug-only cards feels unfinished | LOW | `displayName` persisted (G5). |
| **D1** | **A composed app renders all its parts** (an app made of sub-widgets shows them assembled, seamlessly) | If an app declares pieces, the user expects to see the whole | MEDIUM | Activates dormant WIDGET-01..03 (parse `@widget`, pre-warm, mount). Must look like one app, not a debug tree. |
| **D2** | **A failing widget doesn't take down the app** (one broken piece → placeholder, rest works) | Partial failure beats total failure; standard dashboard expectation | LOW–MEDIUM | Already built as WIDGET-05 — v1.1 just needs to keep it true once composition is a real path. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Aligned with the Core Value (apps "just exist" and work).

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| **A8** | **Stale-while-revalidate freshness** (show last-good data instantly on re-open, refresh silently in the background) | Feels instant *and* fresh — the SWR pattern that powers polished data apps; no spinner on a warm open | MEDIUM | Cached data renders immediately; background fetch updates in place. A subtle "updated just now"/faint stale tint is the polish. Reinforces "apps just exist and are fast." |
| **A9** | **Graceful offline / last-known-good** (network down → show cached data labeled as last update, not an error) | A weather app showing yesterday's reading beats one showing a red error | LOW–MEDIUM | Builds on A5. Strong perceived-reliability win for near-zero cost. |
| **B5** | **Invisible self-heal on bad behavior** (a mishandled action quietly re-produces a corrected handler; user just sees it work the second time — or it works first time after validation) | The reliability story *is* the differentiator: produced behavior that's right more often, failures hidden behind the illusion | MEDIUM–HIGH | Extends RESIL-04 self-heal from compile-time to behavior-time. Must stay silent (HYGIENE-01) — no "regenerating…" text. Bounded; on exhaustion, B3 no-op keeps it usable. |
| **C3** | **"Popular on the platform" row** (most-opened apps surfaced on the storefront) | Gives the storefront depth and a sense of a living platform; classic discovery surface | LOW | **POP-01.** Drives off `useCount` already persisted for LRU (RESIL-06). Ranking/tie-break/count detailed below. |
| **C4** | **Richer card metadata feeding discovery** (description, created-at, maybe a composition badge) | Cards that describe themselves are more inviting and more "real" | LOW | Persisted via G5. Enables better-looking rows than slug-only cards. |
| **D3** | **Per-widget contextual menu / tweak** (each sub-widget independently tweakable/clonable/removable) | Composition becomes *interactive* depth, not just layout — tweak one piece without touching the rest | MEDIUM | WIDGET-04 already gives each widget its own shell+menu. Differentiator is coherence once widgets are real, with correct keys (G1-followups: fold `kind`+prompt so widget variants don't collide). |
| **D4** | **Composition that pre-warms (no render waterfall)** (a composed app appears assembled at once, not piece-by-piece popping in) | Smooth assembly preserves the "it just exists" feel | MEDIUM | WIDGET-03 transitive pre-warm already exists; v1.1 keeps it honest under real composition. |

### Anti-Features (Commonly Requested, Often Problematic)

Several would directly violate the project's hard constraints.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Arbitrary user-typed URLs / "connect any API"** in produced apps | "Let the weather app call whatever the user wants" | Defeats CSP `connect-src` (SEC-04) the moment you widen it; turns the fetch-denied scope into an open exfil/SSRF surface for the user's key; unbounded CORS failures | **Curated allowlist** of no-key, CORS-enabled endpoints (Open-Meteo, Frankfurter/ExchangeRate-API open). Add to `connect-src` explicitly. The path is *sanctioned*, not open. |
| **A visible "refresh/generating/AI" indicator that narrates fetching upstream** | "Show the user it's fetching live data" | A spinner saying *generating*, or a Network tab full of model/source streams, leaks the mechanic (HYGIENE-01..05) | Neutral "loading data" affordance only; keep produce calls non-streaming and out of the visible data-refresh path. A visible fetch to a *weather/FX* host is fine — it reveals "talks to a weather API," not the on-demand mechanic. |
| **Real-time / websocket live updates** for weather & FX | "Make it live" | Free FX feeds update ~daily; weather ~10–60 min. Live polling burns quota and rate-limits with zero freshness gain | Poll-on-open + SWR + manual refresh, TTL matched to the source's real update cadence (A5/A8). |
| **Global "trending" leaderboard / cross-user popularity** | "See what's popular everywhere" | No server, no cross-user sync (explicit Out-of-Scope); `useCount` is a **local-only** signal. Implying it's global is dishonest and impossible | "Popular **on the platform**" framed as *this browser's* most-opened; seed defaults so a fresh install isn't empty. Never claim cross-user data. |
| **Ratings / reviews / download counts on cards** | App-store realism | No accounts, no server, no real userbase — fabricated numbers are deceptive and add UI with no signal | Use the honest local signal (`useCount` → "popular") + descriptive metadata (C4); skip fake social proof. |
| **Deeply nested / recursive widget trees** | "Compose anything from anything" | Render waterfalls, exploding produce cost (RESIL-05 gate), cache-key collisions, debugging hell; each level multiplies failure surface | Cap composition depth (one level of `@widget`, maybe two); pre-warm (D4); enforce the cost cap. First-class ≠ unbounded. |
| **Surfacing widget/handler internals (action specs, cache keys) in the UI** | "Power-user transparency" | Reveals the on-demand machinery → hygiene violation | Keep it all behind the storefront illusion; per-widget menu exposes *tweak/clone/remove* only, never the spec. |
| **Streaming produced behavior into the running app** | "Faster perceived response" | Can't run partial code; SSE source stream is a Network-tab leak (explicit Out-of-Scope) | Non-streaming produce; O(1) cache hit on re-press is already the fast path. |

---

## Feature Dependencies

```
A4 (real data correctly shaped)
    └──requires──> Sanctioned network-data path (CSP connect-src + allowlisted no-key CORS APIs)
                       └──requires──> SEC-04 CSP (exists) widened deliberately, not opened

A5 (client data cache) ──enables──> A8 (stale-while-revalidate) ──enables──> A9 (offline last-known-good)
A2 (error+retry) + A6 (manual refresh) ──share──> data-egress error model (mirrors RESIL-01) + data rate limiter (mirrors RESIL-02)

B3 (graceful mishandled action: guard → no-op, never throw)
    └──is the floor under──> B1 (correct increments) and B2 (no stuck states)
B5 (invisible self-heal on bad behavior)
    └──requires──> B3 (safe no-op fallback) + RESIL-04 (bounded self-heal) + RESIL-03 (error boundary)

C3 (popular row)
    └──requires──> useCount (exists, persisted for RESIL-06 LRU)
C1/C2/C4 (faithful re-produce, name, description)
    └──requires──> G5 (persist displayName/prompt/widgetDeps/createdAt)

D1 (composed app renders parts)
    └──requires──> WIDGET-01/02/03 (parse @widget, pre-warm, mount — built but dormant)
    └──requires──> G3 (real WidgetRecord/HandlerRecord schemas, replace placeholder types)
    └──requires──> G1-followups (fold kind + prompt-hash into cacheKey so widget variants don't collide)
D3 (per-widget tweak) ──requires──> WIDGET-04 (per-widget shell+menu, exists) + G1-followups (distinct keys per variant)
D2 (widget failure isolation) ──is──> WIDGET-05 (exists) — must remain true once composition is live

HYGIENE-01..05 ──constrains──> EVERY feature above (no visible mechanic; banned lexicon; key only to api.anthropic.com)
```

### Dependency Notes

- **A4 is the milestone keystone.** Everything else in track A (caching, refresh, SWR, offline) is decoration on top of "the fetch actually happens." The blocker is the `fetch`-denied handler scope; the fix is a *narrow, allowlisted* egress added to CSP — not a general unlock.
- **B3 underpins B1 and B2.** "Correct increments" and "no stuck states" both follow from a reducer that guards transitions and treats unknown actions as no-ops instead of throwing/hanging. Build the guard contract first; correctness and non-stuckness follow.
- **C-track is cheap because the signals already exist.** `useCount` is persisted (for LRU); G5 metadata is a schema/persistence change, not new machinery. POP-01 is mostly a sort + a row.
- **D-track is "activate, don't build."** The widget machinery (parse/pre-warm/mount/per-widget shell/failure isolation) shipped dormant in v1.0. The real work is **cache-key correctness (G1-followups)** and **real schemas (G3)** so activated widgets don't collide on a bare `SHA-256(type)`.
- **Hygiene conflicts with naive implementations everywhere.** Any visible "generating/refreshing-via-AI" affordance, any exposed action spec, any streamed source breaks the premise. Each track must route its loading/error/empty UI through neutral, data-framed (not mechanic-framed) language.

---

## MVP Definition

### Launch With (v1.1)

Minimum to make the milestone's promise ("real & robust") true.

- [ ] **A4 — Sanctioned network-data path** (allowlisted no-key CORS endpoints in CSP; Weather via Open-Meteo, Currency via Frankfurter/ExchangeRate-API open) — *the keystone; without it the network apps stay fake.*
- [ ] **A1/A2/A3 — Loading / error+retry / empty states for fetched data** — *a data app without these reads as broken.*
- [ ] **A5 — Client-side data cache with TTL** (weather ~10 min, FX ~daily) — *rate-limit friendliness + instant re-open.*
- [ ] **B3 — Guarded reducer / unknown-action no-op (never throw, never hang)** — *the floor under all reliability.*
- [ ] **B1/B2 — Correct increments + no stuck states** — *most basic trust signals.*
- [ ] **C1 + G5 — Persist displayName/prompt for faithful re-produce + stable identity** — *storefront depth's prerequisite.*
- [ ] **C3 + POP-01 — "Popular on the platform" row from useCount** — *cheap, high-visibility depth.*
- [ ] **D1 + G3 + G1-followups — Composed app renders its declared widgets, with correct cache keys + real schemas** — *makes composition first-class.*
- [ ] **D2 — Keep widget failure isolation true under real composition** (WIDGET-05) — *partial failure must not become total.*

### Add After Validation (v1.x)

- [ ] **A8 — Stale-while-revalidate** — *add once A5 caching is proven; turns "fast" into "fast and fresh."*
- [ ] **A9 — Offline last-known-good labeling** — *trigger: users hit flaky networks.*
- [ ] **A6 — Manual refresh control** — *trigger: users want to force-update before the TTL elapses.*
- [ ] **B5 — Invisible behavior self-heal** — *trigger: B-track metrics show residual mishandled-action rate worth the produce cost.*
- [ ] **C4 — Richer card metadata (description, composition badge)** — *trigger: storefront feels sparse after C1/C3.*
- [ ] **D3 — Per-widget contextual tweak as a coherent path** — *trigger: composition is used and users want piece-level edits.*

### Future Consideration (v2+)

- [ ] **HARD-01 — iframe sandbox isolation** — *deferred per MVP-first; the correct end-state for running now-network-capable produced code, but out of v1.1.*
- [ ] **Multi-level widget composition (depth > 1)** — *only after single-level composition proves stable and cost is bounded.*
- [ ] **G2 — Unified Intent contract** — *internal refactor; defer unless it blocks the above.*

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| A4 Sanctioned network-data path | HIGH | MEDIUM | P1 |
| A1/A2/A3 Loading/error/empty states | HIGH | LOW | P1 |
| A5 Client data cache + TTL | HIGH | MEDIUM | P1 |
| B3 Guarded reducer / no-op fallback | HIGH | MEDIUM | P1 |
| B1/B2 Correct increments / no stuck states | HIGH | MEDIUM | P1 |
| C1 + G5 Persist displayName/prompt | MEDIUM | LOW | P1 |
| C3 + POP-01 Popular row | MEDIUM | LOW | P1 |
| D1 + G3 + G1-followups Composed render + keys/schemas | HIGH | MEDIUM | P1 |
| D2 Widget failure isolation (keep true) | HIGH | LOW | P1 |
| A8 Stale-while-revalidate | MEDIUM | MEDIUM | P2 |
| A6 Manual refresh | MEDIUM | LOW | P2 |
| A9 Offline last-known-good | MEDIUM | LOW | P2 |
| B5 Invisible behavior self-heal | MEDIUM | HIGH | P2 |
| C4 Richer card metadata | LOW | LOW | P2 |
| D3 Per-widget tweak coherence | MEDIUM | MEDIUM | P2 |
| HARD-01 iframe isolation | HIGH (security) | HIGH | P3 |
| Multi-level composition | LOW | HIGH | P3 |

**Priority key:** P1 = must have for v1.1 launch · P2 = should have, add when possible · P3 = future.

---

## "Popular on the Platform" Row — Pattern Detail (C3 / POP-01)

A focused dig because the question asks specifically about it:

- **How many:** A single horizontal row of **4–6 cards** is the discovery-row norm (enough to feel curated, few enough to scan). With only ~8 seeded app types, **~4–5** keeps "popular" meaningfully *selective* rather than "almost all of them."
- **Ranking:** Sort by `useCount` descending (the same field RESIL-06 already persists for LRU). No download counts, no ratings — `useCount` is the only honest local signal.
- **Ties:** Break deterministically so the row doesn't reshuffle on every render — e.g. tie-break by most-recently-used (last-open/`createdAt`) then by stable name. Avoid random tie-breaks (looks buggy).
- **Cold start:** A fresh install has all-zero counts → an empty or arbitrary row. Seed with a sensible default ordering (or hide the row until N opens) so it never looks broken on day one.
- **Privacy of a local-only signal:** `useCount` is **per-browser, never synced** (no server, Out-of-Scope). Frame the row honestly as platform/local popularity; do **not** imply cross-user trending (anti-feature). No PII, no transmission — fully consistent with the client-only model and HYGIENE-05.
- **What richer metadata buys (G5):** `displayName` makes the row legible (not slugs); `description` makes cards inviting; persisting `prompt` enables faithful re-produce so a "popular" app behaves the same each open (C1). Without G5, the row is slug cards with drifting behavior.

---

## Data-State Norms Cheat-Sheet (Track A)

For the produced weather/currency apps to read as "polished":

| State | Weather | Currency / FX |
|-------|---------|---------------|
| Loading (first fetch) | Skeleton/spinner, neutral copy | Skeleton/spinner |
| Error (network/non-200/bad shape) | Message + Retry (re-fetch only) | Message + Retry |
| Empty (valid request, no data) | "City not found" | "No rate for that pair" |
| Stale / cached | SWR: show last-good instantly, refresh in bg; optional "updated X ago" | Same; show rate date |
| Refresh cadence / TTL | **~10 min** (weather updates 10–60 min upstream) | **~daily** (most free feeds update once/day) |
| Rate-limit posture | Poll-on-open + cache; no live polling; backoff on 429 | Same; FX especially gains nothing from frequent polls |

Recommended no-key, CORS-enabled endpoints (must be added to CSP `connect-src` explicitly): **Open-Meteo** (weather, no key, CORS on, ~10k free calls/day, requires attribution text near the display), **Frankfurter** or **ExchangeRate-API open endpoint** (FX, no key, CORS on, daily ECB rates). The reliability/optimistic-feedback track (B1/B2) can lean on React 19's built-in `useOptimistic` already in the stack.

---

## Competitor Feature Analysis

| Feature | Real app store (Apple/Google) | Polished data app (e.g. a weather PWA) | Our Approach |
|---------|-------------------------------|----------------------------------------|--------------|
| Popularity surface | Server-aggregated Top/Trending across all users | n/a | Local-only `useCount` framed as "popular on the platform"; never cross-user |
| Data freshness | n/a | SWR + TTL (~10 min weather), manual refresh | Same SWR/TTL norms, but fetch routed through a *sanctioned* allowlist under CSP |
| Failure isolation | Whole-app crash → store relaunch | Per-widget error boundaries on a dashboard | WIDGET-05 per-widget placeholder; one widget fails, app survives |
| Behavior correctness | Ships vetted binaries | Hand-written, deterministic | Produced-on-demand + guarded reducers + invisible self-heal (the differentiator and the risk) |
| Composition | Static layouts | Module-federation micro-frontends | `@widget` composition, depth-capped, pre-warmed, hygiene-hidden |

---

## Sources

Data-state & SWR patterns:
- [UI best practices for loading, error, and empty states in React — LogRocket](https://blog.logrocket.com/ui-design-best-practices-loading-error-empty-state-react/)
- [Stale-While-Revalidate — newline](https://www.newline.co/courses/react-data-fetching-beyond-the-basics/stale-while-revalidate)
- [Handling API Errors & Loading States in React — DEV](https://dev.to/addwebsolutionpvtltd/handling-api-errors-loading-states-in-react-clean-ux-approach-54o7)
- [Weather data caching / TTL norms — QWeather best practices](https://dev.qweather.com/en/docs/best-practices/cache/) · [Weather API common usage / Cache-Control](https://developer.weather.com/docs/api-common-usage-guide)

No-key, CORS-enabled APIs:
- [Open-Meteo — free weather API, no key, CORS](https://open-meteo.com/) · [Open-Meteo GitHub](https://github.com/open-meteo/open-meteo)
- [ExchangeRate-API open endpoint, no key](https://www.exchangerate-api.com/docs/free) · [Frankfurter / exchangerate.host](https://exchangerate.host/) · [Best free currency APIs 2026 — AllRatesToday](https://allratestoday.com/blog/best-free-currency-exchange-api-2026/)

Reliability / FSM / optimistic UI:
- [A Guide to Finite State Machines — BLT](https://bltinc.com/2024/11/04/finite-state-machines-guide/) (guards, error states, unknown-action = invalid/discarded)
- [useOptimistic — React docs](https://react.dev/reference/react/useOptimistic) · [Optimistic UI patterns — murtazaweb](https://murtazaweb.com/blog/2026-03-22-optimistic-ui-updates-patterns/) (instant feedback, explicit rollback, no stuck states)

Discovery / popularity:
- [App Store Ranking Factors — Moburst](https://www.moburst.com/blog/app-store-ranking-factors/) · [ASO Ranking Factors 2026 — App Radar](https://appradar.com/academy/app-store-ranking-factors)

Widget composition / isolation:
- [Error Boundaries in Micro-frontend Architecture — Medium/DevXtalks](https://medium.com/devxtalks/error-boundaries-in-micro-frontend-architecture-5b5dd2c71541) · [Building Resilient Micro Frontends — Habsi Tech](https://blog.habsi.net/building-resilient-micro-frontends-a-practical-guide-to-composable-web-architectures/)

Project context:
- `/Volumes/Unitek-B/Projects/o2.vibe-apps/.planning/PROJECT.md` (v1.1 milestone, Validated v1.0 requirements, constraints, hygiene gate)

---
*Feature research for: client-only generative app marketplace — v1.1 "Real & Robust"*
*Researched: 2026-06-25 · Confidence: HIGH (UX domains verified across multiple current sources; constraints applied from PROJECT.md)*
