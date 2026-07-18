import { describe, it, expect, vi } from "vitest";
import {
  isFromFrame,
  parseSafe,
  RpcEnvelopeSchema,
  dispatchInbound,
  sendToFrame,
  registerPending,
  resolvePending,
  clearPendingForFrame,
  type RpcMethod,
  type RpcEnvelope,
  type InboundHandler,
  type FrameContext,
} from "./frameBridge";

// ---------------------------------------------------------------------------
// isFromFrame
// ---------------------------------------------------------------------------

describe("isFromFrame", () => {
  function makeEvent(origin: string, source: Window | null) {
    return { origin, source } as MessageEvent;
  }

  it("returns true for opaque origin 'null' with correct source", () => {
    const win = {} as Window;
    expect(isFromFrame(makeEvent("null", win), win)).toBe(true);
  });

  it("returns false for wrong origin (non-null)", () => {
    const win = {} as Window;
    expect(isFromFrame(makeEvent("https://evil.example", win), win)).toBe(false);
  });

  it("returns false for correct origin but wrong source", () => {
    const win = {} as Window;
    const other = {} as Window;
    expect(isFromFrame(makeEvent("null", win), other)).toBe(false);
  });

  it("returns false when frameWindow is null", () => {
    const win = {} as Window;
    expect(isFromFrame(makeEvent("null", win), null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseSafe
// ---------------------------------------------------------------------------

describe("parseSafe", () => {
  it("accepts a plain object and returns a null-prototype copy", () => {
    const result = parseSafe({ type: "FRAME_RESIZE", height: 100 });
    expect(result).not.toBeNull();
    expect(Object.getPrototypeOf(result)).toBe(null);
    expect(result!["type"]).toBe("FRAME_RESIZE");
    expect(result!["height"]).toBe(100);
  });

  it("does NOT pollute prototype via __proto__ key (prototype pollution guard)", () => {
    const raw = JSON.parse('{"__proto__":{"polluted":true},"type":"FRAME_RESIZE"}');
    const result = parseSafe(raw);
    // The result must exist (it's a plain object)
    expect(result).not.toBeNull();
    // The pollution must not have propagated to Object.prototype
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    // The result itself must not carry 'polluted'
    expect("polluted" in (result as object)).toBe(false);
  });

  it("returns null for null input", () => {
    expect(parseSafe(null)).toBeNull();
  });

  it("returns null for a number", () => {
    expect(parseSafe(42)).toBeNull();
  });

  it("returns null for an array", () => {
    expect(parseSafe([1, 2])).toBeNull();
  });

  it("returns null for a string", () => {
    expect(parseSafe("hello")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseSafe(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RpcEnvelopeSchema
// ---------------------------------------------------------------------------

describe("RpcEnvelopeSchema", () => {
  it("accepts a minimal envelope with just type", () => {
    expect(RpcEnvelopeSchema.safeParse({ type: "FRAME_READY" }).success).toBe(true);
  });

  it("rejects an empty object (missing type)", () => {
    expect(RpcEnvelopeSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an envelope where type is a number", () => {
    expect(RpcEnvelopeSchema.safeParse({ type: 42 }).success).toBe(false);
  });

  it("accepts optional correlationId and payload", () => {
    expect(
      RpcEnvelopeSchema.safeParse({
        type: "RUN_HANDLER",
        correlationId: "abc-123",
        payload: { intent: "add", input: {} },
      }).success,
    ).toBe(true);
  });

  it("passes through extra unknown keys (looseObject)", () => {
    const result = RpcEnvelopeSchema.safeParse({ type: "FRAME_PONG", extra: true });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dispatchInbound
// ---------------------------------------------------------------------------

describe("dispatchInbound", () => {
  function makeTable(
    overrides: Partial<Record<RpcMethod, InboundHandler>> = {},
  ): Record<RpcMethod, InboundHandler> {
    const noop: InboundHandler = () => {};
    return {
      FRAME_READY: noop,
      RUN_HANDLER: noop,
      FETCH_DATA: noop,
      MODIFY_REQUEST: noop,
      FRAME_RESIZE: noop,
      FRAME_ERROR: noop,
      FRAME_PONG: noop,
      ...overrides,
    };
  }

  const ctx: FrameContext = {
    frameId: "test-frame",
    frameWindow: null,
    parentOrigin: "https://host.test",
  };

  it("calls the FRAME_RESIZE handler exactly once", () => {
    const handler = vi.fn();
    const table = makeTable({ FRAME_RESIZE: handler });
    const env: RpcEnvelope = { type: "FRAME_RESIZE", payload: { height: 200 } };
    dispatchInbound(env, ctx, table);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT invoke any handler for an unknown type like 'VIBE_BOOTSTRAP'", () => {
    const allHandlers = Object.values(makeTable()).map((h) => vi.fn().mockImplementation(h));
    const table = makeTable();
    const methodKeys = Object.keys(table) as RpcMethod[];
    const trackedTable: Record<RpcMethod, InboundHandler> = {} as Record<RpcMethod, InboundHandler>;
    const spies: ReturnType<typeof vi.fn>[] = [];
    for (const key of methodKeys) {
      const spy = vi.fn();
      trackedTable[key] = spy;
      spies.push(spy);
    }
    void allHandlers; // suppress unused warning

    const env: RpcEnvelope = { type: "VIBE_BOOTSTRAP" };
    dispatchInbound(env, ctx, trackedTable);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("does NOT invoke any handler for prototype-inherited name 'toString'", () => {
    const table = makeTable();
    const methodKeys = Object.keys(table) as RpcMethod[];
    const spies: ReturnType<typeof vi.fn>[] = [];
    const trackedTable: Record<RpcMethod, InboundHandler> = {} as Record<RpcMethod, InboundHandler>;
    for (const key of methodKeys) {
      const spy = vi.fn();
      trackedTable[key] = spy;
      spies.push(spy);
    }

    const env: RpcEnvelope = { type: "toString" };
    dispatchInbound(env, ctx, trackedTable);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("passes the parsed payload and ctx to the handler", () => {
    const handler = vi.fn();
    const table = makeTable({ FRAME_RESIZE: handler });
    const env: RpcEnvelope = {
      type: "FRAME_RESIZE",
      payload: { height: 300 },
    };
    dispatchInbound(env, ctx, table);
    expect(handler).toHaveBeenCalledWith({ height: 300 }, ctx);
  });
});

// ---------------------------------------------------------------------------
// sendToFrame
// ---------------------------------------------------------------------------

describe("sendToFrame", () => {
  it("calls postMessage once with the envelope and targetOrigin", () => {
    const postMessage = vi.fn();
    const win = { postMessage } as unknown as Window;
    const env: RpcEnvelope = { type: "FRAME_PING" };
    sendToFrame(win, env, "*");
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(env, "*");
  });

  it("is a no-op when frameWindow is null", () => {
    // Should not throw
    expect(() => sendToFrame(null, { type: "FRAME_PING" }, "*")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Correlation round-trip
// ---------------------------------------------------------------------------

describe("correlation map (registerPending / resolvePending / clearPendingForFrame)", () => {
  it("registerPending then resolvePending invokes callback once and deletes", () => {
    const cb = vi.fn();
    registerPending("f1", "c1", cb);
    resolvePending("f1", "c1", { data: 42 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ data: 42 });

    // Second resolve for the same key is a no-op
    resolvePending("f1", "c1", { data: 99 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("resolvePending for an unknown key is a no-op", () => {
    expect(() => resolvePending("never", "registered", null)).not.toThrow();
  });

  it("clearPendingForFrame drops all callbacks for that frameId", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();
    registerPending("frame-A", "corr-1", cb1);
    registerPending("frame-A", "corr-2", cb2);
    registerPending("frame-B", "corr-3", cb3);

    clearPendingForFrame("frame-A");

    // frame-A callbacks must be gone
    resolvePending("frame-A", "corr-1", null);
    resolvePending("frame-A", "corr-2", null);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();

    // frame-B callback must still be resolvable
    resolvePending("frame-B", "corr-3", "result");
    expect(cb3).toHaveBeenCalledWith("result");
  });
});
