import { type Component, For } from "solid-js";
import { currentTheme, updateTheme, SYNTAX_TOKENS, SYNTAX_SCHEMES } from "../../lib/theme";
import ComboBox from "../ui/ComboBox";
import { FONT_OPTIONS } from "./constants";
import { NumberUnitInput, InputField, ToggleField } from "./fields";
import Section from "./Section";
import ColorInput from "./ColorInput";

// The Advanced sections of the theme form (UI borders through pynote_ui).
const AdvancedSections: Component = () => {
  return (
    <>
            {/* Advanced: UI Element Borders Section */}
            <Section id="advUiBorder" title="Advanced — UI Borders">
                <div class="space-y-3">
                  <p class="text-[10px] leading-relaxed text-secondary/60">
                    <span class="font-mono">Color</span> sets the default for
                    frames and dividers. For <span class="font-mono">Border</span>,{" "}
                    <span class="font-mono">Divider</span> and <span class="font-mono">Menu</span>,
                    enter a thickness (<span class="font-mono">2px</span>) or a
                    full value (<span class="font-mono">2px dashed #89b4fa</span>).
                    Menu styles toolbar/menu buttons. Blank keeps the current look.
                  </p>

                  <ColorInput
                    id="uiBorderColor"
                    label="Color"
                    value={currentTheme.uiBorder.color}
                    onChange={(v) => updateTheme({ uiBorder: { color: v } })}
                    placeholder="var(--foreground)"
                  />
                  <InputField
                    label="Border"
                    value={currentTheme.uiBorder.border}
                    onChange={(v) => updateTheme({ uiBorder: { border: v } })}
                    placeholder="1px"
                  />
                  <InputField
                    label="Divider"
                    value={currentTheme.uiBorder.divider}
                    onChange={(v) => updateTheme({ uiBorder: { divider: v } })}
                    placeholder="1px"
                  />
                  <InputField
                    label="Menu"
                    value={currentTheme.uiBorder.menu}
                    onChange={(v) => updateTheme({ uiBorder: { menu: v } })}
                    placeholder="2px"
                  />
                </div>
            </Section>

            {/* Advanced: UI Typography Section */}
            <Section id="advUiTypography" title="Advanced — UI Typography">
                <div class="space-y-3">
                  <p class="text-[10px] leading-relaxed text-secondary/60">
                    Overrides the font of UI chrome only (dialogs, dropdowns,
                    menus, toolbars). Leave blank to use app font.
                    Menu Weight applies to toolbar/menu buttons.
                    Markdown, code cells and embedded widgets are unaffected.
                  </p>

                  <ComboBox
                    label="Font Family"
                    value={currentTheme.uiTypography.fontFamily}
                    options={FONT_OPTIONS}
                    onChange={(v) => updateTheme({ uiTypography: { fontFamily: v } })}
                    placeholder="app font"
                    previewFontFamily
                  />
                  <NumberUnitInput
                    label="Font Weight"
                    value={currentTheme.uiTypography.fontWeight}
                    onChange={(v) => updateTheme({ uiTypography: { fontWeight: v } })}
                    placeholder="normal"
                    step={100}
                    min={100}
                  />
                  <NumberUnitInput
                    label="Menu Weight"
                    value={currentTheme.uiTypography.menuFontWeight}
                    onChange={(v) => updateTheme({ uiTypography: { menuFontWeight: v } })}
                    placeholder="600"
                    step={100}
                    min={100}
                  />
                </div>
            </Section>

            {/* Advanced: Syntax Colors Section */}
            <Section id="advSyntaxColors" title="Advanced — Syntax Colors">
                <div class="space-y-3">
                  <p class="text-[10px] leading-relaxed text-secondary/60">
                    Override individual token colors on top of the selected
                    scheme. Leave a field blank to use the scheme's color (shown
                    as the placeholder). Accepts any CSS color.
                  </p>

                  <For each={SYNTAX_TOKENS}>
                    {(token) => (
                      <ColorInput
                        id={`syntax-${token}`}
                        label={token.charAt(0).toUpperCase() + token.slice(1)}
                        value={currentTheme.syntax[token]}
                        onChange={(v) => updateTheme({ syntax: { [token]: v } })}
                        placeholder={(SYNTAX_SCHEMES[currentTheme.syntaxScheme] || SYNTAX_SCHEMES.duotone)[token]}
                      />
                    )}
                  </For>
                </div>
            </Section>

            {/* Advanced: Cell Borders Section */}
            <Section id="advBorders" title="Advanced — Cell Borders">
                <div class="space-y-3">
                  <p class="text-[10px] leading-relaxed text-secondary/60">
                    Leave a field blank to keep the current theme behavior. Border
                    fields accept full CSS shorthand (e.g. <span class="font-mono">2px solid #89b4fa</span>).
                    Each state is independent.
                  </p>

                  <NumberUnitInput
                    label="Border Radius"
                    value={currentTheme.cellBorder.radius}
                    onChange={(v) => updateTheme({ cellBorder: { radius: v } })}
                    placeholder="inherit"
                    step={0.125}
                    min={0}
                  />

                  <InputField
                    label="Default"
                    value={currentTheme.cellBorder.default}
                    onChange={(v) => updateTheme({ cellBorder: { default: v } })}
                    placeholder="2px solid transparent"
                  />
                  <InputField
                    label="Hover"
                    value={currentTheme.cellBorder.hover}
                    onChange={(v) => updateTheme({ cellBorder: { hover: v } })}
                    placeholder="2px solid #cdd6f433"
                  />
                  <InputField
                    label="Select"
                    value={currentTheme.cellBorder.select}
                    onChange={(v) => updateTheme({ cellBorder: { select: v } })}
                    placeholder="2px solid #89b4fa99"
                  />
                  <InputField
                    label="Edit"
                    value={currentTheme.cellBorder.edit}
                    onChange={(v) => updateTheme({ cellBorder: { edit: v } })}
                    placeholder="2px solid #89b4fa"
                  />
                </div>
            </Section>

            {/* Advanced: Cell Shadows Section */}
            <Section id="advShadows" title="Advanced — Cell Shadows">
                <div class="space-y-3">
                  <p class="text-[10px] leading-relaxed text-secondary/60">
                    Leave a field blank to keep the current theme behavior. Box-shadow
                    fields accept full CSS shorthand (e.g. <span class="font-mono">0 0 5px #89b4fa</span>).
                    Each state is independent.
                  </p>

                  <InputField
                    label="Default"
                    value={currentTheme.cellShadow.default}
                    onChange={(v) => updateTheme({ cellShadow: { default: v } })}
                    placeholder="none"
                  />
                  <InputField
                    label="Hover"
                    value={currentTheme.cellShadow.hover}
                    onChange={(v) => updateTheme({ cellShadow: { hover: v } })}
                    placeholder="none"
                  />
                  <InputField
                    label="Select"
                    value={currentTheme.cellShadow.select}
                    onChange={(v) => updateTheme({ cellShadow: { select: v } })}
                    placeholder="none"
                  />
                  <InputField
                    label="Edit"
                    value={currentTheme.cellShadow.edit}
                    onChange={(v) => updateTheme({ cellShadow: { edit: v } })}
                    placeholder="0 0 5px #89b4fa"
                  />
                </div>
            </Section>

            {/* Markdown Section */}
            <Section id="markdown" title="Advanced — Markdown Cell">
              <p class="text-[10px] leading-relaxed text-secondary/60">
                <span class="font-mono">Color</span> sets the default for
                bordered elements and their dividers.{" "}
                <span class="font-mono">Border</span> applies to tables,
                images, videos and code blocks;{" "}
                <span class="font-mono">Divider</span> applies to table cell
                dividers. Enter a thickness
                (<span class="font-mono">3px</span>) or a full value
                (<span class="font-mono">3px dashed #89b4fa</span>). Blank
                keeps the current look.
              </p>
              <ToggleField
                label="Section Scoping"
                value={currentTheme.sectionScoping}
                onChange={() => updateTheme({ sectionScoping: !currentTheme.sectionScoping })}
              />
              <div class="space-y-3">
                <ColorInput
                  id="mdBorderColor"
                  label="Color"
                  value={currentTheme.mdBorder.color}
                  onChange={(v) => updateTheme({ mdBorder: { color: v } })}
                  placeholder="color-mix(in srgb, var(--secondary) 40%, transparent)"
                />
                <InputField
                  label="Border"
                  value={currentTheme.mdBorder.border}
                  onChange={(v) => updateTheme({ mdBorder: { border: v } })}
                  placeholder="2px"
                />
                <InputField
                  label="Divider"
                  value={currentTheme.mdBorder.divider}
                  onChange={(v) => updateTheme({ mdBorder: { divider: v } })}
                  placeholder="2px"
                />
                <InputField
                  label="Shadow"
                  value={currentTheme.mdShadow}
                  onChange={(v) => updateTheme({ mdShadow: v })}
                  placeholder="none"
                />
              </div>
            </Section>

            {/* Advanced: Code Block Section */}
            <Section id="advCodeBlock" title="Advanced — Code Cell">
                <div class="space-y-3">
                  <p class="text-[10px] leading-relaxed text-secondary/60">
                    Styles the code area of code cells. Leave a field blank to keep the
                    current styling. Border and shadow fields accept full CSS shorthand;
                    background accepts any CSS color or background value.
                  </p>

                  <div class="space-y-1">
                    <h4 class="text-[11px] font-bold text-secondary/70 uppercase">Outer Block</h4>
                    <InputField
                      label="Border"
                      value={currentTheme.codeBlock.outerBorder}
                      onChange={(v) => updateTheme({ codeBlock: { outerBorder: v } })}
                      placeholder="1px solid #89b4fa"
                    />
                    <NumberUnitInput
                      label="Border Radius"
                      value={currentTheme.codeBlock.outerRadius}
                      onChange={(v) => updateTheme({ codeBlock: { outerRadius: v } })}
                      placeholder="inherit"
                      step={0.125}
                      min={0}
                    />
                    <InputField
                      label="Background"
                      value={currentTheme.codeBlock.outerBackground}
                      onChange={(v) => updateTheme({ codeBlock: { outerBackground: v } })}
                      placeholder="transparent"
                    />
                    <InputField
                      label="Box Shadow"
                      value={currentTheme.codeBlock.outerShadow}
                      onChange={(v) => updateTheme({ codeBlock: { outerShadow: v } })}
                      placeholder="none"
                    />
                    <InputField
                      label="Margin"
                      value={currentTheme.codeBlock.outerMargin}
                      onChange={(v) => updateTheme({ codeBlock: { outerMargin: v } })}
                      placeholder="0"
                    />
                    <InputField
                      label="Padding"
                      value={currentTheme.codeBlock.outerPadding}
                      onChange={(v) => updateTheme({ codeBlock: { outerPadding: v } })}
                      placeholder="0.5rem"
                    />
                  </div>

                  <div class="space-y-1">
                    <h4 class="text-[11px] font-bold text-secondary/70 uppercase">Inner Code Block</h4>
                    <InputField
                      label="Border"
                      value={currentTheme.codeBlock.innerBorder}
                      onChange={(v) => updateTheme({ codeBlock: { innerBorder: v } })}
                      placeholder="1px solid #89b4fa"
                    />
                    <NumberUnitInput
                      label="Border Radius"
                      value={currentTheme.codeBlock.innerRadius}
                      onChange={(v) => updateTheme({ codeBlock: { innerRadius: v } })}
                      placeholder="inherit"
                      step={0.125}
                      min={0}
                    />
                    <InputField
                      label="Background"
                      value={currentTheme.codeBlock.innerBackground}
                      onChange={(v) => updateTheme({ codeBlock: { innerBackground: v } })}
                      placeholder="color-mix(in srgb, #89b4fa 2%, transparent)"
                    />
                    <InputField
                      label="Box Shadow"
                      value={currentTheme.codeBlock.innerShadow}
                      onChange={(v) => updateTheme({ codeBlock: { innerShadow: v } })}
                      placeholder="none"
                    />
                  </div>

                  <div class="space-y-1">
                    <h4 class="text-[11px] font-bold text-secondary/70 uppercase">Gutter</h4>
                    <ToggleField
                      label="Show Right Border"
                      value={currentTheme.codeBlock.gutterBorderRightOn}
                      onChange={() => updateTheme({ codeBlock: { gutterBorderRightOn: !currentTheme.codeBlock.gutterBorderRightOn } })}
                    />
                    <InputField
                      label="Right Border"
                      value={currentTheme.codeBlock.gutterBorderRight}
                      onChange={(v) => updateTheme({ codeBlock: { gutterBorderRight: v } })}
                      placeholder="1px solid var(--foreground)"
                    />
                    <NumberUnitInput
                      label="Border Radius"
                      value={currentTheme.codeBlock.gutterRadius}
                      onChange={(v) => updateTheme({ codeBlock: { gutterRadius: v } })}
                      placeholder="inherit"
                      step={0.125}
                      min={0}
                    />
                    <InputField
                      label="Background"
                      value={currentTheme.codeBlock.gutterBackground}
                      onChange={(v) => updateTheme({ codeBlock: { gutterBackground: v } })}
                      placeholder="var(--background)"
                    />
                  </div>
                </div>
            </Section>

            {/* Advanced: pynote_ui Components Section */}
            <Section id="advPynoteUi" title="Advanced — pynote_ui Components">
                <div class="space-y-3">
                  <p class="text-[10px] leading-relaxed text-secondary/60">
                    Sets the default border for embedded pynote_ui components
                    (Button, Input, Slider, etc). Enter exactly what you'd
                    pass to a component's <span class="font-mono">border</span>{" "}
                    argument: a preset (<span class="font-mono">primary</span>), a
                    color (<span class="font-mono">#89b4fa</span>), a full CSS
                    border (<span class="font-mono">3px dashed #89b4fa</span>) or{" "}
                    <span class="font-mono">none</span>.
                    Components given their own <span class="font-mono">border</span>{" "}
                    are unaffected.
                  </p>

                  <InputField
                    label="Default Border"
                    value={currentTheme.componentBorder}
                    onChange={(v) => updateTheme({ componentBorder: v })}
                    placeholder="2px solid foreground"
                  />
                </div>
            </Section>
    </>
  );
};

export default AdvancedSections;
