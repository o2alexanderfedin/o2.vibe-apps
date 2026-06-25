// Unit tests for the storage-pressure seam guards (Phase 7, RESIL-06).
//
// The production seam wraps `navigator.storage.persist`/`estimate`, both of which
// may be undefined or reject. These tests drive the seam over a jsdom navigator
// whose `storage` is stubbed per case — proving the guards never throw and
// degrade gracefully (persist → false, estimate → null) when the API is absent.

import { afterEach, describe, expect, it } from "vitest";
import { navigatorStorageSeam } from "./storageEstimate";

const original = Object.getOwnPropertyDescriptor(navigator, "storage");

function setNavigatorStorage(value: unknown): void {
  Object.defineProperty(navigator, "storage", { value, configurable: true });
}

afterEach(() => {
  if (original) {
    Object.defineProperty(navigator, "storage", original);
  } else {
    setNavigatorStorage(undefined);
  }
});

describe("navigatorStorageSeam — persist guard (RESIL-06)", () => {
  it("resolves false (never throws) when navigator.storage is undefined", async () => {
    setNavigatorStorage(undefined);
    await expect(navigatorStorageSeam.requestPersist()).resolves.toBe(false);
  });

  it("resolves false when persist is not a function", async () => {
    setNavigatorStorage({ estimate: () => Promise.resolve({}) });
    await expect(navigatorStorageSeam.requestPersist()).resolves.toBe(false);
  });

  it("returns the underlying persist() result when available", async () => {
    setNavigatorStorage({ persist: () => Promise.resolve(true) });
    await expect(navigatorStorageSeam.requestPersist()).resolves.toBe(true);
  });

  it("swallows a rejecting persist() and resolves false", async () => {
    setNavigatorStorage({ persist: () => Promise.reject(new Error("denied")) });
    await expect(navigatorStorageSeam.requestPersist()).resolves.toBe(false);
  });
});

describe("navigatorStorageSeam — estimate guard (RESIL-06)", () => {
  it("resolves null (never throws) when navigator.storage is undefined", async () => {
    setNavigatorStorage(undefined);
    await expect(navigatorStorageSeam.estimate()).resolves.toBeNull();
  });

  it("resolves null when estimate is not a function", async () => {
    setNavigatorStorage({ persist: () => Promise.resolve(true) });
    await expect(navigatorStorageSeam.estimate()).resolves.toBeNull();
  });

  it("returns usage/quota when estimate resolves", async () => {
    setNavigatorStorage({
      estimate: () => Promise.resolve({ usage: 900, quota: 1000 }),
    });
    await expect(navigatorStorageSeam.estimate()).resolves.toEqual({
      usage: 900,
      quota: 1000,
    });
  });

  it("defaults missing usage/quota fields to 0", async () => {
    setNavigatorStorage({ estimate: () => Promise.resolve({}) });
    await expect(navigatorStorageSeam.estimate()).resolves.toEqual({
      usage: 0,
      quota: 0,
    });
  });

  it("swallows a rejecting estimate() and resolves null", async () => {
    setNavigatorStorage({ estimate: () => Promise.reject(new Error("blocked")) });
    await expect(navigatorStorageSeam.estimate()).resolves.toBeNull();
  });
});
