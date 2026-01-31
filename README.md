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

## Development

```bash
npm run dev
```

Runs the app in development mode. Open [http://localhost:5173](http://localhost:5173) to view it.

### The Use of AI

I stand by the belief that AI is a powerful tool, but, at the same time, believe that the developer should know what his tools are doing. 

> [!NOTE] 
> I am not a fan of "vibe coding". I believe the coder/developer should **review** and **understand** every line of code that is added or altered by AI tools. 

During development, I use AI tools to help with debugging, research, exploring ideas, and occasionally, generating some boilerplate code or just adding some comments. I am aware that the latter is controversial. However, I am ok with it for two reasons: one, better to have AI comments than no comments at all, and two, I believe it provides embedded context (memory) that helps AI models remember more details about the code which helps generate better code suggestions, design recommendations, and code analysis later on.

One obvious example of where I made use of AI is in the `docs/`, `explanations/`, and `future-feature-specs/` folders. Thes files in these folders were generated in the moment when I could not take time away from what I was doing to code a full spec or doc but I also didnt want to forget about it or lose my thoughts on the matter. 

Another example you can find in the code base is in the Vite config where I had an AI model generate the repetitive if statements that split the Rollup output files into separate chunks based on module names.

That being said, I am not a fan of extensive use of AI models in Agent mode as this can lead to code corruption, loss of previous work, bloat, and other issues down the line. I believe AI should be used as an imperfect assisting tool that should always be supervised and reviewed by the human developer and never given the reigns. Simply put, you need a healthy bit of skepticism regarding any thing AI says or does.

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