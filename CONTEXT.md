# DOMLens

A Chrome extension that lets users hold a hotkey and hover any element on a webpage to see its tag, dimensions, colors, and fonts. Pressing the Action Key while the hotkey is held copies element details to the clipboard.

## Language

**Inspect Mode**:
The active state entered while the [[hotkey]] is held — the extension tracks the element under the cursor, draws [[highlight-layers]], and shows the [[info-panel]]. Exits immediately on hotkey release, tab switch, window blur, or on a successful commit of an [[element-snippet]] or [[element-snapshot]] — the latter engages the [[capture-latch]], which blocks re-entry until the [[hotkey]] is released and pressed again.
_Avoid_: Peek mode, hover mode, inspection state

**Action Key**:
The key pressed in combination with the [[hotkey]] while in [[inspect-mode]] to capture the current element. A short tap (press and release within the [[hold-gesture]] threshold) produces an [[element-snippet]]; a [[hold-gesture]] produces an [[element-snapshot]].
_Avoid_: Capture key, trigger key, copy key

**Hold Gesture**:
Pressing and holding the [[action-key]] through three named zones: **Snippet zone** (0–300 ms) — releasing here fires an [[element-snippet]]; **Dead Zone** (300–1300 ms) — releasing here cancels silently with no output; **Snapshot zone** (≥ 1300 ms) — crossing the 1300 ms boundary commits an [[element-snapshot]] and starts the [[capture-scan]]. The target element is locked at key-down (cursor movement during the hold does not retarget), and the [[capture-ring]] advances through its states as the hold progresses. Releasing the [[action-key]] before 300 ms, releasing the [[hotkey]], pressing `Esc`, switching tabs, or window blur cancels the hold without copying.
_Avoid_: Long-press, held action, pressing, double-tap

**Dead Zone**:
The middle zone of the [[hold-gesture]], spanning 300–1300 ms. Neither an [[element-snippet]] nor an [[element-snapshot]] is possible during this period. Releasing the [[action-key]] in the Dead Zone cancels the gesture silently — no output is produced and no [[capture-toast]] appears. The [[capture-ring]] is in its `charging` state for the duration of the Dead Zone, giving the user visible confirmation that the gesture is still abortable.
_Avoid_: Cancel zone, middle zone, limbo

**Info Panel**:
The floating, read-only overlay that appears next to the cursor while inspecting, showing the element's selector followed by the user's enabled [[info-fields]]. Non-interactive (`pointer-events: none`).
_Avoid_: Menu, popup, tooltip

**Info Fields**:
The individually toggleable rows shown in the [[info-panel]] below the selector — each one a labelled property of the inspected element (e.g. Dimensions, Margin, Color, Font size). Configured per-user in the Options page; the selector row itself is not an Info Field and is always shown.
_Avoid_: Rows, toggles, panel items

**Highlight Layers**:
The four semi-transparent overlays drawn over the hovered element while in [[inspect-mode]], visualizing the CSS box model: margin (orange), border (yellow), padding (green), content (blue with outline). Margin/border/padding layers are only drawn when the element has non-zero values for them. Hidden the moment the [[action-key]] is pressed — capture feedback is owned entirely by the [[capture-ring]] from key-down through commit. The layers reappear only when [[inspect-mode]] re-enters after the [[capture-latch]] clears.
_Avoid_: Box model overlay, highlight, outline

**Element Snippet**:
The single-line, HTML-like representation of an element produced by a tap of the [[action-key]] while inspecting — includes the tag, curated attributes (id, data-testid, aria-label, etc.), and optionally a parent breadcrumb. Confirmed by the [[capture-ring]] popping in the full Gemini gradient (static — no rotation) and a "Copied!" [[capture-toast]] at the cursor. Optimized for pasting into a chat or prompt.
_Avoid_: Quick copy, short copy

**Element Snapshot**:
The full JSON document produced by a [[hold-gesture]] of the [[action-key]] while inspecting — contains everything an AI agent needs to visually reconstruct the element: selector, box dimensions, outerHTML, full computed styles (filtered against UA defaults, recursively for all descendants, including `::before` / `::after`), referenced asset metadata (fonts, image URLs, CSS custom properties), and a base64-encoded PNG screenshot of the element cropped from the visible tab. Confirmed by a [[capture-scan]] on the [[capture-ring]] and a "Snapshot Copied!" [[capture-toast]] at the cursor at the moment of commit.
_Avoid_: Full copy, dump, export, Markdown snapshot

