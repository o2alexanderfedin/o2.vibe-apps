// DI + prompt tests for the producer's WIDGET mode (Phase 4, WIDGET-02 reuse).
//
// The widget path reuses the SAME produce machinery as the app path (DRY); only
// the prompt differs. These tests prove: the widget prompt is hygiene-safe and
// carries the props contract; produceComponent(kind:"widget") runs the full
// produce loop on a REAL captured widget fixture via the INJECTED transport (no
// network); and a missing key short-circuits before any transport call.
//
// Test doubles are named "canned"/"stub"/"testTransport" (never banned tokens).

import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  buildRepairPrompt,
  buildLengthPrompt,
  produceComponent,
  ProduceError,
} from "./producer";
import type { TransportFn, MessagesResponse } from "../host/modelClient";
import { rawWidgetFixture } from "../test/fixtures/load";

const withKey = () => "sk-test-key";

// A canned transport returning the given text, tracking call count.
function recordingTransport(text: string): { transport: TransportFn; calls: number } {
  const state = { calls: 0 };
  const transport: TransportFn = () => {
    state.calls += 1;
    return Promise.resolve<MessagesResponse>({
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    });
  };
  return {
    transport,
    get calls() {
      return state.calls;
    },
  };
}

describe("buildPrompt — widget kind (WIDGET-02)", () => {
  it("the widget prompt is hygiene-safe (no banned tokens)", () => {
    const prompt = buildPrompt("line-chart", "widget");
    expect(prompt).not.toMatch(/synthesi[sz]/i);
    expect(prompt).not.toMatch(new RegExp("\\bgenerat(e|ed|ing)\\b", "i"));
    expect(prompt).not.toMatch(/\bAI\b/);
    expect(prompt).not.toMatch(/\bmock\b/i);
  });

  it("the widget prompt names the type and the props contract", () => {
    const prompt = buildPrompt("data-table", "widget");
    expect(prompt).toContain("data-table");
    expect(prompt).toContain("widget");
    expect(prompt).toContain("data?");
    expect(prompt).toContain("config?");
    expect(prompt).toContain("onAction?");
  });

  it("the app prompt is unchanged (default kind) — no props contract leaked into it", () => {
    const prompt = buildPrompt("weather");
    expect(prompt).toContain('"weather" app');
    expect(prompt).not.toContain("onAction?");
  });

  it("widget repair + length prompts keep the widget framing and stay hygiene-safe", () => {
    const repair = buildRepairPrompt("stat-card", "function App(){}", "some error", "widget");
    expect(repair).toContain("stat-card");
    expect(repair).toContain("widget");
    expect(repair).not.toMatch(new RegExp("\\bgenerat(e|ed|ing)\\b", "i"));

    const length = buildLengthPrompt("stat-card", "widget");
    expect(length).toContain("stat-card");
    expect(length).toContain("widget");
    expect(length).not.toMatch(/synthesi[sz]/i);
  });
});

describe("produceComponent — widget kind runs the produce loop on injected deps (WIDGET-02)", () => {
  it("produces a widget from a REAL captured fixture via the injected transport", async () => {
    const rec = recordingTransport(rawWidgetFixture("stat-card"));
    const result = await produceComponent("stat-card", rec.transport, withKey, "widget");

    expect(rec.calls).toBe(1); // injected transport used, no real network
    expect(result.source).not.toContain("```"); // fences stripped
    expect(result.source).toContain("function App"); // a real component
    expect(result.transpiledJS).toContain("React.createElement"); // classic runtime
  });

  it("a null key short-circuits a widget produce before any transport call", async () => {
    const rec = recordingTransport(rawWidgetFixture("line-chart"));
    await expect(
      produceComponent("line-chart", rec.transport, () => null, "widget"),
    ).rejects.toBeInstanceOf(ProduceError);
    expect(rec.calls).toBe(0);
  });

  it("all three real widget fixtures produce + transpile cleanly via the widget path", async () => {
    for (const t of ["line-chart", "data-table", "stat-card"] as const) {
      const rec = recordingTransport(rawWidgetFixture(t));
      const result = await produceComponent(t, rec.transport, withKey, "widget");
      expect(result.transpiledJS).toContain("React.createElement");
    }
  });
});
