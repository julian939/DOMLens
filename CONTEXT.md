# DOMLens

A Chrome extension that lets users hold a hotkey and hover any element on a webpage to see its tag, dimensions, colors, and fonts. Pressing C while the hotkey is held copies element details to the clipboard.

## Language

**Inspect Mode**:
The active state entered while the [[hotkey]] is held — the extension tracks the element under the cursor, draws [[highlight-layers]], and shows the [[info-panel]]. Exits immediately on hotkey release, tab switch, or window blur.
_Avoid_: Peek mode, hover mode, inspection state

**Info Panel**:
The floating, read-only overlay that appears next to the cursor while inspecting, showing the element's selector followed by the user's enabled [[info-fields]]. Non-interactive (`pointer-events: none`).
_Avoid_: Menu, popup, tooltip

**Info Fields**:
The individually toggleable rows shown in the [[info-panel]] below the selector — each one a labelled property of the inspected element (e.g. Dimensions, Margin, Color, Font size). Configured per-user in the Options page; the selector row itself is not an Info Field and is always shown.
_Avoid_: Rows, toggles, panel items

**Highlight Layers**:
The four semi-transparent overlays drawn over the hovered element while in [[inspect-mode]], visualizing the CSS box model: margin (orange), border (yellow), padding (green), content (blue with outline). Margin/border/padding layers are only drawn when the element has non-zero values for them.
_Avoid_: Box model overlay, highlight, outline

**Element Snippet**:
The single-line, HTML-like representation of an element produced by a single C press while inspecting — includes the tag, curated attributes (id, data-testid, aria-label, etc.), and optionally a parent breadcrumb. Optimized for pasting into a chat or prompt.
_Avoid_: Quick copy, short copy

**Element Snapshot**:
The full Markdown document produced by a double C press while inspecting — contains selector, box dimensions, outerHTML, computed styles, and visible text under labeled sections.
_Avoid_: Full copy, dump, export

## Example dialogue

> **Dev A:** A user reported that entering Inspect Mode on a page with a fixed header makes the Highlight Layers misalign by the scroll offset.
>
> **Dev B:** Only the layers, or the Info Panel too?
>
> **Dev A:** Just the layers. The Info Panel still anchors correctly next to the cursor, and all the Info Fields inside it show the right values for the hovered element.
>
> **Dev B:** So the measurements are correct, only the four overlay rectangles draw at the wrong coordinates. That points at the box-model rect calculation, not the inspection logic.
>
> **Dev A:** Right. And here's the weird part — when they press C to grab an Element Snippet, the copied selector matches the element they actually intended to hover, not the one under the misaligned layers.
>
> **Dev B:** That confirms it. The hover target is right; only the visual layer is offset. Does the double-press Element Snapshot have the same selector?
>
> **Dev A:** Yes, Snippet and Snapshot agree. So Inspect Mode is tracking the correct element, the Info Panel reflects it, but the Highlight Layers are painted in the wrong place.
