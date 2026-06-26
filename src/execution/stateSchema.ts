// State shape validation helper for the delegated shell merge step.
// Derives a lenient-partial schema from a module's initialState so the merge
// step can reject a known field arriving with the wrong type — keeping the
// prior state intact — while allowing partial updates and extra unknown keys.
//
// Design constraints (reliability paradox):
//   - PARTIAL: every field is optional; a handler may return only some fields.
//   - LOOSE: unknown extra keys in `next` are passed through, not rejected.
//   - TYPE-CHECK ONLY KNOWN FIELDS: reject only when a field that exists in
//     initialState is present in `next` with a mismatched primitive type.
//   - ONE LEVEL DEEP: nested objects and arrays are validated leniently.
//     This is intentional — over-strict validation hurts more than it helps.

import { z } from "zod/mini";

/** Map each top-level initialState value to its lenient validator. */
function validatorFor(value: unknown): z.ZodMiniType {
  if (typeof value === "string") return z.string();
  if (typeof value === "number") return z.number();
  if (typeof value === "boolean") return z.boolean();
  if (Array.isArray(value)) return z.array(z.unknown());
  // null, undefined, or plain object → lenient (any type accepted)
  return z.unknown();
}

/**
 * Derive a lenient-partial schema from an initialState record.
 *
 * The returned schema, when `.safeParse(next)` is called, returns
 * `{ success: false }` ONLY when a known field (present in initialState)
 * appears in `next` with a type that contradicts the initialState-inferred
 * validator. All other cases — partial updates, unknown extra keys, missing
 * known fields — succeed.
 */
export function deriveStateSchema(
  initialState: Record<string, unknown>,
): ReturnType<typeof z.looseObject> {
  const shape: Record<string, z.ZodMiniType> = {};
  for (const [key, value] of Object.entries(initialState)) {
    shape[key] = z.optional(validatorFor(value));
  }
  // looseObject passes unknown keys through without rejecting them.
  return z.looseObject(shape);
}
