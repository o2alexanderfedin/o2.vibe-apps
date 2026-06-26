// Intent resolver — action → Intent (Phase 2, LOOP-01).
//
// A static action-to-type map produces a typed Intent object that drives
// the resolve → compile → instantiate → mount pipeline. No model call occurs
// here; the resolver is purely deterministic.
//
// `contextBundle` carries optional supplementary data (user input, current
// state, etc.) that later phases will pass to the model prompt. In Phase 2
// it is always empty because the source is seeded.

import { registryKey } from "../registry/cacheKey";

/** Operations the platform currently supports. */
export type Operation = "open";

/** The kinds of artifacts that can be resolved. */
export type Kind = "app";

/**
 * A resolved intent — the normalized, opaque-key-carrying descriptor
 * that drives the execution pipeline.
 */
export interface Intent {
  operation: Operation;
  kind: Kind;
  /** The app type id (e.g. "counter", "notes"). */
  type: string;
  /** Supplementary context passed to the prompt in Phase 3+. Empty in Phase 2. */
  contextBundle: Record<string, unknown>;
  /** SHA-256 opaque cache key for this type. Resolved asynchronously. */
  cacheKey: string;
}

/**
 * Resolve an open-app action into a typed Intent.
 *
 * The cacheKey is the opaque structured registry key over (kind="app", type),
 * so an app never collides with a widget of the same type slug and registry
 * reads are always key-stable.
 *
 * @param appType  The app type id from the storefront registry.
 */
export async function resolveOpenApp(appType: string): Promise<Intent> {
  const key = await registryKey("app", appType);
  return {
    operation: "open",
    kind: "app",
    type: appType,
    contextBundle: {},
    cacheKey: key,
  };
}
