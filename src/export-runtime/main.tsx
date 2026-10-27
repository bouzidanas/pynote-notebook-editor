// Entry of the standalone runtime that HTML exports ship: the PyNote UI,
// showing only the notebook embedded in the page. setup.ts must be the first
// import: ES modules run in import order, and it sets up the host and kernel
// before any store module (theme, code visibility, notebook) loads.
import "./setup";
import { render } from "solid-js/web";
import "../index.css";
import "katex/dist/katex.min.css";
import App from "../App";
import { host } from "../lib/host";
import { installStaticRenderHook } from "./static-render";

// A static export is a read-only page, rendered once and saved.
if (host().readOnly) installStaticRenderHook();

render(() => <App />, document.getElementById("root")!);
