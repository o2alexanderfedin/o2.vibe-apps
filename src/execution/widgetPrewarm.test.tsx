// Unit + DI tests for the widget pre-warm pass (WIDGET-02; WIDGET-03 plumbing).
//
// These prove the three pre-warm invariants on the REAL pass with INJECTED deps
// (in-memory registry + canned transport — no network, no real IndexedDB):
//   1. Transitive: a widget's own `@widget` declarations are resolved too.
//   2. Cycle guard: A→B→A terminates and resolves each type exactly once.
//   3. Concurrency cap ≤2: a deliberately gated transport observes at most two
//      in-flight produce calls at any instant.
// Plus DI: the pass consumes the injected transport/registry; a registry-seeded
// widget is served WITHOUT any transport call.
//
// Test doubles are named "canned"/"stub"/"gated"/"testTransport" (never the
// banned hygiene tokens).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { prewarmWidgets, WIDGET_CONCURRENCY, MAX_WIDGET_DEPTH } from "./widgetPrewarm";
import { registryKey } from "../registry/cacheKey";
import {
  createTestServices,
  createInMemoryRegistry,
} from "../services/testServices";
import type { Registry } from "../services/registry";
import type { TransportFn, MessagesResponse } from "../host/modelClient";

afterEach(() => {
  cleanup();
});

// A self-contained widget source that declares the given nested `@widget` deps
// and renders a marker so a render-time assertion can find it.
//
// The body is wrapped in a markdown fence — exactly as real model output ships —
// so the `@widget` declaration comments survive `extractCode` (which otherwise
// treats leading comments before `function App` as droppable prose preamble).
// Real fixtures are fenced for the same reason; this mirrors them.
function widgetSource(marker: string, deps: string[] = []): string {
  const decls = deps.map((d) => `// @widget ${d}`).join("\n");
  return (
    "```tsx\n" +
    `${decls}\n` +
    `function App() {\n` +
    `  return React.createElement("div", { "data-testid": "${marker}" }, "${marker}");\n` +
    `}\n` +
    "```\n"
  );
}

/**
 * A canned transport that returns a widget source per requested type. It infers
 * the requested type from the prompt body (which contains `of type "<type>"`),
 * and tracks call count + peak concurrency. An optional `gate` delays each
 * response so concurrency can be observed.
 */
function widgetTransport(
  sources: Record<string, string>,
  opts: { gateMs?: number } = {},
): { transport: TransportFn; calls: number; peakConcurrency: number } {
  const state = { calls: 0, inFlight: 0, peak: 0 };
  const transport: TransportFn = async (_url, init) => {
    state.calls += 1;
    state.inFlight += 1;
    state.peak = Math.max(state.peak, state.inFlight);
    try {
      const body = JSON.parse(init.body as string) as {
        messages: Array<{ content: string }>;
      };
      const content = body.messages[0]?.content ?? "";
      const m = content.match(/of type "([^"]+)"/);
      const type = m?.[1] ?? "";
      const text = sources[type] ?? widgetSource(type);
      if (opts.gateMs) {
        await new Promise((r) => setTimeout(r, opts.gateMs));
      }
      return { content: [{ type: "text", text }], stop_reason: "end_turn" } as MessagesResponse;
    } finally {
      state.inFlight -= 1;
    }
  };
  return {
    transport,
    get calls() {
      return state.calls;
    },
    get peakConcurrency() {
      return state.peak;
    },
  };
}

describe("prewarmWidgets — resolves all declared widgets (WIDGET-02)", () => {
  it("resolves every directly-declared widget into the component map", async () => {
    const rec = widgetTransport({
      "stat-card": widgetSource("stat-card"),
      "line-chart": widgetSource("line-chart"),
    });
    const services = createTestServices({ transport: rec.transport });
    const root = widgetSource("host", ["stat-card", "line-chart"]);

    const map = await prewarmWidgets(root, services);

    expect(map.has("stat-card")).toBe(true);
    expect(map.has("line-chart")).toBe(true);
    expect(rec.calls).toBe(2);
  });

  it("resolves TRANSITIVE widgets (a widget's own @widget deps are pre-warmed)", async () => {
    // host → outer → inner. `outer`'s source declares `// @widget inner`.
    const rec = widgetTransport({
      outer: widgetSource("outer", ["inner"]),
      inner: widgetSource("inner"),
    });
    const services = createTestServices({ transport: rec.transport });
    const root = widgetSource("host", ["outer"]);

    const map = await prewarmWidgets(root, services);

    expect(map.has("outer")).toBe(true);
    expect(map.has("inner")).toBe(true); // discovered transitively
    expect(rec.calls).toBe(2);
  });

  it("CYCLE GUARD: A→B→A terminates and resolves each type exactly once", async () => {
    // a declares b; b declares a. Without the guard this would loop forever.
    const rec = widgetTransport({
      a: widgetSource("a", ["b"]),
      b: widgetSource("b", ["a"]),
    });
    const services = createTestServices({ transport: rec.transport });
    const root = widgetSource("host", ["a"]);

    const map = await prewarmWidgets(root, services);

    expect(map.has("a")).toBe(true);
    expect(map.has("b")).toBe(true);
    // Each type produced exactly once despite the cycle.
    expect(rec.calls).toBe(2);
  });

  it("CONCURRENCY CAP: never more than WIDGET_CONCURRENCY (≤2) produce calls in flight", async () => {
    // Five independent widgets, each gated so they overlap. The gate makes the
    // pool's cap observable: peak in-flight must not exceed the cap.
    const types = ["w1", "w2", "w3", "w4", "w5"];
    const sources = Object.fromEntries(types.map((t) => [t, widgetSource(t)]));
    const rec = widgetTransport(sources, { gateMs: 15 });
    const services = createTestServices({ transport: rec.transport });
    const root = widgetSource("host", types);

    const map = await prewarmWidgets(root, services);

    expect(WIDGET_CONCURRENCY).toBeLessThanOrEqual(2);
    expect(rec.peakConcurrency).toBeLessThanOrEqual(WIDGET_CONCURRENCY);
    expect(rec.peakConcurrency).toBeGreaterThan(1); // the pool DID run >1 in parallel
    // All five still resolved despite the cap.
    for (const t of types) expect(map.has(t)).toBe(true);
    expect(rec.calls).toBe(5);
  });

  it("returns an empty map for a root that declares no widgets", async () => {
    const services = createTestServices();
    const map = await prewarmWidgets(widgetSource("host"), services);
    expect(map.size).toBe(0);
  });
});

