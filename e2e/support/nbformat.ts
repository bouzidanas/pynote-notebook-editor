import Ajv from "ajv-draft-04";
import schema from "../../test/vendor/nbformat/nbformat.v4.5.schema.json" with { type: "json" };

// Validates notebooks against the official nbformat 4.5 schema (vendored from
// the nbformat package, see test/vendor/nbformat/README.md). Jupyter rejects
// or silently repairs files that fail this schema, so every .ipynb PyNote
// writes must pass it.
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

/** Schema violations as readable "path: message" strings; empty when valid. */
export function nbformatErrors(notebook: unknown): string[] {
  if (validate(notebook)) return [];
  return (validate.errors ?? []).map((e) => `${e.instancePath || "/"}: ${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ""}`);
}
