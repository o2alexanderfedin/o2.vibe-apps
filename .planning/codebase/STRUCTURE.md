# Codebase Structure

**Analysis Date:** 2026-06-21

## Directory Layout

```
o2.vibe-apps/
├── make-doc.py              # Python script — PDF proposal generator (sole source file)
├── EvolveRuntime_Proposal.pdf  # Generated output artifact (produced by running make-doc.py)
├── .planning/               # GSD planning workspace (not source code)
│   └── codebase/            # Codebase analysis documents (this directory)
│       ├── ARCHITECTURE.md
│       └── STRUCTURE.md
└── .remember/               # Agent memory/session logs (runtime tooling, not source code)
    ├── now.md
    ├── today-2026-06-21.md
    ├── logs/
    │   ├── autonomous/      # Timestamped autonomous session logs
    │   └── hook-errors.log
    └── tmp/                 # Ephemeral session state files
```

## Directory Purposes

**Root (`/Volumes/Unitek-B/Projects/o2.vibe-apps/`):**
- Purpose: Contains the entire project — one source file and its generated output
- Contains: `make-doc.py` (source), `EvolveRuntime_Proposal.pdf` (output)
- Key files: `make-doc.py`

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents consumed by planning and execution tools
- Contains: Markdown analysis files (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: By GSD map-codebase command
- Committed: Yes (planning artifacts)

**`.remember/`:**
- Purpose: Agent session memory, logs, and ephemeral state for autonomous tooling
- Contains: Session logs, memory snapshots, PID files
- Generated: Yes — runtime tooling output
- Committed: Partially (`.remember/.gitignore` controls what is excluded)

## Key File Locations

**Entry Points:**
- `make-doc.py`: Single executable script. Run with `python make-doc.py`. Generates the PDF.

**Core Logic:**
- `make-doc.py:7-257`: `create_proposal_pdf()` function — all document generation logic
- `make-doc.py:20-105`: Style definitions (7 `ParagraphStyle` objects)
- `make-doc.py:107-256`: Story assembly (document content in presentation order)
- `make-doc.py:213-244`: Table construction (technical constraints section)

**Output Artifact:**
- `EvolveRuntime_Proposal.pdf`: Generated PDF — do not edit directly; regenerate via `python make-doc.py`

**Configuration:**
- None — no config files, no `.env`, no `requirements.txt`, no `pyproject.toml` detected

## Naming Conventions

**Files:**
- Source: `make-doc.py` — lowercase with hyphen (non-standard for Python modules; hyphens prevent clean `import`)
- Output: `EvolveRuntime_Proposal.pdf` — PascalCase with underscores

**Functions:**
- `create_proposal_pdf` — snake_case (PEP 8 compliant)

**Variables:**
- Local variables: snake_case (`title_style`, `body_style`, `table_data`, `story`)
- Style names (string labels): PascalCase (`'DocTitle'`, `'SectionH1'`, `'CodeBlock'`)

**Styles (ParagraphStyle name strings):**
- `'DocTitle'`, `'DocMeta'`, `'SectionH1'`, `'SectionH2'`, `'BodyTextCustom'`, `'CodeBlock'`, `'TableText'`, `'TableHeader'`

## Where to Add New Code

**New document section:**
- Add content appends to the `story` list inside `create_proposal_pdf()` in `make-doc.py`, following the existing pattern of `story.append(Paragraph(..., style))` and `story.append(Spacer(1, N))`

**New style:**
- Define an additional `ParagraphStyle` object in `make-doc.py:20-105`, following the pattern of the existing style definitions. Use `parent=styles['Normal']` or another base style as the parent.

**New table:**
- Follow the pattern at `make-doc.py:213-244`: build `table_data` as a 2D list of `Paragraph` objects, instantiate `Table(table_data, colWidths=[...])`, apply `TableStyle`, and append to `story`.

**New output format:**
- Add a new top-level function alongside `create_proposal_pdf()` in `make-doc.py`, then add a conditional call at module level (guarded by `if __name__ == "__main__":`)

**Utilities / shared helpers:**
- None currently exist. If content grows, extract style definitions to a separate `styles.py` module and content data to a `content.py` or `data.py` module at the project root.

## Special Directories

**`.planning/`:**
- Purpose: GSD tool workspace for planning documents
- Generated: Partially (by GSD commands)
- Committed: Yes

**`.remember/`:**
- Purpose: Agent memory and session state for autonomous tooling
- Generated: Yes (runtime)
- Committed: Controlled by `.remember/.gitignore`

---

*Structure analysis: 2026-06-21*
