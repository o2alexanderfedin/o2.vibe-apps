import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SandboxFrame, type SandboxFrameProps, type FrameUtilities } from "./SandboxFrame";
import { buildSrcdoc } from "../execution/frameMount";

// ---------------------------------------------------------------------------
// Theme vars fixture
// ---------------------------------------------------------------------------
const THEME_VARS = {
  "--text": "#fff",
  "--wall": "#000",
  "--b1": "#111",
  "--b2": "#222",
  "--b3": "#333",
  "--b4": "#444",
  "--glass": "rgba(0,0,0,0.3)",
  "--glass2": "rgba(0,0,0,0.5)",
  "--bord": "#555",
  "--hi": "#666",
  "--accentA": "#777",
  "--accentB": "#888",
};

// ---------------------------------------------------------------------------
// Helpers — create spy utilities and a stub frame window
// ---------------------------------------------------------------------------

function makeUtils(overrides: Partial<FrameUtilities> = {}): {
  utils: FrameUtilities;
  sendToFrameFn: ReturnType<typeof vi.fn>;
  registerFrameFn: ReturnType<typeof vi.fn>;
  unregisterFrameFn: ReturnType<typeof vi.fn>;
  clearPendingFn: ReturnType<typeof vi.fn>;
} {
  const sendToFrameFn = vi.fn();
  const registerFrameFn = vi.fn();
  const unregisterFrameFn = vi.fn();
  const clearPendingFn = vi.fn();
  const utils: FrameUtilities = {
    registerFrame: registerFrameFn,
    unregisterFrame: unregisterFrameFn,
    clearPendingForFrame: clearPendingFn,
    sendToFrame: sendToFrameFn,
    buildSrcdoc,
    ...overrides,
  };
  return { utils, sendToFrameFn, registerFrameFn, unregisterFrameFn, clearPendingFn };
}

function getMockContentWindow(container: HTMLElement) {
  const iframe = container.querySelector("iframe")!;
  const postMessage = vi.fn();
  const fakeContentWindow = { postMessage } as unknown as Window;
  Object.defineProperty(iframe, "contentWindow", {
    get: () => fakeContentWindow,
    configurable: true,
  });
  return { iframe, fakeContentWindow, postMessage };
}

function fireMessage(source: Window | null, data: unknown) {
  const event = new MessageEvent("message", {
    origin: "null",
    source: source as Window,
    data,
  });
  window.dispatchEvent(event);
}

function defaultProps(
  utils: FrameUtilities,
  overrides: Partial<SandboxFrameProps> = {},
): SandboxFrameProps {
  return {
    instanceId: "test-instance",
    title: "Test App",
    transpiledJS: 'var App = function() { return null; }; module.exports = App;',
    themeVars: THEME_VARS,
    onClose: vi.fn(),
    _utils: utils,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllTimers();
});

