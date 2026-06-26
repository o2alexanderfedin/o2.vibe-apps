// Opaque cache-key derivation: normalize → SHA-256 → lowercase hex.
//
// Two public shapes share one hashing primitive:
//   - cacheKey(input)              — opaque key over a single normalized string.
//   - registryKey(kind, type, ...) — structured key that folds the artifact kind
//                                    and an optional prompt in alongside the type,
//                                    so an app and a widget that share a type slug
//                                    never collide and per-prompt variants (a
//                                    tweak) cache separately from the baseline.
//
// The slug is hashed INTO the digest and never prepended, so the 64-hex key stays
// opaque (no readable prefix). Base64 is deliberately avoided (it throws on
// emoji/CJK and is partially readable). The same normalization runs on every read
// and write so equivalent inputs map to the identical key.

/** Artifact kinds that share the registry's key space. Folding the kind into the
 *  digest is what keeps an app and a widget of the same type slug distinct. */
export type RegistryKind = "app" | "widget" | "handler";

// A unit separator (U+001F) joins the structured parts. It is not whitespace, so
// it survives normalization untouched — field boundaries can never blur (type
// "a" + prompt "b" can't collide with type "a b").
const PART_SEPARATOR = String.fromCharCode(0x1f);

/** Normalize one key component so equivalent inputs map to the same digest:
 *  NFC, lowercase, trim, and collapse internal whitespace. Run per-component so
 *  each field's own leading/trailing space is handled before the parts are
 *  joined (a whole-string trim would miss a prompt's interior boundary). */
function normalizePart(input: string): string {
  return input.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Opaque key over a single string — the low-level hashing primitive. */
export async function cacheKey(input: string): Promise<string> {
  return sha256Hex(normalizePart(input));
}

/** Structured registry key: fold the artifact `kind`, `type`, and an optional
 *  `prompt` into one opaque digest. Guarantees (a) an app and a widget sharing a
 *  type slug get distinct keys, and (b) a prompted variant keys separately from
 *  the un-prompted baseline. Each part is normalized on its own, then joined with
 *  the unit separator, then hashed. */
export async function registryKey(
  kind: RegistryKind,
  type: string,
  prompt = "",
): Promise<string> {
  const canonical = [kind, normalizePart(type), normalizePart(prompt)].join(
    PART_SEPARATOR,
  );
  return sha256Hex(canonical);
}
