// On-demand component producer (Phase 3, GEN-01/02/03; extended Phase 4 for widgets).
//
// When the loader encounters a full cache miss for an unseeded app type — OR the
// widget pre-warm pass needs an unseeded widget type — it calls
// produceComponent(), which:
//   1. Sends a single-turn prompt to the model (GEN-01).
//   2. Extracts compilable TSX from the response (GEN-02).
//   3. Attempts to transpile; on a Babel error feeds it back for up to 3 attempts
//      (self-heal loop, GEN-03) — early-stopping when two consecutive errors match.
//
// Phase 4 DRY note: apps and widgets are produced by the SAME machinery. The
// only difference is the prompt text (a widget accepts `{ data?, config?,
// onAction? }` props and is framed as a sub-component), so `kind` selects the
// prompt builder and EVERYTHING ELSE — extract → transpile → self-heal →
// truncation handling — is shared verbatim. This keeps the widget path from
// duplicating the (carefully tuned) produce loop.
//
// Prompt phrasing uses "Build", "Create", "Write", "Return" (hygiene-safe).
//
// IoC/DI: the transport and the API-key getter are INJECTED (not reached for
// via singletons or `localStorage`). The caller — ultimately the composition
// root — supplies them, so tests substitute a canned transport and a fixed key
// getter without touching the network or the browser.

import { transpile, transpileHandler, TranspileError } from "./transpile";
import {
  callModel,
  isTruncated,
  ModelHttpError,
  type TransportFn,
} from "../host/modelClient";
import type { ApiKeyGetter } from "../services/services";
import { logger } from "../lib/logger";

// Re-export so the loader can type the injected transport parameter without
// importing from modelClient directly.
export type { TransportFn };

/** Max self-heal attempts before giving up (GEN-03). */
const MAX_ATTEMPTS = 3;

/**
 * What is being produced. The three kinds share the SAME produce loop — prompt →
 * extract → transpile → self-heal → truncation handling — and differ only in two
 * pluggable spots (Phase 4 + Phase 8, DRY):
 *
 *   - "app" / "widget": a React TSX component (transpiled with the react preset).
 *   - "handler"        : a PLAIN async `handler(input)` over local data — NOT a
 *                        React component, so it is transpiled by `transpileHandler`
 *                        (TS-strip only, no react preset / no JSX). Its prompt asks
 *                        for `{ data }` / `{ error }` rather than an `App` export.
 *
 * The loop selects the prompt builder by `kind` and the transpile function by
 * `kind === "handler"`; EVERYTHING else is shared verbatim, so the handler path
 * does not duplicate the (carefully tuned) produce/self-heal machinery.
 */
export type ProduceKind = "app" | "widget" | "handler" | "shell" | "delegated";

/**
 * An optional free-form instruction that shapes the produced component (Phase 5,
 * MOD-03). When present, the same produce machinery runs verbatim — the only
 * difference is one extra line woven into the prompt that asks the model to honor
 * the instruction. Threading it as a single optional parameter (rather than a
 * second produce path) keeps the produce loop DRY across open AND tweak.
 *
 * Phrasing is neutral per hygiene gate (HYGIENE-03): "tailor it to this request"
 * carries no mechanic-revealing token.
 */
function mutationLine(userPrompt?: string): string {
  const trimmed = userPrompt?.trim();
  return trimmed ? `- Tailor it to this request: ${trimmed}\n` : "";
}

/**
 * Build the initial prompt for a given type.
 *
 * For an app: a self-contained component with a default `App` export.
 * For a widget: the same shape, plus the `{ data?, config?, onAction? }` props
 * contract so a parent app can pass it data and receive actions back.
 *
 * When `userPrompt` is supplied (Phase 5 tweak, MOD-03) it is woven in as an extra
 * requirement so the produced component reflects the user's mutation — same loop,
 * same extract/transpile/self-heal, just a request-tailored prompt (DRY).
 *
 * Phrasing is neutral per hygiene gate (HYGIENE-03): no mechanic-revealing tokens.
 */
