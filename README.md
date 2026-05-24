# DOMLens

A zero-dependency Chrome extension (Manifest V3) that lets you hold a hotkey, hover any element, and instantly see its tag name, dimensions, colors, fonts, and layout properties in a floating info panel. Press an action key to copy element data — single-tap for a compact snippet, double-tap for a full snapshot.

Designed for developers, QA engineers, and **AI agents** that need precise, structured element descriptions to generate selectors, write automation scripts, or debug styling.

---

## Features

### Hold-to-Inspect

Hold your configured hotkey (default: **Left Alt**) and move the mouse. The overlay follows your cursor, showing an info panel with the hovered element's properties.

### 20 Configurable Info Fields

The panel shows properties organized in four groups. Every field can be toggled on/off in the options page:

| Group | Fields |
|---|---|
| **Box** | Dimensions, Coordinates, Margin, Padding, Border, Border-radius |
| **Layout** | Display, Position, Z-index, Overflow, Opacity, Cursor |
| **Colors** | Color (with swatch), Background (with swatch), Box-shadow |
| **Typography** | Font, Size, Weight, Line-height, Letter-spacing, Text-align |

7 fields enabled by default; 13 more can be opted in.

### CSS Box Model Visualization

Four semi-transparent highlight layers draw the element's margin (orange), border (yellow), padding (green), and content (blue) — only for non-zero values. Gives instant insight into spacing.

### Double Action Key — Optimized for AI Agents

Press the action key (default: **C**) while holding the hotkey. It has two modes:

1. **Single tap** — copies an **Element Snippet**, a compact, single-line HTML representation:
   ```
   <button data-testid="submit-btn" class="btn-primary">Submit form</button>
   ```
   Attributes are curated for AI relevance: `id`, `data-testid`, `data-cy`, `aria-label`, `role`, `name`, `type`, `alt`, `placeholder`, `href`, and semantic class names. Utility classes (Tailwind, CSS modules, Emotion hashes) are stripped. If the element is ambiguous, a parent breadcrumb is appended.

2. **Double tap** (within 250 ms) — copies an **Element Snapshot**, a full Markdown document:
   ```markdown
   # DOMLens — Element snapshot

   ## Selector
   div.card > button#submit-btn

   ## Box
   width: 120px  height: 40px  x: 300  y: 200

   ## HTML
   <button id="submit-btn" class="btn-primary" data-testid="submit-btn">Submit form</button>

   ## Computed styles
   display: flex
   align-items: center
   justify-content: center
   background-color: rgb(59, 130, 246)
   color: #fff
   font-size: 14px
   font-weight: 600

   ## Text
   Submit form
   ```

**Why this is built for AI agents:**

- Snippets strip non-semantic noise (Tailwind utility classes, CSS module hashes) so LLMs receive clean, meaningful HTML.
- Snapshot output is structured Markdown — the format LLMs parse most reliably — with sections for selector, box, HTML, computed styles, and text.
- The curated attribute list (`data-testid`, `aria-label`, `role`, etc.) mirrors the attributes AI agents need to generate robust selectors or test code.
- An AI agent can implement this exact double-tap pattern (single press → snippet, second press within 250ms → snapshot) without reverse engineering; the state machine is in `src/content/content.js:101-120`.

### Element Snippet Details

```
<tag id="..." class="..." data-testid="..." aria-label="...">visible text</tag>  ← in parent > breadcrumb
```

- Curated attributes: `id`, `data-testid`, `data-test-id`, `data-test`, `data-cy`, `data-component`, `role`, `aria-label`, `name`, `type`, `alt`, `placeholder`, `href`
- Utility classes filtered: Tailwind (`text-`, `bg-`, `p-`, `m-`, `flex`, `grid`, etc.), CSS modules (`sc-*`, `_*`), Emotion (`css-*`)
- Text truncated at 120 characters (word-boundary aware)
- Parent breadcrumb appended when element lacks identifying attributes or meaningful text

### Element Snapshot Details

Full Markdown document with these sections:
- **Selector** — unique CSS selector (prefers `#id`, falls back to tag + `.class`, then `:nth-of-type` chain)
- **Box** — `width`, `height`, `x`, `y` from `getBoundingClientRect()`
- **HTML** — full `outerHTML`
- **Computed styles** — 50+ curated CSS properties (display, position, box model, colors, typography, flex/grid, transforms) with defaults like `none`, `auto`, `0px` omitted
- **Text** — visible `innerText`

### Zero Dependencies

No build step. No npm. No bundlers. Vanilla ES2020+ JavaScript, Shadow DOM for overlay isolation, `chrome.storage.sync` for settings. The extension is loaded directly from source files.

---

## How It Works

