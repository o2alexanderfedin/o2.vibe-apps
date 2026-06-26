---
title: Blueprint-vs-Built Delta Report
blueprint: docs/vibeappstore.md
audited: 2026-06-25
method: 4 parallel read-only code audits (verified against live src/, not planning docs)
verdict: blueprint intent MET and exceeded; reality has pivoted past the doc (v1.1 delegated thin-shell)
legend: "✅ satisfied · 🟡 partial/different-shape · 🔀 diverged-by-design · ❌ missing/dormant"
---

# Blueprint ⇄ Built — Delta Report

**Bottom line:** `docs/vibeappstore.md` is the **pre-pivot v1.0 blueprint**. The codebase
implements essentially **all of its MVP checklist** and then **moved past it** with the v1.1
**delegated thin-shell** architecture. Most "gaps" are either (a) intentional improvements,
(b) the doc being stale vs. the Jun-25 pivot, or (c) MVP-narrowing of unbuilt breadth
(widgets/full-Intent). One substantive technical item stands out: the **cacheKey contract**.

368 tests green · `tsc` 0 · build clean · hygiene gate green.

---

## 1. Scorecard by blueprint layer

| Layer | Built? | Headline delta |
|---|---|---|
| **L0 — Storage (key/theme)** | ✅ | Neutral `marketplace.apiKey` / `marketplace.theme`; theme via `data-theme` + CSS vars. |
| **L1 — Intent Resolver** | 🟡 | `Intent` narrowed to `operation:"open"`, `kind:"app"` only; `contextBundle` is empty `{}`. Mutate/clone/remove live in a **separate** `routeModification`/`Modification` type, not the unified `Intent`. No Haiku classifier (deterministic by design). |
| **L2 — Registry / IndexedDB** | ✅/🟡 | DB + 3 stores exact. **cacheKey = SHA-256(type slug)** — drops `kind`+`prompt`. Record schemas trimmed (no `displayName`/`prompt`/`widgetDeps`/`createdAt`); widget/handler record types are untyped placeholders (dormant). |
| **L3 — AI Generation** | ✅/🟡 | Model id, all headers (+ the one the doc omits), `@widget` parse+prewarm, self-heal(3, Babel error), fence-strip — all ✅. Deltas: flat `MAX_TOKENS=8192` (not per-kind 1500/1000/800); simplified theming vars; dropped `<400`/`<300` line caps. |
| **L4 — Execution Engine** | ✅ | Classic-runtime Babel confirmed; `new Function` scope (superset: +`runHandler`,+`require` shim); `createRoot` Map-tracked; session transpiled cache. |
| **L5 — UI Surface** | ✅ | AppShell/WidgetShell/ContextualPrompt/Marketplace/AppBar all real and wired; storefront grid over 8-app registry; tweak/clone/remove route client-side, regen in-place. |
| **L6 — Backend Handlers** | ✅ / 🔀 | `runHandler(intent,input)`→resolve/produce/exec→`{data?,error?}`, transparent + DI. But repurposed (see §3). |
| **Error handling** | ✅ | Every error-table row satisfied (key-missing, 401, 429, transpile self-heal, render boundary, widget-dep placeholder, IDB→in-memory). |
| **Devtools hygiene** | ✅ | **CI gate** (`hygiene.test.ts`) bans the lexicon across `src/**`+`index.html`; neutral stores/keys/logs/CSS; `sourcemap:false`; CSP pinned+tested. |
| **Security** | ✅ | `new Function` scope contained; React vdom (no innerHTML); key only → `api.anthropic.com`, never logged; handler denylist-shadowed scope; prompt-as-string. |

---

## 2. The genuinely actionable gaps (not just doc drift)

