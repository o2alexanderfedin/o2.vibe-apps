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

import { transpile, TranspileError } from "./transpile";
import { callModel, isTruncated, type TransportFn } from "../host/modelClient";
import type { ApiKeyGetter } from "../services/services";
import { logger } from "../lib/logger";

// Re-export so the loader can type the injected transport parameter without
// importing from modelClient directly.
export type { TransportFn };

/** Max self-heal attempts before giving up (GEN-03). */
const MAX_ATTEMPTS = 3;

/**
 * What is being produced: a top-level app, or a sub-widget composed inside one.
 * The two share the full produce loop; only the prompt differs (Phase 4, DRY).
 */
export type ProduceKind = "app" | "widget";

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
  // Try to extract a fenced code block first.
  const fenceMatch = responseText.match(/```(?:tsx|typescript|ts|jsx|js)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  // No fence — look for the start of a component definition.
  const firstToken = responseText.search(
    /^(?:export\s+default\s+|export\s+|function\s+App|const\s+App)/m,
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
 * @param kind       "app" (default) or "widget" — selects the prompt only; the
 *                   produce loop is identical for both (Phase 4, DRY).
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
    throw new ProduceError(
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
      const transpiledJS = transpile(code, { filename: type + ".tsx" });
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