export function buildPrompt(
  type: string,
  kind: ProduceKind = "app",
  userPrompt?: string,
): string {
  if (kind === "handler") {
    // A handler is a PLAIN async function over local data — NOT a React component.
    // Phrasing is hygiene-safe (HYGIENE-03): it carries none of the gate's
    // mechanic-revealing tokens. "local sample data" stands in for the usual
    // throwaway-data phrasing, which would otherwise have tripped the word gate.
    return (
      `Build a TypeScript async function \`handler(input)\` that handles: ${type}.\n` +
      `Requirements:\n` +
      `- CRITICAL: this runs OFFLINE in a tiny scope with NO modules. Write NO import and NO require — there is no SDK, no package, no network, no model, no storage. Do the work yourself with plain TypeScript (Math, String, Array, JSON, Date). Any import makes the handler fail.\n` +
      `- Write TypeScript with EXPLICIT types: annotate the \`input\` parameter and the return type, and declare \`interface\`/\`type\` aliases for the input and output shapes — these types ARE the contract (stripped before running, so they cost nothing at runtime).\n` +
      `- Return \`{ data }\` on success or \`{ error }\` on failure (a plain object literal that matches the declared return type)\n` +
      `- Under 150 lines\n` +
      mutationLine(userPrompt) +
      `Return ONLY the TypeScript function code, no explanation.`
    );
  }
  if (kind === "shell") {
    // THIN-SHELL mode (the user's "minimal control + on-demand behavior" direction).
    // The produced component is structure + state ONLY — every interaction is routed
    // through the in-scope `runHandler`, which resolves-or-produces the real behavior
    // on demand and caches it. So a big monolithic app collapses into a tiny shell
    // (reliable to produce) plus per-action handlers that are each small, sandboxed,
    // and cached. Drift across independently produced handlers is contained by making
    // the SHELL the single source of truth: it owns the full state shape and embeds
    // that shape into every (stable) intent, and it merges/keeps-prior on the result
    // (see .planning/research/CONSULT-thin-shell-on-demand-handlers.md). Phrasing is
    // hygiene-safe (HYGIENE-03); the `"${type}" app` substring is preserved.
    return (
      `Build a MINIMAL React TSX control for a "${type}" app — structure and state ONLY, with NO business logic.\n` +
      `Requirements:\n` +
      `- Default export named App (function App() { ... })\n` +
      `- No imports — React is injected as a global; never write the word import\n` +
      `- Uses CSS variables for theming: var(--color-surface), var(--color-text), var(--color-accent)\n` +
      `- Hold the COMPLETE app state in ONE React.useState with an explicit, named initial shape (keep it small, e.g. { display: "0", expr: "" }) and a separate React.useState(false) "busy" flag.\n` +
      `- Define ONE async function dispatch(action, payload) — the ONLY place behavior happens — that:\n` +
      `    1. sets busy true;\n` +
      `    2. const res = await runHandler(intent, { state, payload });\n` +
      `    3. if (res && res.data && res.data.state) setState(prev => ({ ...prev, ...res.data.state }));\n` +
      `    4. sets busy false.\n` +
      `  Do NOT compute any result yourself — runHandler returns the next state.\n` +
      `- The intent MUST be a STABLE string (NEVER embed live state values, so it is the same on every press) that fully specifies the behavior so it can be built on its own. It MUST include: the app name and action, the EXACT state shape, that input is { state, payload } where payload is a STRING, and that it must return { data: { state } } with the SAME shape. Be UNAMBIGUOUS — spell out the EXACT change THIS one action makes to the state; do NOT rely on the handler inferring behavior or expecting a structured payload. For example:\n` +
      `    const intent = "${type} action '" + action + "': state is exactly { display: string, expr: string }; input is { state, payload } where payload is the single-character string '" + action + "'; for a digit/operator append payload to expr and set display to expr; for '=' evaluate expr and set display and expr to the result; return { data: { state } } with the same shape and always a valid state";\n` +
      `- Render the control's minimal markup (a display reading from state, and buttons). Each interactive element calls dispatch("<action>", <payload>). Show a small busy hint (e.g. disable the buttons) while busy.\n` +
      `- Functional control markup, no placeholders, but ZERO arithmetic or business logic in this file.\n` +
      mutationLine(userPrompt) +
      `Return ONLY the TSX code block, no explanation.`
    );
  }
  if (kind === "delegated") {
    // DELEGATED mode (the productized "minimal control + on-demand behavior" path).
    // The produced module is BEHAVIOR-FREE: it exports the state SSOT, a markup-only
    // view, and a precise action spec. The permanent runtime (DelegatedShell) owns
    // state, the container event delegate, on-demand behavior (runHandler) and the
    // merge — so this module contains no handlers and never wires events itself.
    // Phrasing is hygiene-safe; the `"${type}" app` substring is preserved.
    return (
      `Build a React TSX module for a "${type}" app as a BEHAVIOR-FREE view plus a small spec — it exports exactly three names and contains NO behavior.\n` +
      `Requirements:\n` +
      `- No imports — React is injected as a global; never write the word import. NO event handlers, NO onClick, and do NOT wire any actions — behavior is added elsewhere.\n` +
      `- export const initialState = { ... } : the COMPLETE app state as ONE object with named fields and sensible initial values (e.g. { display: "0", expr: "" }).\n` +
      `- export function view(state) { return ( ...markup... ); } : a PURE function that renders the UI from state. Every interactive element MUST carry a data-action="<short action id>" attribute (e.g. data-action="1", data-action="equals") and have NO onClick or other handler. Read all dynamic text from state. Use CSS variables: var(--color-surface), var(--color-text), var(--color-accent).\n` +
      `- export const actionSpec = "..." : ONE precise description of the EXACT state shape and what EACH data-action does to the state — unambiguous, since this is the contract the behavior follows. Example: "state is { display: string, expr: string }; for a digit/operator action append it to expr and set display to expr; for 'equals' evaluate expr and set display and expr to the result".\n` +
      `- Finish with: export { initialState, view, actionSpec };\n` +
      mutationLine(userPrompt) +
      `Return ONLY the TSX code block, no explanation.`
    );
  }
  if (kind === "widget") {
    return (
      `Build a self-contained React TSX widget of type "${type}".\n` +
      `Requirements:\n` +
      `- Default export named App (function App(props) { ... })\n` +
      `- Accepts props { data?, config?, onAction? } — all optional, render sensible defaults when absent\n` +
      `- Uses React.useState / React.useEffect (React is available as a global)\n` +
      `- Uses CSS variables for theming: var(--color-surface), var(--color-text), var(--color-accent)\n` +
      `- Compact, fully functional, no placeholders\n` +
      `- No imports — React is injected; no import statements at all\n` +
      mutationLine(userPrompt) +
      `Return ONLY the TSX code block, no explanation.`
    );
  }
  // App prompt. Beyond the base contract it now surfaces TWO optional, in-scope
  // helpers so a produced app can compose sub-widgets and run backend-style data
  // operations — the capabilities the runtime already injects into the component
  // scope (`useWidget`, `runHandler`) but that earlier prompts never mentioned, so
  // real apps never used them. Design follows the recorded research consult
  // (.planning/research/CONSULT-activating-widgets-handlers.md):
  //   - the `// @widget <type>` declaration doubles as a chain-of-thought anchor
  //     that primes the matching `useWidget(...)` call (so the declaration form is
  //     kept verbatim — it is what `parseWidgetDeps` pre-warms);
  //   - helpers are framed as GLOBALS (small models fail at injection patterns);
  //   - explicit NO-OP / negative constraints + a two-widget cap keep simple apps
  //     self-contained, protecting the resilience budget and first-paint latency
  //     (every declared widget is an eager pre-warm produce on a cache miss).
  // Phrasing stays hygiene-safe (HYGIENE-03) — none of the banned lexicon. The
  // `"${type}" app` substring is load-bearing (the widget/app routing seam matches
  // it); the app prompt deliberately never contains the widget-only `of type "…"`.
  return (
    `Build a React TSX component for a "${type}" app.\n` +
    `Requirements:\n` +
    `- Default export named App (function App() { ... })\n` +
    `- Uses React.useState / React.useEffect (React is available as a global)\n` +
    `- Uses CSS variables for theming: var(--color-surface), var(--color-text), var(--color-accent)\n` +
    `- Fully functional, no placeholders\n` +
    `- No imports — React is injected; no import statements at all\n` +
    `Two optional helpers are in scope as globals — reach for them when the app naturally calls for them (a simple single-purpose app can stay one self-contained component):\n` +
    `- Sub-widgets: when the app has a distinct reusable part (a chart, a stat card, a list section), declare it at the very top as a line comment like "// @widget chart" (at most two), then in render write const Chart = useWidget("chart") and place {Chart ? <Chart data={myData} /> : null}. A sub-widget accepts optional props { data?, config?, onAction? }. Prefer this when the app shows more than one distinct kind of content.\n` +
    `- Data helper: when the app filters, summarizes, or derives values, do that work by calling await runHandler("describe the operation", input) inside React.useEffect or an event handler; it resolves to { data } or { error } — store { data } in state and render it.\n` +
    mutationLine(userPrompt) +
    `Return ONLY the TSX code block, no explanation.`
  );
}

