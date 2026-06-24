// Shared test setup — handles all three jsdom gaps (Pitfalls 3 & 4 from RESEARCH.md).

// Gap 1: jsdom has no IndexedDB — install spec-compliant polyfill for registry.test.ts.
import "fake-indexeddb/auto";

// Gap 2: jest-dom matchers for DOM assertions.
import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

// Gap 3: jsdom has no window.matchMedia — provide a controllable stub (Pitfall 4).
// Theme tests override `matches` per test to simulate prefers-color-scheme.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false, // override per-test for system-dark scenarios
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated; kept for compatibility
    removeListener: vi.fn(), // deprecated; kept for compatibility
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
