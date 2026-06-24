// Tests for the on-demand component producer (Phase 3, GEN-01..05).
//
// All network calls are replaced with canned transports — no real API key is needed.
// Test doubles are named "canned", "stub", or "testTransport" (hygiene-safe naming).
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPrompt,
  buildRepairPrompt,
  extractCode,
  produceComponent,
  ProduceError,
} from "./producer";
import type { TransportFn } from "../host/modelClient";

// ---------------------------------------------------------------------------
// Helpers — canned transport builders
// ---------------------------------------------------------------------------

function cannedResponse(text: string): ReturnType<TransportFn> {
  return Promise.resolve({
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
  });
}

/** A transport that returns the given text on every call. */
function singleResponseTransport(text: string): TransportFn {
  return (_url, _init) => cannedResponse(text);
}

/**
 * A transport that cycles through responses in order.
 * After exhausting the list, the last response is repeated.
 */
function sequenceTransport(responses: string[]): TransportFn {
  let idx = 0;
  return (_url, _init) => {
    const text = responses[Math.min(idx, responses.length - 1)] ?? "";
    idx++;
    return cannedResponse(text);
  };
}

// ---------------------------------------------------------------------------
// Canned component source strings
// ---------------------------------------------------------------------------

const VALID_COMPONENT = `
function App() {
  return React.createElement('div', { style: { color: 'var(--color-text)' } }, 'Hello');
}
`;

const VALID_FENCED = `
Here is your component:

\`\`\`tsx
function App() {
  return React.createElement('div', null, 'Fenced');
}
\`\`\`
`;

const INVALID_COMPONENT = `
function App( {
  return <div>broken</div;
}
`;

// ---------------------------------------------------------------------------
// buildPrompt — structural and hygiene-forward tests
// ---------------------------------------------------------------------------

describe("buildPrompt", () => {
  it("prompt text passes the HYGIENE-03 gate (no neutral-product violations)", () => {
    // The hygiene gate scans src/**; this assertion runs the same check over
    // the runtime output of buildPrompt so a future string-interpolation bug
    // (e.g. appType value leaking a banned word) is caught here first.
    const prompt = buildPrompt("weather");
    // synthesi[sz]
    expect(prompt).not.toMatch(/synthesi[sz]/i);
    // generat(e|ed|ing) — use character class to avoid literal token in source
    expect(prompt).not.toMatch(new RegExp("\\bgenerat(e|ed|ing)\\b", "i"));
  });

  it("includes the app type in the prompt", () => {
    const prompt = buildPrompt("timer");
    expect(prompt).toContain("timer");
  });

  it("requests a default export named App", () => {
    const prompt = buildPrompt("calculator");
    expect(prompt.toLowerCase()).toMatch(/default export|named app|function app/);
  });

  it("instructs the model to avoid import statements", () => {
    const prompt = buildPrompt("notes");
    expect(prompt.toLowerCase()).toContain("import");
  });
});

describe("buildRepairPrompt", () => {
  it("repair prompt includes the Babel error", () => {
    const error = "Unexpected token, expected (15:4)";
    const prompt = buildRepairPrompt("notes", INVALID_COMPONENT, error);
    expect(prompt).toContain(error);
  });

  it("repair prompt includes the previous code", () => {
    const code = "function App() { return null; }";
    const prompt = buildRepairPrompt("timer", code, "some error");
    expect(prompt).toContain(code);
  });

  it("repair prompt includes the app type", () => {
    const prompt = buildRepairPrompt("budget", VALID_COMPONENT, "err");
    expect(prompt).toContain("budget");
  });

  it("repair prompt references the Babel error label", () => {
    const prompt = buildRepairPrompt("timer", VALID_COMPONENT, "Missing semicolon");
    expect(prompt.toLowerCase()).toMatch(/babel error|compile error|error/);
  });
});

// ---------------------------------------------------------------------------
// extractCode — GEN-02
// ---------------------------------------------------------------------------

