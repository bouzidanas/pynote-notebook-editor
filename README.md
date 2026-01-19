# PyNote Notebook Editor

PyNote is a modern, browser-based Python notebook environment (similar to Jupyter) that runs entirely in the client using Pyodide (WebAssembly).

## Features

-   **Client-Side Execution**: Runs Python code directly in your browser using Pyodide. No backend server required.
-   **Rich Text Support**: Markdown cells with math support (KaTeX).
-   **Interactive Code**: Code cells with syntax highlighting, auto-completion, and output display.
-   **Persistence**: Autosaves your work to local storage; supports importing and exporting `.ipynb` files.
-   **Shortcuts**: Extensive keyboard shortcuts for efficient workflow.

## Usage

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Runs the app in development mode. Open [http://localhost:5173](http://localhost:5173) to view it.

### Build

```bash
npm run build
```

Builds the app for production to the `dist` folder.

## Tech Stack

-   **Frontend Framework**: SolidJS
-   **Language**: TypeScript
-   **Bundler**: Vite
-   **Styling**: Tailwind CSS
-   **Python Runtime**: Pyodide (WASM)
-   **Editor**: CodeMirror 6, Milkdown