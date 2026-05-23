(() => {
  const STORAGE_KEY = "settings";
  const DEFAULTS = Object.freeze({
    modifiers: ["Alt"]
  });

  const ALLOWED_MODIFIERS = ["Alt", "Control", "Meta", "Shift"];

  function sanitize(raw) {
    const merged = { ...DEFAULTS, ...(raw || {}) };
    if (!Array.isArray(merged.modifiers)) {
      merged.modifiers = [...DEFAULTS.modifiers];
    } else {
      merged.modifiers = merged.modifiers.filter((m) => ALLOWED_MODIFIERS.includes(m));
    }
    return merged;
  }

  async function load() {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    return sanitize(result[STORAGE_KEY]);
  }

  async function save(settings) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: sanitize(settings) });
  }

  function onChange(callback) {
    const listener = (changes, area) => {
      if (area !== "sync") return;
      const change = changes[STORAGE_KEY];
      if (!change) return;
      callback(sanitize(change.newValue));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  globalThis.InspectSettings = {
    DEFAULTS,
    STORAGE_KEY,
    ALLOWED_MODIFIERS,
    load,
    save,
    onChange
  };
})();
