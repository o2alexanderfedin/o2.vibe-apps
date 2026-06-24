# Vibe App Store

## What This Is

A browser-based **app marketplace** where users browse, open, and interact with **apps** — each of which is a live React widget produced on demand by a cheap LLM (Claude Haiku), cached per-app in IndexedDB, and injected into the page at runtime. Apps are composed of smaller **widgets** (also produced on demand), and any app or widget can be tweaked, cloned, or removed through a contextual natural-language prompt. To the user there is no "AI" and no "generate" button — apps simply *exist* on the platform, and the platform takes care of everything behind the storefront.

The product runs entirely client-side: there is no application server. The user supplies their own Anthropic API key (stored locally), and the platform calls `api.anthropic.com` directly from the browser. Backend-style data operations are themselves produced on demand as cached handlers.

## Core Value

**A user opens an app from the storefront and it renders and works** — instantly on a cache hit, seamlessly produced on a cache miss — **and nothing visible ever reveals that the app was made on demand.** The resolve → cache → compile → render → interact loop is the product; if everything else fails, this loop must still deliver a working, interactive app while preserving the illusion that apps are first-class platform citizens.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. All are hypotheses until shipped. -->

**Storefront & shell**
- [ ] User sees a marketplace storefront grid of available app types and can open one
- [ ] User can configure / change / clear their own Anthropic API key from the UI (stored locally)
- [ ] User can switch theme between light / dark / system, applied via CSS variables on `:root`

**Resolve → cache → render loop**
- [ ] Opening or interacting with an app produces a structured intent (operation, kind, type, cacheKey, context)
- [ ] On a cache hit, the app/widget renders immediately from the local registry (no model call)
- [ ] On a cache miss, the platform calls Haiku with the user's key, compiles the result, stores it, and renders it
- [ ] Generated source is compiled once (JSX → JS), the compiled string is stored, and it is never re-compiled from storage twice in a session
- [ ] An opened app renders inside an app shell with its own contextual menu

**Widgets & composition**
- [ ] An app can declare and use sub-widgets, which are resolved (cache or produce) before the app mounts
- [ ] A widget renders inside its own shell with its own contextual menu, independent of its parent app
- [ ] A failing widget shows a placeholder without crashing its parent app

**Contextual modification**
- [ ] A contextual prompt popover (shared by apps and widgets) accepts free-form natural-language instructions
- [ ] Prompt routing handles remove / clone / tweak intents (remove and clone resolved client-side without a model call)
- [ ] A tweak produces a new cache key, resolves it (cache or produce), and replaces the target in place

**Resilience**
- [ ] A render error is caught by an error boundary that offers a retry, without taking down the rest of the page
- [ ] A failed production attempt is automatically retried (bounded) with the compiler error fed back into the next attempt
- [ ] Missing/invalid API key, rate limiting, and storage-unavailable conditions degrade gracefully with neutral, non-revealing messaging

**Backend-style handlers (optional layer)**
- [ ] Apps and widgets can request a data operation through a single helper that resolves a cached handler or produces one on first need, transparently

**Devtools hygiene (cross-cutting, non-negotiable)**
- [ ] No browser-devtools-visible surface (JS symbol names, IndexedDB store/key names, console logs, network payloads/headers, source comments, CSS class names, HTML attributes, error messages, localStorage keys) reveals that apps are produced on demand
- [ ] The word "synthesize / synthesized / synthesis" appears in **no** devtools-visible surface — including source comments, since source maps expose them

### Out of Scope

<!-- Explicit boundaries with reasoning. -->

- **Server-side application backend** — the architecture is deliberately client-only; "handlers" run in-browser against mock/local data. No server to build or operate.
- **Real authentication / accounts / billing** — the subscription framing is product narrative; v1 has no auth system. The only credential is the user's own Anthropic API key in `localStorage`.
- **Multi-user sync / sharing of generated apps** — the registry is local (IndexedDB) per browser; no cloud registry in v1.
- **`<iframe sandbox>` isolation of generated code** — noted as a production hardening step; v1 runs generated code in a constrained `new Function()` scope. Tracked as a known security tradeoff, not v1 scope.
- **A user-visible "generate / AI / synthesize" surface** — actively excluded by the core illusion; the user never sees the mechanic.
- **Proxying the Anthropic API through our own server** — would break the client-only, zero-infra model and expose us to key handling; the key goes browser → `api.anthropic.com` only.

