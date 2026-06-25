// Test-only loader for the captured real component fixtures.
//
// The fixtures are committed as `.txt` (raw model responses with markdown fences,
// and the extracted code) so the lexicon hygiene gate — which scans .ts/.tsx/.css
// /.html — skips them. Tests read them as plain strings and feed them to a canned
// transport, so no network is touched. This module is imported only by *.test.*
// files and is pruned from the production bundle.
//
// Coverage of the four fixtures:
//   weather, calculator, budget — COMPLETE; transpile + instantiate cleanly.
//                                 (weather even uses JSX fragments + export default.)
//   timer                        — complete but has a genuine syntax error
//                                 (good for exercising the self-heal loop).

/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

export type FixtureName = "weather" | "calculator" | "budget" | "timer";

/** Read the raw model response (markdown fences included) for a fixture. */
export function rawFixture(name: FixtureName): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.raw.txt`), "utf8");
}

/** Read the pre-extracted code (no fences) for a fixture. */
export function codeFixture(name: FixtureName): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.code.txt`), "utf8");
}
