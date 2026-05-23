(async () => {
  const { load, save, onChange, ALLOWED_MODIFIERS } = globalThis.InspectSettings;
  const checkboxes = Array.from(document.querySelectorAll('input[data-modifier]'));
  const statusEl = document.getElementById('status');

  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
  document.querySelectorAll('[data-platform-label]').forEach((el) => {
    const key = el.getAttribute('data-platform-label');
    if (key === 'Meta') {
      el.textContent = isMac ? '(Cmd)' : '(Windows key)';
    } else if (key === 'Alt') {
      el.textContent = isMac ? '(Option)' : '';
    }
  });

  function render(settings) {
    const selected = new Set(settings.modifiers);
    checkboxes.forEach((cb) => {
      cb.checked = selected.has(cb.dataset.modifier);
    });
    renderStatus(settings.modifiers);
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

  async function persist() {
    const modifiers = checkboxes
      .filter((cb) => cb.checked)
      .map((cb) => cb.dataset.modifier)
      .filter((m) => ALLOWED_MODIFIERS.includes(m));
    await save({ modifiers });
    renderStatus(modifiers);
  }

  checkboxes.forEach((cb) => cb.addEventListener('change', persist));

  onChange((settings) => render(settings));

  render(await load());
})();
