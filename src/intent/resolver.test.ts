// @vitest-environment node
// Node environment: cacheKey uses crypto.subtle; avoids jsdom ArrayBuffer shim.
import { describe, expect, it } from "vitest";
import { resolveOpenApp } from "./resolver";
import { registryKey } from "../registry/cacheKey";

describe("intent resolver — resolveOpenApp", () => {
  it("returns an Intent with operation=open and kind=app", async () => {
    const intent = await resolveOpenApp("counter");
    expect(intent.operation).toBe("open");
    expect(intent.kind).toBe("app");
  });

  it("type matches the input appType", async () => {
    const intent = await resolveOpenApp("notes");
    expect(intent.type).toBe("notes");
  });

  it("cacheKey is a 64-char lowercase hex string", async () => {
    const intent = await resolveOpenApp("counter");
    expect(intent.cacheKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cacheKey matches the structured registryKey(\"app\", appType)", async () => {
    const expected = await registryKey("app", "counter");
    const intent = await resolveOpenApp("counter");
    expect(intent.cacheKey).toBe(expected);
  });

  it("contextBundle is an empty object in Phase 2", async () => {
    const intent = await resolveOpenApp("counter");
    expect(intent.contextBundle).toEqual({});
  });

  it("distinct appTypes produce distinct cacheKeys", async () => {
    const a = await resolveOpenApp("counter");
    const b = await resolveOpenApp("notes");
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });
});
