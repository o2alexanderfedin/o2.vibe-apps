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
 * Typed transport error (Phase 6 refactor — flagged in Phase 5).
 *
 * The old transport threw a GENERIC `Error("Request failed: <status>…")` that
 * fused the status code, status text, and body into one opaque string — so a
 * caller could not branch on the status (401 vs 429 vs 500) without re-parsing
 * prose, and the `retry-after` header was lost entirely.
 *
 * `ModelHttpError` preserves the structured signal callers need:
 *   - `status`     — the HTTP status (e.g. 401, 429, 500).
 *   - `retryAfter` — the parsed `retry-after` header in SECONDS, when present
 *                    (429 / 503 responses). Honored over a computed backoff delay.
 *   - `body`       — the raw response body text (diagnostics only, never shown).
 *
 * The message stays neutral and mechanic-free (HYGIENE): it names only the
 * transport status, not the on-demand mechanic.
 */
export class ModelHttpError extends Error {
  readonly status: number;
  readonly retryAfter?: number;
  readonly body?: string;

  constructor(status: number, retryAfter?: number, body?: string) {
    super(`Request failed with status ${status}`);
    this.name = "ModelHttpError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.body = body;
  }

  /** True for a missing/invalid key — degrades to the reconfigure prompt. */
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** True for a rate-limit response — drives backoff + retry-after handling. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * Parse a `retry-after` header into a delay in SECONDS.
 *
 * The header (RFC 7231) may be either an integer count of seconds
 * ("retry-after: 30") or an HTTP-date ("retry-after: Wed, 21 Oct 2025 07:28:00
 * GMT"). Both forms are handled; an absent/garbage value yields `undefined`.
 *
 * @param headers  The response headers (`res.headers`), or any `{ get }` shape.
 * @param nowMs    Current epoch ms — injected so the HTTP-date branch is
 *                 deterministic in tests (defaults to `Date.now()`).
 */
export function parseRetryAfter(
  headers: { get(name: string): string | null },
  nowMs: number = Date.now(),
): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const trimmed = raw.trim();

  // Numeric form: delta-seconds.
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  // HTTP-date form: compute the delta from now (never negative).
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.max(0, Math.round((dateMs - nowMs) / 1000));
}

/**
 * Transport function signature — allows test stubs to replace the real fetch.
 * The real implementation is a plain browser fetch call.
 */
export type TransportFn = (
  url: string,
  init: RequestInit,
) => Promise<MessagesResponse>;

/**
 * Default transport: real browser fetch to the Anthropic messages endpoint.
 *
 * On `!res.ok` it throws a TYPED `ModelHttpError` carrying the status code and
 * the parsed `retry-after` header (Phase 6), so the resilience wrapper can
 * branch on 401 vs 429 vs 500 and honor the server's backoff hint. The success
 * path is unchanged: it returns the parsed `MessagesResponse`.
 */
export const defaultTransport: TransportFn = async (url, init) => {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ModelHttpError(res.status, parseRetryAfter(res.headers), body);
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
