// Tests for the on-demand component producer (Phase 3, GEN-01..05).
//
// All network calls are replaced with canned transports — no real API key is needed.
// Test doubles are named "canned", "stub", or "testTransport" (hygiene-safe naming).
import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  buildRepairPrompt,
  buildLengthPrompt,
  extractCode,
  produceComponent,
  ProduceError,
} from "./producer";
import type { TransportFn } from "../host/modelClient";
import { unusedTransport } from "../services/testServices";

// Injected API-key getters (IoC/DI): no localStorage access in these tests.
const withKey = () => "sk-test-key";
const withoutKey = () => null;

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

  it("app prompt mandates the new theme CSS variable contract (TGEN-01)", () => {
    const prompt = buildPrompt("weather");
    expect(prompt).toContain("var(--accentA)");
    expect(prompt).toContain("var(--accentB)");
    expect(prompt).toContain("var(--text)");
    expect(prompt).toContain("var(--glass)");
    expect(prompt).toContain("var(--bord)");
    // Explicitly allows neutral shadows/overlays
    expect(prompt).toContain("rgba(0,0,0");
    // Old vars must NOT appear
    expect(prompt).not.toContain("var(--color-surface)");
    expect(prompt).not.toContain("var(--color-text)");
    expect(prompt).not.toContain("var(--color-accent)");
  });

  it("repair prompt (app/widget branch) carries the new theme var contract (TGEN-01)", () => {
    const repair = buildRepairPrompt("weather", VALID_COMPONENT, "some babel error");
    expect(repair).toContain("var(--accentA)");
    expect(repair).toContain("var(--text)");
    expect(repair).not.toContain("var(--color-surface)");
  });

  it("shell prompt mandates the new theme CSS variable contract (TGEN-01)", () => {
    const prompt = buildPrompt("calculator", "shell");
    expect(prompt).toContain("var(--accentA)");
    expect(prompt).toContain("var(--text)");
    expect(prompt).not.toContain("var(--color-surface)");
  });

  it("delegated prompt mandates the new theme CSS variable contract (TGEN-01)", () => {
    const prompt = buildPrompt("todo", "delegated");
    expect(prompt).toContain("var(--accentA)");
    expect(prompt).toContain("var(--glass)");
    expect(prompt).not.toContain("var(--color-accent)");
  });

  it("delegated repair prompt carries the theme var contract (TGEN-01, WR-02)", () => {
    const repair = buildRepairPrompt("todo", VALID_COMPONENT, "some error", "delegated");
    expect(repair).toContain("var(--accentA)");
    expect(repair).toContain("var(--text)");
    expect(repair).not.toContain("var(--color-accent)");
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

describe("buildLengthPrompt — theme var contract on truncation retry (TGEN-01)", () => {
  it("length prompt (app/widget) carries the new theme var contract (WR-01)", () => {
    const prompt = buildLengthPrompt("timer");
    expect(prompt).toContain("var(--accentA)");
    expect(prompt).not.toContain("var(--color-surface)");
  });

  it("length prompt (delegated) carries the new theme var contract (WR-02)", () => {
    const prompt = buildLengthPrompt("todo", "delegated");
    expect(prompt).toContain("var(--accentA)");
    expect(prompt).toContain("var(--glass)");
    expect(prompt).not.toContain("var(--color-accent)");
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
  it("throws ProduceError when no API key is available", async () => {
    await expect(
      produceComponent("weather", unusedTransport, withoutKey),
    ).rejects.toBeInstanceOf(ProduceError);
    await expect(
      produceComponent("weather", unusedTransport, withoutKey),
    ).rejects.toThrow(/No access key/);
  });

  it("success path: returns source and transpiledJS for a valid canned response", async () => {
    const transport = singleResponseTransport(VALID_COMPONENT);

    const result = await produceComponent("weather", transport, withKey);
    expect(typeof result.source).toBe("string");
    expect(typeof result.transpiledJS).toBe("string");
    expect(result.source.length).toBeGreaterThan(0);
    expect(result.transpiledJS.length).toBeGreaterThan(0);
  });

  it("extracts code from fenced markdown in the canned response", async () => {
    const transport = singleResponseTransport(VALID_FENCED);

    const result = await produceComponent("notes-type", transport, withKey);
    expect(result.source).toContain("function App()");
    expect(result.source).not.toContain("```");
  });

  it("self-heal loop: feeds Babel error into the repair prompt on second attempt", async () => {
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

    const result = await produceComponent("calendar", transport, withKey);

    // Should have succeeded on the second attempt.
    expect(callLog).toHaveLength(2);
    // The repair prompt must include the Babel error.
    expect(callLog[1]).toMatch(/Babel error|compile error/i);
    // Final result is valid.
    expect(typeof result.transpiledJS).toBe("string");
  });

  it("self-heal loop: early-stops when two consecutive errors are identical", async () => {
    let callCount = 0;
    const transport: TransportFn = (_url, _init) => {
      callCount++;
      return cannedResponse(INVALID_COMPONENT);
    };

    await expect(
      produceComponent("budget", transport, withKey),
    ).rejects.toBeInstanceOf(ProduceError);
    // First call: compile error. Second call: same error → early stop.
    // No third call is made.
    expect(callCount).toBe(2);
  });

  it("gives up after MAX_ATTEMPTS (3) when errors keep changing", async () => {
    const brokenVariants = [
      "function App( { return null; }",    // parse error variant A
      "function App() { return <div>}",    // parse error variant B
      "function App() { return <div>;",    // parse error variant C
    ];
    const transport = sequenceTransport(brokenVariants);

    const attempt = produceComponent("currency", transport, withKey);
    await expect(attempt).rejects.toBeInstanceOf(ProduceError);
  });

  // --- kind: "handler" path (Phase 8) — same loop, handler prompt + transpile ---

  it("handler kind: produces a plain handler (TS-strip transpile, no JSX preset)", async () => {
    const HANDLER_SRC = `async function handler(input) { return { data: input }; }`;
    const result = await produceComponent(
      "echo the input",
      singleResponseTransport(HANDLER_SRC),
      withKey,
      "handler",
    );
    expect(result.source).toContain("async function handler");
    // Transpiled via transpileHandler — no React/JSX runtime references.
    expect(result.transpiledJS).not.toContain("React.createElement");
    expect(result.transpiledJS).not.toContain("react/jsx-runtime");
    expect(result.transpiledJS).toContain("handler");
  });

  it("handler prompt is hygiene-safe and asks for a TYPED handler(input) + { data }/{ error }", () => {
    const prompt = buildPrompt("filter a list", "handler");
    expect(prompt).toContain("handler(input)");
    // Handlers are produced as TypeScript with explicit types (the contract).
    expect(prompt).toContain("TypeScript");
    expect(prompt.toLowerCase()).toContain("types");
    expect(prompt.toLowerCase()).toMatch(/\{ data \}|\{ error \}/);
    expect(prompt).not.toMatch(/synthesi[sz]/i);
    expect(prompt).not.toMatch(new RegExp("\\bgenerat(e|ed|ing)\\b", "i"));
    expect(prompt).not.toMatch(/\bmock\b/i);
    expect(prompt).not.toMatch(/\bAI\b/);
    expect(prompt).not.toMatch(/\bllm\b/i);
  });

  it("extractCode finds a fence-less async handler declaration", () => {
    const text = "Here is your function:\nasync function handler(input) { return { data: 1 }; }";
    const result = extractCode(text);
    expect(result.startsWith("async function handler")).toBe(true);
  });

  it("extractCode handles a ```javascript fence (handler output)", () => {
    const text = "```javascript\nasync function handler(input) { return { data: 1 }; }\n```";
    const result = extractCode(text);
    expect(result).toContain("async function handler");
    expect(result).not.toContain("javascript");
    expect(result).not.toContain("```");
  });
});

// ---------------------------------------------------------------------------
// colorCheck wiring (Phase 18, TGEN-02) — post-compile saturated color gate
// ---------------------------------------------------------------------------

describe("produceComponent — colorCheck post-compile gate (TGEN-02)", () => {
  // A minimal valid React component body with a saturated hex color.
  // Chosen to compile cleanly so the colorCheck is the first error raised.
  const SATURATED_COMPONENT = `
function App() {
  return React.createElement('div', { style: { color: '#ff0000' } }, 'Hello');
}
`;

  // A minimal valid component with only rgba(0,0,0,0.3) — a neutral shadow.
  const NEUTRAL_SHADOW_COMPONENT = `
function App() {
  return React.createElement('div', { style: { boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)' } }, 'Hello');
}
`;

  it("saturated hex in produced code causes ProduceError after self-heal retries (TGEN-02)", async () => {
    // The transport always returns the saturated component — every attempt
    // re-triggers colorCheck → identical error → early-stop at attempt 2.
    const transport = singleResponseTransport(SATURATED_COMPONENT);
    await expect(
      produceComponent("color-test", transport, withKey, "app"),
    ).rejects.toBeInstanceOf(ProduceError);
  });

  it("handler kind skips colorCheck even when produced code contains a saturated hex (TGEN-02)", async () => {
    // A handler that compiles but contains a saturated color literal.
    // colorCheck must NOT run for kind="handler".
    const HANDLER_WITH_COLOR = `
async function handler(input) {
  const color = '#ff0000';
  return { data: { color } };
}
`;
    const result = await produceComponent(
      "color-handler",
      singleResponseTransport(HANDLER_WITH_COLOR),
      withKey,
      "handler",
    );
    // Succeeds: handler path skips colorCheck.
    expect(result.source).toContain("async function handler");
  });

  it("neutral rgba(0,0,0,0.3) shadow does NOT trigger colorCheck (TGEN-02)", async () => {
    const result = await produceComponent(
      "shadow-test",
      singleResponseTransport(NEUTRAL_SHADOW_COMPONENT),
      withKey,
      "app",
    );
    // Succeeds: neutral shadow is allowed.
    expect(result.transpiledJS).toContain("React.createElement");
  });
});
