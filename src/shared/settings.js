(() => {
  const STORAGE_KEY = "settings";

  const DEFAULT_HOTKEY = Object.freeze({ code: "AltLeft", key: "Alt" });
  const DEFAULT_ACTION_KEY = Object.freeze({ code: "KeyC", key: "c" });

  const MODIFIER_KEYS = Object.freeze(["Alt", "Control", "Meta", "Shift"]);

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

  function sanitizeKeyBinding(raw, defaultVal) {
    if (!raw || typeof raw !== "object" || typeof raw.code !== "string") {
      return { ...defaultVal };
    }
    return {
      code: raw.code,
      key: typeof raw.key === "string" ? raw.key : raw.code
    };
  }

  function sanitize(raw) {
    const input = raw || {};
    return {
      hotkey: sanitizeKeyBinding(input.hotkey, DEFAULT_HOTKEY),
      actionKey: sanitizeKeyBinding(input.actionKey, DEFAULT_ACTION_KEY),
      infoFields: sanitizeInfoFields(input.infoFields)
    };
  }

  function getDefaults() {
    return Object.freeze({
      hotkey: { ...DEFAULT_HOTKEY },
      actionKey: { ...DEFAULT_ACTION_KEY },
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
    MODIFIER_KEYS,
    DEFAULT_HOTKEY,
    DEFAULT_ACTION_KEY,
    get DEFAULTS() { return getDefaults(); },
    get INFO_FIELD_DEFAULTS() { return computeInfoFieldDefaults(); },
    load,
    save,
    onChange
  };
})();
