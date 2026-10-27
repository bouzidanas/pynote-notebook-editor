"""Check the exported .py golden files with real Python tools.

Every .py golden (test/golden/python, test/golden/pair) is a script that must
run top to bottom with CPython: this is the end-to-end check of the export's
cell order. With --jupytext, each file must also be read by jupytext's
py:percent reader as the same cells PyNote writes: same count, types, code
and prose, the pair's cell ids, and the execution mode from the header.

    uv run python -I test/oracle/check_scripts.py
    uv run --with jupytext==1.19.6 python -I test/oracle/check_scripts.py --jupytext

npm run test:oracle runs both checks. Exits with a non-zero status when any
check fails.
"""
import argparse
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = sorted([*ROOT.glob("test/golden/python/*.py"), *ROOT.glob("test/golden/pair/*.py")])

# The cell marker PyNote writes and reads (src/lib/formats/python.ts).
MARKER = re.compile(r"^# ?%%(?=[ \t]|$)")
ID = re.compile(r'\bid="([A-Za-z0-9_-]+)"')


def pynote_cells(text):
    """The cells as PyNote's reader sees them: (type, source, id) per marker."""
    lines = text.split("\n")
    starts = [i for i, line in enumerate(lines) if MARKER.match(line)]
    cells = []
    for k, start in enumerate(starts):
        end = starts[k + 1] if k + 1 < len(starts) else len(lines)
        region = lines[start + 1:end]
        if region and region[-1] == "":
            region.pop()
        rest = lines[start]
        kind = "markdown" if "[markdown]" in rest else "raw" if "[raw]" in rest else "code"
        if kind != "code":
            region = [line[2:] if line.startswith("# ") else line[1:] if line.startswith("#") else line for line in region]
        match = ID.search(rest)
        cells.append((kind, "\n".join(region), match.group(1) if match else None))
    return cells


def same_text(a, b):
    # jupytext splits lines like str.splitlines (U+2028 included) and drops
    # trailing blank lines; compare on those terms.
    return a.splitlines() == b.splitlines() or a.rstrip("\n").splitlines() == b.rstrip("\n").splitlines()


def run_with_cpython(path):
    with tempfile.TemporaryDirectory() as cwd:
        result = subprocess.run([sys.executable, "-I", str(path)], cwd=cwd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        return [f"exit status {result.returncode}:\n{result.stderr}"]
    return []


def header_mode(text):
    """The execution mode PyNote's header line records (None without one)."""
    match = re.search(r"^#   executionMode: (\w+)$", text.split("\n# ---\n", 1)[0], re.M)
    return match.group(1) if match else None


def read_with_jupytext(path):
    import jupytext
    from jupytext.config import JupytextConfiguration

    text = path.read_text(encoding="utf-8")
    expected = pynote_cells(text)
    # The header is root-level metadata to jupytext; keep it out of the cells.
    config = JupytextConfiguration(root_level_metadata_as_raw_cell=False)
    notebook = jupytext.reads(text, fmt="py:percent", config=config)
    problems = []
    mode = (notebook.metadata.get("jupytext", {}).get("root_level_metadata", {}).get("pynote") or {}).get("executionMode")
    written = header_mode(text)
    if mode != written:
        problems.append(f"jupytext reads execution mode {mode!r} from the header, PyNote wrote {written!r}")
    if len(notebook.cells) != len(expected):
        return problems + [f"jupytext reads {len(notebook.cells)} cells, PyNote writes {len(expected)}"]
    for index, (cell, (kind, source, cell_id)) in enumerate(zip(notebook.cells, expected), start=1):
        if cell.cell_type != kind:
            problems.append(f"cell {index}: jupytext reads a {cell.cell_type} cell, PyNote writes {kind}")
        elif not same_text(cell.source, source):
            problems.append(f"cell {index}: jupytext reads {cell.source!r}, PyNote writes {source!r}")
        if cell_id is not None and cell.metadata.get("id") != cell_id:
            problems.append(f"cell {index}: jupytext reads id {cell.metadata.get('id')!r}, PyNote writes {cell_id!r}")
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--jupytext", action="store_true", help="also read every script with jupytext's py:percent reader")
    args = parser.parse_args()
    if not SCRIPTS:
        print("no .py golden files found", file=sys.stderr)
        return 1
    checks = [("cpython", run_with_cpython)] + ([("jupytext", read_with_jupytext)] if args.jupytext else [])
    failures = 0
    for path in SCRIPTS:
        for name, check in checks:
            problems = check(path)
            print(f"{'ok' if not problems else 'FAIL':>4}  {name:<8} {path.relative_to(ROOT)}")
            for problem in problems:
                print(f"      {problem}")
            failures += bool(problems)
    print(f"{len(SCRIPTS)} scripts, {len(checks)} check(s) each: {'all passed' if failures == 0 else f'{failures} failed'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
