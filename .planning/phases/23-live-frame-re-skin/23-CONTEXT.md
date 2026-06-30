# Phase 23: Live Frame Re-Skin - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Theme switches re-skin every open opaque app frame **in place** — without reloading the iframe — so in-frame app state is preserved across theme changes.

Requirement: RESKIN-01.
</domain>

<decisions>
## Implementation Decisions

### Settled (from v3.1 scope / v3.0 audit tech debt — binding)
- **Root cause (from v3.0 audit + integration check):** `SandboxFrame.srcdoc` is currently memoized on `[transpiledJS, themeVars]`. Because `themeVars` is a new object reference on every theme change, the srcdoc rebuilds, the `<iframe>` `srcDoc` attribute changes, and the frame reloads from scratch — destroying in-frame React state.
- **Fix:** remove `themeVars` from the srcdoc memo dependency array so the iframe element is stable across theme changes. The first-paint theme is still baked into the *initial* srcdoc; subsequent theme changes are delivered to the live frame via the **already-wired `THEME_PUSH` postMessage path** (`broadcastTheme(vars)` from Phase 20, frame bootstrap `THEME_PUSH` handler already live).
- **`broadcastTheme` must reliably reach connected frames.** The integration check noted `THEME_PUSH` currently lands as a no-op because the frame either reloaded (old element) or wasn't yet registered. Once the iframe is stable, `broadcastTheme` must post to the live, connected frame (respect the existing `el.isConnected` guard) so the re-skin actually applies.
- **First-paint correctness preserved:** the initial srcdoc must still bake in the *current* theme vars at mount so a freshly opened app and a FOUC reload are unaffected.
- All cross-cutting constraints stay in force: zero new runtime deps; hygiene lexicon gate (no `iframe`/`sandbox`/`isolation` in user-visible/devtools surfaces); CSP allowlist + FOUC/CSP-hash invariant; IoC/DI via ServicesProvider; build 0 source maps; full suite stays green.

### Claude's Discretion
- Exact memo refactor shape and whether a `themeVarsRef` is needed so the initial srcdoc reads current vars while the memo no longer depends on them — at Claude's discretion, simplest approach that satisfies all 5 success criteria. Prefer consistency with the existing SandboxFrame / frameMount patterns.

</decisions>

<code_context>
## Existing Code Insights

Touches the frame layer built in Phase 20: `SandboxFrame` (srcdoc memo + iframe element + THEME_PUSH handler wiring), `frameMount.ts` (`broadcastTheme(vars)`, the `el.isConnected` guard, frame registry), and `VibeThemeProvider.setTheme → broadcastTheme`. Exact file:line anchors gathered during plan-phase research. Phase 20 verification + the v3.0 integration check already documented the reload mechanism precisely.

</code_context>

<specifics>
## Specific Ideas

Success criteria (from ROADMAP, binding acceptance tests):
1. Switching any theme (built-in or custom) while an app is open does NOT reload the iframe — the frame document is not recreated, no srcdoc re-injection.
2. After a switch the open frame immediately shows the new theme's colors, glass, and accent vars.
3. In-frame app state (scroll, form input, counter/timer) survives a theme switch unchanged.
4. A JSDOM unit test asserts `themeVars` is absent from the `SandboxFrame` srcdoc memo dependency array.
5. Full existing suite (935) + the new unit test pass; `tsc --noEmit` 0 errors.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped. (Real-browser proof of the live re-skin is Phase 25 / SMOKE-03, not this phase.)
</deferred>
