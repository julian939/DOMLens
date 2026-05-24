(async () => {
  const { DEFAULTS, load, save, onChange, ALLOWED_MODIFIERS, INFO_FIELD_DEFAULTS } = globalThis.InspectSettings;
  const { GROUPS, REGISTRY } = globalThis.InfoFields;

  const checkboxes = Array.from(document.querySelectorAll('input[data-modifier]'));
  const statusEl = document.getElementById('status');
  const infoFieldsContainer = document.getElementById('info-fields');
  const resetButton = document.getElementById('reset-button');

  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
  document.querySelectorAll('[data-platform-label]').forEach((el) => {
    const key = el.getAttribute('data-platform-label');
    if (key === 'Meta') {
      el.textContent = isMac ? '(Cmd)' : '(Windows key)';
    } else if (key === 'Alt') {
      el.textContent = isMac ? '(Option)' : '';
    }
  });

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
        cb.addEventListener('change', persistInfoFields);
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

  function render(settings) {
    const selected = new Set(settings.modifiers);
    checkboxes.forEach((cb) => {
      cb.checked = selected.has(cb.dataset.modifier);
    });
    renderStatus(settings.modifiers);

    const infoFields = settings.infoFields || INFO_FIELD_DEFAULTS;
    infoFieldCheckboxes.forEach((cb) => {
      cb.checked = !!infoFields[cb.dataset.field];
    });
  }

  function displayName(mod) {
    if (mod === 'Meta') return isMac ? 'Cmd' : 'Meta';
    if (mod === 'Alt') return isMac ? 'Option' : 'Alt';
    if (mod === 'Control') return 'Ctrl';
    return mod;
  }

  function renderStatus(modifiers) {
    if (!modifiers.length) {
      statusEl.classList.add('warn');
      statusEl.innerHTML = 'Select at least one key, otherwise the extension is disabled. <br>Active: <strong>disabled</strong>';
      return;
    }
    statusEl.classList.remove('warn');
    const label = modifiers.map(displayName).join(' + ');
    statusEl.innerHTML = `Active: Hold <strong>${label}</strong>.`;
  }

  function readModifiers() {
    return checkboxes
      .filter((cb) => cb.checked)
      .map((cb) => cb.dataset.modifier)
      .filter((m) => ALLOWED_MODIFIERS.includes(m));
  }

  function readInfoFields() {
    const out = {};
    infoFieldCheckboxes.forEach((cb) => {
      out[cb.dataset.field] = cb.checked;
    });
    return out;
  }

  async function persistModifiers() {
    const modifiers = readModifiers();
    await save({ modifiers, infoFields: readInfoFields() });
    renderStatus(modifiers);
  }

  async function persistInfoFields() {
    await save({ modifiers: readModifiers(), infoFields: readInfoFields() });
  }

  checkboxes.forEach((cb) => cb.addEventListener('change', persistModifiers));

  resetButton.addEventListener('click', async () => {
    const confirmed = window.confirm('Reset all DOMLens settings to defaults?');
    if (!confirmed) return;
    const defaults = {
      modifiers: [...DEFAULTS.modifiers],
      infoFields: { ...INFO_FIELD_DEFAULTS }
    };
    await save(defaults);
    render(defaults);
  });

  onChange((settings) => render(settings));

  render(await load());
})();
