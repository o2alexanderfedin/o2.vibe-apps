// Tests for backend-style data handlers (Phase 8, HANDLER-01..03).
//
// Everything is INJECTED via test doubles (named canned/stub/testTransport, never
// the banned hygiene tokens): a canned transport returns handler source (no
// network), an in-memory registry stands in for the `handlers` store (no
// IndexedDB), a fixed key getter (no localStorage), and a real produce gate with a
// stub clock exercises the cost cap (no real waits). So the resolve-or-produce,
// the dual-cache + reuse, the cost cap, and — crucially — the HANDLER-03
// constrained scope are all proven with NO real network/storage/IndexedDB.

import { describe, expect, it } from "vitest";
import {
  runHandler,
  executeHandlerSource,
  DENIED_GLOBALS,
} from "./handler";
import {
  createTestServices,
  createInMemoryRegistry,
  cannedTransport,
  unusedTransport,
} from "../services/testServices";
import type { Registry } from "../services/registry";
import type { TransportFn, MessagesResponse } from "../host/modelClient";
import { createProduceGate } from "../host/produceGate";
import { createStubClock } from "../host/clock";
import { cacheKey } from "../registry/cacheKey";
import {
  codeHandlerFixture,
  rawHandlerFixture,
} from "../test/fixtures/load";

// ---------------------------------------------------------------------------
// Canned handler source strings (small, hygiene-safe — no banned tokens)
// ---------------------------------------------------------------------------

/** A handler that echoes a derived value from input — returns { data }. */
const ECHO_HANDLER = `
async function handler(input) {
  return { data: { doubled: (input && input.n) ? input.n * 2 : 0 } };
}
`;

/** A handler that throws — runHandler must map it to neutral { error }. */
const THROWING_HANDLER = `
async function handler(input) {
  throw new Error("boom from inside the handler");
}
`;

/** A handler that returns its own { error } — passed through unchanged. */
const ERROR_HANDLER = `
async function handler(input) {
  return { error: "not allowed" };
}
`;

/** A transport that counts how many times it is invoked. */
function countingTransport(text: string): { transport: TransportFn; calls: () => number } {
  let n = 0;
  const transport: TransportFn = (_url, _init) => {
    n += 1;
    return Promise.resolve<MessagesResponse>({
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    });
  };
  return { transport, calls: () => n };
}

// ===========================================================================
// HANDLER-01 — resolve-or-produce-then-exec, returns { data? , error? }
// ===========================================================================

describe("runHandler — HANDLER-01 (resolve-or-produce, execute, neutral result)", () => {
  it("MISS: produces a handler (transport called) and returns { data }", async () => {
    const { transport, calls } = countingTransport(ECHO_HANDLER);
    const services = createTestServices({ transport });

    const result = await runHandler("double a number", { n: 21 }, services);

    expect(calls()).toBe(1); // produced via the model on first need
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({ doubled: 42 });
  });

  it("a handler that THROWS maps to a neutral { error } (mechanic hidden)", async () => {
    const services = createTestServices({ transport: cannedTransport(THROWING_HANDLER) });

    const result = await runHandler("explode", {}, services);

    expect(result.data).toBeUndefined();
    expect(typeof result.error).toBe("string");
    // Neutral copy — never echoes the thrown detail or names the mechanic.
    expect(result.error).not.toMatch(/boom|throw|handler|produce|compile/i);
  });

  it("a handler returning its OWN { error } is passed through unchanged", async () => {
    const services = createTestServices({ transport: cannedTransport(ERROR_HANDLER) });

    const result = await runHandler("deny it", {}, services);

    expect(result.data).toBeUndefined();
    expect(result.error).toBe("not allowed");
  });

  it("a produce failure (no key) returns a neutral { error }, never throws", async () => {
    const services = createTestServices({
      transport: cannedTransport(ECHO_HANDLER),
      apiKey: null, // producer bails → ProduceAuthError → neutral { error }
    });

    const result = await runHandler("anything", {}, services);
    expect(result.data).toBeUndefined();
    expect(typeof result.error).toBe("string");
    expect(result.error).not.toMatch(/key|auth|produce/i);
  });
});

