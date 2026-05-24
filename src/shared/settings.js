(() => {
  const STORAGE_KEY = "settings";
  const ALLOWED_MODIFIERS = ["Alt", "Control", "Meta", "Shift"];
  const DEFAULT_MODIFIERS = ["Alt"];

  let cachedInfoFieldDefaults = null;

  function computeInfoFieldDefaults() {
    if (cachedInfoFieldDefaults) return cachedInfoFieldDefaults;
    const registry = (globalThis.InfoFields && globalThis.InfoFields.REGISTRY) || [];
    const out = {};
    for (const field of registry) {
      out[field.id] = !!field.defaultEnabled;
    }
    cachedInfoFieldDefaults = Object.freeze(out);
    return cachedInfoFieldDefaults;
  }

  function sanitizeInfoFields(raw) {
    const defaults = computeInfoFieldDefaults();
    const out = {};
    const source = (raw && typeof raw === "object") ? raw : {};
    for (const key of Object.keys(defaults)) {
      const value = source[key];
      out[key] = typeof value === "boolean" ? value : defaults[key];
    }
    return out;
  }

  function sanitize(raw) {
    const input = raw || {};
    const merged = {
      modifiers: Array.isArray(input.modifiers)
        ? input.modifiers.filter((m) => ALLOWED_MODIFIERS.includes(m))
        : [...DEFAULT_MODIFIERS],
      infoFields: sanitizeInfoFields(input.infoFields)
    };
    return merged;
  }

  function getDefaults() {
    return Object.freeze({
      modifiers: [...DEFAULT_MODIFIERS],
      infoFields: computeInfoFieldDefaults()
    });
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
    STORAGE_KEY,
    ALLOWED_MODIFIERS,
    get DEFAULTS() { return getDefaults(); },
    get INFO_FIELD_DEFAULTS() { return computeInfoFieldDefaults(); },
    load,
    save,
    onChange
  };
})();
