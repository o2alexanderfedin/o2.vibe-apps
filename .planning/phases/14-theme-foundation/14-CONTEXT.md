# Phase 14: Theme Foundation - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Autonomous (grey areas resolved with noted defaults; research-grounded)

<domain>
## Phase Boundary

Establish the Vibe OS **theme engine** — the dependency root for the whole milestone. Four named themes (Aurora/Aero/Aqua/Noir) apply as CSS custom properties on `document.documentElement`; the active theme persists with no flash on reload; a backward-compat alias bridge keeps every pre-v2.0 cached app rendering. Requirements: **THEME-01..05**.

**In scope:** the theme registry + provider + apply mechanism + persistence + FOUC script extension + alias bridge + a working switch path. **Out of scope this phase:** the menu-bar visual home of the switcher (Phase 16), windows (Phase 15), the desktop surface (Phase 16), and the produce-prompt contract (Phase 18 — but the variable names defined here ARE the contract Phase 18 will mandate).
</domain>

<decisions>
## Implementation Decisions (auto-resolved — KISS/simplest-that-works; override if you disagree)

1. **Variable contract = the design's exact names.** Adopt `design/VibeOS.dc.html`'s `THEMES` set verbatim: `--text`, `--wall`, `--glass`, `--glass2`, `--bord`, `--hi`, `--accentA`, `--accentB`, `--b1`, `--b2`, `--b3`, `--b4`. These are neutral/hygiene-safe and are exactly what generated apps will reference in Phase 18 and what the design's components use. Define the 4 themes as a typed `VIBE_THEMES` constant mirroring the design's `THEMES` map.
2. **Apply on `document.documentElement` via `style.setProperty`** for each variable — NOT via a React context value or a host element. (Research Pitfall: CSS custom properties only cascade into separately-`createRoot`'d generated-app subtrees if set on the document root.) This is the central, load-bearing mechanism.
3. **Instant apply, no transition/crossfade in v1.** The design switches instantly; a crossfade risks compositing jank and is deferrable polish. Theme switch = synchronous re-`setProperty`. (Defers research's "transition jank" concern by not animating.)
4. **Persistence: localStorage (source of truth for FOUC) + IDB `settings` mirror.** Store the active theme NAME in `localStorage` under a neutral key (e.g. `marketplace.osTheme`) — read synchronously by the FOUC script. Also add an additive **`settings`** object store (bump `REGISTRY_DB_VERSION` 2→3, same additive-upgrade pattern already in `db.ts`) and mirror the choice there for durability/future settings. localStorage wins on read; IDB is the durable mirror.
5. **Extend the existing `index.html` FOUC script** (it already owns first paint for `data-theme`) to ALSO read `marketplace.osTheme` and apply the `VIBE_THEMES` variables to `document.documentElement` before React mounts. **Update the script's SHA-256 hash in `csp.test.ts` in the SAME commit** (hard invariant — the CSP test guards the exact hash).
6. **Alias bridge for pre-v2 cached apps.** Add a static `:root` rule mapping the OLD variable names used by previously-cached generated apps (`--color-surface`, `--color-text`, `--color-accent`) to the new contract (e.g. `--color-surface: var(--glass)`, `--color-text: var(--text)`, `--color-accent: var(--accentA)`), so apps cached before v2.0 keep rendering and re-skin. Verify the exact old names against the shipped produce prompt / existing app CSS before finalizing the mapping.
7. **Default theme: Aurora** (the design default), used when nothing is persisted.
8. **`VibeThemeProvider` layers on top of the existing `ThemeProvider`** — do NOT rip out the existing light/dark/system `data-theme` mechanism (552 tests depend on it). The new provider owns the named-theme variables on the document root and exposes a `setTheme(name)` / current-theme API. The existing provider keeps working; reconcile (not replace) — the old AppBar light/dark toggle becomes vestigial once the desktop lands but is not removed here.
9. **A working switch path is required this phase** (THEME-01 maps here). Since the menu bar doesn't exist until Phase 16, add a **temporary 4-theme switcher** in the current AppBar/storefront so the capability is visible + testable now; Phase 16 relocates it to the menu bar. Keep it small and neutral-named.

</decisions>

<code_context>
## Existing Code Insights (scouted)

- `src/ui/ThemeProvider.tsx` — light/dark/system via `document.documentElement.setAttribute("data-theme", …)`; reads `STORAGE_KEY_THEME` from `src/lib/storage.ts`; an inline FOUC script in `index.html` "owns first paint", the provider owns runtime switches. Model the new provider on this (same FOUC-handoff pattern, named-theme variables instead of a `data-theme` attribute).
- `src/registry/db.ts` — `REGISTRY_DB_VERSION = 2`; `RegistrySchema extends DBSchema` with `apps`/`widgets`/`handlers` stores; `upgrade(db)` is purely additive (`if (!contains) createObjectStore`). Add a `settings` store the same way; bump to 3.
- `index.html` — already contains the inline FOUC `<script>` and a CSP meta tag; `csp.test.ts` asserts the script's SHA-256 hash (must update in the same commit as any script edit).
- `src/lib/storage.ts` — central storage-key constants; add the neutral `osTheme` key here.
- Theming/CSS lives where the host styles are defined; confirm the exact pre-v2 variable names (`--color-surface/--color-text/--color-accent`) used by cached apps before wiring the alias bridge.

</code_context>

<specifics>
## Specific Ideas / Acceptance

- Switching a theme re-skins **everything that reads the variables** instantly (verify once windows exist in P15+, but the mechanism is provable now by toggling and asserting computed `documentElement` styles).
- Hard reload with a non-default theme persisted paints that theme from the first frame (FOUC test).
- A simulated pre-v2 app using `--color-surface` still renders via the alias bridge.
- DB upgrade v2→v3 is non-destructive (existing apps/widgets/handlers survive).
- All 552 existing tests stay green; `tsc` clean; build emits no source maps; hygiene lexicon gate green (new files use neutral names — no banned tokens; `VIBE_THEMES`/`osTheme`/`settings` are all clean).
- TDD with real fixtures; IoC/DI for any injected seams (e.g. the settings persistence behind the existing registry/services seam).

</specifics>

<deferred>
## Deferred Ideas

- User-created/custom themes + a theme editor (v2.x — Future Requirements).
- Animated theme transitions / crossfade (polish; instant apply ships first).
- Relocating the switcher into the menu bar (Phase 16).
- Mandating the variable contract in the produce prompt + post-compile color check (Phase 18).

</deferred>
