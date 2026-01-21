# PyNote Developer Documentation

Welcome to the developer documentation for PyNote, a client-side notebook editor that runs Python directly in the browser using WebAssembly.

## Table of Contents

### System Architecture
1.  [Architecture & System Overview](./system-architecture/architecture-spec.md) (The master spec)
2.  [Pyodide Execution Environment](./system-architecture/pyodide-execution.md)
3.  [WASM Bridge (The Communication Protocol)](./system-architecture/wasm-bridge.md)
4.  [State Management](./system-architecture/state-management.md)

### UI System
1.  [Custom UI System](./ui-system/index.md) (Master Spec)
2.  [Adding New Components](./ui-system/adding-components.md)
3.  [Rendering Protocol](./ui-system/protocol.md)
4.  [State Synchronization](./ui-system/state-sync.md)

## Core Technologies

*   **Frontend:** SolidJS, TailwindCSS, DaisyUI
*   **Runtime:** Pyodide (Python 3.11+ compiled to WASM)
*   **Language:** TypeScript (Frontend), Python (Runtime)
*   **Bundler:** Vite

## Getting Started for Contributors

1.  **Install Dependencies:** `npm install`
2.  **Build Python Package:** `./scripts/build_python_pkg.sh` (Required for UI components)
3.  **Start Dev Server:** `npm run dev`

The application runs entirely client-side. There is no backend server to configure.