# Pyodide fixtures

`pyodide-lock.subset.json` is a subset of the `pyodide-lock.json` that Pyodide 0.29.4 publishes on jsDelivr (`https://cdn.jsdelivr.net/pyodide/v0.29.4/full/pyodide-lock.json`).
It keeps the packages (with their full dependency closures) that the offline-export tests resolve: micropip, numpy, pandas, matplotlib and scikit-learn.
Entries are unchanged, including file names and SHA-256 hashes; only other packages were removed.
