"""
PyNote UI - Interactive UI components for PyNote notebooks.

This package provides reactive UI components that can be embedded in notebook cells,
allowing you to create interactive controls, forms, and visualizations that update
in real-time as users interact with them.

Main Components:
    - Form: Container for form inputs with deferred updates until submission
    - Input, Textarea: Text input fields
    - Select: Dropdown selection
    - Slider: Numeric range slider
    - Button: Clickable buttons with callbacks
    - Toggle, Checkbox: Boolean switches
    - Text: Display dynamic text content
    - Group: Layout container for arranging components

Plotting Modules:
    - oplot: Observable Plot for declarative charts
    - uplot: High-performance time-series plots
    - fplot: Frappe Charts for pie/donut/heatmap

Utilities:
    - display(): Show UI elements at any point during execution
    - print_md(): Render markdown with full styling
"""

from .core import (
    UIElement, StateManager, handle_interaction, set_current_cell, clear_cell, 
    register_comm_target, display, print_md,
    MARKER_UI_START, MARKER_UI_END, 
    MARKER_MD_STYLED_START, MARKER_MD_STYLED_END,
    MARKER_MD_PLAIN_START, MARKER_MD_PLAIN_END
)
from .elements import Slider, Text, Group, Button, Select, Input, Textarea, Toggle, Checkbox, Form
from . import oplot, uplot, fplot

__all__ = [
    "UIElement", "StateManager", "handle_interaction", 
    "Slider", "Text", "Group", "Button", "Select", "Input", "Textarea", "Toggle", "Checkbox", "Form",
    "oplot", "uplot", "fplot",
    "set_current_cell", "clear_cell", "register_comm_target",
    "display", "print_md",
    "MARKER_UI_START", "MARKER_UI_END",
    "MARKER_MD_STYLED_START", "MARKER_MD_STYLED_END",
    "MARKER_MD_PLAIN_START", "MARKER_MD_PLAIN_END"
]