| # | Gap | Severity | Detail | Where |
|---|---|---|---|---|
| G1 | **cacheKey omits `kind` + `prompt`** | ⚠️ Medium | Key = `SHA-256(type)` only. → (a) app/widget **collision** if widgets activate (same type slug); (b) per-prompt/tweak variants don't get **distinct keys** — tweaks are forced through the model path instead of being keyed/cached. Blueprint specifies `hash(kind::type::prompt)`. Not breaking *today* (widgets dormant), but it's a latent correctness constraint. | `registry/cacheKey.ts`, `loader.ts:230-233`, `handler.ts:189` |
| G2 | **`Intent` narrowed; no unified mutate/clone/remove** | 🟡 Low | Functionally covered by the parallel `routeModification` path, but the blueprint's single `Intent { operation, kind, contextBundle{...} }` contract is unbuilt. Matters only if you want one resolver to drive every action. | `intent/resolver.ts`, `intent/routeModification.ts` |
| G3 | **Widget & handler record schemas untyped/dormant** | 🟡 Low | Stores exist; `WidgetRecord`/`HandlerRecord` are `Record<string,unknown>` placeholders. The user-facing *widget* generation path is built but **dormant** (delegated apps never declare `@widget`). | `registry/db.ts:37-38` |
| G4 | **Per-kind token budgets absent** | ℹ️ Info | Flat `MAX_TOKENS=8192` (raised because 2048 truncated real components). Arguably **better** than the doc's 1500/1000/800 — flag only for doc reconciliation. | `modelClient.ts:26` |
| G5 | **Missing persisted fields** (`displayName`, `prompt`, `widgetDeps`, `createdAt`) | 🟡 Low | Trimmed for MVP; `useCount`/`updatedAt` (LRU) present. `displayName`/`prompt` would be needed for a richer storefront + faithful re-gen. | `registry/db.ts:30-36` |

---

## 3. Intentional divergences — reality is *ahead* of the blueprint

These are **not deficiencies**; they're the v1.1 pivot the doc predates.

- **🔀 Delegated thin-shell (the core divergence).** The blueprint assumes a **monolithic**
  model: one call → a complete `<400`-line app. Reality: **unseeded apps are behavior-free
  "delegated modules"** exporting `initialState` + a *markup-only* `view(state)` (interactive
  elements carry `data-action`, **no handlers**) + a precise `actionSpec`. A **permanent**
  `DelegatedShell` mounts it with **one container `onClick` delegate** that **produces each
  action's handler on demand** via `runHandler` and **caches it** (stable per-`(appType,action)`
  intent key → re-press is an O(1) hit = "attached forever").
  → **Contradicts** the monolithic `<400`-line constraint; **makes handlers the *primary*
  behavior mechanism** (the doc treated them as occasional backend helpers).
- **🔀 Handlers as TypeScript + require-purity guard.** Produced as TS (strip-only, no JSX),
  rejected if transpiled output contains `require(` (the model sometimes imports an SDK to
  "compute"); run in a denylist-shadowed `new Function` scope. Not in the blueprint.
- **🔀 Positive header divergence.** Code adds `anthropic-dangerous-direct-browser-access:true`
  — **required** for the browser CORS path; the blueprint's Auth line omits it.
- **🔀 Resilience + DI layers beyond the doc.** `host/` (TokenBucket, backoff, produceGate cost
  cap, global error backstop, storage-pressure LRU) and `services/` (IoC: transport/registry/
  key/gate injected so tests substitute the model) — neither is in the blueprint's structure.
- **🔀 Seeds stay monolithic** with a graceful **delegated→monolith fallback**; legacy records
  default `mode:"app"`.

---

## 4. Structural relocation (doc tree vs. reality)

| Blueprint dir | Reality | Note |
|---|---|---|
| `src/db/` | `src/registry/` | + `cacheKey.ts`, `registry.ts`, `storagePressure.ts` |
| `src/intent/{resolver,classifier,router}` | `src/intent/{resolver,routeModification}` | no `classifier.ts` (deterministic); `router`→`routeModification` |
| `src/generation/` | folded into `src/execution/producer.ts` (+`transpile.ts`, `widgetParse.ts`, `widgetPrewarm.ts`) | one producer drives app/widget/handler/shell/delegated kinds |
| `src/store/` | `src/lib/storage.ts` | — |
| — | `src/host/`, `src/services/`, `src/data/`, `src/apps/` | resilience, DI, app registry, seeds — **new layers** |
| `src/app.tsx` | `src/App.tsx` + `src/main.tsx` | — |

---

## 5. What "build this blueprint" would actually mean now

The blueprint is **~95% already built or deliberately superseded.** Remaining *real* work, if
any, is small and optional:

1. **G1 — cacheKey contract** (the one worth doing): fold `kind` (and a normalized `prompt`
   hash for tweaks) into the key, so widgets can't collide and tweak-variants cache distinctly.
2. **G2/G3 — activate widgets** as a first-class user path (currently dormant) + type the
   widget/handler records — *only if* widget composition is a goal for the next milestone.
3. **G5 — persist `displayName`/`prompt`** for a richer storefront + faithful re-gen.
4. **Doc reconciliation** — update `docs/vibeappstore.md` to describe the delegated model,
   flat token budget, simplified theming vars, and the host/services layers (so the blueprint
   stops contradicting reality).

Everything else in the MVP checklist (lines 670-689) is **done**.
