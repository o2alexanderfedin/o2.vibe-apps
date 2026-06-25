// Shared contextual-modification prompt popover (Phase 5, MOD-01).
//
// ONE component, used by BOTH the app `⋮` (AppShell) and the widget `⋮`
// (WidgetShell). It names the target it will act on ("Modify: <displayName>"),
// offers a free-form textarea, and a Cancel / Apply pair. On Apply it hands the
// raw instruction back to the host shell, which routes it client-side (MOD-02):
// remove/clone resolve with no model call (MOD-04); anything else is a tweak that
// re-resolves the target in place (MOD-03).
//
// The popover owns NO routing or resolve logic — it is a thin, reusable input
// surface (KISS). Open/close lives in the parent shell so the same component
// serves both shells without duplicating the textarea/buttons (DRY). Copy is
// neutral per the hygiene gate (HYGIENE-03): "Modify", "Apply", "Cancel" carry
// no mechanic-revealing token.

import { useEffect, useId, useRef, useState } from "react";

export interface ContextualPromptProps {
  /** The name of the target shown in the popover heading ("Modify: <name>"). */
  targetName: string;
  /** Called with the raw instruction when the user applies a non-empty change. */
  onApply: (instruction: string) => void;
  /** Called when the user cancels or dismisses the popover. */
  onCancel: () => void;
}

/**
 * The contextual prompt popover. Renders a labeled textarea and Cancel/Apply.
 * Apply is disabled until the instruction is non-empty so an empty change is
 * never dispatched. Escape cancels; the textarea is focused on open.
 */
export function ContextualPrompt({
  targetName,
  onApply,
  onCancel,
}: ContextualPromptProps) {
  const [value, setValue] = useState("");
  const headingId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the input on open so the user can type immediately.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const trimmed = value.trim();
  const canApply = trimmed.length > 0;

  function handleApply(): void {
    if (!canApply) return;
    onApply(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div
      className="contextual-prompt"
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      onKeyDown={handleKeyDown}
    >
      <p id={headingId} className="contextual-prompt__heading">
        Modify: {targetName}
      </p>
      <textarea
        ref={textareaRef}
        className="contextual-prompt__input"
        aria-label={`Describe a change to ${targetName}`}
        placeholder="Describe a change…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
      />
      <div className="contextual-prompt__actions">
        <button
          type="button"
          className="contextual-prompt__cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="contextual-prompt__apply"
          onClick={handleApply}
          disabled={!canApply}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