## Context

- **Pure browser application, no build step for generated code.** Generated JSX is compiled in the browser via `@babel/standalone` and instantiated with `new Function(...)`, receiving only an explicit, named scope (`React`, and for apps a `useWidget` hook). No `window`/`document`/globals leak into generated code.
- **Two-tier generation model.** "App" is the user-facing name for a top-level widget; "Widget" is the internal name for anything composable inside an app. The same resolve/cache/produce pattern applies to apps, widgets, and backend-style handlers.
- **Local-first registry.** A single IndexedDB database holds three object stores — `apps`, `widgets`, `handlers` — keyed by opaque hashes. Cache keys are stable: same type + normalized prompt → same key.
- **User-funded inference.** All model calls use the user's own Anthropic API key from `localStorage`, sent only to `api.anthropic.com` over HTTPS.
- **The illusion is a feature, not a detail.** An advanced user opening devtools (F12) must not be able to tell that apps are produced on demand. This shapes naming, logging, storage, network payloads, comments, CSS, and error copy throughout the codebase.
- **Reference blueprint:** `docs/vibeappstore.md` — the full system blueprint (layers, schemas, prompt templates, file/module structure, MVP checklist) that this project implements.

## Constraints

- **Tech stack**: React + react-dom, `@babel/standalone` (in-browser JSX compilation, loaded eagerly at init), IndexedDB (optionally via the `idb` wrapper), Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) via direct browser `fetch` to `/v1/messages` — Why: zero-infra, client-only, on-demand generation with the user's own key.
- **Security**: generated code runs only in a `new Function()` scope with an explicit named parameter list (no `eval`, no global pollution); rendering goes through React's virtual DOM (no `innerHTML`); the API key lives in `localStorage`, is sent only to `api.anthropic.com`, and is never logged or proxied — Why: arbitrary generated code must be contained and the user's secret protected.
- **Devtools hygiene (hard rule)**: nothing visible via F12 may reveal the on-demand mechanic; the literal token "synthesize/synthesized/synthesis" must not appear in any devtools-visible surface, including source comments — Why: the entire product premise is that apps simply exist on the platform.
- **Performance**: load Babel before the first production attempt (its ~450KB download must not block a cache miss); compile each app/widget once and persist the compiled string; keep a session-scoped in-memory compiled cache; pre-warm an app's declared widget dependencies before mounting it to avoid render-time waterfalls — Why: the loop must feel instant on hits and acceptable on misses.
- **Storage discipline**: never store compiled functions in IndexedDB — store the compiled JS string and re-instantiate via `new Function()` on load — Why: functions aren't serializable and recompilation must be controlled.
- **Resilience budget**: bounded self-heal retries (≈3) feeding the **compiler** error (not the runtime error) back to the model, because compiler errors are more actionable — Why: maximize the chance a cache miss still yields a working app.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Produce apps/widgets on demand via Claude Haiku using the user's own API key, fully client-side | Zero backend/infra; inference cost sits with the user; fits the "platform just works" narrative | — Pending |
| Single IndexedDB registry (`apps`/`widgets`/`handlers`) with stable opaque cache keys; store compiled JS string, never functions | Deterministic cache hits, serializable storage, compile-once guarantee | — Pending |
| "App" = user-facing top-level widget; "Widget" = internal composable building block; same resolve/cache/produce pattern for both (and for handlers) | One mental model and one engine for everything | — Pending |
| Run generated code in a constrained `new Function()` scope (React + `useWidget` only) rather than `<iframe>` for v1 | Simpler v1; iframe sandboxing deferred to production hardening | — Pending (⚠️ revisit for production) |
| Treat devtools hygiene / the "apps just exist" illusion as a first-class, enforced constraint across naming, logs, storage, network, comments, CSS, errors | The illusion is the product; a single leak breaks it | — Pending |
| Self-heal generation loop (≈3 attempts) feeding the compiler error back into the prompt | Compiler errors (line/token) are the most actionable feedback for the model | — Pending |
| Structure the roadmap as a **Vertical MVP** (each phase ships an end-to-end working slice) | Get a usable marketplace fast, then add capability slice by slice | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-24 after initialization*
