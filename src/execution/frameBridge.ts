// Frame communication bridge — typed postMessage envelope helpers for the
// opaque-origin frame isolation layer (Phase 20).
//
// Design rules:
//   - parseSafe copies to Object.create(null) to prevent prototype pollution.
//   - dispatchInbound uses an `in` guard on the literal union before any lookup.
//   - sendToFrame is a no-op on a null frame window.
//   - Correlation map keyed by `${frameId}:${correlationId}` for per-frame namespacing.
//   - logger used for all diagnostics; helpers never throw.

import { z } from "zod/mini";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// RPC method names
// ---------------------------------------------------------------------------

export type RpcMethod =
  | "FRAME_READY"
  | "RUN_HANDLER"
  | "FETCH_DATA"
  | "MODIFY_REQUEST"
  | "FRAME_RESIZE"
  | "FRAME_ERROR"
  | "FRAME_PONG";

// ---------------------------------------------------------------------------
// Envelope type and schema
// ---------------------------------------------------------------------------

export interface RpcEnvelope {
  type: string;
  correlationId?: string;
  payload?: unknown;
}

export const RpcEnvelopeSchema = z.looseObject({
  type: z.string(),
  correlationId: z.optional(z.string()),
  payload: z.optional(z.unknown()),
});

// ---------------------------------------------------------------------------
// parseSafe — null-prototype copy, blocks prototype pollution
// ---------------------------------------------------------------------------

/**
 * Rejects non-plain-objects (null, primitives, arrays).
 * Copies each own-enumerable key onto Object.create(null) so downstream code
 * operates on a null-prototype object with no inherited properties — prevents
 * prototype-pollution attacks via `__proto__`, `constructor`, or `toString`.
 *
 * Returns null on any non-object input. NEVER deep-merges or spreads raw.
 */
export function parseSafe(raw: unknown): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(raw as object)) {
    result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// isFromFrame — origin + source guard
// ---------------------------------------------------------------------------

/**
 * Returns true only when the message originates from the expected frame window
 * with the opaque "null" origin (produced by a sandboxed frame without
 * allow-same-origin).
 */
export function isFromFrame(
  event: MessageEvent,
  frameWindow: Window | null,
): boolean {
  return (
    frameWindow != null &&
    event.origin === "null" &&
    event.source === frameWindow
  );
}

// ---------------------------------------------------------------------------
// FrameContext + InboundHandler
// ---------------------------------------------------------------------------

export interface FrameContext {
  frameId: string;
  frameWindow: Window | null;
  parentOrigin: string;
}

export type InboundHandler = (
  payload: Record<string, unknown> | undefined,
  ctx: FrameContext,
) => void;

// ---------------------------------------------------------------------------
// dispatchInbound — safe table dispatch with `in` guard
// ---------------------------------------------------------------------------

/**
 * Looks up the handler for `env.type` in the handler table using an `in`
 * check on the literal-union set of known methods.  Any message whose type is
 * not in the union (unknown, outbound, prototype-inherited name like "toString")
 * is silently ignored — the guard means we NEVER call `table[env.type]` without
 * first confirming the key exists in the table.
 */
export function dispatchInbound(
  env: RpcEnvelope,
  ctx: FrameContext,
  table: Record<RpcMethod, InboundHandler>,
): void {
  const method = env.type as RpcMethod;
  if (!(method in table)) {
    return;
  }
  const payload =
    env.payload !== undefined &&
    env.payload !== null &&
    typeof env.payload === "object" &&
    !Array.isArray(env.payload)
      ? (env.payload as Record<string, unknown>)
      : undefined;
  table[method](payload, ctx);
}

// ---------------------------------------------------------------------------
// Correlation map — pending callbacks keyed by `${frameId}:${correlationId}`
// ---------------------------------------------------------------------------

type PendingKey = `${string}:${string}`;

const pending = new Map<PendingKey, (result: unknown) => void>();

export function registerPending(
  frameId: string,
  correlationId: string,
  cb: (result: unknown) => void,
): void {
  const key: PendingKey = `${frameId}:${correlationId}`;
  pending.set(key, cb);
}

export function resolvePending(
  frameId: string,
  correlationId: string,
  result: unknown,
): void {
  const key: PendingKey = `${frameId}:${correlationId}`;
  const cb = pending.get(key);
  if (!cb) return;
  pending.delete(key);
  cb(result);
}

export function clearPendingForFrame(frameId: string): void {
  const prefix = `${frameId}:`;
  for (const key of pending.keys()) {
    if (key.startsWith(prefix)) {
      pending.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// sendToFrame — no-op on null window
// ---------------------------------------------------------------------------

export function sendToFrame(
  frameWindow: Window | null,
  env: RpcEnvelope,
  targetOrigin: string,
): void {
  if (!frameWindow) {
    logger.warn("Frame bridge: sendToFrame called with null window");
    return;
  }
  frameWindow.postMessage(env, targetOrigin);
}

// ---------------------------------------------------------------------------
// newCorrelationId
// ---------------------------------------------------------------------------

export function newCorrelationId(): string {
  return crypto.randomUUID();
}
