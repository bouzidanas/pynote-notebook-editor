import { type Component } from "solid-js";
import { currentTheme, updateTheme, defaultTheme, SYNTAX_SCHEME_OPTIONS } from "../../lib/theme";
import { THEME_PRESETS, getBuiltinTheme, isBuiltinTheme } from "../../lib/themes";
import ComboBox from "../ui/ComboBox";
import { FONT_OPTIONS } from "./constants";
import { NumberUnitInput } from "./fields";
import Section from "./Section";
import ColorInput from "./ColorInput";

// The non-advanced sections of the theme form (presets through layout).
const CoreSections: Component = () => {
  return (
    <>
            {/* Presets Section */}
            <Section id="presets" title="Presets">
              <ComboBox
                label="Load Preset"
                value={currentTheme.preset}
                options={[
                  { label: "Pynote Dark", value: "pynote_dark" },
                  ...THEME_PRESETS.map((p) => ({ label: p.label, value: p.type })),
                ]}
                placeholder="Select a preset…"
                onChange={(v) => {
                  if (v !== "pynote_dark" && !isBuiltinTheme(v)) return;
                  // Reset to the default reference point first, then overlay the
                  // preset, so fields the preset doesn't customize fall back to
                  // defaults (same as "Reset to App Defaults" followed by load).
                  // "Pynote Dark" is the default reference point itself (reset only).
                  updateTheme({ ...defaultTheme });
                  if (isBuiltinTheme(v)) updateTheme(getBuiltinTheme(v));
                  // Persist the selection so the dialog re-shows it on reopen.
                  updateTheme({ preset: v });
                }}
              />
            </Section>

            {/* Colors Section */}
            <Section id="colors" title="Colors">
              <ColorInput
                id="primary"
                label="Primary"
                value={currentTheme.colors.primary}
                onChange={(v) => updateTheme({ colors: { ...currentTheme.colors, primary: v } })}
              />
              <ColorInput
                id="secondary"
                label="Secondary"
                value={currentTheme.colors.secondary}
                onChange={(v) => updateTheme({ colors: { ...currentTheme.colors, secondary: v } })}
              />
              <ColorInput
                id="accent"
                label="Accent"
                value={currentTheme.colors.accent}
                onChange={(v) => updateTheme({ colors: { ...currentTheme.colors, accent: v } })}
              />
              <ColorInput
                id="background"
                label="Background"
                value={currentTheme.colors.background}
                onChange={(v) => updateTheme({ colors: { ...currentTheme.colors, background: v } })}
              />
              <ColorInput
                id="foreground"
                label="Foreground"
                value={currentTheme.colors.foreground}
                onChange={(v) => updateTheme({ colors: { ...currentTheme.colors, foreground: v } })}
              />

              {/* Header Colors */}
              <ColorInput
                id="h1Color"
                label="H1 Color"
                value={currentTheme.typography.headerColors?.[0] || currentTheme.colors.primary}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerColors: [v, currentTheme.typography.headerColors?.[1] || "", currentTheme.typography.headerColors?.[2] || "", currentTheme.typography.headerColors?.[3] || ""] } })}
              />
              <ColorInput
                id="h2Color"
                label="H2 Color"
                value={currentTheme.typography.headerColors?.[1] || currentTheme.colors.primary}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerColors: [currentTheme.typography.headerColors?.[0] || "", v, currentTheme.typography.headerColors?.[2] || "", currentTheme.typography.headerColors?.[3] || ""] } })}
              />
              <ColorInput
                id="h3Color"
                label="H3 Color"
                value={currentTheme.typography.headerColors?.[2] || currentTheme.colors.primary}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerColors: [currentTheme.typography.headerColors?.[0] || "", currentTheme.typography.headerColors?.[1] || "", v, currentTheme.typography.headerColors?.[3] || ""] } })}
              />
              <ColorInput
                id="h4Color"
                label="H4 Color"
                value={currentTheme.typography.headerColors?.[3] || currentTheme.colors.primary}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerColors: [currentTheme.typography.headerColors?.[0] || "", currentTheme.typography.headerColors?.[1] || "", currentTheme.typography.headerColors?.[2] || "", v] } })}
              />
            </Section>

            {/* Markdown Typography Section */}
            <Section id="mdTypography" title="Markdown Typography">
              <ComboBox
                label="Font Family"
                value={currentTheme.font}
                options={FONT_OPTIONS}
                onChange={(v) => updateTheme({ font: v })}
                placeholder='"JetBrains Mono Variable", monospace'
                previewFontFamily
              />
              <NumberUnitInput
                label="Font Weight"
                value={currentTheme.fontWeight}
                onChange={(v) => updateTheme({ fontWeight: v })}
                placeholder="normal"
                step={100}
                min={100}
              />
              <NumberUnitInput
                label="Base Font Size"
                value={currentTheme.typography.fontSize}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, fontSize: v } })}
                placeholder="1rem"
                step={0.0625}
              />
              <NumberUnitInput
                label="Header Size Delta"
                value={currentTheme.typography.headerDelta}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerDelta: v } })}
                placeholder="0.225rem"
                step={0.0125}
              />
            </Section>

            {/* Code Typography Section */}
            <Section id="codeTypography" title="Code Typography">
              <ComboBox
                label="Font Family"
                value={currentTheme.codeTypography.fontFamily}
                options={FONT_OPTIONS}
                onChange={(v) => updateTheme({ codeTypography: { ...currentTheme.codeTypography, fontFamily: v } })}
                placeholder='"JetBrains Mono Variable", monospace'
                previewFontFamily
              />
              <NumberUnitInput
                label="Base Font Size"
                value={currentTheme.codeTypography.baseFontSize}
                onChange={(v) => updateTheme({ codeTypography: { ...currentTheme.codeTypography, baseFontSize: v } })}
                placeholder="0.875rem"
                step={0.0625}
              />
              <NumberUnitInput
                label="Inline Font Size"
                value={currentTheme.codeTypography.inlineFontSize}
                onChange={(v) => updateTheme({ codeTypography: { ...currentTheme.codeTypography, inlineFontSize: v } })}
                placeholder="0.875rem"
                step={0.0625}
              />
              <NumberUnitInput
                label="Editor Font Size"
                value={currentTheme.codeTypography.editorFontSize}
                onChange={(v) => updateTheme({ codeTypography: { ...currentTheme.codeTypography, editorFontSize: v } })}
                placeholder="1rem"
                step={0.0625}
              />
              <NumberUnitInput
                label="Font Weight"
                value={currentTheme.codeTypography.fontWeight}
                onChange={(v) => updateTheme({ codeTypography: { ...currentTheme.codeTypography, fontWeight: v } })}
                placeholder="400"
                step={100}
                min={100}
              />
            </Section>

            {/* Syntax Highlighting Section */}
            <Section id="syntaxHighlighting" title="Syntax Highlighting">
              <ComboBox
                label="Color Scheme"
                value={currentTheme.syntaxScheme}
                options={SYNTAX_SCHEME_OPTIONS}
                onChange={(v) => updateTheme({ syntaxScheme: v })}
              />
              <p class="text-[10px] leading-relaxed text-secondary/60 pt-1">
                Applies to code cells and markdown code blocks. Fine-tune
                individual token colors in Advanced — Syntax Colors.
              </p>
            </Section>

            {/* Spacing Section */}
            <Section id="spacing" title="Spacing">
              <NumberUnitInput
                label="Line Spacing"
                value={currentTheme.spacing.line}
                onChange={(v) => updateTheme({ spacing: { ...currentTheme.spacing, line: v } })}
                placeholder="1.75"
                step={0.05}
              />
              <NumberUnitInput
                label="Cell Margin"
                value={currentTheme.spacing.cell}
                onChange={(v) => updateTheme({ spacing: { ...currentTheme.spacing, cell: v } })}
                placeholder="0.90rem"
                step={0.05}
              />
              <NumberUnitInput
                label="Block Margin"
                value={currentTheme.spacing.block}
                onChange={(v) => updateTheme({ spacing: { ...currentTheme.spacing, block: v } })}
                placeholder="1.25rem"
                step={0.125}
              />
              <NumberUnitInput
                label="Header Margin"
                value={currentTheme.typography.headerMarginBottom}
                onChange={(v) => updateTheme({ typography: { ...currentTheme.typography, headerMarginBottom: v } })}
                placeholder="1.5rem"
                step={0.125}
              />
            </Section>

            {/* Border Radius Section */}
            <Section id="borderRadius" title="Border Radius">
              <NumberUnitInput
                label="Large Radius"
                value={currentTheme.radii.lg}
                onChange={(v) => updateTheme({ radii: { ...currentTheme.radii, lg: v } })}
                placeholder="9999px"
                step={1}
                min={0}
              />
              <NumberUnitInput
                label="Small Radius"
                value={currentTheme.radii.sm}
                onChange={(v) => updateTheme({ radii: { ...currentTheme.radii, sm: v } })}
                placeholder="0.75rem"
                step={0.125}
                min={0}
              />
            </Section>

            {/* Layout Section */}
            <Section id="layout" title="Layout">
              <ComboBox
                label="Page Width"
                value={currentTheme.pageWidth}
                options={[
                  { value: "normal", label: "Normal (52rem)" },
                  { value: "wide", label: "Wide (64rem)" },
                  { value: "full", label: "Full Page" },
                ]}
                onChange={(v) => updateTheme({ pageWidth: v as "normal" | "wide" | "full" })}
              />
              <ComboBox
                label="Table Overflow"
                value={currentTheme.tableOverflow}
                options={[
                  { value: "scroll", label: "Horizontal Scroll" },
                  { value: "wrap", label: "Force 100% Width (Wrap)" },
                ]}
                onChange={(v) => updateTheme({ tableOverflow: v as "scroll" | "wrap" })}
              />
            </Section>
    </>
  );
};

export default CoreSections;
