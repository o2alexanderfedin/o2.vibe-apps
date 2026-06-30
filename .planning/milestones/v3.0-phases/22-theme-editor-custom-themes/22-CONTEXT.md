# Phase 22: Theme Editor & Custom Themes - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

A user can create, name, edit, and save custom themes over the 12-variable CSS contract, see them in the menu-bar switcher alongside the built-ins (Aurora, Aero, Aqua, Noir), and find them waiting after a hard reload — without any Aurora flash on first paint.

Requirements: THEME-06, THEME-07, THEME-08, THEME-09, THEME-10.
</domain>

<decisions>
## Implementation Decisions

### Settled (from v3.0 roadmap / STATE.md — binding)
- **Storage is additive, no DB version bump**: custom themes persist under the `"custom:<name>"` key namespace in the existing IDB `settings` store via the `writeRaw`/`readRaw` seam added in Phase 21. No migration, no new object store.
- **Name collision guard**: custom themes use the `"custom:<name>"` IDB key namespace so they can never collide with the four built-in names. A user-supplied name that equals a built-in (e.g. `"aurora"`) is rejected or auto-namespaced to `"custom:aurora"`; the built-in Aurora stays accessible and unmodified.
- **`sanitizeDisplayName` MUST be applied** to user-supplied theme names before any DOM render OR any IDB write (hygiene: banned token family + iframe/sandbox/isolation must never reach a devtools-visible surface).
- **Live preview mutates `:root` vars without saving** — editing color pickers re-skins the desktop in real time; persistence only happens on explicit Save.
- **Invalid color values are rejected before any IDB write** via a `CSS.supports(...)` gate; the current theme is unchanged on rejection.
- **THEME_PUSH to frames**: activating a custom theme must call the same `broadcastTheme(vars)` path introduced in Phase 20 (now live) so the host AND all open opaque-origin frames re-skin live — identical to a built-in switch.
- **FOUC invariant (from Phase 14, binding)**: mirror the active custom theme's vars to `localStorage["vibe.customTheme.<name>"]` at save time; extend the first-paint FOUC script to apply the active custom theme when the stored selection starts with `"custom:"`. **Any change to the inline FOUC script REQUIRES recomputing the `csp.test.ts` SHA-256 hash in the SAME commit** — this invariant is non-negotiable.
- **12-variable contract** is the surface for the editor — the same variable set already defined by the theme foundation (Phase 14). Do not introduce new theme vars.
- All v1.0/v1.1/v2.0/v3.0 cross-cutting constraints remain acceptance criteria: HYGIENE-01..07, single Anthropic egress, sourcemaps-off, CSP allowlist, IoC/DI via ServicesProvider, additive-IDB-only.

### Claude's Discretion
- **Alpha-color inputs** for the `--glass` / `--glass2` vars (which carry alpha): `<input type="color">` returns only `#rrggbb`. Choose the SIMPLEST workable pattern during planning — a dual range+color control OR a validated text field for the alpha-bearing vars. Recommendation: validated text field gated by `CSS.supports`, to keep one consistent validation path.
- Editor layout/placement, contrast-warning presentation, and component decomposition are at Claude's discretion, consistent with existing menu-bar / theme-switcher and window-chrome conventions.

</decisions>

<code_context>
## Existing Code Insights

Built on: the Phase 14 theme foundation (12-var contract, `VibeThemeProvider`, built-in themes, the inline FOUC script + `csp.test.ts` SHA-256 invariant), the Phase 19 MenuBar (where the theme switcher + editor entry live), the Phase 20 `broadcastTheme(vars)` / `THEME_PUSH` frame path (now live), and the Phase 21 `settingsStore.writeRaw/readRaw` seam. Exact APIs and file anchors gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

Success criteria (from ROADMAP, binding acceptance tests):
1. Open editor from menu bar, adjust pickers for any of the 12 vars → desktop re-skins in real time; live preview mutates `:root` without saving.
2. Name + save a custom theme → appears in the menu-bar switcher alongside the 4 built-ins; selecting it re-skins host AND all open frames live (THEME_PUSH), identical to a built-in switch.
3. Invalid color value → rejected before any IDB write (`CSS.supports` gate); current theme unchanged.
4. Create custom theme, reload → still in switcher; if active, applied on first paint with NO Aurora flash (FOUC script reads mirrored `localStorage` vars; `csp.test.ts` SHA-256 updated in the same commit as the FOUC change).
5. Name `"aurora"` → rejected or auto-namespaced to `"custom:aurora"`; built-in Aurora still accessible/unmodified. Deleting the active custom theme auto-switches to Aurora before delete completes.
6. Inline, non-blocking WCAG-AA contrast warning on low-contrast text/background pairing — advisory, user can still save.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
