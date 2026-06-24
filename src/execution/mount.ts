// Roots map and mount/unmount lifecycle (Phase 2, LOOP-08).
//
// The roots map is keyed by INSTANCE ID (not app type), so two instances of
// the same app type can coexist with independent React roots.
//
// Rules enforced here:
//   - createRoot is called exactly once per instance id.
//   - root.render() updates an already-mounted root.
//   - root.unmount() removes a root and deletes it from the map.
//
// This module has NO React import at module level to avoid a circular
// dependency; it receives ReactDOM as a parameter so the caller controls
// which ReactDOM copy is used (the single shared instance from main.tsx).

import { createRoot, type Root } from "react-dom/client";
import { createElement, type ComponentType } from "react";
import { ErrorBoundary } from "../ui/ErrorBoundary";

/** In-memory roots map: instance id → Root (LOOP-08). */
const roots = new Map<string, Root>();

/**
 * Mount or re-render a component into the given container element.
 *
 * Wraps the component in ErrorBoundary before mounting.
 * Creates a new root on first mount; calls root.render() for subsequent calls.
 *
 * @param instanceId  Unique id for this app instance (not the app type).
 * @param container   DOM element to render into.
 * @param Component   The React component to render.
 */
export function mountApp(
  instanceId: string,
  container: HTMLElement,
  Component: ComponentType,
): void {
  let root = roots.get(instanceId);
  if (!root) {
    root = createRoot(container);
    roots.set(instanceId, root);
  }
  root.render(createElement(ErrorBoundary, null, createElement(Component)));
}

/**
 * Unmount and remove a root by instance id.
 *
 * Safe to call with a non-existent id (no-op).
 */
export function unmountApp(instanceId: string): void {
  const root = roots.get(instanceId);
  if (root) {
    root.unmount();
    roots.delete(instanceId);
  }
}

/**
 * Return whether an instance is currently mounted.
 * Used by tests to assert root lifecycle invariants.
 */
export function isMounted(instanceId: string): boolean {
  return roots.has(instanceId);
}

/**
 * Return the number of currently mounted roots.
 * Used by tests.
 */
export function mountedCount(): number {
  return roots.size;
}

/**
 * Unmount ALL roots. Used in test teardown.
 */
export function unmountAll(): void {
  for (const [id] of roots) {
    unmountApp(id);
  }
}
