// Typed (TypeScript) handler — strip + run.
//
// Handlers are now produced as TypeScript with explicit input/output types (the
// types ARE the contract; @babel/preset-typescript strips them before the handler
// runs). This locks the two guarantees that gives us, deterministically and with
// no network:
//   1. transpileHandler removes all TS type syntax → runnable JS (and a type-syntax
//      error would throw a TranspileError that feeds the producer self-heal loop).
//   2. The stripped handler still executes in the constrained scope and honors the
//      { state, payload } -> { data: { state } } contract it declared.
//
// (Babel STRIPS types — it does not type-CHECK. The benefit is contract adherence
// + self-documentation + syntax safety, not a compiler gate; the runtime shape
// merge/keep-prior in the shell remains the actual enforcement.)

import { describe, expect, it } from "vitest";
import { transpileHandler, TranspileError } from "./transpile";
import { executeHandlerSource } from "./handler";

// A realistic typed handler: interfaces for input/output, an annotated parameter
// and return type, and a typed local — exactly the shape the new handler prompt asks
// for. It is valid TypeScript that is NOT valid JavaScript (the `: Type` annotations
// and `interface` declarations must be stripped to run).
const TYPED_HANDLER = `
interface CalcState { display: string; expr: string }
interface HandlerInput { state: CalcState; payload: string }
interface HandlerOutput { data: { state: CalcState } }

async function handler(input: HandlerInput): Promise<HandlerOutput> {
  const { state, payload }: HandlerInput = input;
  const expr: string = state.expr + payload;
  const next: CalcState = { display: expr, expr };
  return { data: { state: next } };
}
`;

describe("typed (TypeScript) handler — strips to runnable JS", () => {
  it("transpileHandler removes all TS type syntax", () => {
    const js = transpileHandler(TYPED_HANDLER, { filename: "handler.ts" });
    expect(js).not.toContain("interface");
    expect(js).not.toContain(": HandlerInput");
    expect(js).not.toContain("Promise<HandlerOutput>");
    expect(js).not.toContain(": CalcState");
    // The runnable function survives the strip.
    expect(js).toContain("handler");
  });

  it("the stripped handler executes and honors its declared contract", async () => {
    const res = await executeHandlerSource(TYPED_HANDLER, {
      state: { display: "1", expr: "1" },
      payload: "+",
    });
    expect(res.error).toBeUndefined();
    expect((res.data as { state: { display: string; expr: string } }).state).toEqual({
      display: "1+",
      expr: "1+",
    });
  });

  it("a TS type-SYNTAX error surfaces as a TranspileError (feeds the self-heal loop)", () => {
    // `: : number` is malformed type syntax — preset-typescript must reject it so the
    // producer's self-heal loop gets an actionable Babel error rather than silently
    // shipping broken code.
    const broken = `async function handler(input: : number) { return { data: 1 }; }`;
    expect(() => transpileHandler(broken, { filename: "handler.ts" })).toThrow(TranspileError);
  });
});