/**
 * Build a self-heal prompt that includes the previous code and the Babel error.
 * Phrasing is neutral per hygiene gate (HYGIENE-03): no mechanic-revealing tokens.
 */
export function buildRepairPrompt(
  type: string,
  previousCode: string,
  babelError: string,
  kind: ProduceKind = "app",
  userPrompt?: string,
): string {
  if (kind === "handler") {
    // Repair a plain handler function — same self-heal contract, no React framing.
    return (
      `Fix the TypeScript async function \`handler(input)\` that handles: ${type}.\n` +
      `The following code has a compile error:\n` +
      `\`\`\`ts\n${previousCode}\n\`\`\`\n` +
      `Babel error: ${babelError}\n\n` +
      `Requirements:\n` +
      `- A TypeScript async function \`handler(input)\` with explicit input/return types, returning \`{ data }\` or \`{ error }\`\n` +
      `- No imports, no network, no storage — local data operations only\n` +
      mutationLine(userPrompt) +
      `Return ONLY the corrected TypeScript function code, no explanation.`
    );
  }
  if (kind === "delegated") {
    return (
      `Fix the React TSX module for a "${type}" app (a behavior-free view module).\n` +
      `The following code has a compile error:\n` +
      `\`\`\`tsx\n${previousCode}\n\`\`\`\n` +
      `Babel error: ${babelError}\n\n` +
      `Requirements:\n` +
      `- export const initialState (one object), export function view(state) returning markup whose interactive elements carry data-action="..." and have NO handlers, and export const actionSpec (a string), then export { initialState, view, actionSpec }\n` +
      `- No imports — React is injected as a global; no event handlers in this module\n` +
      mutationLine(userPrompt) +
      `Return ONLY the corrected TSX code block, no explanation.`
    );
  }
  const subject = kind === "widget" ? `widget of type "${type}"` : `component for a "${type}" app`;
  return (
    `Fix the React TSX ${subject}.\n` +
    `The following code has a compile error:\n` +
    `\`\`\`tsx\n${previousCode}\n\`\`\`\n` +
    `Babel error: ${babelError}\n\n` +
    `Requirements:\n` +
    `- Default export named App (function App(${kind === "widget" ? "props" : ""}) { ... })\n` +
    `- No imports — React is injected as a global, no import statements\n` +
    `- Uses CSS variables: var(--color-surface), var(--color-text), var(--color-accent)\n` +
    mutationLine(userPrompt) +
    `Return ONLY the corrected TSX code block, no explanation.`
  );
}

