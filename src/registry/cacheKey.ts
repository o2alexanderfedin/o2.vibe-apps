// Opaque cache-key derivation: normalize → SHA-256 → lowercase hex.
//
// The input string already carries the type slug; the slug is hashed INTO the
// digest and never prepended to the output, so the 64-hex key stays opaque
// (no readable prefix). Base64 encoding is deliberately avoided (it throws on
// emoji/CJK and is partially readable). The same normalization runs on every
// read and write so equivalent inputs map to the identical key.
export async function cacheKey(input: string): Promise<string> {
  const normalized = input
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
