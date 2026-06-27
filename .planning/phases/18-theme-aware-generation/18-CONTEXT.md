# Phase 18: Theme-Aware Generation - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Autonomous (grey areas resolved with noted defaults; research-grounded). FINAL phase — highest novelty; needs the var contract (P14) live + apps in windows (P15–17) to verify end-to-end.

<domain>
## Phase Boundary

Make **produced** apps theme-aware: they reference the theme variable contract (so they re-skin on theme switch), a post-compile check catches hardcoded colors and feeds the self-heal loop, model-supplied names are sanitized before display, and the CI lexicon gate covers all new v2.0 surfaces. Requirements: **TGEN-01, TGEN-02, TGEN-03, HYGIENE-06**.

**In scope:** the produce-prompt contract, the post-compile color check + self-heal wiring, name sanitization at the display boundary, and finalizing the hygiene gate. **Out of scope:** new product surfaces (this phase hardens generation + closes the milestone).
</domain>

<decisions>
## Implementation Decisions (auto-resolved — KISS/research-grounded; override if you disagree)

1. **Produce-prompt contract (TGEN-01).** Extend `buildPrompt(type, kind, userPrompt)` (and ensure it carries into all kinds: app / widget / handler / tweak via `buildRepairPrompt`/`buildLengthPrompt` too) to **mandate the theme variable contract**: instruct the model to color UI via `var(--accentA)`, `var(--accentB)`, `var(--text)`, `var(--glass)`, `var(--glass2)`, `var(--bord)`, `var(--hi)` (and gradients from `--accentA`→`--accentB`) **instead of hardcoded brand colors**. EXPLICITLY allow neutral `rgba(0,0,0,α)` / `rgba(255,255,255,α)` for shadows, overlays, and glass highlights (the design itself does this) — the contract is about *branded* color, not shadows.
2. **Post-compile color check (TGEN-02) — must NOT fight legitimate shadows.** After a successful transpile, statically scan the produced code for **saturated/branded hardcoded color literals**: hex `#rgb`/`#rrggbb`/`#rrggbbaa` that are NOT grayscale, and saturated `rgb()/rgba()` (where R≈G≈B is FALSE). **ALLOW**: grayscale hex (`#000`,`#fff`,`#333`…), `rgba(0,0,0,α)`, `rgba(255,255,255,α)`, and any near-grayscale (shadows/overlays/glass). On a violation, feed a **compiler-style error into the EXISTING self-heal loop** (≤3 attempts, GEN-03/RESIL-04 — NO extra round-trips beyond the budget): "Use the theme CSS variables, not hardcoded colors." This is the load-bearing subtlety: a too-greedy check makes the small model fail more (reliability paradox) and fights every `box-shadow`. Tune the allowlist carefully + test both a flagged (saturated hex) and an allowed (rgba black shadow) fixture.
3. **Name sanitization (TGEN-03).** A `sanitizeDisplayName(name)` strips/neutralizes any banned-lexicon token (`synthesi*`, `\bAI\b`, `\bllm\b`, `generate*`, `\bfake\b`, `\bmock\b`) from a model-supplied display string, applied at the **single display boundary** where the name enters the UI (the window-manager `open()` meta / the displayName derivation), so the titlebar, dock, and menu bar can never render a banned token. Neutral fallback if the whole name is stripped (e.g. "App").
4. **HYGIENE-06.** The gate already walks `src/**` + `index.html`, so all new v2.0 files are auto-scanned. Finalize: ensure every new UI surface (DesktopShell, WindowFrame, Dock, MenuBar, SearchLauncherPanel, VibeThemeProvider, MinimalLauncher-removed) is in the gate's explicit Pitfall-11 copy list, and add the `sanitizeDisplayName` test proving model output can't leak a token to a visible surface.

</decisions>

<code_context>
## Existing Code Insights (scouted)

- `src/execution/producer.ts` — `buildPrompt(type, kind, userPrompt)` (L87), `buildRepairPrompt` (self-heal, L211), `buildLengthPrompt` (L265); the produce machinery does **extract → transpile → self-heal (≤3, early-stop on 2 matching errors)**. TGEN-01 edits `buildPrompt`; TGEN-02 adds the color check as a post-transpile gate that feeds the SAME self-heal loop (treat a color violation like a transpile error).
- `src/execution/transpile.ts` — the transpile step; the post-compile check runs against the transpiled output (or source) right after.
- `src/ui/WindowFrame.tsx` — `title` (=displayName) → `AppShell displayName` + `title={title}`; `src/ui/Dock.tsx`/`MenuBar.tsx` show the active app name. Sanitize BEFORE these (at the open()/record boundary), not per-component.
- `src/ui/useWindowManager.tsx` — `open(appType, meta)` mints the window with its title; the sanitize boundary.
- `src/hygiene.test.ts` — walks `src/**` + `index.html`, bans the token set with word boundaries (Pitfall 6 self-exclusion), has a third-party allowlist (`fake-indexeddb`). New files already covered by the walk; add sanitization coverage + confirm the explicit surface list.

</code_context>

<specifics>
## Specific Ideas / Acceptance

- A produced app references the theme vars and **re-skins on theme switch** alongside the chrome; its source contains no saturated hardcoded color literals (neutral shadows/overlays allowed).
- A model response containing a saturated hex literal → post-compile check flags it → self-heal retries (≤3) → the app emerges using only the vars (or neutral shadows). A `rgba(0,0,0,.3)` shadow is NOT flagged.
- An app the model names "AI Weather" / "Generated Notes" → `sanitizeDisplayName` strips the banned token before it reaches the titlebar/dock/menu — proven by test.
- The CI lexicon gate covers all new v2.0 files; `tsc` 0; full suite green (669+); build clean (no source maps).
- TDD with real captured-Haiku fixtures (one flagged, one clean). The reliability paradox: measure that the contract + check do NOT tank produce-success — keep the check's allowlist generous toward neutrals.

## Verification reality (key requirement)

The full LIVE visual proof (produce a fresh app → switch theme → watch it re-skin) needs the user's Anthropic API key (a cache miss). The dev environment currently has no key (the describe path shows a neutral "Connect your account"). So the end-to-end is verified **offline via fixtures** (prompt-contract test, flagged/clean color-check fixtures, sanitize test) + the existing alias-bridged paths; the live visual re-skin is left for the user to confirm with their key (consistent with the "user owns the key story" steer). Note this honestly in verification.

</specifics>

<deferred>
## Deferred Ideas

- Per-device GPU auto-degrade beyond `prefers-reduced-motion` (Phase 16 shipped the reduced-motion path).
- Custom/user themes (Future Requirements).
- A runtime (not post-compile) color linter on already-cached pre-v2 apps — the alias bridge already handles those.

</deferred>
