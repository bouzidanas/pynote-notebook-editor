# PyNote Architecture & UI System Specification

**Status:** Draft / Active Implementation
**Date:** January 19, 2026
**Context:** Client-side WASM Notebook Editor

## 1. High-Level Overview

PyNote is a browser-based notebook environment that executes Python code client-side using Pyodide (WebAssembly). Unlike traditional Jupyter notebooks that rely on a WebSocket connection to a backend server, PyNote runs entirely within the user's browser.

The core distinction of PyNote is its custom UI system (`pynote_ui`), which allows Python code to render native SolidJS components rather than injecting raw HTML. This creates a bridge between Python's state management and SolidJS's fine-grained reactivity.

### Core Components

1.  **Frontend (Main Thread):** SolidJS + TailwindCSS + DaisyUI. Handles rendering, user events, and cell management.
2.  **Kernel (Web Worker):** Pyodide. Executes Python code, manages `pynote_ui` state, and communicates via `postMessage`.
3.  **Bridge:** A messaging protocol that marshals execution requests, stdout/stderr streams, and UI interaction events between the Main Thread and Worker.

---

## 2. The `pynote_ui` Architecture

The `pynote_ui` package is a custom Python library installed dynamically into the Pyodide environment. It implements a **Remote Handle Pattern**, where Python objects act as proxies for UI components living in the frontend.

### 2.1. The Rendering Protocol
Instead of returning HTML string representations (which is common in `ipywidgets` or standard `_repr_html_`), `pynote_ui` elements implement `_repr_mimebundle_`.

*   **Format:** `application/vnd.pynote.ui+json`
*   **Payload:**
    ```json
    {
      "id": "uuid-v4-string",
      "type": "Slider",
      "props": { "min": 0, "max": 100, "value": 50 }
    }
    ```
*   **Justification:**
    *   **Security:** Eliminates XSS risks associated with rendering raw HTML from execution results.
    *   **Performance:** React/SolidJS are faster at mounting components from data than parsing HTML strings and hydrating them.
    *   **Theming:** The UI is rendered using the app's native component library (DaisyUI), ensuring perfect visual consistency without inline styles in Python.

### 2.2. State Management (Python Side)
A singleton `StateManager` exists in the Python kernel.
*   **Registry:** Maps unique UUIDs to Python object instances.
*   **Context Awareness:** Tracks which Cell ID is currently executing (`_current_cell_id`).
*   **Garbage Collection:** Maintains a map of `Cell ID -> [Component UUIDs]`. When a cell is re-executed or deleted, the `StateManager` prunes instances associated with that cell to prevent memory leaks.

### 2.3. Two-Way Binding & Reactivity

**JS → Python (User Interaction):**
When a user moves a slider:
1.  SolidJS component catches the event.
2.  Calls `kernel.sendInteraction(id, { value: 55 })`.
3.  Worker receives message `type: "interaction"`.
4.  Python calls `StateManager.update(id, data)`.
5.  The specific Python instance updates its internal state (`self.value = 55`).

**Python → JS (Programmatic Update):**
When code executes `slider.value = 80`:
1.  Property setter in Python class triggers.
2.  Calls `StateManager.send_update(id, { value: 80 })`.
3.  Message sent to Main Thread `type: "component_update"`.
4.  `Kernel` class in TS routes message to the specific SolidJS component listener.
5.  SolidJS Signal updates, refreshing *only* the specific DOM node (Fine-grained reactivity).

---

## 3. Frontend Architecture

### 3.1. Cell Execution Lifecycle
1.  **Preparation:** Frontend calls `kernel.clearCellState(cellId)` to instruct Python to GC old widgets for this cell.
2.  **Context Setting:** Frontend calls `kernel.setCellContext(cellId)`. Any UI element created in Python during the next run step will be tagged with this ID.
3.  **Execution:** Code runs.
4.  **Rendering:** If the result contains the custom mime type, `UIOutputRenderer` looks up the component in `ComponentRegistry`.

### 3.2. Lazy Loading
The `ComponentRegistry` utilizes `lazy(() => import(...))` for UI components.
*   **Motivation:** Keeps the initial bundle size small. A user who never plots a graph or uses a slider shouldn't pay the network cost for those libraries.

---

## 4. Critical Analysis & Alternatives

### 4.1. Pros of Current Approach
1.  **Zero Latency UI:** Once mounted, the UI interaction (dragging a slider) feels native because it *is* native DOM, not an iframe or canvas.
2.  **Privacy & Offline Capable:** Everything runs in the browser. No data leaves the user's machine.
3.  **Developer Experience:** Extending the library is easy. Define a Python class, define a Solid component, register the mapping. No complex build chains (like typical Jupyter Widgets extensions require).

### 4.2. Cons & Hurdles
1.  **Serialization Overhead:**
    *   *Issue:* Every update requires serializing JSON and crossing the Worker boundary via `postMessage`.
    *   *Impact:* High-frequency updates (e.g., dragging a slider sending updates every 16ms) can congest the bridge.
    *   *Mitigation:* Debouncing on the frontend or batching updates.
2.  **State Desynchronization:**
    *   *Issue:* If the Python kernel crashes or is restarted, the Frontend components might still exist but be "orphaned" (pointing to non-existent Python objects).
    *   *Mitigation:* The frontend needs to listen for "restart" events and gray out or disable interactive widgets.
3.  **Memory Management Complexity:**
    *   *Issue:* Explicitly managing GC via `clear_cell` is robust but relies on the frontend behaving correctly. If the frontend fails to send the clear signal, Python memory grows indefinitely.

### 4.3. Alternative Approaches Considered

#### A. Standard ipywidgets
*   *Approach:* Port the full `ipywidgets` protocol to Pyodide.
*   *Why Rejected:* It is extremely heavy, relies deeply on the Jupyter Comms protocol (which assumes a server), and brings in a massive dependency tree. It is overkill for a lightweight, client-side notebook.

#### B. HTML Injection (e.g., `ipyvuetify` style)
*   *Approach:* Python generates Vue/React template strings and injects them.
*   *Why Rejected:* Hard to style consistently with the outer application. Security risks (XSS). Harder to maintain bidirectional state (parsing DOM vs. structured data).

#### C. SharedArrayBuffer
*   *Approach:* Use a shared memory buffer for state syncing instead of `postMessage`.
*   *Why Rejected:* Requires `Cross-Origin-Opener-Policy` (COOP) and `Cross-Origin-Embedder-Policy` (COEP) headers, which makes deploying the app (e.g., on GitHub Pages or simple hosting) much more difficult and restricts loading external resources (images/scripts) from non-compliant CDNs.

## 5. Future Roadmap
1.  **Binary Data Transfer:** Optimize image/plot transfer using `Transferable` objects in `postMessage` to avoid base64 string overhead.
2.  **Debounced Sync:** Add automatic debouncing for continuous inputs (sliders) in the `pynote_ui` base class.
3.  **Reactive DAG:** Extend `StateManager` to trigger re-execution of downstream cells when a UI element updates (Reactive Notebook pattern).
