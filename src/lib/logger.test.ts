import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

// Re-import logger fresh for each test using dynamic import to reset module state.
// The gate is read ONCE at module load, so we must reset modules between test groups.

describe("logger — gate OFF (no localStorage.debug)", () => {
  beforeEach(() => {
    // Ensure localStorage.debug is NOT set
    localStorage.removeItem("debug");
    vi.resetModules();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("debug");
  });

  it("logger.info triggers ZERO console.info calls when gate is off", async () => {
    const { logger } = await import("./logger");
    logger.info("Registry initialized");
    expect(console.info).not.toHaveBeenCalled();
  });

  it("logger.warn triggers ZERO console.warn calls when gate is off", async () => {
    const { logger } = await import("./logger");
    logger.warn("test warning");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("logger.error triggers ZERO console.error calls when gate is off", async () => {
    const { logger } = await import("./logger");
    logger.error("test error");
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("logger — gate ON (localStorage.debug is truthy)", () => {
  beforeEach(() => {
    // Set localStorage.debug to truthy BEFORE module load
    localStorage.setItem("debug", "true");
    vi.resetModules();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("debug");
  });

  it("logger.info calls console.info with [Marketplace] prefix as first argument", async () => {
    const { logger } = await import("./logger");
    logger.info("Registry initialized");
    expect(console.info).toHaveBeenCalledWith("[Marketplace]", "Registry initialized");
  });

  it("logger.warn calls console.warn with [Marketplace] prefix", async () => {
    const { logger } = await import("./logger");
    logger.warn("test warning");
    expect(console.warn).toHaveBeenCalledWith("[Marketplace]", "test warning");
  });

  it("logger.error calls console.error with [Marketplace] prefix", async () => {
    const { logger } = await import("./logger");
    logger.error("test error");
    expect(console.error).toHaveBeenCalledWith("[Marketplace]", "test error");
  });

  it("logger.info passes additional data arguments after the prefix", async () => {
    const { logger } = await import("./logger");
    logger.info("some message", { key: "value" }, 42);
    expect(console.info).toHaveBeenCalledWith("[Marketplace]", "some message", { key: "value" }, 42);
  });
});
