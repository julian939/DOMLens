/*
 * Info Panel — the content of the floating overlay shown next to the cursor
 * while inspecting (CONTEXT.md → Info Panel). This module owns the *what*: it
 * turns an element + its computed style + the user's settings into the panel's
 * HTML string. The *container* (mounting, positioning, show/hide) stays in
 * overlay.js; the *when* (debounce, cache, render loop) stays in content.js.
 *
 * htmlFor is pure — element + style + settings in, HTML string out — so it can
 * be tested as a string without a Shadow DOM, the same way Element Copy's
 * snippet builder is tested.
 */
(function () {
  var escapeHtml = (typeof module !== 'undefined' && module.exports)
    ? require('./escape-html.js').escapeHtml
    : globalThis.EscapeHtml.escapeHtml;

  function safeGetValue(field, el, cs) {
    try {
      return field.getValue(el, cs);
    } catch (_) {
      return null;
    }
  }

  function renderSwatch(color) {
    return `<span class="swatch" style="background:${color}"></span>`;
  }

  function renderFieldRow(label, value) {
    if (!value) return '';
    const text = value.text == null ? '' : String(value.text);
    if (!text) return '';
    if (value.kind === 'content') {
      return `<div class="content-row"><span class="content-label">${escapeHtml(label)}</span><div class="content-value">${escapeHtml(text)}</div></div>`;
    }
    let valueHtml;
    if (value.kind === 'color') {
      valueHtml = renderSwatch(value.color) + escapeHtml(text);
    } else {
      valueHtml = escapeHtml(text);
    }
    return `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="value">${valueHtml}</span></div>`;
  }

  function htmlFor(el, cs, settings) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const classes = el.classList.length ? '.' + Array.from(el.classList).join('.') : '';

    const selectorHtml = `
      <div class="selector">
        <span class="sel-tag">${escapeHtml(tag)}</span>${
          id ? `<span class="sel-id">${escapeHtml(id)}</span>` : ''
        }${
          classes ? `<span class="sel-class">${escapeHtml(classes)}</span>` : ''
        }
      </div>
    `;

    const enabled = (settings && settings.infoFields) || {};
    const registry = (globalThis.InfoFields && globalThis.InfoFields.REGISTRY) || [];
    const groups = (globalThis.InfoFields && globalThis.InfoFields.GROUPS) || [];

    let textHtml = '';
    const textField = registry.find((f) => f.id === 'text');
    if (textField && enabled.text) {
      const textResult = safeGetValue(textField, el, cs);
      if (textResult) {
        textHtml = renderFieldRow(textField.label, textResult);
      }
    }

    const rowsByGroup = new Map();
    for (const field of registry) {
      if (field.id === 'text') continue;
      if (!enabled[field.id]) continue;
      const result = safeGetValue(field, el, cs);
      if (!result) continue;
      const rowHtml = renderFieldRow(field.label, result);
      if (!rowHtml) continue;
      if (!rowsByGroup.has(field.group)) rowsByGroup.set(field.group, []);
      rowsByGroup.get(field.group).push(rowHtml);
    }

    let firstGroup = true;
    let groupsHtml = '';
    if (textHtml) firstGroup = false;
    for (const group of groups) {
      const rows = rowsByGroup.get(group.id);
      if (!rows || !rows.length) continue;
      const cls = firstGroup ? 'fields' : 'fields group';
      groupsHtml += `<div class="${cls}">${rows.join('')}</div>`;
      firstGroup = false;
    }

    const textBlock = textHtml ? `<div class="fields">${textHtml}</div>` : '';
    return selectorHtml + textBlock + groupsHtml;
  }

  var api = { htmlFor: htmlFor };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.InfoPanel = api;
  }
})();
