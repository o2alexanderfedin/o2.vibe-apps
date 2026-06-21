# Technology Stack

**Analysis Date:** 2026-06-21

## Languages

**Primary:**
- Python 3.12.2 - Single script `make-doc.py` at repository root

## Runtime

**Environment:**
- CPython 3.12.2 (system installation via `/Library/Frameworks/Python.framework/Versions/3.12/`)

**Package Manager:**
- pip3 (system pip tied to above Python installation)
- Lockfile: None — no `requirements.txt`, `pyproject.toml`, `setup.py`, or `Pipfile` present

## Frameworks

**Core:**
- None — `make-doc.py` is a standalone script with no application framework

**Testing:**
- None — no test framework configured, no test files present

**Build/Dev:**
- None — no build tooling, task runners, or Makefile present

## Key Dependencies

**Critical:**
- `reportlab` 5.0.0 — PDF generation library; provides `SimpleDocTemplate`, `Paragraph`, `Spacer`, `Table`, `TableStyle`, `ParagraphStyle`, `getSampleStyleSheet`, and the `colors` module used throughout `make-doc.py`

**Infrastructure (transitive, installed with reportlab):**
- `pillow` 11.2.1 — Image processing; pulled in by reportlab for image embedding support
- `charset-normalizer` 3.4.0 — Character encoding detection; pulled in by reportlab

**Standard Library Only (no additional install needed):**
- `os` — Used in `make-doc.py` for `os.path.getsize()` to report output file size

## Configuration

**Environment:**
- No environment variables used
- No `.env` file present
- Script is fully self-contained; output filename `EvolveRuntime_Proposal.pdf` is hardcoded as a default parameter in `create_proposal_pdf()`

**Build:**
- No build config files (no `pyproject.toml`, `setup.cfg`, `tox.ini`, `.python-version`, `.nvmrc`)

## Platform Requirements

**Development:**
- Python 3.12+ with `reportlab` 5.x installed globally via pip
- Run with: `python3 make-doc.py`
- Output: `EvolveRuntime_Proposal.pdf` written to the current working directory

**Production:**
- Not applicable — this is a one-shot document generation script, not a deployed service

---

*Stack analysis: 2026-06-21*
