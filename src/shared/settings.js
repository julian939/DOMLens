(() => {
  const STORAGE_KEY = "settings";

  const INFO_FIELD_DEFAULTS = Object.freeze({
    dimensions: true,
    coordinates: true,
    margin: false,
    padding: false,
    border: false,
    borderRadius: false,
    display: false,
    positionType: false,
    zIndex: false,
    overflow: false,
    opacity: false,
    cursor: false,
    color: true,
    background: true,
    boxShadow: false,
    font: true,
    fontSize: true,
    fontWeight: true,
    lineHeight: false,
    letterSpacing: false,
    textAlign: false
  });

  const DEFAULTS = Object.freeze({
    modifiers: ["Alt"],
    infoFields: INFO_FIELD_DEFAULTS
  });

  const ALLOWED_MODIFIERS = ["Alt", "Control", "Meta", "Shift"];

  function sanitizeInfoFields(raw) {
    const out = {};
    const source = (raw && typeof raw === "object") ? raw : {};
    for (const key of Object.keys(INFO_FIELD_DEFAULTS)) {
      const value = source[key];
      out[key] = typeof value === "boolean" ? value : INFO_FIELD_DEFAULTS[key];
    }
    return out;
  }

  function sanitize(raw) {
    const merged = { ...DEFAULTS, ...(raw || {}) };
    if (!Array.isArray(merged.modifiers)) {
      merged.modifiers = [...DEFAULTS.modifiers];
    } else {
      merged.modifiers = merged.modifiers.filter((m) => ALLOWED_MODIFIERS.includes(m));
    }
    merged.infoFields = sanitizeInfoFields(merged.infoFields);
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
    INFO_FIELD_DEFAULTS,
    STORAGE_KEY,
    ALLOWED_MODIFIERS,
    load,
    save,
    onChange
  };
})();
