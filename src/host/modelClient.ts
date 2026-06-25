// Single egress chokepoint for the browser → Anthropic request edge.
//
// Phase 1 scope: header assembly only.
// Phase 3 scope: adds callModel() — the single browser fetch to the messages API.
// Isolating the only module that names the external host turns every
// network-hygiene rule into a one-file invariant.

export const ANTHROPIC_API_BASE = "https://api.anthropic.com";
const MESSAGES_ENDPOINT = ANTHROPIC_API_BASE + "/v1/messages";

// Use the dated model id (not the floating alias) so cache-key determinism is
// not silently invalidated by an alias repoint.
export const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

/**
 * Maximum tokens for a component response.
 *
 * Real component responses are ~6–12 KB of TSX (a full weather/calculator/budget
 * app, fences included). At 2048 the response was truncated mid-code: the closing
 * markdown fence never arrived, `extractCode` returned half a component, and the
 * transpiler threw ("Unterminated string constant" / "Unexpected token") — which
 * the open flow then dropped silently. 8192 comfortably fits the largest observed
 * component (~12 KB ≈ ~3–4 K tokens) with headroom, so complete components arrive
 * intact and the closing fence is present.
 */
export const MAX_TOKENS = 8192;

/**
 * Assemble the exact request headers for a browser → Anthropic call.
 *
 * The access key is received as a parameter at call time, returned only inside
 * the result object, and is never stored at module level and never logged.
 *
 * `anthropic-dangerous-direct-browser-access: "true"` is mandatory for the
 * browser CORS path — without it the API rejects the request. Sending it does
 * not change the request body and reveals nothing beyond what the request URL
 * already shows, so it is safe for the platform's surface.
 */
export function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

/**
 * Origin-assertion seam for the single egress chokepoint.
 *
 * Phase 1 keeps this a no-op so the call site exists and is wired now. A later
 * phase makes it enforce the target origin, e.g.:
 *   const { origin } = new URL(url);
 *   if (origin !== ANTHROPIC_API_BASE) throw new Error("blocked target");
 */
export function assertAnthropicTarget(url: string): void {
  void url;
}

/** Shape of the Anthropic /v1/messages response (non-streaming). */
export interface MessagesResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

/**
 * Transport function signature — allows test stubs to replace the real fetch.
 * The real implementation is a plain browser fetch call.
 */
export type TransportFn = (
  url: string,
  init: RequestInit,
) => Promise<MessagesResponse>;

/** Default transport: real browser fetch to the Anthropic messages endpoint. */
export const defaultTransport: TransportFn = async (url, init) => {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Request failed: ${res.status} ${res.statusText} — ${body}`);
  }
  return res.json() as Promise<MessagesResponse>;
};

/**
 * Result of a single model call: the text plus the stop reason.
 *
 * `stop_reason === "max_tokens"` means the response was truncated (the token
 * budget was exhausted before the model finished). A truncated response holds
 * half-written code with no closing fence, so callers must treat it as a failed
 * produce and retry rather than handing the fragment to the transpiler.
 */
export interface ModelResult {
  text: string;
  stopReason: string | null;
}

/** True when the model stopped because it ran out of token budget (truncated). */
export function isTruncated(stopReason: string | null | undefined): boolean {
  return stopReason === "max_tokens";
}

/**
 * Send a single-turn prompt to the model and return the text plus stop reason.
 *
 * @param prompt  The user-turn message text to send.
 * @param apiKey  The access key (read from localStorage by the caller).
 * @param transport  Optional transport override for testing.
 */
export async function callModel(
  prompt: string,
  apiKey: string,
  transport: TransportFn = defaultTransport,
): Promise<ModelResult> {
  assertAnthropicTarget(MESSAGES_ENDPOINT);
  const headers = buildHeaders(apiKey);
  const body = JSON.stringify({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const response = await transport(MESSAGES_ENDPOINT, {
    method: "POST",
    headers,
    body,
  });

  const stopReason = response.stop_reason ?? null;
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Model returned no text content");
  }
  return { text: textBlock.text, stopReason };
}
