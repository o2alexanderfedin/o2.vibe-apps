import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  isFromFrame,
  parseSafe,
  sendToFrame,
  clearPendingForFrame,
  RpcEnvelopeSchema,
  type RpcEnvelope,
  type RpcMethod,
} from "../execution/frameBridge";
import {
  buildSrcdoc,
  registerFrame,
  unregisterFrame,
} from "../execution/frameMount";
import { logger } from "../lib/logger";
import "./SandboxFrame.css";

// ---------------------------------------------------------------------------
// Injected utility seam (for testability — IoC/DI pattern used throughout)
// ---------------------------------------------------------------------------

export interface FrameUtilities {
  registerFrame: (instanceId: string, el: HTMLIFrameElement) => void;
  unregisterFrame: (instanceId: string) => void;
  clearPendingForFrame: (frameId: string) => void;
  sendToFrame: (
    frameWindow: Window | null,
    env: RpcEnvelope,
    targetOrigin: string,
  ) => void;
  buildSrcdoc: (
    transpiledJS: string,
    themeVars: Record<string, string>,
    parentOrigin: string,
  ) => string;
}

const defaultUtils: FrameUtilities = {
  registerFrame,
  unregisterFrame,
  clearPendingForFrame,
  sendToFrame,
  buildSrcdoc,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SandboxFrameProps {
  instanceId: string;
  title: string;
  transpiledJS: string;
  themeVars: Record<string, string>;
  onClose: () => void;
  onModify?: (instruction: string) => void;
  onRunHandler?: (
    intent: string,
    input: unknown,
  ) => Promise<{ data?: unknown; error?: string }>;
  onFetchData?: (
    sourceId: string,
    params: unknown,
  ) => Promise<{ data?: unknown; error?: string }>;
  /** Injected utilities — production uses defaults; tests supply stubs. */
  _utils?: Partial<FrameUtilities>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SandboxFrame({
  instanceId,
  title,
  transpiledJS,
  themeVars,
  onClose,
  onModify,
  onRunHandler,
  onFetchData,
  _utils,
}: SandboxFrameProps) {
  const utils: FrameUtilities = { ...defaultUtils, ..._utils };
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const [errored, setErrored] = useState(false);
  const [unresponsive, setUnresponsive] = useState(false);
  const missedPongsRef = useRef(0);

  const srcdoc = useMemo(
    () => utils.buildSrcdoc(transpiledJS, themeVars, window.location.origin),
    // utils is stable across renders because _utils is typically a constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transpiledJS, themeVars],
  );

  // ---------------------------------------------------------------------------
  // Mount / unmount registry
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    utils.registerFrame(instanceId, el);
    return () => {
      utils.unregisterFrame(instanceId);
      utils.clearPendingForFrame(instanceId);
    };
    // utils members are stable references when _utils is a constant object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  // ---------------------------------------------------------------------------
  // Message handler — full envelope access for correlationId
  // ---------------------------------------------------------------------------
  const handleRetry = useCallback(() => {
    setErrored(false);
    setUnresponsive(false);
    missedPongsRef.current = 0;
  }, []);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow ?? null;
      if (!isFromFrame(event, frameWindow)) return;
      const safe = parseSafe(event.data);
      if (!safe) return;
      const parsed = RpcEnvelopeSchema.safeParse(safe);
      if (!parsed.success) return;
      const env = parsed.data as RpcEnvelope;
      const payload =
        safe["payload"] !== undefined &&
        safe["payload"] !== null &&
        typeof safe["payload"] === "object" &&
        !Array.isArray(safe["payload"])
          ? (safe["payload"] as Record<string, unknown>)
          : undefined;

      const type = env.type as RpcMethod;

      if (type === "FRAME_READY") {
        utils.sendToFrame(
          frameWindow,
          { type: "VIBE_BOOTSTRAP", payload: { transpiledJS, themeVars } },
          "*",
        );
        return;
      }

      if (type === "FRAME_RESIZE") {
        const h = payload?.["height"];
        if (typeof h === "number") setHeight(h);
        return;
      }

      if (type === "FRAME_ERROR") {
        setErrored(true);
        logger.error(
          "Frame: runtime error: " +
            String(payload?.["message"] ?? "unknown"),
        );
        return;
      }

      if (type === "FRAME_PONG") {
        missedPongsRef.current = 0;
        return;
      }

      if (type === "RUN_HANDLER") {
        const intent = payload?.["intent"];
        const input = payload?.["input"];
        const corrId = env.correlationId;
        if (typeof intent !== "string" || !corrId) return;
        try {
          const result = await (onRunHandler?.(intent, input) ??
            Promise.resolve({ data: undefined }));
          utils.sendToFrame(
            frameWindow,
            {
              type: "RUN_HANDLER_RESULT",
              correlationId: corrId,
              payload: { data: result?.data },
            },
            "*",
          );
        } catch {
          utils.sendToFrame(
            frameWindow,
            {
              type: "RUN_HANDLER_RESULT",
              correlationId: corrId,
              payload: { error: "This operation could not be completed." },
            },
            "*",
          );
        }
        return;
      }

      if (type === "FETCH_DATA") {
        const sourceId = payload?.["sourceId"];
        const params = payload?.["params"];
        const corrId = env.correlationId;
        if (typeof sourceId !== "string" || !corrId) return;
        try {
          const result = await (onFetchData?.(sourceId, params) ??
            Promise.resolve({ data: undefined }));
          utils.sendToFrame(
            frameWindow,
            {
              type: "FETCH_DATA_RESULT",
              correlationId: corrId,
              payload: { data: result?.data },
            },
            "*",
          );
        } catch {
          utils.sendToFrame(
            frameWindow,
            {
              type: "FETCH_DATA_RESULT",
              correlationId: corrId,
              payload: { error: "This operation could not be completed." },
            },
            "*",
          );
        }
        return;
      }

      if (type === "MODIFY_REQUEST") {
        const instruction = payload?.["instruction"];
        if (typeof instruction === "string") onModify?.(instruction);
        return;
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, transpiledJS, themeVars, onRunHandler, onFetchData, onModify]);

  // ---------------------------------------------------------------------------
  // Ping/pong liveness (SANDBOX-06)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      utils.sendToFrame(
        iframeRef.current?.contentWindow ?? null,
        { type: "FRAME_PING" },
        "*",
      );
      missedPongsRef.current += 1;
      if (missedPongsRef.current >= 3) {
        setUnresponsive(true);
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="app-frame">
      <iframe
        ref={iframeRef}
        className="app-frame__iframe"
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        title={title}
        style={{ height: height !== undefined ? height : undefined }}
      />
      {errored && (
        <div className="app-frame__overlay" role="alert">
          <p className="app-frame__overlay-body">Something went wrong.</p>
          <button className="app-frame__overlay-close" onClick={handleRetry}>
            Try again
          </button>
        </div>
      )}
      {unresponsive && !errored && (
        <div className="app-frame__overlay" role="alert">
          <p className="app-frame__overlay-body">
            This app stopped responding.
          </p>
          <button className="app-frame__overlay-close" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