**Capture Ring**:
A dedicated shadow-DOM overlay drawn at the captured element's outer border, separate from the [[highlight-layers]], that is the canonical visible body of all capture feedback. Four observable states: `idle` (invisible), `active` (the full Gemini conic gradient `#1E40AF → #3B82F6 → #7C3AED → #DB2777 → #F59E0B → #1E40AF` at a fixed angle — static, no rotation — 4 px thick, with a multi-colour outer glow) while the [[action-key]] is held in the Snippet zone (0–300 ms), `charging` (the same gradient now rotating as a build-up) while the [[action-key]] is held in the [[dead-zone]] (300–1300 ms), and `scanning` (the rotating [[capture-scan]]) once a Snapshot has committed at 1300 ms. Releasing in the Snippet zone holds the static gradient ring on screen for the shared 1200 ms feedback window, then fades it together with the [[capture-toast]]. The [[highlight-layers]] are hidden the moment the [[action-key]] is pressed and stay hidden through capture — the ring is the sole visual anchor on the captured element.
_Avoid_: Capture layer, capture overlay, feedback layer, capture pulse

**Capture Scan**:
The rotating multi-colour border animation that the [[capture-ring]] transitions into the moment a [[hold-gesture]] crosses the threshold — the Gemini-style conic gradient (`#1E40AF → #3B82F6 → #7C3AED → #DB2777 → #F59E0B → #1E40AF`) sweeps once around the element's border over ~3 s with a stronger outer glow, then fades. Same ring, same position, same border thickness — only the gradient swaps in.
_Avoid_: Snapshot scan, ring scan, sweep

**Capture Latch**:
A one-shot block engaged at the moment an [[element-snippet]] or [[element-snapshot]] commits. While the latch is engaged, [[inspect-mode]] cannot re-enter even if the [[hotkey]] is still held — the user must release the [[hotkey]] and press it again. The latch is released by any observed `keyup` on the [[hotkey]] (including the implicit release on tab switch, window blur, or `Esc`). Cancels (Dead Zone release of the [[action-key]], `Esc` during a [[hold-gesture]], tab switch, blur) do **not** engage the latch — only successful commits do. The [[capture-ring]] and [[capture-toast]] animations continue to play during the latched window as pure feedback; they are not gated by the latch.
_Avoid_: Cooldown, lockout, capture freeze

**Capture Toast**:
The pill confirmation rendered centered below the captured element after a capture — dark background with a Gemini-gradient border. Falls back to centered above the element only when the below position would leave the viewport. Reads "Copied!" for an [[element-snippet]] or "Snapshot Copied!" for an [[element-snapshot]] (both appear synchronously at the moment of commit, concurrent with the start of their respective ring animations). Position is derived from the captured element's bounding rect, not the cursor.
_Avoid_: Confirmation toast, copy popup

## Example dialogue

> **Dev A:** A user reported that entering Inspect Mode on a page with a fixed header makes the Highlight Layers misalign by the scroll offset.
>
> **Dev B:** Only the layers, or the Info Panel too?
>
> **Dev A:** Just the layers. The Info Panel still anchors correctly next to the cursor, and all the Info Fields inside it show the right values for the hovered element.
>
> **Dev B:** So the measurements are correct, only the four overlay rectangles draw at the wrong coordinates. That points at the box-model rect calculation, not the inspection logic.
>
> **Dev A:** Right. And here's the weird part — when they press the Action Key to grab an Element Snippet, the copied selector matches the element they actually intended to hover, not the one under the misaligned layers.
>
> **Dev B:** That confirms it. The hover target is right; only the visual layer is offset. Does the double-press Element Snapshot have the same selector?
>
> **Dev A:** Yes, Snippet and Snapshot agree. So Inspect Mode is tracking the correct element, the Info Panel reflects it, but the Highlight Layers are painted in the wrong place.
