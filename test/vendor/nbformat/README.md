# Vendored nbformat schema

`nbformat.v4.5.schema.json` is the official Jupyter notebook format schema, copied unchanged from the `nbformat` Python package, version 5.11.1 (`nbformat/v4/nbformat.v4.5.schema.json`).
Its SHA-256 is `523e3578ddbfcad52933d2423dc5951114ef73f48df180b6a601498ba5ca071a`.

The tests validate every `.ipynb` PyNote writes against it, so PyNote's files stay readable by Jupyter and other tools.
It is a JSON Schema draft-04 document, which is why the tests load it with `ajv-draft-04`.

The schema is distributed under the BSD 3-Clause license in `LICENSE`, copied from the same package.
To update it, copy the file from a newer nbformat release, update the version and hash above, and run the format tests.
