(async () => {
  const { DEFAULTS, load, save, onChange, MODIFIER_KEYS, INFO_FIELD_DEFAULTS, DEFAULT_SNAPSHOT_OPTIONS } = globalThis.InspectSettings;
  const { GROUPS, REGISTRY } = globalThis.InfoFields;

  const hotkeyRecorder = document.getElementById('hotkey-recorder');
  const hotkeyDisplay = document.getElementById('hotkey-display');
  const actionKeyRecorder = document.getElementById('action-key-recorder');
  const actionKeyDisplay = document.getElementById('action-key-display');
  const statusEl = document.getElementById('status');
  const leadText = document.getElementById('lead-text');
  const infoFieldsContainer = document.getElementById('info-fields');
  const includeScreenshotCb = document.getElementById('include-screenshot');
  const resetButton = document.getElementById('reset-button');

  includeScreenshotCb.addEventListener('change', persist);

  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

  let currentSettings = null;

  /* ── Key display helpers ────────────────────────────── */

  function prettyKeyLabel(binding) {
    const { code, key } = binding;

    // Modifier keys
    if (key === 'Alt') return isMac ? 'Option ⌥' : 'Alt';
    if (key === 'Control') return isMac ? 'Control ⌃' : 'Ctrl';
    if (key === 'Meta') return isMac ? 'Cmd ⌘' : 'Win ⊞';
    if (key === 'Shift') return 'Shift ⇧';

    // Letter keys
    if (code.startsWith('Key')) return code.slice(3);
    // Digit keys
    if (code.startsWith('Digit')) return code.slice(5);
    // Numpad
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);

    // Special keys
    const SPECIAL = {
      Space: 'Space', Enter: 'Enter', Escape: 'Esc',
      Backspace: 'Backspace', Tab: 'Tab', CapsLock: 'CapsLock',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End',
      PageUp: 'PgUp', PageDown: 'PgDn',
      Backquote: '`', Minus: '−', Equal: '=',
      BracketLeft: '[', BracketRight: ']', Backslash: '\\',
      Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    };
    if (SPECIAL[code]) return SPECIAL[code];

    // F-keys
    if (/^F\d{1,2}$/.test(code)) return code;

    return key || code;
  }

  function shortKeyLabel(binding) {
    const { code, key } = binding;
    if (key === 'Alt') return isMac ? 'Option' : 'Alt';
    if (key === 'Control') return 'Ctrl';
    if (key === 'Meta') return isMac ? 'Cmd' : 'Meta';
    if (key === 'Shift') return 'Shift';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (key === ' ') return 'Space';
    return prettyKeyLabel(binding);
  }

  /* ── Key recorder ───────────────────────────────────── */

  function setupRecorder(recorderEl, displayEl, settingsKey) {
    let recording = false;

    function startRecording() {
      recording = true;
      recorderEl.classList.add('recording');
      displayEl.textContent = '…';
    }

    function stopRecording(binding) {
      recording = false;
      recorderEl.classList.remove('recording');
      if (binding) {
        displayEl.textContent = prettyKeyLabel(binding);
      }
    }

    recorderEl.addEventListener('click', () => {
      if (!recording) startRecording();
    });

    recorderEl.addEventListener('focus', () => {
      if (!recording) startRecording();
    });

    recorderEl.addEventListener('blur', () => {
      if (recording) {
        stopRecording(currentSettings ? currentSettings[settingsKey] : null);
      }
    });

    recorderEl.addEventListener('keydown', (e) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      const binding = { code: e.code, key: e.key };
      stopRecording(binding);

      if (currentSettings) {
        currentSettings[settingsKey] = binding;
        persist();
      }
    });
  }

  setupRecorder(hotkeyRecorder, hotkeyDisplay, 'hotkey');
  setupRecorder(actionKeyRecorder, actionKeyDisplay, 'actionKey');

  /* ── Info fields UI ─────────────────────────────────── */

  const infoFieldCheckboxes = [];
  buildInfoFieldsUI();

  function buildInfoFieldsUI() {
    const fieldsByGroup = new Map();
    for (const field of REGISTRY) {
      if (!fieldsByGroup.has(field.group)) fieldsByGroup.set(field.group, []);
      fieldsByGroup.get(field.group).push(field);
    }

    const frag = document.createDocumentFragment();
    for (const group of GROUPS) {
      const fields = fieldsByGroup.get(group.id);
      if (!fields || !fields.length) continue;

      const wrap = document.createElement('div');
      wrap.className = 'field-group';

      const heading = document.createElement('h3');
      heading.textContent = group.label;
      wrap.appendChild(heading);

      const list = document.createElement('div');
      list.className = 'field-list';
      for (const field of fields) {
        const label = document.createElement('label');
        label.className = 'field';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.field = field.id;
        cb.addEventListener('change', persist);
        const text = document.createElement('span');
        text.textContent = field.label;
        label.appendChild(cb);
        label.appendChild(text);
        list.appendChild(label);
        infoFieldCheckboxes.push(cb);
      }
      wrap.appendChild(list);
      frag.appendChild(wrap);
    }
    infoFieldsContainer.appendChild(frag);
  }

  /* ── Render ─────────────────────────────────────────── */

  function render(settings) {
    currentSettings = {
      hotkey: { ...settings.hotkey },
      actionKey: { ...settings.actionKey },
      infoFields: { ...settings.infoFields },
      snapshot: { ...settings.snapshot }
    };

    hotkeyDisplay.textContent = prettyKeyLabel(settings.hotkey);
    actionKeyDisplay.textContent = prettyKeyLabel(settings.actionKey);
    renderStatus(settings);
    renderLead(settings);

    const infoFields = settings.infoFields || INFO_FIELD_DEFAULTS;
    infoFieldCheckboxes.forEach((cb) => {
      cb.checked = !!infoFields[cb.dataset.field];
    });

    const snapshot = settings.snapshot || DEFAULT_SNAPSHOT_OPTIONS;
    includeScreenshotCb.checked = !!snapshot.includeScreenshot;
  }

  function renderStatus(settings) {
    const hotkeyLabel = shortKeyLabel(settings.hotkey);
    const actionLabel = shortKeyLabel(settings.actionKey);
    statusEl.classList.remove('warn');
    statusEl.innerHTML = `Active: Hold <strong>${escapeHtml(hotkeyLabel)}</strong>, press <strong>${escapeHtml(actionLabel)}</strong> to capture.`;
  }

  function renderLead(settings) {
    const hk = shortKeyLabel(settings.hotkey);
    const ak = shortKeyLabel(settings.actionKey);
    leadText.innerHTML =
      `Hold the configured hotkey and move your mouse over elements. ` +
      `The hovered element is highlighted and an info panel shows the tag, ` +
      `classes, dimensions, position, colors, and typography. Releasing the hotkey hides everything. ` +
      `Press <strong>${escapeHtml(ak)}</strong> while holding <strong>${escapeHtml(hk)}</strong> to copy a unique CSS selector ` +
      `(plus any visible text) to the clipboard — ` +
      `the highlight briefly flashes green to confirm. ` +
      `Press <strong>${escapeHtml(ak)}</strong> twice in quick succession to copy a full snapshot of the element ` +
      `(HTML, box, computed styles, and text).`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Persist ────────────────────────────────────────── */

  function readInfoFields() {
    const out = {};
    infoFieldCheckboxes.forEach((cb) => {
      out[cb.dataset.field] = cb.checked;
    });
    return out;
  }

  async function persist() {
    if (!currentSettings) return;
    const settings = {
      hotkey: currentSettings.hotkey,
      actionKey: currentSettings.actionKey,
      infoFields: readInfoFields(),
      snapshot: { includeScreenshot: includeScreenshotCb.checked }
    };
    await save(settings);
    renderStatus(settings);
    renderLead(settings);
  }

  /* ── Reset ──────────────────────────────────────────── */

  resetButton.addEventListener('click', async () => {
    const confirmed = window.confirm('Reset all DOMLens settings to defaults?');
    if (!confirmed) return;
    const defaults = {
      hotkey: { ...DEFAULTS.hotkey },
      actionKey: { ...DEFAULTS.actionKey },
      infoFields: { ...INFO_FIELD_DEFAULTS },
      snapshot: { ...DEFAULT_SNAPSHOT_OPTIONS }
    };
    await save(defaults);
    render(defaults);
  });

  /* ── Init ───────────────────────────────────────────── */

  onChange((settings) => render(settings));
  render(await load());
})();