/**
 * Build a retry prompt for a response that was cut short by the token budget.
 * Asks for a more compact component so the full output fits.
 * Phrasing is neutral per hygiene gate (HYGIENE-03): no mechanic-revealing tokens.
 */
export function buildLengthPrompt(
  type: string,
  kind: ProduceKind = "app",
  userPrompt?: string,
): string {
  if (kind === "handler") {
    return (
      `Build a compact TypeScript async function \`handler(input)\` that handles: ${type}.\n` +
      `Keep it concise so the full function fits in one response.\n` +
      `Requirements:\n` +
      `- A TypeScript async function \`handler(input)\` with explicit input/return types, returning \`{ data }\` or \`{ error }\`\n` +
      `- Use realistic local sample data — no network, no storage, no imports\n` +
      mutationLine(userPrompt) +
      `Return ONLY the complete TypeScript function code, no explanation.`
    );
  }
  if (kind === "delegated") {
    return (
      `Build a compact React TSX module for a "${type}" app — a behavior-free view.\n` +
      `Keep it concise so the full module fits in one response.\n` +
      `Requirements:\n` +
      `- export const initialState (one object), export function view(state) returning compact markup whose interactive elements carry data-action="..." and have NO handlers, and export const actionSpec (a short string), then export { initialState, view, actionSpec }\n` +
      `- No imports — React is injected as a global; no behavior in this module\n` +
      mutationLine(userPrompt) +
      `Return ONLY the complete TSX code block, no explanation.`
    );
  }
  const subject = kind === "widget" ? `widget of type "${type}"` : `component for a "${type}" app`;
  return (
    `Build a compact, self-contained React TSX ${subject}.\n` +
    `Keep it concise so the full component fits in one response.\n` +
    `Requirements:\n` +
    `- Default export named App (function App(${kind === "widget" ? "props" : ""}) { ... })\n` +
    `- Uses React.useState / React.useEffect (React is available as a global)\n` +
    `- No imports — React is injected; no import statements at all\n` +
    `- Fully functional, no placeholders, minimal inline styling\n` +
    mutationLine(userPrompt) +
    `Return ONLY the complete TSX code block, no explanation.`
  );
}