```
manifest.json
  └─ content_scripts (all frames, document_start, ISOLATED world)
       ├─ src/shared/settings.js       Settings load/save via chrome.storage.sync
       ├─ src/shared/info-fields.js    Registry of 20 toggleable info fields
       ├─ src/shared/element-copy.js   Snippet + Snapshot builders
       ├─ src/content/overlay.js       Shadow DOM overlay (highlights, panel, toast)
       └─ src/content/content.js       State machine, hotkey detection, hover loop
  └─ background.js                     Opens options page on icon click
  └─ options_ui (open_in_tab: true)
       └─ src/options/options.html/js/css  Key recorders + field toggles
```

### Hotkey State Machine

The core logic in `src/content/content.js` implements a deterministic state machine:

1. **Inactive** — no overlay, no listeners beyond key capture
2. **Active** — hotkey is held → `mousemove` listener runs a `requestAnimationFrame`-throttled render loop
3. **Copy pending** — action key pressed once → wait 250ms
4. **Snippet copied** — single tap → `ElementCopy.buildSnippet()` → clipboard
5. **Snapshot copied** — double tap (second press within 250ms) → `ElementCopy.buildSnapshot()` → clipboard

State resets on hotkey release, window blur, or tab hide.

### Overlay Architecture

The overlay uses a `closed` Shadow DOM host attached to `document.documentElement`. All elements have `pointer-events: none` so they never intercept interactions. Three visual layers:
- **Highlight layers** — four absolutely-positioned divs for margin/border/padding/content
- **Info panel** — floating card clamped to viewport bounds
- **Toast** — green pill that fades after 1.5s

### Clipboard Strategy

Primary: `navigator.clipboard.writeText()`. Fallback: `document.execCommand('copy')` via a hidden textarea. This covers both secure contexts and iframes.

---

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `domlens/` directory
5. Pin DOMLens to the toolbar for quick access to settings

### From Chrome Web Store

[DOMLens on Chrome Web Store](https://chromewebstore.google.com/detail/domlens/...) *(coming soon)*

---

## Usage

1. Click the DOMLens toolbar icon to open the options page
2. Configure your **Hotkey** (default: Left Alt) and **Action Key** (default: C)
3. Toggle which info fields you want to see
4. Visit any webpage and hold the hotkey
5. Hover elements to inspect them
6. Press the action key:
   - **Single press** → element snippet copied to clipboard
   - **Double press** (within 250ms) → full element snapshot copied to clipboard

---

## Options Page

The options page (`src/options/options.html`) uses a medieval/parchment theme and includes:

- **Key Recorder** for the hotkey — click, press the key you want
- **Key Recorder** for the action key — same interaction
- **Info Fields** — checkboxes grouped by category, persisted immediately
- **Reset** button — restores all defaults

Supported hotkeys: Left Alt, Ctrl, Meta (Cmd), Shift, or any letter/number key. The hotkey must be held continuously; the action key is pressed while holding it.

---

## Architecture Reference for AI Agents

If you are building a similar tool or an AI coding agent that needs to interact with DOMLens output, these are the exact interfaces:

### Element Snippet (`buildSnippet`)

```js
// Returns a single-line string like:
// <button id="submit" data-testid="submit" class="btn">Submit</button>
// Input: DOM Element node
// Output: Compact HTML representation with curated attrs + text
```

### Element Snapshot (`buildSnapshot`)

```js
// Returns a multi-line Markdown string with sections:
// # DOMLens — Element snapshot
// ## Selector
// ## Box
// ## HTML
// ## Computed styles
// ## Text (omitted if empty)
// Input: DOM Element node
// Output: Structured Markdown document
```

### Double-Tap State Machine

```
actionKey pressed:
  if pendingCopyTimeout exists:
    → clear timeout → buildSnapshot(el) → write clipboard → flash + "All info copied!"
  else:
    → set timeout (250ms) → buildSnippet(el) → write clipboard → flash + "Copied!"
```

Implement this pattern when you need two tiers of data from a single input: compact on first interaction, detailed on second.

---

## Build & Package

```bash
./build.sh
```

Creates `domlens.zip` with all required files for Chrome Web Store submission. The zip includes:
- `manifest.json`, `src/shared/settings.js`, `src/content/content.js`
- `src/shared/info-fields.js`, `src/shared/element-copy.js`, `src/content/overlay.js`
- `src/options/options.html`, `options.js`, `options.css`
- `icons/icon16.png`–`icon128.png`, `LICENSE`

---

## License

MIT — see [LICENSE](LICENSE).

---

## Development Notes

- All scripts use the IIFE-on-globalThis pattern: `globalThis.InspectSettings = { ... }`
- Content scripts load in dependency order: `settings.js` → `info-fields.js` → `element-copy.js` → `overlay.js` → `content.js`
- No TypeScript, no bundlers, no build step — edit and reload
- Tested on Chrome 88+ (Manifest V3 minimum)
