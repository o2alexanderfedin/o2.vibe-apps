# Coding Conventions

**Analysis Date:** 2026-06-21

## Codebase Summary

The codebase consists of a single Python script: `/Volumes/Unitek-B/Projects/o2.vibe-apps/make-doc.py` (261 lines). It uses the `reportlab` library to generate a PDF proposal document. There are no linter configs, formatters, CI pipelines, or additional Python source files.

## Naming Patterns

**Files:**
- Single script, `snake_case.py` naming: `make-doc.py` (note: hyphen rather than underscore, atypical for Python modules)

**Functions:**
- `snake_case`: `create_proposal_pdf(filename="EvolveRuntime_Proposal.pdf")`
- One function in the entire codebase

**Local variables:**
- `snake_case` throughout: `doc`, `styles`, `title_style`, `meta_style`, `h1_style`, `h2_style`, `body_style`, `code_style`, `table_text`, `table_header`, `story`, `table_data`, `t`, `output_path`
- `ParagraphStyle` instance names follow the pattern `<role>_style` (e.g., `title_style`, `meta_style`, `body_style`, `code_style`) or `<role>_<type>` (e.g., `table_text`, `table_header`)

**ParagraphStyle name strings (internal reportlab identifiers):**
- `PascalCase` strings that describe the semantic role: `'DocTitle'`, `'DocMeta'`, `'SectionH1'`, `'SectionH2'`, `'BodyTextCustom'`, `'CodeBlock'`, `'TableText'`, `'TableHeader'`
- These differ from the Python variable names: e.g., variable `h1_style` has internal name `'SectionH1'`

**Module-level execution:**
- Script runs at import via module-level call at line 259: `output_path = create_proposal_pdf()`

## Code Style

**Formatting:**
- No formatter configured (no `.prettierrc`, `pyproject.toml`, `setup.cfg`, `.flake8`, or `.pylintrc`)
- Indentation: 4 spaces throughout (PEP 8 compliant)
- Lines are generally short; long string literals are split using implicit string concatenation with parentheses (e.g., lines 116–127, 249–253)
- Blank lines used between style definitions for readability; no blank lines enforced by tooling

**Linting:**
- Not configured. No `.flake8`, `.pylintrc`, `pyproject.toml [tool.ruff]`, or any equivalent.

## Import Organization

**Order (as observed in `make-doc.py`, lines 1–5):**
1. Standard library: `os`
2. Third-party (`reportlab`): grouped together without blank line separation

```python
import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
```

No path aliases, no relative imports.

## ParagraphStyle Pattern

All styles are defined at the top of `create_proposal_pdf()` before any content is added to `story`. Each `ParagraphStyle` specifies:
- An internal name string (PascalCase)
- A `parent` style from `getSampleStyleSheet()`
- Typography properties: `fontName`, `fontSize`, `leading`, `textColor` (always `colors.HexColor(...)`)
- Spacing properties: `spaceAfter`, `spaceBefore` (where applicable)
- Optional behavior: `keepWithNext=True` (headings), `backColor`, `borderColor`, `borderWidth`, `borderPadding`, `textTransform`

All colors use hex strings (e.g., `"#2B6CB0"`, `"#2D3748"`) rather than named colors, except `colors.white` (line 104).

## Error Handling

No error handling is present. The script does not use `try/except`. If `reportlab` raises (e.g., missing font, write permission error), the exception propagates uncaught and terminates the process.

## Logging / Output

Single `print` statement at line 260 used for success confirmation:

```python
print(f"File created successfully: {output_path}, Size: {os.path.getsize(output_path)} bytes")
```

f-string formatting is used. No logging framework.

## Comments

Inline `#` comments mark document sections (e.g., `# Title & Metadata`, `# 1. Executive Summary`, `# Build Document`). Comments are section dividers, not explanations of logic. No docstrings on any function.

## Function Design

**Size:** The entire script is one function (`create_proposal_pdf`) plus two module-level lines. The function is 250 lines — a single monolithic builder.

**Parameters:** One optional parameter with a default value (`filename="EvolveRuntime_Proposal.pdf"`).

**Return values:** Returns the `filename` string after building the PDF.

## Module Design

**Exports:** None. The script is not designed to be imported — it executes on run via the module-level call.

**Structure pattern:** Define-all-styles first, then build `story` list imperatively by appending `Paragraph`, `Spacer`, and `Table` objects, then call `doc.build(story)`.

---

*Convention analysis: 2026-06-21*
