// Tests for the producer's optional mutation prompt (Phase 5, MOD-03).
//
// A tweak weaves the user's free-form instruction into the SAME produce loop
// (DRY) — no separate produce path. These tests prove the instruction reaches the
// prompt (initial / repair / length variants), the prompt stays hygiene-safe, the
// no-mutation behavior is unchanged, and produceComponent forwards userPrompt to
// the transport. Test doubles are named "canned"/"stub"/"testTransport".

import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  buildRepairPrompt,
  buildLengthPrompt,
  produceComponent,
} from "./producer";
import type { TransportFn, MessagesResponse } from "../host/modelClient";

const withKey = () => "sk-test-key";

const VALID_COMPONENT = `
function App() {
  return React.createElement('div', null, 'Tweaked');
}
`;

describe("buildPrompt — mutation instruction (MOD-03)", () => {
  it("weaves the user's instruction into the app prompt", () => {
    const prompt = buildPrompt("notes", "app", "make the text bigger");
    expect(prompt).toContain("make the text bigger");
  });

  it("weaves the user's instruction into the widget prompt", () => {
    const prompt = buildPrompt("line-chart", "widget", "use a bar style");
    expect(prompt).toContain("use a bar style");
    expect(prompt).toContain("line-chart");
  });

  it("omits the mutation line entirely when no instruction is given (open path unchanged)", () => {
    const open = buildPrompt("notes");
    const tweak = buildPrompt("notes", "app", "x");
    expect(tweak.length).toBeGreaterThan(open.length);
    // The plain-open prompt has no tailoring line.
    expect(open).not.toMatch(/Tailor it to this request/);
    expect(tweak).toMatch(/Tailor it to this request/);
  });

  it("the mutation prompt stays hygiene-safe (no banned tokens from the wrapper copy)", () => {
    const prompt = buildPrompt("budget", "app", "add a chart");
    expect(prompt).not.toMatch(/synthesi[sz]/i);
    expect(prompt).not.toMatch(new RegExp("\\bgenerat(e|ed|ing)\\b", "i"));
    expect(prompt).not.toMatch(/\bAI\b/);
    expect(prompt).not.toMatch(/\bmock\b/i);
  });

  it("repair + length prompts keep the instruction so a retry honors it", () => {
    const repair = buildRepairPrompt("notes", "function App(){}", "err", "app", "make it red");
    expect(repair).toContain("make it red");
    const length = buildLengthPrompt("notes", "app", "make it red");
    expect(length).toContain("make it red");
  });
});

describe("produceComponent — forwards the mutation to the transport (MOD-03)", () => {
  it("the produce request body carries the user's instruction in the prompt", async () => {
    let seenContent = "";
    const transport: TransportFn = (_url, init) => {
      const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
      seenContent = body.messages[0]?.content ?? "";
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text: VALID_COMPONENT }],
        stop_reason: "end_turn",
      });
    };

    const result = await produceComponent("weather", transport, withKey, "app", "show a 5-day view");
    expect(seenContent).toContain("show a 5-day view");
    expect(result.transpiledJS).toContain("React.createElement");
  });
});
