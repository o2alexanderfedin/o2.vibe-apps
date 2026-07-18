// Frame bootstrap inline-script CSP hash guard (Phase 20, SANDBOX-05).
//
// WHAT THIS IS: a sibling of csp.test.ts. A `srcdoc` frame INHERITS the
// embedding document's Content-Security-Policy, and the host policy authorizes
// inline scripts by sha256 hash (never 'unsafe-inline'). The opaque-origin app
// body therefore cannot boot unless the host CSP's script-src carries the hash
// of the frame's inline bootstrap <script>. buildSrcdoc keeps that script
// byte-stable (no per-render interpolation INTO the script body — theme vars go
// in <style>, app code arrives via VIBE_BOOTSTRAP), so a single pinned hash
// suffices for every app instance.
//
// WHY THE GUARD: the browser hashes the EXACT bytes between <script> and
// </script>. Any future edit to the bootstrap body (or a React re-embed, since
// the embed is inlined) changes the hash; without this guard the policy would
// silently refuse to run the frame bootstrap and every opaque-origin app would
// render blank in production. This test recomputes the hash from buildSrcdoc's
// own output and asserts the matching 'sha256-...' source is present in the host
// script-src, so such a change fails CI instead of shipping a dead feature.

/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { buildSrcdoc } from "./execution/frameMount";

const REPO_ROOT = process.cwd();
const INDEX_HTML = resolve(REPO_ROOT, "index.html");

const THEME_VARS = {
  "--text": "#f3f1ff",
  "--wall": "#000",
  "--b1": "#111",
};

// Extract the text content of the LAST inline <script> in the srcdoc — the same
// bytes the browser hashes for the CSP source. buildSrcdoc emits exactly one
// inline <script> (the bootstrap); match it non-greedily.
function bootstrapScriptBody(html: string): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match?.[1])
    throw new Error("No inline <script> element found in the frame srcdoc");
  return match[1];
}

function sha256Source(body: string): string {
  return "sha256-" + createHash("sha256").update(body, "utf8").digest("base64");
}

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

describe("frame bootstrap inline-script CSP hash guard (SANDBOX-05)", () => {
  it("the bootstrap script body is byte-stable across renders (theme/app vars excluded)", () => {
    const a = bootstrapScriptBody(buildSrcdoc("CODE_A", THEME_VARS, "https://a"));
    const b = bootstrapScriptBody(
      buildSrcdoc("CODE_B", { "--text": "#000" }, "https://b"),
    );
    // The script body must NOT vary by app code, theme vars, or parent origin —
    // otherwise a single pinned host-CSP hash could not authorize every instance.
    expect(a).toBe(b);
  });

  it("host script-src contains the sha256 hash of the frame bootstrap script", () => {
    const html = readFileSync(INDEX_HTML, "utf8");
    const expected = sha256Source(
      bootstrapScriptBody(buildSrcdoc("", THEME_VARS, "https://host")),
    );
    const directive = scriptSrcDirective(html);
    expect(
      directive,
      `Host CSP script-src is missing the frame bootstrap hash.\n` +
        `Add '${expected}' to the script-src directive in index.html.\n` +
        `(A srcdoc frame inherits the host CSP; without this hash the opaque-` +
        `origin app body renders blank in production.)`,
    ).toContain(`'${expected}'`);
  });
});
