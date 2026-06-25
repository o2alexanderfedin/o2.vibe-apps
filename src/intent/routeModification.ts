// Contextual-modification router (Phase 5, MOD-02).
//
// A free-form instruction typed into the shared `⋮` prompt is classified
// CLIENT-SIDE — no model call — into one of three actions:
//   - remove : the user wants the target gone        (remove | delete | close)
//   - clone  : the user wants a duplicate            (clone | duplicate | copy)
//   - tweak  : anything else → re-resolve the target with the instruction woven
//              into the produce prompt (the only branch that may touch the model)
//
// Keeping this deterministic and isolated means remove/clone never incur a model
// call (MOD-04) and the routing is trivially unit-testable. The order matters:
// remove is checked before clone so an instruction mentioning both leans toward
// the destructive (and cheaper) action; tweak is the catch-all so the platform
// never silently does nothing on an unrecognized instruction.

/** The three client-routed modification actions (MOD-02). */
export type ModificationKind = "remove" | "clone" | "tweak";

/**
 * A routed modification. `tweak` carries the original instruction so the
 * caller can weave it into the produce prompt; `remove`/`clone` carry none
 * because they are pure client-side operations (no model call — MOD-04).
 */
export type Modification =
  | { kind: "remove" }
  | { kind: "clone" }
  | { kind: "tweak"; instruction: string };

const REMOVE_RE = /\b(remove|delete|close)\b/i;
const CLONE_RE = /\b(clone|duplicate|copy)\b/i;

/**
 * Classify a free-form instruction into a modification action (MOD-02).
 *
 * @param instruction  The raw text the user typed into the contextual prompt.
 * @returns A {@link Modification}; `tweak` preserves the (trimmed) instruction.
 */
export function routeModification(instruction: string): Modification {
  const text = instruction.trim();
  if (REMOVE_RE.test(text)) return { kind: "remove" };
  if (CLONE_RE.test(text)) return { kind: "clone" };
  return { kind: "tweak", instruction: text };
}
