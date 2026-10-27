"""Write the golden .ipynb files the format tests compare against.

The expected output is what Jupyter's own nbformat writer produces for each
fixture once outputs and execution counts are cleared (PyNote does not persist
outputs), so PyNote's writer is checked against the reference implementation
byte for byte. Regenerate only when a fixture changes:

    uv run --with nbformat==5.11.1 python -I test/oracle/write_golden.py

With --check nothing is written: the script fails if a golden file differs
from what nbformat produces now (npm run test:oracle).
"""
import pathlib
import sys
import nbformat

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "test" / "fixtures" / "notebooks"
GOLDEN = ROOT / "test" / "golden" / "ipynb"

CHECK = "--check" in sys.argv[1:]
stale = []

for path in sorted(FIXTURES.glob("jupyter-*.ipynb")):
    nb = nbformat.reads(path.read_text(encoding="utf-8"), as_version=nbformat.NO_CONVERT)
    for cell in nb.cells:
        if cell.cell_type == "code":
            cell.outputs = []
            cell.execution_count = None
    nbformat.validate(nb)
    out = GOLDEN / path.name
    expected = nbformat.writes(nb) + "\n"
    if CHECK:
        if not out.exists() or out.read_text(encoding="utf-8") != expected:
            stale.append(str(out.relative_to(ROOT)))
        continue
    out.write_text(expected, encoding="utf-8")
    print("wrote", out.relative_to(ROOT))

if CHECK:
    if stale:
        sys.exit("Golden files differ from nbformat's output: " + ", ".join(stale))
    print("golden files match nbformat")