/**
 * Extract the TSX/code block from a model response (GEN-02).
 *
 * Handles:
 *   - Markdown fences: ```tsx ... ``` or ``` ... ```
 *   - Prose preamble before the first function/const declaration
 *   - Raw code with no fences
 */
export function extractCode(responseText: string): string {
  // Try to extract a fenced code block first. The language tag is optional and
  // matched longest-first ("javascript"/"typescript" before "js"/"ts") so a
  // ```javascript handler fence (Phase 8) is captured cleanly rather than leaving
  // a stray "cript" prefix in the body.
  const fenceMatch = responseText.match(
    /```(?:javascript|typescript|tsx|jsx|ts|js)?\s*\n?([\s\S]*?)```/,
  );
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  // No fence — slice from the FIRST top-level code construct, dropping any prose
  // preamble while KEEPING every leading definition. The match set covers all
  // produce kinds: a component/handler (`function`/`const`), a typed handler's
  // leading `interface`/`type`, an `import`/`export`, a leading comment, and a
  // delegated MODULE that opens with a bare `const`/`function` (e.g.
  // `const React = window.React`) and exports its names in a trailing
  // `export { ... }`. The earlier App/handler-only regex matched that TRAILING
  // export instead and sliced the whole module body away — this anchors on the
  // first construct so leading definitions survive.
  const firstToken = responseText.search(
    /^(?:import\s|export\b|interface\s|type\s+\w|(?:async\s+)?function\s|const\s|let\s|var\s|\/\/|\/\*)/m,
  );
  if (firstToken !== -1) {
    return responseText.slice(firstToken).trim();
  }

  // Return the full text as a last resort — transpile will report the real error.
  return responseText.trim();
}

export class ProduceError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ProduceError";
    this.cause = cause;
  }
}

/**
 * A produce failure caused by a missing or invalid access key (Phase 6,
 * RESIL-03). Distinguished from a generic ProduceError so the UI can route to
 * the INLINE key-reconfiguration prompt ("Connect your account") instead of the
 * generic "couldn't load" fallback. Raised both when no key is present and when
 * the API rejects the key with a 401/403. The copy is neutral and mechanic-free.
 */
export class ProduceAuthError extends ProduceError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ProduceAuthError";
  }
}

/**
 * On-demand produce: prompt the model, extract TSX, transpile with self-heal.
 *
 * Returns the transpiled JS string (not the TSX source) so callers can
 * instantiate immediately. The caller is responsible for storing both pieces.
 *
 * Dependencies are injected (IoC/DI): the transport and the API-key getter are
 * supplied by the caller (the composition root in production, test doubles in
 * tests), so this function never touches `fetch` or `localStorage` directly.
 *
 * @param type       The unseeded app/widget type id (e.g. "weather", "line-chart").
 * @param transport  The model HTTP transport.
 * @param getApiKey  Reads the access key (returns null when unavailable).
 * @param kind       "app" (default), "widget", or "handler" — selects the prompt
 *                   builder AND the transpile (handlers strip TS only, no react
 *                   preset); the produce/self-heal loop is identical for every
 *                   kind (Phase 4 + Phase 8, DRY).
 * @param userPrompt Optional free-form mutation instruction (Phase 5 tweak,
 *                   MOD-03). Woven into the initial/repair/length prompts so the
 *                   produced component reflects the request — the produce loop is
 *                   otherwise identical to a fresh open (DRY).
 */
