// Single egress chokepoint for the browser → Anthropic request edge.
//
// Phase 1 scope is header assembly only: this module makes NO network call.
// Isolating the only module that names the external host turns every
// network-hygiene rule into a one-file invariant.

export const ANTHROPIC_API_BASE = "https://api.anthropic.com";

// Use the dated model id (not the floating alias) so cache-key determinism is
// not silently invalidated by an alias repoint.
export const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

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