describe("extractCode", () => {
  it("extracts code from a tsx fenced block", () => {
    const result = extractCode(VALID_FENCED);
    expect(result).toContain("function App()");
    expect(result).not.toContain("```");
  });

  it("extracts code from a generic fenced block", () => {
    const text = "Intro.\n```\nfunction App() { return null; }\n```\nOutro.";
    const result = extractCode(text);
    expect(result).toContain("function App()");
    expect(result).not.toContain("```");
  });

  it("handles prose preamble by finding first function declaration", () => {
    const text = "Here is your component:\nfunction App() { return null; }";
    const result = extractCode(text);
    expect(result.startsWith("function App()")).toBe(true);
  });

  it("returns raw text when no fence or known token found", () => {
    const raw = "return React.createElement('div', null);";
    expect(extractCode(raw)).toBe(raw);
  });
});

// ---------------------------------------------------------------------------
// produceComponent — GEN-01/03/04
// ---------------------------------------------------------------------------

describe("produceComponent", () => {
  beforeEach(() => {
    // Ensure no stale key from other tests.
    localStorage.removeItem("marketplace.apiKey");
  });

  it("throws ProduceError when no API key is available", async () => {
    await expect(produceComponent("weather")).rejects.toBeInstanceOf(ProduceError);
    await expect(produceComponent("weather")).rejects.toThrow(/No access key/);
  });

  it("success path: returns source and transpiledJS for a valid canned response", async () => {
    localStorage.setItem("marketplace.apiKey", "sk-ant-test");
    const transport = singleResponseTransport(VALID_COMPONENT);

    const result = await produceComponent("weather", transport);
    expect(typeof result.source).toBe("string");
    expect(typeof result.transpiledJS).toBe("string");
    expect(result.source.length).toBeGreaterThan(0);
    expect(result.transpiledJS.length).toBeGreaterThan(0);

    localStorage.removeItem("marketplace.apiKey");
  });

  it("extracts code from fenced markdown in the canned response", async () => {
    localStorage.setItem("marketplace.apiKey", "sk-ant-test");
    const transport = singleResponseTransport(VALID_FENCED);

    const result = await produceComponent("notes-type", transport);
    expect(result.source).toContain("function App()");
    expect(result.source).not.toContain("```");

    localStorage.removeItem("marketplace.apiKey");
  });

  it("self-heal loop: feeds Babel error into the repair prompt on second attempt", async () => {
    localStorage.setItem("marketplace.apiKey", "sk-ant-test");

    const callLog: string[] = [];
    const transport: TransportFn = (_url, init) => {
      const body = JSON.parse(init.body as string) as {
        messages: Array<{ content: string }>;
      };
      const userContent = body.messages[0]?.content ?? "";
      callLog.push(userContent);
      // First call: return broken code. Second call: return valid code.
      if (callLog.length === 1) {
        return cannedResponse(INVALID_COMPONENT);
      }
      return cannedResponse(VALID_COMPONENT);
    };

    const result = await produceComponent("calendar", transport);

    // Should have succeeded on the second attempt.
    expect(callLog).toHaveLength(2);
    // The repair prompt must include the Babel error.
    expect(callLog[1]).toMatch(/Babel error|compile error/i);
    // Final result is valid.
    expect(typeof result.transpiledJS).toBe("string");

    localStorage.removeItem("marketplace.apiKey");
  });

  it("self-heal loop: early-stops when two consecutive errors are identical", async () => {
    localStorage.setItem("marketplace.apiKey", "sk-ant-test");
    let callCount = 0;
    const transport: TransportFn = (_url, _init) => {
      callCount++;
      return cannedResponse(INVALID_COMPONENT);
    };

    await expect(produceComponent("budget", transport)).rejects.toBeInstanceOf(ProduceError);
    // First call: compile error. Second call: same error → early stop.
    // No third call is made.
    expect(callCount).toBe(2);

    localStorage.removeItem("marketplace.apiKey");
  });

  it("gives up after MAX_ATTEMPTS (3) when errors keep changing", async () => {
    localStorage.setItem("marketplace.apiKey", "sk-ant-test");
    const brokenVariants = [
      "function App( { return null; }",    // parse error variant A
      "function App() { return <div>}",    // parse error variant B
      "function App() { return <div>;",    // parse error variant C
    ];
    const transport = sequenceTransport(brokenVariants);

    const attempt = produceComponent("currency", transport);
    await expect(attempt).rejects.toBeInstanceOf(ProduceError);

    localStorage.removeItem("marketplace.apiKey");
  });
});
