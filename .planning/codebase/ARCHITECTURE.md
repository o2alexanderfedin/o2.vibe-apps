<!-- refreshed: 2026-06-21 -->
# Architecture

**Analysis Date:** 2026-06-21

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                   make-doc.py (entry point)                  │
│                     module-level call                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ calls
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              create_proposal_pdf()                           │
│              `make-doc.py:7`                                 │
│                                                              │
│  1. Instantiate SimpleDocTemplate (layout/page settings)     │
│  2. Define ParagraphStyle objects (typography system)        │
│  3. Build `story` list (ordered list of Flowable elements)   │
│  4. Append Paragraphs, Spacers, Tables to story              │
│  5. Call doc.build(story) → writes PDF to disk               │
└──────────────────────────┬──────────────────────────────────┘
                           │ produces
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               EvolveRuntime_Proposal.pdf                     │
│               (output artifact on disk)                      │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `create_proposal_pdf()` | Builds entire PDF document: styles, content, layout | `make-doc.py:7` |
| `SimpleDocTemplate` | Page layout container (size, margins) | `make-doc.py:8-15` |
| Style definitions | Typography via 7 `ParagraphStyle` objects | `make-doc.py:20-105` |
| Story assembly | Ordered list of `Flowable` elements appended sequentially | `make-doc.py:107-256` |
| `Table` + `TableStyle` | Technical constraints table with header/alternating row styling | `make-doc.py:213-244` |
| Module-level call | `output_path = create_proposal_pdf()` — invokes generation on import/run | `make-doc.py:259` |
| Print statement | Reports output filename and file size via `os.path.getsize()` | `make-doc.py:260` |

## Pattern Overview

**Overall:** Single-function document builder using a declarative story-list pattern (reportlab Platypus).

**Key Characteristics:**
- All logic lives in one function: `create_proposal_pdf()`
- Content is accumulated as an ordered Python list (`story = []`) then built in one pass
- Style objects are defined locally within the function, not in external config
- No classes, no inheritance, no module-level state beyond the final invocation
- Output filename is a parameter with a default value (`"EvolveRuntime_Proposal.pdf"`)

## Layers

**Style Layer:**
- Purpose: Define typography and visual appearance
- Location: `make-doc.py:20-105`
- Contains: 7 `ParagraphStyle` objects: `title_style`, `meta_style`, `h1_style`, `h2_style`, `body_style`, `code_style`, `table_text`, `table_header`
- Depends on: `reportlab.lib.styles.getSampleStyleSheet`, `reportlab.lib.colors`
- Used by: Story assembly layer

**Story Assembly Layer:**
- Purpose: Construct ordered sequence of document elements
- Location: `make-doc.py:107-256`
- Contains: `Paragraph`, `Spacer`, `Table`, `TableStyle` instances appended to `story` list
- Depends on: Style layer, `reportlab.platypus`
- Used by: `doc.build(story)` call

**Build/Output Layer:**
- Purpose: Render story list to PDF file on disk
- Location: `make-doc.py:256`
- Contains: `doc.build(story)` invocation
- Depends on: `SimpleDocTemplate` instance, assembled story list
- Used by: Module-level entry point

## Data Flow

### Primary Execution Path

1. Python interpreter executes `make-doc.py` at module level (`make-doc.py:259`)
2. `create_proposal_pdf("EvolveRuntime_Proposal.pdf")` is called
3. `SimpleDocTemplate` is instantiated with filename and page margins (`make-doc.py:8-15`)
4. `getSampleStyleSheet()` loads base reportlab styles (`make-doc.py:17`)
5. Seven custom `ParagraphStyle` objects are created, inheriting from base styles (`make-doc.py:20-105`)
6. `story = []` initializes the content list (`make-doc.py:107`)
7. Document sections are appended to `story` in order: title, executive summary, architectural blueprint, component lifecycle, engine specs, constraints table, next steps (`make-doc.py:109-254`)
8. `doc.build(story)` renders all Flowables and writes `EvolveRuntime_Proposal.pdf` to disk (`make-doc.py:256`)
9. Function returns the output filename string (`make-doc.py:257`)
10. `os.path.getsize(output_path)` confirms file size and prints to stdout (`make-doc.py:260`)

## Key Abstractions

**`story` List:**
- Purpose: Ordered sequence of reportlab `Flowable` objects representing all document content
- Location: `make-doc.py:107`
- Pattern: Append-only list; each `story.append(...)` call adds one visible element

**`ParagraphStyle` Objects:**
- Purpose: Named typography configurations reused across content sections
- Location: `make-doc.py:20-105`
- Pattern: Inline style definition — each style is a local variable, not extracted to a separate module

**`Table` + `TableStyle`:**
- Purpose: Structured grid for technical constraints comparison (section 4)
- Location: `make-doc.py:213-244`
- Pattern: `table_data` is a 2D list of `Paragraph` instances; `TableStyle` applies cell formatting separately

## Entry Points

**Script Execution:**
- Location: `make-doc.py:259`
- Triggers: Running `python make-doc.py` directly; also executes on `import make-doc` since the call is at module level (not guarded by `if __name__ == "__main__":`)
- Responsibilities: Calls `create_proposal_pdf()`, prints result path and size

## Architectural Constraints

- **Single function:** All document logic — styles, content, layout — is contained in `create_proposal_pdf()`. There is no separation of content from presentation within the function.
- **No `__main__` guard:** The module-level call at `make-doc.py:259` executes unconditionally on import, which means importing the module as a library triggers PDF generation immediately.
- **No external content source:** All document text is hardcoded as string literals inside the function. There is no template file, YAML, or external data source.
- **Global state:** None. The function is self-contained with no module-level mutable state.
- **Circular imports:** Not applicable — only standard library (`os`) and `reportlab` are imported.
- **Output location:** PDF is written to the current working directory by default (relative path `"EvolveRuntime_Proposal.pdf"`).

## Anti-Patterns

### No `if __name__ == "__main__":` Guard

**What happens:** `create_proposal_pdf()` is called at `make-doc.py:259` unconditionally at module scope.
**Why it's wrong:** Importing the module (e.g., `import make-doc`) triggers immediate PDF generation and filesystem writes as a side effect.
**Do this instead:** Wrap the call:
```python
if __name__ == "__main__":
    output_path = create_proposal_pdf()
    print(f"File created successfully: {output_path}, Size: {os.path.getsize(output_path)} bytes")
```

### Hardcoded Content Inside Function

**What happens:** All proposal text is embedded as string literals inside `create_proposal_pdf()` (`make-doc.py:110-253`).
**Why it's wrong:** Updating document content requires modifying the generation function directly, coupling content and presentation.
**Do this instead:** Extract content to a separate data structure (dict, dataclass, or external file) and pass it into the builder function.

## Error Handling

**Strategy:** None implemented. No try/except blocks exist in `make-doc.py`.

**Patterns:**
- reportlab exceptions (e.g., invalid style, write permission error) propagate unhandled to the caller
- No validation of the output filename parameter

## Cross-Cutting Concerns

**Logging:** Single `print()` statement at `make-doc.py:260` — reports success path and file size.
**Validation:** None — no input validation or output verification beyond the print statement.
**Authentication:** Not applicable — local file generation only.

---

*Architecture analysis: 2026-06-21*