export async function produceComponent(
  type: string,
  transport: TransportFn,
  getApiKey: ApiKeyGetter,
  kind: ProduceKind = "app",
  userPrompt?: string,
): Promise<{ source: string; transpiledJS: string }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    // No key at all → route to the inline reconfigure prompt (RESIL-03).
    throw new ProduceAuthError(
      "No access key available. Connect your account to open this app.",
    );
  }

  let prompt = buildPrompt(type, kind, userPrompt);
  let lastError: string | null = null;
  let lastCode = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    logger.info(`Producer: attempt ${attempt} for "${type}"`);

    let responseText: string;
    let stopReason: string | null;
    try {
      const result = await callModel(prompt, apiKey, transport);
      responseText = result.text;
      stopReason = result.stopReason;
    } catch (err) {
      // A 401/403 means the stored key is invalid/expired — route to the inline
      // reconfigure prompt (RESIL-03) rather than the generic fallback. The key
      // is NEVER echoed into the message (HYGIENE / D-13).
      if (err instanceof ModelHttpError && err.isAuth) {
        throw new ProduceAuthError(
          "Your account connection needs attention. Connect your account to open this app.",
          err,
        );
      }
      throw new ProduceError(
        `Model request failed on attempt ${attempt}: ${String(err)}`,
        err,
      );
    }

    // Defensive truncation handling: a response cut off by the token budget
    // holds half-written code with no closing fence. Transpiling it would throw
    // an opaque syntax error that the self-heal loop cannot repair (the code is
    // not wrong, it is incomplete). Treat truncation as a retryable produce
    // failure with a clear, hygiene-safe message instead. The retry asks for a
    // shorter component, which has a real chance of fitting the budget.
    if (isTruncated(stopReason)) {
      const truncMsg = "Response was cut short before the component was complete";
      logger.info(`Producer: truncated response on attempt ${attempt}`);
      if (truncMsg === lastError || attempt >= MAX_ATTEMPTS) {
        throw new ProduceError(
          `Could not build a complete component for "${type}" after ${attempt} attempt(s): the response was cut short`,
        );
      }
      lastError = truncMsg;
      prompt = buildLengthPrompt(type, kind, userPrompt);
      continue;
    }

    const code = extractCode(responseText);

    try {
      // Select the transpile by kind: handlers are PLAIN JS/TS (TS-strip only, no
      // react preset / no JSX); apps and widgets are React TSX (Phase 8, DRY). The
      // self-heal/truncation loop around this is identical for every kind.
      const transpiledJS =
        kind === "handler"
          ? transpileHandler(code, { filename: type + ".ts" })
          : transpile(code, { filename: type + ".tsx" });
      // Handler purity guard: a handler must be self-contained local computation, but
      // the model sometimes reaches for an external module (e.g. an SDK) "to be
      // helpful". The CJS transform turns any such import into a `require(...)` that
      // the constrained scope's hostile require would throw on at runtime (a silent
      // no-op to the user). Reject it at PRODUCE time so the self-heal loop gets an
      // actionable error and retries for a pure handler instead. A clean handler
      // imports nothing, so any `require(` is a definitive illegal-import signal.
      if (kind === "handler" && /\brequire\s*\(/.test(transpiledJS)) {
        throw new TranspileError(
          "Handler must not import or require any module — no SDK, library, package, network, or model is available in this scope. Compute the result with plain local TypeScript only (Math, String, Array, JSON, Date).",
          null,
        );
      }
      logger.info(`Producer: compiled successfully on attempt ${attempt}`);
      return { source: code, transpiledJS };
    } catch (err) {
      if (!(err instanceof TranspileError)) throw err;
      const errorMsg = err.message;
      logger.info(`Producer: compile error on attempt ${attempt}: ${errorMsg}`);

      // GEN-03 early-stop: identical consecutive error → no progress possible.
      if (errorMsg === lastError) {
        logger.info("Producer: identical error — stopping early");
        throw new ProduceError(
          `Could not compile the component for "${type}" after ${attempt} attempt(s): ${errorMsg}`,
          err,
        );
      }

      lastError = errorMsg;
      lastCode = code;

      if (attempt < MAX_ATTEMPTS) {
        // Feed the Babel error back into the next prompt (GEN-03), keeping the
        // user's mutation instruction so a self-heal retry honors it too (MOD-03).
        prompt = buildRepairPrompt(type, lastCode, errorMsg, kind, userPrompt);
      }
    }
  }

  throw new ProduceError(
    `Could not compile the component for "${type}" after ${MAX_ATTEMPTS} attempts`,
  );
}