describe("SandboxFrame", () => {
  it("renders exactly one <iframe> with sandbox='allow-scripts' (NOT allow-same-origin)", () => {
    const { utils } = makeUtils();
    const { container } = render(<SandboxFrame {...defaultProps(utils)} />);
    const iframes = container.querySelectorAll("iframe");
    expect(iframes).toHaveLength(1);
    const iframe = iframes[0]!;
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("iframe srcdoc attribute contains connect-src 'none'", () => {
    const { utils } = makeUtils();
    const { container } = render(<SandboxFrame {...defaultProps(utils)} />);
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("srcdoc")).toContain("connect-src 'none'");
  });

  it("calls registerFrame on mount and unregisterFrame + clearPendingForFrame on unmount", async () => {
    const { utils, registerFrameFn, unregisterFrameFn, clearPendingFn } = makeUtils();
    const { unmount, container } = render(<SandboxFrame {...defaultProps(utils)} />);

    await waitFor(() => {
      expect(registerFrameFn).toHaveBeenCalledTimes(1);
    });
    const iframe = container.querySelector("iframe")!;
    expect(registerFrameFn).toHaveBeenCalledWith("test-instance", iframe);

    unmount();

    // WR-04: the cleanup passes the SPECIFIC element so a StrictMode double-mount
    // does not evict the entry the second mount re-registered.
    expect(unregisterFrameFn).toHaveBeenCalledWith("test-instance", iframe);
    expect(clearPendingFn).toHaveBeenCalledWith("test-instance");
  });

  it("FRAME_READY from live contentWindow triggers exactly one sendToFrame with VIBE_BOOTSTRAP", async () => {
    const { utils, sendToFrameFn } = makeUtils();
    const { container } = render(<SandboxFrame {...defaultProps(utils)} />);
    const { fakeContentWindow } = getMockContentWindow(container);

    await act(async () => {
      fireMessage(fakeContentWindow, { type: "FRAME_READY" });
    });

    expect(sendToFrameFn).toHaveBeenCalledTimes(1);
    expect(sendToFrameFn).toHaveBeenCalledWith(
      fakeContentWindow,
      expect.objectContaining({ type: "VIBE_BOOTSTRAP" }),
      "*",
    );
  });

  it("FRAME_READY from a forged source triggers NO VIBE_BOOTSTRAP", async () => {
    const { utils, sendToFrameFn } = makeUtils();
    const { container } = render(<SandboxFrame {...defaultProps(utils)} />);

    // Bind the real contentWindow first, but fire from a different source
    getMockContentWindow(container);
    const forgedWindow = { postMessage: vi.fn() } as unknown as Window;

    await act(async () => {
      fireMessage(forgedWindow, { type: "FRAME_READY" });
    });

    // No VIBE_BOOTSTRAP should have been sent (the forged source is rejected)
    expect(sendToFrameFn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "VIBE_BOOTSTRAP" }),
      expect.anything(),
    );
  });

  it("FRAME_RESIZE message updates iframe height style", async () => {
    const { utils } = makeUtils();
    const { container } = render(<SandboxFrame {...defaultProps(utils)} />);
    const { fakeContentWindow } = getMockContentWindow(container);
    const iframe = container.querySelector("iframe")!;

    await act(async () => {
      fireMessage(fakeContentWindow, {
        type: "FRAME_RESIZE",
        payload: { height: 350 },
      });
    });

    expect((iframe as HTMLIFrameElement).style.height).toBe("350px");
  });

  it("FRAME_ERROR message renders role='alert' overlay with neutral copy", async () => {
    const { utils } = makeUtils();
    const { container } = render(<SandboxFrame {...defaultProps(utils)} />);
    const { fakeContentWindow } = getMockContentWindow(container);

    await act(async () => {
      fireMessage(fakeContentWindow, {
        type: "FRAME_ERROR",
        payload: { message: "ReferenceError: x is not defined" },
      });
    });

    const overlay = container.querySelector("[role='alert']");
    expect(overlay).toBeTruthy();
    expect(overlay!.textContent).not.toMatch(/iframe|sandbox|isolation/i);
    expect(overlay!.textContent).toContain("Something went wrong.");
  });

  it("after 3 ping intervals with no FRAME_PONG, unresponsive overlay appears", async () => {
    vi.useFakeTimers();
    const { utils } = makeUtils();
    const { container } = render(<SandboxFrame {...defaultProps(utils)} />);

    await act(async () => {
      vi.advanceTimersByTime(6001);
    });

    const overlay = container.querySelector("[role='alert']");
    expect(overlay).toBeTruthy();
    expect(overlay!.textContent).toContain("This app stopped responding.");

    const closeBtn = overlay!.querySelector("button");
    expect(closeBtn).toBeTruthy();
    expect(closeBtn!.textContent).toContain("Close");

    vi.useRealTimers();
  });

  it("FRAME_PONG resets the pong counter so overlay does not appear", async () => {
    vi.useFakeTimers();
    const { utils } = makeUtils();
    const { container } = render(<SandboxFrame {...defaultProps(utils)} />);
    const { fakeContentWindow } = getMockContentWindow(container);

    // Advance 2 intervals (2 missed pongs)
    await act(async () => {
      vi.advanceTimersByTime(4001);
    });

    // Send PONG — resets missed pong counter to 0
    await act(async () => {
      fireMessage(fakeContentWindow, { type: "FRAME_PONG" });
    });

    // Advance 1 more interval — only 1 missed pong now, not 3
    await act(async () => {
      vi.advanceTimersByTime(2001);
    });

    // No overlay (only 1 missed pong after reset)
    const overlay = container.querySelector("[role='alert']");
    expect(overlay).toBeNull();

    vi.useRealTimers();
  });

  it("clicking the unresponsive Close button calls onClose", async () => {
    vi.useFakeTimers();
    const { utils } = makeUtils();
    const onClose = vi.fn();
    const { container } = render(<SandboxFrame {...defaultProps(utils, { onClose })} />);

    await act(async () => {
      vi.advanceTimersByTime(6001);
    });

    const overlay = container.querySelector("[role='alert']");
    expect(overlay).toBeTruthy();
    const closeBtn = overlay!.querySelector("button")!;

    await act(async () => {
      closeBtn.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
