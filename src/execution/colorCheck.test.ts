// TDD test suite for checkForHardcodedColors (Phase 18, TGEN-02).
// RED first (before colorCheck.ts exists), then GREEN after implementation.

import { describe, expect, it } from "vitest";
import { checkForHardcodedColors } from "./colorCheck";
import { TranspileError } from "./transpile";

describe("checkForHardcodedColors — flagged colors (saturated)", () => {
  it("throws TranspileError for saturated red hex #ff0000 (6-digit)", () => {
    expect(() =>
      checkForHardcodedColors(`function App() { return <div style={{color: "#ff0000"}} />; }`)
    ).toThrow(TranspileError);
  });

  it("throws TranspileError for saturated blue hex #1a73e8 (6-digit)", () => {
    expect(() =>
      checkForHardcodedColors(`function App() { return <div style={{color: "#1a73e8"}} />; }`)
    ).toThrow(TranspileError);
  });

  it("throws TranspileError for saturated short hex #abc (3-digit, not all same)", () => {
    // #abc expands to #aabbcc: r=170, g=187, b=204 — saturated (r≠g≠b)
    expect(() =>
      checkForHardcodedColors(`function App() { return <div style={{color: "#abc"}} />; }`)
    ).toThrow(TranspileError);
  });

  it("throws TranspileError for saturated rgb(255, 100, 0)", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{boxShadow: "rgb(255, 100, 0) 0px 0px 5px"}} />`)
    ).toThrow(TranspileError);
  });

  it("throws TranspileError for saturated rgba(30, 144, 255, 1)", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{background: "rgba(30, 144, 255, 1)"}} />`)
    ).toThrow(TranspileError);
  });

  it("throws TranspileError for 8-digit saturated hex #ff0000aa", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{color: "#ff0000aa"}} />`)
    ).toThrow(TranspileError);
  });
});

describe("checkForHardcodedColors — allowed colors (grayscale + shadows)", () => {
  it("does NOT throw for rgba(0, 0, 0, 0.3) — valid shadow", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)"}} />`)
    ).not.toThrow();
  });

  it("does NOT throw for rgba(255, 255, 255, 0.1) — valid glass highlight", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{background: "rgba(255, 255, 255, 0.1)"}} />`)
    ).not.toThrow();
  });

  it("does NOT throw for #000 — grayscale black (3-digit)", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{color: "#000"}} />`)
    ).not.toThrow();
  });

  it("does NOT throw for #000000 — grayscale black (6-digit)", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{color: "#000000"}} />`)
    ).not.toThrow();
  });

  it("does NOT throw for #ffffff — grayscale white", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{background: "#ffffff"}} />`)
    ).not.toThrow();
  });

  it("does NOT throw for #fff — grayscale white (3-digit)", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{background: "#fff"}} />`)
    ).not.toThrow();
  });

  it("does NOT throw for #333 — grayscale dark gray (3-digit)", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{color: "#333"}} />`)
    ).not.toThrow();
  });

  it("does NOT throw for #333333 — grayscale dark gray (6-digit)", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{color: "#333333"}} />`)
    ).not.toThrow();
  });

  it("does NOT throw for #eee — grayscale light gray (3-digit)", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{border: "1px solid #eee"}} />`)
    ).not.toThrow();
  });

  it("does NOT throw for #aaa — grayscale gray (3-digit, R=G=B=a)", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{color: "#aaa"}} />`)
    ).not.toThrow();
  });

  it("does NOT throw for rgba(50, 50, 50, 0.8) — near-grayscale shadow (R=G=B=50)", () => {
    expect(() =>
      checkForHardcodedColors(`<div style={{boxShadow: "0 2px 8px rgba(50, 50, 50, 0.8)"}} />`)
    ).not.toThrow();
  });

  it("does NOT throw for code with only var(--accentA) references and no color literals", () => {
    expect(() =>
      checkForHardcodedColors(
        `function App() { return <div style={{background: "var(--accentA)", color: "var(--text)"}} />; }`
      )
    ).not.toThrow();
  });
});

describe("checkForHardcodedColors — error message content", () => {
  function throwingCall(): { msg: string; err: unknown } {
    try {
      checkForHardcodedColors(`<div style={{color: "#ff0000"}} />`);
    } catch (e) {
      return { msg: (e as Error).message, err: e };
    }
    throw new Error("Expected checkForHardcodedColors to throw but it did not");
  }

  it("thrown error is an instance of TranspileError", () => {
    const { err } = throwingCall();
    expect(err).toBeInstanceOf(TranspileError);
  });

  it("thrown error message contains 'theme CSS variables'", () => {
    const { msg } = throwingCall();
    expect(msg).toContain("theme CSS variables");
  });

  it("thrown error message contains 'var(--accentA)'", () => {
    const { msg } = throwingCall();
    expect(msg).toContain("var(--accentA)");
  });
});
