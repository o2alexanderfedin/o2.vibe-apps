// Producer auth-degradation tests (Phase 6, RESIL-03).
//
// A 401/403 from the model call, or a missing key, must surface a
// ProduceAuthError (a ProduceError subclass) so the UI can route to the inline
// reconfigure prompt instead of the generic fallback. All transports are canned
// (no network); the key getter is injected.
import { describe, expect, it } from "vitest";
import {
  produceComponent,
  ProduceError,
  ProduceAuthError,
} from "./producer";
import { ModelHttpError, type TransportFn } from "../host/modelClient";

const withKey = () => "sk-test-key";
const withoutKey = () => null;

/** A canned transport that always throws the given ModelHttpError. */
function failingTransport(status: number): TransportFn {
  return () => Promise.reject(new ModelHttpError(status, undefined, "body"));
}

describe("produceComponent — auth degradation (RESIL-03)", () => {
  it("throws ProduceAuthError (not just ProduceError) when no key is present", async () => {
    const err = await produceComponent("weather", failingTransport(401), withoutKey).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProduceAuthError);
    // ProduceAuthError IS-A ProduceError (so generic catch sites still work).
    expect(err).toBeInstanceOf(ProduceError);
    expect((err as Error).message).toMatch(/connect your account/i);
  });

  it("maps a 401 from the model call to a ProduceAuthError", async () => {
    const err = await produceComponent("weather", failingTransport(401), withKey).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProduceAuthError);
    // The key is never echoed into the message (HYGIENE / D-13).
    expect((err as Error).message).not.toContain("sk-test-key");
    expect((err as Error).message).toMatch(/connect your account/i);
  });

  it("maps a 403 from the model call to a ProduceAuthError", async () => {
    const err = await produceComponent("weather", failingTransport(403), withKey).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProduceAuthError);
  });

  it("a non-auth transport failure stays a generic ProduceError (not auth)", async () => {
    const err = await produceComponent("weather", failingTransport(500), withKey).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProduceError);
    expect(err).not.toBeInstanceOf(ProduceAuthError);
  });
});
