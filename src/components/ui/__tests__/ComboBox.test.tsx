// Component test for ComboBox's font-preview behaviour.
//
// ComboBox is used both for font-family selects (where each dropdown option is
// rendered in its own font as a preview) and for non-font selects like the
// syntax colour scheme, page width, etc. (where the option value is "dracula",
// "wide", ... and must NOT be applied as a font-family). The `previewFontFamily`
// prop is the seam that distinguishes the two, so it's covered here.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@solidjs/testing-library";

import ComboBox from "../ComboBox";

const OPTIONS = [
  { label: "Serif", value: "serif" },
  { label: "Monospace", value: "monospace" },
];

afterEach(cleanup);

const openDropdown = () => {
  fireEvent.focus(screen.getByRole("combobox"));
};

describe("ComboBox previewFontFamily", () => {
  it("renders each option in its own value as font-family when enabled", () => {
    render(() => (
      <ComboBox label="Font Family" value="serif" options={OPTIONS} onChange={() => {}} previewFontFamily />
    ));
    openDropdown();

    const options = screen.getAllByRole("option");
    expect(options[0].style.fontFamily).toBe("serif");
    expect(options[1].style.fontFamily).toBe("monospace");
  });

  it("does not apply an inline font-family when disabled", () => {
    render(() => (
      <ComboBox label="Color Scheme" value="serif" options={OPTIONS} onChange={() => {}} />
    ));
    openDropdown();

    const options = screen.getAllByRole("option");
    expect(options[0].style.fontFamily).toBe("");
    expect(options[1].style.fontFamily).toBe("");
  });
});
