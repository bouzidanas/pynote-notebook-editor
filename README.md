> [!NOTE]
> Update 2026-02-6: Added a suite of new UI components for the `pynote_ui` module, including form, toggle, input, textarea, and more. These components work with PyNote's theming system and come with extra features like size presets, theme-based color options, border styles, and the ability to show and hide them. The new Form component has the same flexible layout options as the Group component, allowing for easy arrangement of child components in rows or columns with customizable spacing while also supporting form submission handling. Check out the updated sections in the tutorial: [Interactive UI Part 1](https://pynote-notebook.vercel.app/?open=tutorial_ui_part1) and [Interactive UI Part 2](https://pynote-notebook.vercel.app/?open=tutorial_ui_part2) to learn how to use these new components effectively in your notebooks!

> [!NOTE]
> Update 2026-02-05: Added a suite of editing bells and whistles to the code editor including:
> - Autocomplete suggestions with type info
> - Function signature help while typing
> - Multi-cursor support and multi-selection editing
>   - Bracket matching and auto-closing
>   - Match selection highlighting
>   - Multi-match selection
> - Find and replace
> - Duplicate line/selection
> - Line operations (move up/down, delete line)
> - Tooltips for hover info about modules, functions, classes, and variables

# PyNote Notebook Editor

> [!IMPORTANT]
>**Copyright © 2026 Anas Bouzid. All Rights Reserved.**
> *This project is currently in development. Open-source release is planned for the future.*

---

# [Live Tutorial](https://pynote-notebook.vercel.app/?open=tutorial)  |  [GitHub](https://github.com/bouzidanas/pynote-notebook-editor)

> [!TIP]
> In PyNote, press `Ctrl-\` to see shortcuts!

## What is PyNote?

**PyNote** is a serverless, zero-setup Python notebook environment that runs entirely in your web browser using WebAssembly (Pyodide). It removes the need for backend kernels or cloud infrastructure, ensuring all code executes locally on your machine for privacy and speed. It features a custom UI python module (`pynote_ui`) that allows Python code to render native, interactive web components (like sliders, buttons, and layouts) and high-performance visualizations directly in the notebook output.

Truth be told, nothing above is special. Many existing open-source notebook environments do this and more.

## What I think makes PyNote special

1. **Modern tech stack** (what its built with):
   * **SolidJS** for reactive javascript framework (fine-grained reactivity and performance)
   * **Pyodide** for running the Python interpreter and scientific stack (NumPy, Pandas) directly in the browser
   * **DaisyUI** for modern, accessible, and *themeable* UI components based on Tailwind CSS.
   * **Tailwind CSS** for consistent, responsive styling/theming
   * **CodeMirror** for robust, IDE-grade code editors
   * **Milkdown** for powerful WYSIWYG Markdown editors
   * **Observable Plot** for a lightweight, capable, and declarative charting library (perfect for SolidJS)

2. **Built for presentation!** This is the main thing.

PyNote isn't trying to replace heavy-duty compute environments. If you're training large machine learning models, you need a GPU and a real server.

But where PyNote aims to excel is ***presentation***. The UI is built with [daisyUI](https://daisyui.com/) a component library for Tailwind CSS that provides semantic class names and a ***powerful theming system***. This gives us consistent, polished components out of the box while keeping everything customizable. You can adjust the following for the whole notebook:

* Colors (background, foreground, primary, secondary, accent, H1-4, and more), fonts, and spacing (line, block, header, cell, and more)
* **Section-scoped styling** where everything under the same heading shares theme elements

The goal: notebooks that look good enough to publish, share, present, and use in blogs, documentation, and articles. When file export features are completed, you'll be able to save stripped-down versions of your notebooks as standalone mini-apps to embed in websites, blogs, or documentation. There will also be other export options like python and markdown.

3. **Has a lot of cool features:**

* **Marimo-style reactive mode!** There are plans to actually add greater reactivity soon (in testing).
* **3 other execution modes!** Sequential, Hybrid, Concurrent
* Theme is entirely customizable (or will be when release) and can be applied app-wide, session-only, or even stored into the notebook metadata itself so the notebook carries its presentation/look with it.
* Presentation mode
* Session persistence. Even if you close your tab, you wont lose your progress. You can set app theme, execution mode, and code visibility options as well as other options to apply to the session only.

## Development/Contribution Notes and Philosophy (a rant for now, will revise soon)

### The Use of AI

I stand by the belief that AI is a powerful tool, but, at the same time, believe that the developer should know what his tools are doing. 

> [!NOTE] 
> I am not a fan of "vibe coding". I believe the coder/developer should **review** and **understand** every line of code that is added or altered by AI tools. 

During development, I use AI tools to help with debugging, research, exploring ideas, and occasionally, generating some boilerplate code or just adding some comments. I am aware that the latter is controversial. However, I am ok with it for two reasons: one, better to have AI comments than no comments at all, and two, I believe it provides embedded context (memory) that helps AI models remember more details about the code which helps generate better code suggestions, design recommendations, and code analysis later on.

One obvious example of where I made use of AI is in the `docs/`, `explanations/`, and `future-feature-specs/` folders. Thes files in these folders were generated in the moment when I could not take time away from what I was doing to code a full spec or doc but I also didnt want to forget about it or lose my thoughts on the matter. 

Another example you can find in the code base is in the Vite config where I had an AI model generate the repetitive if statements that split the Rollup output files into separate chunks based on module names.

That being said, I am not a fan of extensive use of AI models in Agent mode as this can lead to code corruption, loss of previous work, bloat, and other issues down the line. I believe AI should be used as an imperfect assisting tool that should always be supervised and reviewed by the human developer and never given the reigns. Simply put, you need a healthy bit of skepticism regarding any thing AI says or does.

## Setup and Usage
To run the project locally:
1. Clone the repository: `git clone
2. Navigate to the project directory: `cd pynote-notebook-editor`
3. Install dependencies: `npm install`
4. Start the development server: `npm run dev`
5. Open your browser and go to `http://localhost:5173` to see the
    app in action!

## Open source release

When this app is ready for release, it will be open sourced. But repo is public and PyNote is [live](https://pynote-notebook.vercel.app/) if you would like to check it out!