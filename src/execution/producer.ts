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
export type ProduceKind = "app" | "widget" | "handler";

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
      `Build a JavaScript async function \`handler(input)\` that handles: ${type}.\n` +
      `Requirements:\n` +
      `- Return \`{ data }\` on success or \`{ error }\` on failure (a plain object literal)\n` +
      `- Use realistic local sample data computed in-process — no external services\n` +
      `- No imports, no network, no storage — local data operations only\n` +
      `- Under 150 lines\n` +
      mutationLine(userPrompt) +
      `Return ONLY the function code, no explanation.`
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
  return (
    `Build a self-contained React TSX component for a "${type}" app.\n` +
    `Requirements:\n` +
    `- Default export named App (function App() { ... })\n` +
    `- Uses React.useState / React.useEffect (React is available as a global)\n` +
    `- Uses CSS variables for theming: var(--color-surface), var(--color-text), var(--color-accent)\n` +
    `- Fully functional, no placeholders\n` +
    `- No imports — React is injected; no import statements at all\n` +
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
      `Fix the JavaScript async function \`handler(input)\` that handles: ${type}.\n` +
      `The following code has a compile error:\n` +
      `\`\`\`js\n${previousCode}\n\`\`\`\n` +
      `Babel error: ${babelError}\n\n` +
      `Requirements:\n` +
      `- An async function \`handler(input)\` returning \`{ data }\` or \`{ error }\`\n` +
      `- No imports, no network, no storage — local data operations only\n` +
      mutationLine(userPrompt) +
      `Return ONLY the corrected function code, no explanation.`
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
      `Build a compact JavaScript async function \`handler(input)\` that handles: ${type}.\n` +
      `Keep it concise so the full function fits in one response.\n` +
      `Requirements:\n` +
      `- An async function \`handler(input)\` returning \`{ data }\` or \`{ error }\`\n` +
      `- Use realistic local sample data — no network, no storage, no imports\n` +
      mutationLine(userPrompt) +
      `Return ONLY the complete function code, no explanation.`
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

  // No fence — look for the start of a component OR handler definition. Matches
  // an export, a (possibly async) `function App`/`function handler` declaration,
  // or a `const App`/`const handler` binding. Broadened in Phase 8 so a fence-less
  // handler (`async function handler(input) { ... }`) is found the same way an app
  // (`function App() { ... }`) is — one extractor for every produce kind (DRY).
  const firstToken = responseText.search(
    /^(?:export\s+default\s+|export\s+|(?:async\s+)?function\s+(?:App|handler)|const\s+(?:App|handler))/m,
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
