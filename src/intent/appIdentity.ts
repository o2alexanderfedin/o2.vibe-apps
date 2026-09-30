// Which app a window shows, as the registry and the model see it.
//
// A window's app is its type slug plus, optionally, the description it was
// opened from and the latest tweak applied to it. Opening, tweaking and
// restoring a window after a reload must all turn those three into the SAME
// cache key, or a restored window looks its app up under the wrong key. This
// module is the one place that does it.
//
// Tweaks do not stack: a new tweak replaces the previous one and applies to the
// window's base app (the catalogue app, or the described app). That is what the
// tweak path has always done — it keyed a tweak on type + latest instruction.

import { registryKey } from "../registry/cacheKey";

export interface AppIdentity {
  /** The registry key the app is cached under. */
  cacheKey: string;
  /** The request text woven into the produce prompt, if any. */
  prompt: string | undefined;
}

// Joins the description and the tweak inside the key. Not whitespace, so the
// key normalization cannot move the boundary: ("a b", "c") and ("a", "b c")
// stay distinct keys.
const KEY_JOINER = String.fromCharCode(0x1f);

/**
 * The cache key and prompt for an app of `appType`, opened from `description`
 * (if described) and changed by `tweak` (if tweaked).
 *
 * With only one of the two, the key is exactly the one used before tweaks were
 * saved — `registryKey("app", appType, description)` for a described app and
 * `registryKey("app", appType, tweak)` for a tweaked catalogue app — so apps
 * already in the cache still open.
 */
export async function appIdentity(
  appType: string,
  description?: string,
  tweak?: string,
): Promise<AppIdentity> {
  const desc = description?.trim() || undefined;
  const change = tweak?.trim() || undefined;
  if (desc && change) {
    return {
      cacheKey: await registryKey("app", appType, desc + KEY_JOINER + change),
      prompt: `${desc}. Then change it: ${change}`,
    };
  }
  const prompt = desc ?? change;
  return { cacheKey: await registryKey("app", appType, prompt), prompt };
}
