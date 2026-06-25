// Typed transport error tests (Phase 6 refactor, RESIL-04).
//
// The transport used to throw a generic Error that fused status + body into one
// opaque string. These tests pin the NEW contract: a `ModelHttpError` carrying
// the status code and the parsed `retry-after` header, so callers can branch on
// 401 vs 429 vs 500 and honor the server's backoff hint. All doubles are canned
// (no network).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultTransport,
  ModelHttpError,
  parseRetryAfter,
} from "./modelClient";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Build a minimal headers-like object for parseRetryAfter. */
function headers(map: Record<string, string>): { get(name: string): string | null } {
  return { get: (name) => map[name] ?? null };
}

/** Build a canned `Response` for the global fetch stub. */
function cannedResponse(init: {
  ok: boolean;
  status: number;
  headerMap?: Record<string, string>;
  body?: string;
  json?: unknown;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    statusText: "",
    headers: headers(init.headerMap ?? {}),
    text: () => Promise.resolve(init.body ?? ""),
    json: () => Promise.resolve(init.json ?? {}),
  } as unknown as Response;
}

describe("ModelHttpError — status branching", () => {
  it("isAuth is true for 401 and 403, false otherwise", () => {
    expect(new ModelHttpError(401).isAuth).toBe(true);
    expect(new ModelHttpError(403).isAuth).toBe(true);
    expect(new ModelHttpError(429).isAuth).toBe(false);
    expect(new ModelHttpError(500).isAuth).toBe(false);
  });

  it("isRateLimited is true only for 429", () => {
    expect(new ModelHttpError(429).isRateLimited).toBe(true);
    expect(new ModelHttpError(401).isRateLimited).toBe(false);
    expect(new ModelHttpError(500).isRateLimited).toBe(false);
  });

  it("carries status, retryAfter, and body, with a neutral message", () => {
    const err = new ModelHttpError(429, 12, "rate body");
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(12);
    expect(err.body).toBe("rate body");
    expect(err.name).toBe("ModelHttpError");
    // Message is neutral — no mechanic, no leaked body.
    expect(err.message).toBe("Request failed with status 429");
    expect(err.message).not.toContain("rate body");
  });
});

describe("parseRetryAfter", () => {
  it("parses a numeric delta-seconds header", () => {
    expect(parseRetryAfter(headers({ "retry-after": "30" }))).toBe(30);
  });

  it("returns undefined when the header is absent", () => {
    expect(parseRetryAfter(headers({}))).toBeUndefined();
  });

  it("returns undefined for a garbage value", () => {
    expect(parseRetryAfter(headers({ "retry-after": "soon-ish" }))).toBeUndefined();
  });

  it("parses an HTTP-date header into seconds from the injected now", () => {
    const nowMs = Date.parse("Wed, 21 Oct 2025 07:28:00 GMT");
    const future = "Wed, 21 Oct 2025 07:28:45 GMT"; // +45s
    expect(parseRetryAfter(headers({ "retry-after": future }), nowMs)).toBe(45);
  });

  it("clamps a past HTTP-date to zero (never negative)", () => {
    const nowMs = Date.parse("Wed, 21 Oct 2025 07:28:00 GMT");
    const past = "Wed, 21 Oct 2025 07:27:00 GMT"; // -60s
    expect(parseRetryAfter(headers({ "retry-after": past }), nowMs)).toBe(0);
  });
});

describe("defaultTransport — throws typed ModelHttpError on !res.ok", () => {
  it("maps a 401 to a ModelHttpError with isAuth", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      cannedResponse({ ok: false, status: 401, body: "bad key" }),
    );
    const err = await defaultTransport("u", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelHttpError);
    expect((err as ModelHttpError).status).toBe(401);
    expect((err as ModelHttpError).isAuth).toBe(true);
  });

  it("maps a 429 to a ModelHttpError carrying the parsed retry-after", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      cannedResponse({
        ok: false,
        status: 429,
        headerMap: { "retry-after": "7" },
        body: "slow down",
      }),
    );
    const err = await defaultTransport("u", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelHttpError);
    expect((err as ModelHttpError).status).toBe(429);
    expect((err as ModelHttpError).isRateLimited).toBe(true);
    expect((err as ModelHttpError).retryAfter).toBe(7);
  });

  it("maps a 500 to a ModelHttpError (neither auth nor rate-limited)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      cannedResponse({ ok: false, status: 500, body: "boom" }),
    );
    const err = await defaultTransport("u", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelHttpError);
    expect((err as ModelHttpError).status).toBe(500);
    expect((err as ModelHttpError).isAuth).toBe(false);
    expect((err as ModelHttpError).isRateLimited).toBe(false);
  });

  it("success path returns the parsed JSON body unchanged", async () => {
    const payload = { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      cannedResponse({ ok: true, status: 200, json: payload }),
    );
    const res = await defaultTransport("u", {});
    expect(res).toEqual(payload);
  });
});
