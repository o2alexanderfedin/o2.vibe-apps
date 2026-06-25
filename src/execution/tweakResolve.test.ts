// DI tests for the tweak resolve paths (Phase 5, MOD-03).
//
// Both the app tweak (resolveComponent with a userPrompt) and the widget tweak
// (resolveWidgetTweak) run entirely on INJECTED dependencies — a canned transport
// (no network) and an in-memory registry (no real IndexedDB). These tests prove:
//   - a tweak on an unseeded app weaves the instruction into the produce prompt;
//   - a tweak on a SEEDED app still produces (the seed is the un-tweaked baseline)
//     so the instruction is honored — a seeded open never would have called out;
//   - the widget tweak produces a fresh widget via the injected transport and
//     instantiates it, caching the tweaked variant under a new key.
// Test doubles are named "canned"/"stub"/"testTransport".

import { describe, expect, it, vi } from "vitest";
import {
  createTestServices,
  createInMemoryRegistry,
} from "../services/testServices";
import type { TransportFn, MessagesResponse } from "../host/modelClient";

const TWEAKED_APP = `
function App() {
  return React.createElement('div', null, 'Tweaked App');
}
`;

const TWEAKED_WIDGET = "```tsx\nfunction App(){ return React.createElement('div', null, 'Tweaked Widget'); }\n```";

/** A transport that records every prompt it receives and returns canned text. */
function recordingTransport(text: string): {
  transport: TransportFn;
  prompts: string[];
} {
  const prompts: string[] = [];
  const transport: TransportFn = (_url, init) => {
    const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
    prompts.push(body.messages[0]?.content ?? "");
    return Promise.resolve<MessagesResponse>({
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    });
  };
  return { transport, prompts };
}

describe("app tweak — resolveComponent with a userPrompt (MOD-03)", () => {
  it("a tweak on a SEEDED app produces via the model with the instruction (seed bypassed)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();
    const { cacheKey } = await import("../registry/cacheKey");

    const rec = recordingTransport(TWEAKED_APP);
    const services = createTestServices({ transport: rec.transport });

    // "counter" IS seeded — but a tweak must still call out so the instruction is
    // honored. A plain open of "counter" would never invoke the transport.
    const tweakKey = await cacheKey("counter\nmake it count by ten");
    const Component = await resolveComponent(
      "counter-tweak-1",
      "counter",
      tweakKey,
      services,
      "make it count by ten",
    );

    expect(typeof Component).toBe("function");
    // The transport WAS called (seed bypassed) and the prompt carries the tweak.
    expect(rec.prompts.length).toBeGreaterThanOrEqual(1);
    expect(rec.prompts[0]).toContain("make it count by ten");
  });

  it("the tweaked variant caches under its own key (re-resolve is a cache hit, no second call)", async () => {
    const { resolveComponent, _clearCachesForTesting } = await import("./loader");
    _clearCachesForTesting();
    const { cacheKey } = await import("../registry/cacheKey");

    const rec = recordingTransport(TWEAKED_APP);
    const registry = createInMemoryRegistry();
    const services = createTestServices({ transport: rec.transport, registry });

    const tweakKey = await cacheKey("weather\nadd humidity");
    await resolveComponent("weather-tweak-1", "weather", tweakKey, services, "add humidity");
    const callsAfterFirst = rec.prompts.length;

    // Second resolve, SAME tweak key, different instance, caches cleared in-memory
    // → tier-3 registry hit → NO new transport call.
    _clearCachesForTesting();
    await resolveComponent("weather-tweak-2", "weather", tweakKey, services, "add humidity");
    expect(rec.prompts.length).toBe(callsAfterFirst);
  });
});

describe("widget tweak — resolveWidgetTweak (MOD-03)", () => {
  it("produces a fresh widget via the injected transport and instantiates it", async () => {
    vi.resetModules();
    const { resolveWidgetTweak } = await import("./widgetPrewarm");
    const rec = recordingTransport(TWEAKED_WIDGET);
    const services = createTestServices({ transport: rec.transport });

    const Component = await resolveWidgetTweak("line-chart", "use a bar style", services);
    expect(typeof Component).toBe("function");
    // The widget produce prompt carries the instruction (and the widget framing).
    expect(rec.prompts.some((p) => p.includes("use a bar style"))).toBe(true);
    expect(rec.prompts.some((p) => p.includes("line-chart"))).toBe(true);
  });

  it("returns null (and does not throw) when the tweaked widget can't transpile", async () => {
    vi.resetModules();
    const { resolveWidgetTweak } = await import("./widgetPrewarm");
    const garbage = "function App( { return <div>broken</div"; // cannot transpile
    const rec = recordingTransport(garbage);
    const services = createTestServices({ transport: rec.transport });

    const Component = await resolveWidgetTweak("stat-card", "break it", services);
    expect(Component).toBeNull();
  });
});
