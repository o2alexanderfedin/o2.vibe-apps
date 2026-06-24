// CSP inline-script hash guard (CR-01).
//
// WHAT THIS IS: a test that pins the Content-Security-Policy of index.html to
// the inline first-paint theme script. Under CSP, an inline <script> runs only
// when script-src carries 'unsafe-inline', a matching nonce, or a matching
// sha256 source hash. This project deliberately keeps 'unsafe-inline' OUT of
// script-src (it would weaken the posture once the runtime compile path lands),
// so the inline script is authorized by the exact hash of its text content.
//
// WHY THE GUARD: the browser hashes the EXACT bytes between <script> and
// </script>. Any future edit to that script body changes the hash, which would
// silently break first paint in production (the policy would refuse to run the
// script). This test recomputes the hash from the live file and asserts the
// matching 'sha256-...' source is present in the script-src directive, so such
// an edit fails CI instead of shipping a broken no-flash guarantee.

/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";

const REPO_ROOT = process.cwd();
const INDEX_HTML = resolve(REPO_ROOT, "index.html");

function readIndexHtml(): string {
  return readFileSync(INDEX_HTML, "utf8");
}

// Extract the text content of the first inline <script> element (the one with
// no src attribute) — the same bytes the browser hashes for the CSP source.
function inlineScriptBody(html: string): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match?.[1])
    throw new Error("No inline <script> element found in index.html");
  return match[1];
}

function sha256Source(body: string): string {
  return "sha256-" + createHash("sha256").update(body, "utf8").digest("base64");
}

// Pull the script-src directive out of the CSP meta tag's content attribute.
function scriptSrcDirective(html: string): string {
  const meta = html.match(
    /http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]*)"/,
  );
  if (!meta?.[1]) throw new Error("No Content-Security-Policy meta tag found");
  const directive = meta[1]
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("script-src"));
  if (!directive) throw new Error("No script-src directive in the CSP");
  return directive;
}

describe("CSP inline-script hash guard (CR-01)", () => {
  it("script-src contains the sha256 source matching the inline first-paint script", () => {
    const html = readIndexHtml();
    const expected = sha256Source(inlineScriptBody(html));
    const directive = scriptSrcDirective(html);
    expect(directive).toContain(`'${expected}'`);
  });

  it("keeps the inline script authorized by hash, not by 'unsafe-inline'", () => {
    const directive = scriptSrcDirective(readIndexHtml());
    // 'unsafe-inline' would let ANY inline script run, defeating the hash gate.
    expect(directive).not.toContain("'unsafe-inline'");
    // 'unsafe-eval' is intentionally retained for the later runtime compile path.
    expect(directive).toContain("'unsafe-eval'");
  });
});
