# CONSULT — Activating widget/handler affordances in the app prompt

**Source:** Google AI Mode (browser), 2026-06-25
**Question (open/unbiased):** Reliably prompting a small/cheap LLM (Haiku) to *optionally* compose sub-components via an injected accessor and call an async data function, using a declaration-comment convention, without over-using them or breaking when unused.

## What the model said (distilled)

Small models get confused by ambiguous instructions → they either skip the call or emit
un-executable code. The reliable recipe is **strict structural isolation + clear execution
rules**, specifically:

1. **Declaration comment as a Chain-of-Thought anchor.** Require the model to write a header
   comment (e.g. `// @widget <name>`) *first*. The act of printing the declaration primes the
   model to write the matching implementation correctly. → **Validates our existing
   `// @widget <type>` convention.**
2. **Treat injected helpers as GLOBAL variables**, not as a DI/imports pattern. Small models
   fail at dependency injection; "X is available as a global" minimizes syntax errors. → Our
   `new Function` scope already injects `React`, `useWidget`, `runHandler` as globals. ✓
3. **Negative / NO-OP constraints are mandatory.** Explicitly say what *not* to do: if the
   component needs no sub-parts, do NOT write the declaration and do NOT reference the accessor.
   Without this, the model hallucinates data calls / sub-components "just to be helpful." →
   This is exactly our reliability risk (each declared widget triggers another produce on a
   cache miss). Bake in NO-OP rules + cap the number of sub-widgets.
4. **Give an exact, copy-pasteable contract** (the comment syntax + the accessor call + the
   return/props shape) and a worked example of both the "uses features" and "static no-op" case.

## Decisions applied

- **Activate on the APP prompt only** (`buildPrompt`, `kind === "app"`). Apps are the top-level
  thing users open. Keep the widget/handler/length/repair prompts lean (KISS) — note that
  widgets are instantiated WITHOUT a `runHandler` binding (`widgetPrewarm` passes only
  `makeUseWidget`), so we must NOT tell widgets to call `runHandler`.
- **Keep it optional + conservative:** "use ONLY when they genuinely fit — most apps need
  neither", **cap sub-widgets at two**, and an explicit NO-OP line. Protects the resilience
  budget / first-paint latency (pre-warm is eager) and the core loop's reliability.
- **Preserve load-bearing substrings** the routing transports/tests match: `for a "<type>" app`
  (app) stays; `of type "<type>"` is widget-only and must NOT appear in the app prompt.
- **Hygiene:** all added wording avoids the banned lexicon (`synthesi[sz]`, `fake`, `mock`,
  `AI`, `llm`, `generat(e|ed|ing)`); verified against `src/hygiene.test.ts`.

## Validation plan (TDD + real fixtures)

The machinery is already proven end-to-end (`MarketplaceWidgets.test.tsx`, `handlerWiring.test.tsx`).
The only unknown is whether REAL Haiku, under the new prompt, actually emits `// @widget` +
`useWidget` and `runHandler` calls AND still produces working apps (no regression). So: capture
real fixtures under the new prompt, assert activation + clean transpile/render, then lock with
RTL integration tests.