// ===========================================================================
// HANDLER-02 — cached in the `handlers` store, reused with NO further model call
// ===========================================================================

describe("runHandler — HANDLER-02 (dual-cache in handlers store, reuse on hit)", () => {
  it("MISS writes source + transpiledJS to the handlers store with fresh LRU meta", async () => {
    const registry = createInMemoryRegistry();
    const services = createTestServices({
      transport: cannedTransport(ECHO_HANDLER),
      registry,
    });

    await runHandler("persist me", { n: 1 }, services);

    const key = await cacheKey("handler\npersist me");
    const stored = await registry.get("handlers", key);
    expect(stored).toBeDefined();
    expect(typeof stored?.source).toBe("string");
    expect(typeof stored?.transpiledJS).toBe("string");
    expect(stored?.useCount).toBe(0); // fresh write — no hits yet
    expect(typeof stored?.updatedAt).toBe("number");
  });

  it("second call REUSES the cached handler — NO further transport call", async () => {
    const { transport, calls } = countingTransport(ECHO_HANDLER);
    const registry = createInMemoryRegistry();
    const services = createTestServices({ transport, registry });

    const first = await runHandler("reuse me", { n: 5 }, services);
    const second = await runHandler("reuse me", { n: 5 }, services);

    expect(first.data).toEqual({ doubled: 10 });
    expect(second.data).toEqual({ doubled: 10 });
    // Produced exactly once; the second call hit the cache (no model call).
    expect(calls()).toBe(1);
  });

  it("a cache HIT bumps useCount and refreshes updatedAt (consistent with apps path)", async () => {
    const registry = createInMemoryRegistry();
    const services = createTestServices({
      transport: cannedTransport(ECHO_HANDLER),
      registry,
    });
    const key = await cacheKey("handler\nlru handler");

    await runHandler("lru handler", { n: 1 }, services); // miss → write useCount 0
    expect((await registry.get("handlers", key))?.useCount).toBe(0);

    await runHandler("lru handler", { n: 1 }, services); // hit → bump to 1
    expect((await registry.get("handlers", key))?.useCount).toBe(1);

    await runHandler("lru handler", { n: 1 }, services); // hit → bump to 2
    expect((await registry.get("handlers", key))?.useCount).toBe(2);
  });

  it("distinct intents cache under distinct opaque keys (no collision)", async () => {
    const registry = createInMemoryRegistry();
    const services = createTestServices({
      transport: cannedTransport(ECHO_HANDLER),
      registry,
    });

    await runHandler("intent one", {}, services);
    await runHandler("intent two", {}, services);

    expect(await registry.keys("handlers")).toHaveLength(2);
  });
});

// ===========================================================================
// HANDLER-03 — CONSTRAINED SCOPE: the denylist is provably unreachable
// ===========================================================================