describe("prewarmWidgets — DI: injected registry/transport (WIDGET-02)", () => {
  it("a registry-seeded widget is served WITHOUT any transport call", async () => {
    // Pre-seed the widgets store with a resolved record; the transport must
    // never be touched for that type (seeded paths don't call the model).
    const registry: Registry = createInMemoryRegistry();
    const key = await registryKey("widget", "seeded-widget");
    await registry.put(
      "widgets",
      {
        cacheKey: key,
        type: "seeded-widget",
        source: widgetSource("seeded-widget"),
        transpiledJS:
          'exports.default = function App(){ return React.createElement("div", { "data-testid": "seeded-widget" }, "seeded"); };',
      },
      key,
    );

    let transportCalled = false;
    const trackingTransport: TransportFn = () => {
      transportCalled = true;
      return Promise.resolve({ content: [{ type: "text", text: "" }] } as MessagesResponse);
    };
    const services = createTestServices({ registry, transport: trackingTransport });

    const map = await prewarmWidgets(widgetSource("host", ["seeded-widget"]), services);

    expect(transportCalled).toBe(false); // served from the registry, no model call
    expect(map.has("seeded-widget")).toBe(true);
  });

  it("a produced widget is persisted to the widgets store (dual-cache parity)", async () => {
    const registry = createInMemoryRegistry();
    const rec = widgetTransport({ "fresh-widget": widgetSource("fresh-widget") });
    const services = createTestServices({ registry, transport: rec.transport });

    await prewarmWidgets(widgetSource("host", ["fresh-widget"]), services);

    const key = await registryKey("widget", "fresh-widget");
    const stored = await registry.get("widgets", key);
    expect(typeof stored?.["source"]).toBe("string");
    expect(typeof stored?.["transpiledJS"]).toBe("string");
  });

  it("the resolved widget actually renders (instantiated + wrapped) from the map", async () => {
    const rec = widgetTransport({ "stat-card": widgetSource("stat-card") });
    const services = createTestServices({ transport: rec.transport });

    const map = await prewarmWidgets(widgetSource("host", ["stat-card"]), services);
    const W = map.get("stat-card");
    expect(W).toBeDefined();

    render(createElement(W!));
    // The wrapper exposes the widget in its own shell (role=group, labeled by type)…
    expect(screen.getByRole("group", { name: "stat-card" })).toBeInTheDocument();
    // …and the produced widget content renders inside it.
    expect(screen.getByTestId("stat-card")).toBeInTheDocument();
  });
});

describe("prewarmWidgets — composition-depth cap (WIDGET-06)", () => {
  it("bounds a straight-line nesting chain at MAX_WIDGET_DEPTH; deeper types are isolated", async () => {
    // Build a chain longer than the cap: host → d1 → d2 → … → dN, each widget
    // declaring the next. Root deps are depth 1, so types d1..d{MAX} resolve and
    // anything deeper (d{MAX+1}+) is dropped — absent from the map (useWidget null),
    // exactly like a resolve failure. No infinite loop, no unbounded resolution.
    const total = MAX_WIDGET_DEPTH + 4; // a few levels past the cap
    const sources: Record<string, string> = {};
    for (let i = 1; i <= total; i += 1) {
      const next = i < total ? ["d" + (i + 1)] : [];
      sources["d" + i] = widgetSource("d" + i, next);
    }
    const rec = widgetTransport(sources);
    const services = createTestServices({ transport: rec.transport });

    const map = await prewarmWidgets(widgetSource("host", ["d1"]), services);

    // Exactly MAX_WIDGET_DEPTH widgets resolve (d1..d{MAX} at depths 1..MAX)…
    expect(map.size).toBe(MAX_WIDGET_DEPTH);
    expect(map.has("d" + MAX_WIDGET_DEPTH)).toBe(true);
    // …and the first type beyond the cap (depth MAX+1) is never resolved.
    expect(map.has("d" + (MAX_WIDGET_DEPTH + 1))).toBe(false);
    expect(map.has("d" + total)).toBe(false);
    // The cap short-circuits resolution: the transport is never asked for the
    // over-deep types (call count == the resolved types).
    expect(rec.calls).toBe(MAX_WIDGET_DEPTH);
  });
});
