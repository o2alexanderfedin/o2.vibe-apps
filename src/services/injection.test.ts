// IoC/DI-layer coverage: prove that the producer and loader consume their
// INJECTED dependencies (transport, registry, getApiKey) and never reach for the
// real network or browser storage in unit scope. Also proves the composition
// root (createServices) wires the real implementations.
//
// Test doubles are named "canned"/"stub"/"testTransport" (never the banned
// hygiene tokens). The canned transport returns a REAL captured fixture, so the
// produce path runs end-to-end on realistic input with no network.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { produceComponent, ProduceError } from "../execution/producer";
import {
  createTestServices,
  createInMemoryRegistry,
  cannedTransport,
  unusedTransport,
} from "./testServices";
import { createServices, createModelTransport } from "./services";
import { realRegistry } from "./realRegistry";
import {
  defaultTransport,
  ModelHttpError,
  type TransportFn,
  type MessagesResponse,
} from "../host/modelClient";
import { rawFixture, codeFixture } from "../test/fixtures/load";

const withKey = () => "sk-test-key";

// A canned transport that returns the given raw fixture text once, then a fixed
// trailing response (used to assert the producer reads the INJECTED transport).
function recordingTransport(text: string): {
  transport: TransportFn;
  calls: number;
} {
  const state = { calls: 0 };
  const transport: TransportFn = (_url, _init) => {
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

describe("DI — producer consumes the injected transport and key getter", () => {
  it("runs the produce path on a REAL captured fixture via the canned transport", async () => {
    const rec = recordingTransport(rawFixture("calculator"));
    const result = await produceComponent("calculator", rec.transport, withKey);

    // The injected transport was used (no real network).
    expect(rec.calls).toBe(1);
    // The produced source is the extracted real component (no markdown fences).
    expect(result.source).not.toContain("```");
    expect(result.source).toContain("function App()");
    expect(result.transpiledJS).toContain("React.createElement");
  });

  it("reads the INJECTED key getter — a null key short-circuits before any transport call", async () => {
    const rec = recordingTransport(codeFixture("weather"));
    await expect(
      produceComponent("weather", rec.transport, () => null),
    ).rejects.toBeInstanceOf(ProduceError);
    // The key getter gated the call: the transport was never touched.
    expect(rec.calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Truncation handling (defensive): a max_tokens stop is a retryable failure,
// NOT something to transpile.
// ---------------------------------------------------------------------------

describe("DI — truncated (max_tokens) responses are handled, not transpiled", () => {
  // A transport that returns a half-written component with stop_reason max_tokens.
  function truncatedTransport(): { transport: TransportFn; calls: number } {
    const state = { calls: 0 };
    const transport: TransportFn = (_url, _init) => {
      state.calls += 1;
      return Promise.resolve<MessagesResponse>({
        // Realistic truncation: opening fence + partial code, no closing fence.
        content: [
          {
            type: "text",
            text: "```tsx\nfunction App() {\n  const [s, setS] = React.useState('the value is ",
          },
        ],
        stop_reason: "max_tokens",
      });
    };
    return {
      transport,
      get calls() {
        return state.calls;
      },
    };
  }

  it("rejects with a clear, hygiene-safe ProduceError (does not surface a raw transpile error)", async () => {
    const rec = truncatedTransport();
    const attempt = produceComponent("weather", rec.transport, withKey);
    await expect(attempt).rejects.toBeInstanceOf(ProduceError);
    await expect(
      produceComponent("weather", rec.transport, withKey),
    ).rejects.toThrow(/cut short/i);
  });

  it("a single truncation then a complete response succeeds (truncation retries)", async () => {
    let call = 0;
    const transport: TransportFn = (_url, _init) => {
      call += 1;
      if (call === 1) {
        return Promise.resolve<MessagesResponse>({
          content: [{ type: "text", text: "```tsx\nfunction App() { return <div" }],
          stop_reason: "max_tokens",
        });
      }
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text: codeFixture("calculator") }],
        stop_reason: "end_turn",
      });
    };
    const result = await produceComponent("calculator", transport, withKey);
    expect(call).toBe(2);
    expect(result.transpiledJS).toContain("React.createElement");
  });
});

// ---------------------------------------------------------------------------
// No real network / storage touched in unit scope.
// ---------------------------------------------------------------------------

describe("DI — no real fetch / localStorage / indexedDB touched in unit scope", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    // Spy on the globals that production deps would use; the injected doubles
    // must never reach them.
    if (typeof globalThis.fetch === "function") {
      fetchSpy = vi.spyOn(globalThis, "fetch");
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produce on a real fixture never calls global fetch (transport is injected)", async () => {
    const rec = recordingTransport(codeFixture("budget"));
    await produceComponent("budget", rec.transport, withKey);
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(rec.calls).toBe(1);
  });

  it("the in-memory registry double is a plain Map — no indexedDB involved", async () => {
    const registry = createInMemoryRegistry();
    await registry.put("apps", { cacheKey: "k", type: "t", source: "s", transpiledJS: "j" }, "k");
    const got = await registry.get("apps", "k");
    expect(got?.source).toBe("s");
  });

  it("unusedTransport throws if invoked — guards seeded paths against network use", () => {
    expect(() => unusedTransport("u", {})).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Composition root wires the REAL implementations.
// ---------------------------------------------------------------------------

describe("DI — createServices() wires the real implementations", () => {
  it("returns a transport function, the real registry singleton, and a key getter", () => {
    const services = createServices();
    // Phase 6: production wraps the real fetch transport in the resilient
    // limiter + backoff, so it is a function but no longer the BARE default.
    expect(typeof services.transport).toBe("function");
    expect(services.transport).not.toBe(defaultTransport);
    expect(services.registry).toBe(realRegistry);
    expect(typeof services.getApiKey).toBe("function");
  });

  it("wires the Phase 7 guardrails: a produce gate and a storage seam (RESIL-05/06)", () => {
    const services = createServices();
    // The cost gate exposes tryAcquire (the produce-path chokepoint hook).
    expect(typeof services.produceGate.tryAcquire).toBe("function");
    // The storage seam exposes the guarded persist + estimate surface.
    expect(typeof services.storage.requestPersist).toBe("function");
    expect(typeof services.storage.estimate).toBe("function");
  });

  it("the test bundle does NOT wire the real transport (substitutable seam)", () => {
    const test = createTestServices({ transport: cannedTransport("x") });
    expect(test.transport).not.toBe(defaultTransport);
    expect(test.registry).not.toBe(realRegistry);
  });

  // SANDBOX-05: the render-mode seam. Production frames app bodies; tests run the
  // direct in-tree path so the JSDOM/RTL suite needs no real browser.
  it("production defaults frameMode to iframe", () => {
    expect(createServices().frameMode).toBe("iframe");
  });

  it("the test bundle defaults frameMode to in-tree", () => {
    expect(createTestServices().frameMode).toBe("in-tree");
  });

  it("a test can opt into the iframe render mode via override", () => {
    expect(createTestServices({ frameMode: "iframe" }).frameMode).toBe("iframe");
  });
});

// ---------------------------------------------------------------------------
// createModelTransport wraps an inner transport with the shared limiter + 429
// backoff (Phase 6, RESIL-04). Proven by injecting a canned inner that 429s once
// then succeeds — the wrapper recovers transparently with no real network.
// ---------------------------------------------------------------------------

describe("DI — createModelTransport wraps the inner with limiter + backoff", () => {
  it("retries a transient 429 from the injected inner transport and succeeds", async () => {
    let calls = 0;
    const inner: TransportFn = () => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new ModelHttpError(429, 0, "rate"));
      }
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
      });
    };
    // retry-after: 0 → the real-clock sleep is ~0ms, so this stays fast.
    const transport = createModelTransport(inner);
    const res = await transport("u", {});
    expect(res.content[0]?.text).toBe("ok");
    expect(calls).toBe(2);
  });
});
