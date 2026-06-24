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
// The transport is injectable for testing (no real key needed in tests).

import { transpile, TranspileError } from "./transpile";
import { callModel, type TransportFn } from "../host/modelClient";
import { STORAGE_KEY_API } from "../lib/storage";
import { logger } from "../lib/logger";

// Re-export so the loader can type the optional transport parameter without
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

/**
 * Read the API key from localStorage (browser only).
 * Returns null if localStorage is unavailable or the key is absent.
 */
function readApiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_API);
  } catch {
    return null;
  }
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
 * @param appType   The unseeded app type id (e.g. "weather").
 * @param transport Optional transport override (for testing — no real key needed).
 */
export async function produceComponent(
  appType: string,
  transport?: TransportFn,
): Promise<{ source: string; transpiledJS: string }> {
  const apiKey = readApiKey();
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
    try {
      responseText = await callModel(prompt, apiKey, transport);
    } catch (err) {
      throw new ProduceError(
        `Model request failed on attempt ${attempt}: ${String(err)}`,
        err,
      );
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
