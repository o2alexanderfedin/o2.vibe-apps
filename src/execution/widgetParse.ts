// `@widget` dependency parser (Phase 4, WIDGET-01).
//
// An app (or a widget) declares the sub-widgets it composes with a line comment:
//
//   // @widget line-chart
//   // @widget data-table
//
// This module extracts those declared types from a source string BEFORE the
// source is mounted, so the pre-warm pass (WIDGET-02) can resolve every declared
// widget — transitively — ahead of render. The parser is a pure function over a
// string: no IO, no model call, deterministic.
//
// Grammar (deliberately strict and KISS): a declaration is a `//` line comment
// whose only content is `@widget` followed by a single whitespace-separated
// type token. The token charset matches the app-type id convention elsewhere in
// the codebase (lowercase-kebab plus digits): [a-z0-9-]. Anything else on the
// line (or a block-comment form) is ignored — we want one unambiguous shape so a
// produced component cannot accidentally over-declare.

/**
 * The `@widget <type>` line form. Anchored to a line so a `@widget` appearing
 * inside a string literal mid-line is not mistaken for a declaration. The type
 * token is the same lowercase-kebab+digit charset used for app/widget type ids.
 */
const WIDGET_DECL = /^[ \t]*\/\/[ \t]*@widget[ \t]+([a-z0-9][a-z0-9-]*)[ \t]*$/gm;

/**
 * Parse all `// @widget <type>` declarations from a source string.
 *
 * Returns the declared widget types in first-seen order, de-duplicated (a type
 * declared twice is pre-warmed once). The result is order-stable so callers and
 * tests can rely on it.
 *
 * @param source  The TSX source of an app or widget.
 */
export function parseWidgetDeps(source: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Reset lastIndex defensively — the regex is module-level and `g`/`m` carry state.
  WIDGET_DECL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIDGET_DECL.exec(source)) !== null) {
    const type = match[1];
    if (type && !seen.has(type)) {
      seen.add(type);
      out.push(type);
    }
  }
  return out;
}
