# Phase 17: Search / Launcher Panel - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Autonomous (grey areas resolved with noted defaults; research-grounded).

<domain>
## Phase Boundary

Replace the Phase-16 `MinimalLauncher` stub with the full **search/launcher panel**: a text input + action button **and** a pre-installed apps list; submitting a description **finds-or-produces** the app via the real resolve→produce→cache→mount loop (idle/working/result), and the result opens as a window on the desktop. Requirements: **CREATE-01, CREATE-02, CREATE-03**.

**In scope:** the panel UI (input + examples + pre-installed grid), the describe→produce→window flow with idle/working/result states, reusing the existing produce path. **Out of scope this phase:** making *generated* apps theme-aware (Phase 18 — produce-prompt contract + post-compile color check + name sanitization).
</domain>

<decisions>
## Implementation Decisions (auto-resolved — KISS/research-grounded; override if you disagree)

1. **Evolve `MinimalLauncher` → `SearchLauncherPanel`** (or a new component replacing it at the same `onOpenLauncher` seam). Keep its pre-installed grid + the `onOpen(appType, displayName)` path (that already works). ADD: a text input + action button + example-prompt chips (CREATE-01 "offers example prompts").
2. **Describe → produce → window** (the key new integration, CREATE-02). Submitting free text routes through the **existing produce path** the `DesktopShell` already owns (`wm.open` → `resolveOpenApp` → `resolveComponent`). Derive a type slug from the text and pass the **full text as the producing prompt** so the cache key (which folds prompt) caches per-description and the producer generates the component. **PRIMARY RISK / design point:** verify `resolveOpenApp`/`resolveComponent`/`producer` can produce from an arbitrary free-text prompt; if they assume a known type, add a thin free-text entry point (derive slug + use text as prompt) — do NOT fork the produce path, reuse it.
3. **States idle / working / result** (CREATE-02):
   - **idle** = input + example chips + pre-installed grid.
   - **working** = a genuine loading affordance during produce (real latency on a cache miss; instant on a hit). Reuse the existing in-window **"Preparing…"** placeholder the DesktopShell already renders while produce settles; the panel shows a branded, **mechanic-free** working indicator (step copy like "Working…" / design-style copy is fine — NO banned tokens).
   - **result** = on success the app **opens as a window** on the desktop and the panel closes (the window appearing IS the result). A brief in-panel success/preview before opening is optional polish, not required.
4. **Cache hit = instant, miss = produced** (CREATE-02/03): reuse resolve→produce→cache→mount verbatim — no redundant model call on a hit.
5. **Pre-installed pick** opens directly (no key needed for seeded apps) — keep current behavior; launched apps appear in the dock (Phase 16).
6. **Graceful, neutral failure** (CREATE-03 + existing RESIL): the DesktopShell already handles `ProduceAuthError` (→ KeyDialog) and `ProduceThrottledError` (→ soft-cap fallback). The panel must surface these as **neutral, data/UX-framed** states (e.g. "Add your key to create new apps", "Try again in a moment") that **never name the mechanic**; a cache-miss describe needs the API key (seeded picks don't).
7. **Hygiene** (CREATE-03): no surface in the flow names the mechanic — input placeholder, button label, working copy, examples, errors all use neutral/branded language (the word "vibe"/"create"/"open" is fine; `synthesi*`/`AI`/`llm`/`generate`/`fake`/`mock` are not). Model-supplied produced names being sanitized for chrome is Phase 18 (TGEN-03) — but keep Phase 17 copy clean.

</decisions>

<code_context>
## Existing Code Insights (scouted)

- `src/ui/MinimalLauncher.tsx` — `{ onOpen(appType, displayName), onClose }`; renders `APP_REGISTRY` (pre-installed catalog) as a grid; click → `onOpen(app.id, app.displayName)`. This is what the full panel replaces/extends.
- `src/ui/DesktopShell.tsx` — owns the open flow: `wm.open(appType, …)` → `resolveOpenApp(appType)` (`src/intent/resolver.ts`) → `resolveComponent(...)` (`src/execution/loader.ts`); renders a **"Preparing…"** placeholder while produce is in flight; handles `ProduceAuthError` (key missing) + `ProduceThrottledError` (cost cap). The panel's describe-submit should reuse this exact flow.
- `src/intent/resolver.ts` (`resolveOpenApp`), `src/execution/loader.ts` (`resolveComponent`, `evictLiveComponent`), `src/execution/producer.ts` (`ProduceAuthError`, the Haiku produce), `src/host/produceGate.ts` (throttle) — the produce machinery to reuse for free-text.
- `src/registry/cacheKey.ts` / `registryKey(kind, type, prompt)` — folds the prompt, so a free-text description caches as its own app (distinct per description).
- `design/VibeOS.dc.html` — the "Vibe Store" panel reference: input + "Vibe it" button, example suggestion chips, vibing progress, result card → "Open app". Use for structure; reword freely.

</code_context>

<specifics>
## Specific Ideas / Acceptance

- Magnifier (dock) opens the panel: text input + action button + example chips + pre-installed grid.
- Typing a description and submitting shows a genuine working state (real produce latency on a miss), then opens the app as a window on the desktop; a cache hit opens immediately with no extra model call.
- Selecting a pre-installed app opens it as a window (current behavior preserved); launched apps appear in the dock.
- Key-missing on a describe → neutral "add key" affordance (KeyDialog), never mechanic-framed; throttle → neutral "try again".
- No surface in the flow contains a banned lexicon token.
- All existing tests stay green (636); `tsc` 0; build clean (no source maps); hygiene gate green incl. the new panel file. TDD with real captured-Haiku fixtures (the describe→produce path tested offline against a fixture); IoC/DI preserved.

</specifics>

<deferred>
## Deferred Ideas

- Theme-aware **generated** apps: produce-prompt CSS-var contract + post-compile hardcoded-color check + model-name sanitization (Phase 18).
- Streaming/typing progress affordance (Out of Scope — hygiene leak + non-functional).
- Rich result-preview card before opening (optional polish; opening the window directly is the default).
- Search *filtering* of the pre-installed list as you type (nice-to-have; the input's primary job is describe→produce).

</deferred>