describe("runHandler — HANDLER-03 (constrained scope: denied globals are undefined)", () => {
  // One assertion per denied global: a handler that reports `typeof <global>`
  // must see "undefined" — i.e. it resolves to the shadowed parameter, NOT the
  // real global. This is the proof the handler cannot reach network/storage/DOM.
  for (const name of DENIED_GLOBALS) {
    it(`\`${name}\` is shadowed to undefined inside the handler`, async () => {
      const probe = `
        async function handler(input) {
          return { data: { seen: typeof ${name} } };
        }
      `;
      const services = createTestServices({ transport: cannedTransport(probe) });
      const result = await runHandler("probe " + name, {}, services);
      expect(result.data).toEqual({ seen: "undefined" });
    });
  }

  it("a handler ATTEMPTING a network call cannot — fetch() throws → neutral { error }", async () => {
    // fetch is undefined in scope, so calling it throws "fetch is not a function".
    const netHandler = `
      async function handler(input) {
        const r = await fetch("https://api.anthropic.com/v1/messages");
        return { data: r };
      }
    `;
    const services = createTestServices({ transport: cannedTransport(netHandler) });
    const result = await runHandler("try to phone home", {}, services);
    expect(result.data).toBeUndefined();
    expect(result.error).not.toMatch(/fetch|network|anthropic/i); // neutral
  });

  it("a handler ATTEMPTING storage access cannot — localStorage throws → neutral { error }", async () => {
    const storageHandler = `
      async function handler(input) {
        return { data: localStorage.getItem("anything") };
      }
    `;
    const services = createTestServices({ transport: cannedTransport(storageHandler) });
    const result = await runHandler("read storage", {}, services);
    expect(result.data).toBeUndefined();
    expect(typeof result.error).toBe("string");
  });

  it("a handler cannot reach the API key — no key identifier exists in scope", async () => {
    // There is no key parameter in the handler scope. `typeof <undeclared>` is the
    // ONLY safe probe (a bare read would ReferenceError) and yields "undefined" —
    // proving the key never enters the handler path (HANDLER-03). A real attempt to
    // USE such a value (e.g. `getApiKey()`) would throw → neutral { error }.
    const keyHandler = `
      async function handler(input) {
        return { data: typeof getApiKey + ":" + typeof apiKey };
      }
    `;
    const services = createTestServices({ transport: cannedTransport(keyHandler) });
    const result = await runHandler("reach for the key", {}, services);
    expect(result.error).toBeUndefined();
    expect(result.data).toBe("undefined:undefined");
  });

  it("CALLING a would-be key accessor throws (no credential is reachable) → neutral { error }", async () => {
    const keyCallHandler = `
      async function handler(input) {
        return { data: getApiKey() };
      }
    `;
    const services = createTestServices({ transport: cannedTransport(keyCallHandler) });
    const result = await runHandler("invoke the key getter", {}, services);
    expect(result.data).toBeUndefined();
    expect(typeof result.error).toBe("string");
    expect(result.error).not.toMatch(/getApiKey|key/i); // neutral
  });

  it("pure language built-ins REMAIN reachable (denylist, not a full lockdown)", async () => {
    const computeHandler = `
      async function handler(input) {
        const xs = input.xs;
        return { data: { max: Math.max.apply(null, xs), j: JSON.stringify(xs) } };
      }
    `;
    const services = createTestServices({ transport: cannedTransport(computeHandler) });
    const result = await runHandler("compute locally", { xs: [3, 1, 4, 1, 5] }, services);
    expect(result.data).toEqual({ max: 5, j: "[3,1,4,1,5]" });
  });

  it("a handler that require()s a module is blocked (no local module access)", async () => {
    const reqHandler = `
      const dep = require("some-package");
      async function handler(input) { return { data: dep }; }
    `;
    const services = createTestServices({ transport: cannedTransport(reqHandler) });
    const result = await runHandler("import a dep", {}, services);
    expect(result.data).toBeUndefined();
    expect(typeof result.error).toBe("string");
  });
});

// ===========================================================================
// Cost cap — a produce MISS consults the produce gate (RESIL-05 reuse)
// ===========================================================================

describe("runHandler — cost gate is consulted on a produce miss (reuses produceGate)", () => {
  it("blocks the (N+1)th distinct produce, recovers as the window slides, and never throttles a cache HIT", async () => {
    const clock = createStubClock();
    const produceGate = createProduceGate({ clock, cap: 1, windowMs: 1000 });
    const registry = createInMemoryRegistry();
    const { transport, calls } = countingTransport(ECHO_HANDLER);
    const services = createTestServices({ transport, registry, produceGate });

    // First distinct intent → produce → allowed (consumes the single slot).
    const a = await runHandler("intent-a", { n: 1 }, services);
    expect(a.data).toEqual({ doubled: 2 });
    expect(calls()).toBe(1);

    // Second distinct intent → would be the 2nd produce → throttled → neutral error,
    // and NO model call is made (the gate blocks before produceComponent).
    const b = await runHandler("intent-b", { n: 1 }, services);
    expect(b.data).toBeUndefined();
    expect(typeof b.error).toBe("string");
    expect(calls()).toBe(1); // unchanged — the blocked produce never hit the model

    // Re-running intent-a is a cache HIT → never consults the gate → succeeds.
    const aAgain = await runHandler("intent-a", { n: 3 }, services);
    expect(aAgain.data).toEqual({ doubled: 6 });
    expect(calls()).toBe(1); // still no new model call

    // Advance virtual time past the window — capacity frees up (no real wait).
    clock.sleep(1001);
    const c = await runHandler("intent-c", { n: 5 }, services);
    expect(c.data).toEqual({ doubled: 10 });
    expect(calls()).toBe(2); // intent-c produced after recovery
  });
});

