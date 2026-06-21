# Codebase Concerns

**Analysis Date:** 2026-06-21

## Tech Debt

**Undeclared dependency (reportlab):**
- Issue: `reportlab` is imported at lines 2–5 of `make-doc.py` but there is no `requirements.txt`, `pyproject.toml`, `setup.cfg`, `Pipfile`, or any other Python dependency manifest in the repo. The installed version is unknown and untracked.
- Files: `make-doc.py`
- Impact: The script will silently fail with `ModuleNotFoundError` on any machine where reportlab is not already installed. There is no way to reproduce the exact environment that generated the committed PDF.
- Fix approach: Add a `requirements.txt` with a pinned version (e.g., `reportlab==4.x.x`), or a `pyproject.toml` with `[project.dependencies]`. Run `pip freeze | grep reportlab` to capture the current version.

**Hardcoded output filename:**
- Issue: The output path `"EvolveRuntime_Proposal.pdf"` is the default argument to `create_proposal_pdf()` at line 7 and is called without arguments at line 259. The PDF is always written to the current working directory under that fixed name, silently overwriting any existing file.
- Files: `make-doc.py` (lines 7, 259)
- Impact: Running the script from a different working directory writes the PDF to an unexpected location. There is no way to specify a custom output path without editing the source. The committed `EvolveRuntime_Proposal.pdf` at the repo root will be overwritten without warning each time the script runs.
- Fix approach: Accept the output path as a CLI argument via `argparse` (e.g., `python make-doc.py --output path/to/file.pdf`).

**Hardcoded document content:**
- Issue: All document text — title, version string, section bodies, code examples, table data, and styling — is embedded directly in `make-doc.py` as string literals (lines 110–254). There is no external data source, template, or configuration file.
- Files: `make-doc.py`
- Impact: Updating any part of the proposal requires editing Python source code. The document version is a hardcoded string (`"1.0.0"` at line 111) with no mechanism to increment it automatically or track changes separately from code changes.
- Fix approach: Extract content into a structured data file (JSON, YAML, or Markdown with front-matter) and have the script render it. This separates document authoring from PDF generation logic.

## Known Bugs

**No error handling around PDF build:**
- Symptoms: If `doc.build(story)` fails (disk full, permission denied, corrupt reportlab state), the script raises an unhandled exception and exits with a Python traceback. The `os.path.getsize()` call at line 260 will also raise `FileNotFoundError` if the file was not written.
- Files: `make-doc.py` (lines 256–260)
- Trigger: Write to a read-only directory, run out of disk space, or encounter a reportlab rendering error.
- Workaround: None. The script must be rerun after resolving the underlying condition.

## Security Considerations

**No path traversal guard on output filename:**
- Risk: The `filename` parameter accepted by `create_proposal_pdf()` is passed directly to `SimpleDocTemplate` without sanitization. If the function were ever called with user-supplied input, a path like `../../etc/cron.d/evil` could write a file outside the intended directory.
- Files: `make-doc.py` (lines 7–9)
- Current mitigation: The parameter is only called with its default value at line 259, so there is no active exposure in the current usage.
- Recommendations: If CLI argument support is added, validate the output path against an expected directory before passing it to `SimpleDocTemplate`.

## Test Coverage Gaps

**No tests exist:**
- What's not tested: Script execution, PDF file creation, output file size > 0, all content sections rendering without error, style definitions not conflicting, table layout not overflowing page width.
- Files: `make-doc.py` (entire file — 260 lines, zero test coverage)
- Risk: Any change to `make-doc.py` can silently break PDF generation with no automated signal. The only verification mechanism is manually running the script and visually inspecting the output PDF.
- Priority: Medium — the script is short and self-contained, but the absence of even a smoke test (run script, assert output file exists and is non-empty) means regressions go undetected.

## Missing Critical Features

**No Python version constraint declared:**
- Problem: There is no `.python-version`, `pyproject.toml` `[tool.python]` section, or `requires-python` specifier. The script uses f-strings (Python 3.6+) and relies on reportlab's Python 3 API, but this is not enforced or documented anywhere.
- Blocks: Reproducible environment setup; CI/CD pipeline creation.

**No entry-point guard (`if __name__ == "__main__":`):**
- Problem: Lines 259–260 execute unconditionally at module import time. `output_path = create_proposal_pdf()` runs whenever the file is imported (e.g., in a test or REPL), immediately writing a PDF to disk as a side effect.
- Files: `make-doc.py` (lines 259–260)
- Fix approach: Wrap the call in `if __name__ == "__main__":`.

**Committed binary artifact:**
- Problem: `EvolveRuntime_Proposal.pdf` is tracked in the git repository alongside the source script. PDF binaries do not diff meaningfully, bloat repository size over time as they are regenerated, and can drift out of sync with the script if the script is updated without re-running it.
- Files: `EvolveRuntime_Proposal.pdf`
- Fix approach: Add `*.pdf` to `.gitignore` and treat the PDF as a build artifact generated on demand (or in CI).

---

*Concerns audit: 2026-06-21*
