# Rendering Protocol

This document defines the interface between the Python kernel and the Frontend renderer.

## MIME Type
`application/vnd.pynote.ui+json`

## Payload Schema

The JSON payload emitted by `_repr_mimebundle_` must adhere to this structure:

```typescript
interface UIPayload {
  /**
   * Unique identifier for the component instance.
   * UUID v4 is recommended.
   */
  id: string;

  /**
   * The type of component to render.
   * Must match a key in ComponentRegistry.tsx.
   */
  type: string;

  /**
   * Initial properties passed to the component.
   * Can be any JSON-serializable object.
   */
  props: Record<string, any>;
}
```

## Example Payload

```json
{
  "id": "c928229d-4886-4556-943a-734f15309395",
  "type": "Slider",
  "props": {
    "min": 0,
    "max": 100,
    "value": 25,
    "step": 5,
    "label": "Volume"
  }
}
```

## Protocol Rules

1.  **Immutability of Type:** The `type` of a component cannot change after instantiation.
2.  **ID Uniqueness:** IDs must be globally unique across the entire session.
3.  **Props Serialization:** All values in `props` must be JSON-serializable. Complex objects (like NumPy arrays) should be converted to lists or base64 strings before sending.
