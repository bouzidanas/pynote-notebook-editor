// The page's notebook: its look and settings from PyNote's Export dialog
// (pynote.config.json), and the <pynote-cell> element.
import { configure } from "pynote/element";
import config from "./pynote.config.json";

configure(config);
