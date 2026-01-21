# PyNote Notebook Editor

**Copyright © 2026 Anas Bouzid. All Rights Reserved.**
*This project is currently in development. Open-source release is planned for the future.*

---

PyNote is a next-generation, browser-based Python notebook environment. Unlike traditional notebooks that require a complex backend server setup, PyNote runs entirely in your client using WebAssembly.

## Why PyNote?

PyNote was built to modernize the data science notebook experience by leveraging the latest advancements in browser capabilities and web frameworks.

*   **Zero Setup, Serverless Execution:** Powered by Pyodide (WASM), PyNote executes Python code directly in your browser tab. There are no backend servers to configure, no connection latencies, and no cloud costs.
*   **Privacy First:** Because there is no backend server, your code and data never leave your machine. It operates completely offline once loaded.
*   **Native UI Integration:** While many notebooks render static HTML, PyNote features a custom bridge (`pynote_ui`) that lets Python code control native, high-performance web components. This means sliders, buttons, and interactive elements feel smooth and responsive, just like a native app.
*   **Modern Developer Experience:** Built with a focus on speed and usability, featuring rich text editing, intelligent auto-completion, and immediate feedback loops.

## Under the Hood

PyNote isn't just a wrapper around a Python console; it's a bridge between two worlds.

*   **The WASM Engine:** At its core is a complete Python runtime compiled to WebAssembly. This allows it to perform complex computations and data analysis right in your browser's memory.
*   **The "Bridge" Architecture:** PyNote uses a unique communication protocol that synchronizes state between the Python kernel and the user interface. When you drag a slider in the UI, the Python state updates strictly in sync. Conversely, when Python code changes a variable, the specific element on your screen updates instantly without refreshing the page.
*   **Security by Design:** Traditional notebooks often rely on rendering raw HTML for custom widgets, which can be a security risk (XSS). PyNote uses a strict data-protocol to instruct the browser *how* to render components using secure, pre-built native elements, ensuring safety without sacrificing flexibility.

## Features

-   **Client-Side Execution**: Full Python environment running in-browser.
-   **Rich Text Support**: Markdown cells with math support (KaTeX).
-   **Interactive Code**: Code cells with syntax highlighting, auto-completion, and output display.
-   **Persistence**: Autosaves your work to local storage; supports importing and exporting `.ipynb` files.
-   **Smart Shortcuts**: Extensive keyboard shortcuts for efficiently managing cells and execution flow.

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