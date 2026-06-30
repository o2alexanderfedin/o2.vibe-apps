# Phase 24: Launcher CSS Polish - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

The SearchLauncherPanel's interior renders with a full glass treatment matching the rest of the v3.0 chrome, across all four built-in themes and custom themes.

Requirement: POLISH-01.
</domain>

<decisions>
## Implementation Decisions

### Settled (binding)
- **CSS-only change.** Styles live in `src/index.css` (the `.launcher__*` rules); markup is in `src/ui/SearchLauncherPanel.tsx`. The six interior classes to finish: `.launcher__search`, `.launcher__input`, `.launcher__open-btn`, `.launcher__working`, `.launcher__chips`, `.launcher__chip`.
- **Use ONLY the existing 12-var CSS contract** (the theme custom properties already on `:root` — `--glass`, `--glass2`, `--wall`, `--text`, accent vars, etc. as defined in index.css). NO new custom properties. NO hardcoded fallback colors — every color/background/border references a theme var so built-in AND custom themes propagate automatically.
- **Visual target:** consistent with the existing window chrome / other glass surfaces (same backdrop, border, background treatment those use). Match the established pattern rather than inventing a new look.
- **No CSP/FOUC-hash impact:** the CSP hash pins the inline `<script>` in `index.html`; CSS changes in `index.css` do not affect it. (Still run csp.test.ts to confirm.)
- Cross-cutting: zero new runtime deps; hygiene lexicon gate green; full suite stays green; `tsc --noEmit` 0; build 0 source maps.

### Claude's Discretion
- Exact glass values per class (which of the glass/border vars each class uses) — at Claude's discretion, guided by how the window chrome and existing launcher container already use the vars. Prefer copying the established glass recipe.

</decisions>

<code_context>
## Existing Code Insights

`.launcher__*` rules + the 12 theme vars are both in `src/index.css`. The launcher container/panel is likely already styled with the glass recipe (from v2.0/v3.0 chrome); these 6 *interior* classes were left partially styled by the v3.0 audit-debt fix (commit `8f0e601`). The planner should read the existing glass treatment on the window chrome / launcher container in index.css and apply the same var-based recipe to the 6 classes.

</code_context>

<specifics>
## Specific Ideas

Success criteria (binding):
1. All six interior classes display the active theme's glass backdrop, border, and background via the 12-var contract.
2. Visually consistent with the window chrome across all four built-in themes.
3. A custom theme's glass vars propagate to all six classes with no hardcoded fallback colors.
4. No new CSS custom properties; 12-var contract unchanged.
5. Full suite green; `tsc --noEmit` 0.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.
</deferred>