// ===========================================================================
// Real captured fixtures — REAL Haiku handler output through a canned transport
// ===========================================================================

describe("runHandler — real captured handler fixtures (no network at test time)", () => {
  it("filter-tasks fixture runs in the constrained scope and returns { data }", async () => {
    // The raw fixture (with markdown fences) is fed verbatim through the canned
    // transport, exactly as the real produce path would receive it.
    const services = createTestServices({
      transport: cannedTransport(rawHandlerFixture("filter-tasks")),
    });

    const result = await runHandler(
      "filter tasks by status",
      { status: "completed" },
      services,
    );

    expect(result.error).toBeUndefined();
    const data = result.data as { count: number; status: string };
    expect(data.status).toBe("completed");
    expect(data.count).toBe(3); // 3 completed tasks in the fixture's local data
  });

  it("summarize-list fixture (which reached for an external module) is BLOCKED → { error }", async () => {
    // This REAL fixture tried to require an external SDK at module top-level — so
    // the constrained scope's hostile require throws and runHandler returns a
    // neutral { error }, proving network/module access is genuinely unreachable.
    const services = createTestServices({
      transport: cannedTransport(rawHandlerFixture("summarize-list")),
    });

    const result = await runHandler("summarize a list", { numbers: [1, 2, 3] }, services);
    expect(result.data).toBeUndefined();
    expect(typeof result.error).toBe("string");
    expect(result.error).not.toMatch(/require|module|sdk|anthropic/i); // neutral
  });

  it("executeHandlerSource runs extracted fixture code directly (transpile + constrained exec)", async () => {
    // The transpile-only escape hatch proves the extracted code path independently
    // of produce/cache — used to assert the constrained scope against real code.
    const result = await executeHandlerSource(
      codeHandlerFixture("filter-tasks"),
      { status: "in-progress" },
    );
    expect(result.error).toBeUndefined();
    const data = result.data as { count: number };
    expect(data.count).toBe(3); // 3 in-progress tasks in the fixture's local data
  });
});

// ===========================================================================
// Hygiene-safe prompt — the handler produce prompt carries no banned tokens
// ===========================================================================

describe("handler produce prompt is hygiene-safe (HYGIENE-03)", () => {
  it("never invokes the transport with a banned token in the prompt body", async () => {
    let captured = "";
    const transport: TransportFn = (_url, init) => {
      const body = JSON.parse(init.body as string) as { messages: Array<{ content: string }> };
      captured = body.messages[0]?.content ?? "";
      return Promise.resolve<MessagesResponse>({
        content: [{ type: "text", text: ECHO_HANDLER }],
        stop_reason: "end_turn",
      });
    };
    const services = createTestServices({ transport });
    await runHandler("anything at all", {}, services);

    expect(captured).not.toMatch(/synthesi[sz]/i);
    expect(captured).not.toMatch(new RegExp("\\bgenerat(e|ed|ing)\\b", "i"));
    expect(captured).not.toMatch(/\bmock\b/i);
    expect(captured).not.toMatch(/\bAI\b/);
    expect(captured).not.toMatch(/\bllm\b/i);
    // It IS a real handler prompt, though.
    expect(captured).toMatch(/handler\(input\)/);
  });

  it("unusedTransport is never invoked on a pure cache hit (sanity for the reuse path)", async () => {
    const registry = createInMemoryRegistry();
    // Pre-seed the cache so the first call is already a hit (no transport needed).
    const key = await cacheKey("handler\npre-seeded");
    // Build the transpiled JS the same way the producer would, by going through a
    // first produce with a canned transport, then swap to unusedTransport.
    const warm = createTestServices({
      transport: cannedTransport(ECHO_HANDLER),
      registry,
    });
    await runHandler("pre-seeded", { n: 2 }, warm);
    expect(await registry.get("handlers", key)).toBeDefined();

    const hot = createTestServices({ transport: unusedTransport, registry });
    const result = await runHandler("pre-seeded", { n: 2 }, hot); // must NOT call transport
    expect(result.data).toEqual({ doubled: 4 });
  });
});
