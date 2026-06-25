// On-demand component producer (Phase 3, GEN-01/02/03).
//
// When the loader encounters a full cache miss for an unseeded app type it calls
// produceComponent(), which:
//   1. Sends a single-turn prompt to the model (GEN-01).
//   2. Extracts compilable TSX from the response (GEN-02).
//   3. Attempts to transpile; on a Babel error feeds it back for up to 3 attempts
//      (self-heal loop, GEN-03) — early-stopping when two consecutive errors match.
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
 * Build the initial prompt for a given app type.
 * Phrasing is neutral per hygiene gate (HYGIENE-03): no mechanic-revealing tokens.
 */
export function buildPrompt(appType: string): string {
  return (
    `Build a self-contained React TSX component for a "${appType}" app.\n` +
    `Requirements:\n` +
    `- Default export named App (function App() { ... })\n` +
    `- Uses React.useState / React.useEffect (React is available as a global)\n` +
    `- Uses CSS variables for theming: var(--color-surface), var(--color-text), var(--color-accent)\n` +
    `- Fully functional, no placeholders\n` +
    `- No imports — React is injected; no import statements at all\n` +
    `Return ONLY the TSX code block, no explanation.`
  );
}

/**
 * Build a self-heal prompt that includes the previous code and the Babel error.
 * Phrasing is neutral per hygiene gate (HYGIENE-03): no mechanic-revealing tokens.
 */
export function buildRepairPrompt(
  appType: string,
  previousCode: string,
  babelError: string,
): string {
  return (
    `Fix the React TSX component for a "${appType}" app.\n` +
    `The following code has a compile error:\n` +
    `\`\`\`tsx\n${previousCode}\n\`\`\`\n` +
    `Babel error: ${babelError}\n\n` +
    `Requirements:\n` +
    `- Default export named App (function App() { ... })\n` +
    `- No imports — React is injected as a global, no import statements\n` +
    `- Uses CSS variables: var(--color-surface), var(--color-text), var(--color-accent)\n` +
    `Return ONLY the corrected TSX code block, no explanation.`
  );
}

/**
 * Build a retry prompt for a response that was cut short by the token budget.
 * Asks for a more compact component so the full output fits.
 * Phrasing is neutral per hygiene gate (HYGIENE-03): no mechanic-revealing tokens.
 */
export function buildLengthPrompt(appType: string): string {
  return (
    `Build a compact, self-contained React TSX component for a "${appType}" app.\n` +
    `Keep it concise so the full component fits in one response.\n` +
    `Requirements:\n` +
    `- Default export named App (function App() { ... })\n` +
    `- Uses React.useState / React.useEffect (React is available as a global)\n` +
    `- No imports — React is injected; no import statements at all\n` +
    `- Fully functional, no placeholders, minimal inline styling\n` +
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
 * @param appType    The unseeded app type id (e.g. "weather").
 * @param transport  The model HTTP transport.
 * @param getApiKey  Reads the access key (returns null when unavailable).
 */
export async function produceComponent(
  appType: string,
  transport: TransportFn,
  getApiKey: ApiKeyGetter,
): Promise<{ source: string; transpiledJS: string }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new ProduceError(
      "No access key available. Connect your account to open this app.",
    );
  }

  let prompt = buildPrompt(appType);
  let lastError: string | null = null;
  let lastCode = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    logger.info(`Producer: attempt ${attempt} for "${appType}"`);

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
          `Could not build a complete component for "${appType}" after ${attempt} attempt(s): the response was cut short`,
        );
      }
      lastError = truncMsg;
      prompt = buildLengthPrompt(appType);
      continue;
    }

    const code = extractCode(responseText);

    try {
      const transpiledJS = transpile(code, { filename: appType + ".tsx" });
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
          `Could not compile the component for "${appType}" after ${attempt} attempt(s): ${errorMsg}`,
          err,
        );
      }

      lastError = errorMsg;
      lastCode = code;

      if (attempt < MAX_ATTEMPTS) {
        // Feed the Babel error back into the next prompt (GEN-03).
        prompt = buildRepairPrompt(appType, lastCode, errorMsg);
      }
    }
  }

  throw new ProduceError(
    `Could not compile the component for "${appType}" after ${MAX_ATTEMPTS} attempts`,
  );
}
