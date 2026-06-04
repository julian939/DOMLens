/*
 * Hotkey Matcher.
 *
 * Owns the fiddly keyboard-matching that content.js used to inline: tracking
 * which non-modifier keys are down, and answering — given a KeyboardEvent —
 * "is the Hotkey held?", "is this the Action Key?", "is this a page-scroll
 * key?". Driveable with synthetic KeyboardEvents, so the matching is testable.
 *
 * One thing it cannot do, by platform limitation: tell whether a *modifier*
 * Hotkey (Alt/Ctrl/Meta/Shift) is held without an event in hand. isHeldNow()
 * names that gap honestly — it falls back to the host's active state, supplied
 * via the isActive collaborator. See ADR 0004.
 */
(function () {
  var MODIFIER_EVENT_MAP = {
    Alt: function (e) { return e.altKey; },
    Control: function (e) { return e.ctrlKey; },
    Meta: function (e) { return e.metaKey; },
    Shift: function (e) { return e.shiftKey; }
  };

  function isModifierKey(key) {
    return key in MODIFIER_EVENT_MAP;
  }

  function isPageScrollKey(event) {
    var key = event.key;
    if (key === ' ' || key === 'Spacebar') return true;
    if (key === 'PageUp' || key === 'PageDown') return true;
    if (key === 'Home' || key === 'End') return true;
    return false;
  }

  function createMatcher(opts) {
    opts = opts || {};
    var getSettings = opts.getSettings || function () { return null; };
    var isActive = opts.isActive || function () { return false; };
    var pressed = new Set();

    function hotkey() {
      var s = getSettings();
      return s && s.hotkey;
    }

    function trackKeyDown(event) {
      if (!isModifierKey(event.key)) pressed.add(event.code);
    }

    function trackKeyUp(event) {
      if (!isModifierKey(event.key)) pressed.delete(event.code);
    }

    function clear() {
      pressed.clear();
    }

    /* Is the Hotkey held, judged from this event? Modifier hotkeys read the
       event's modifier flags; regular keys read the tracked set. */
    function isHeld(event) {
      var hk = hotkey();
      if (!hk) return false;
      if (isModifierKey(hk.key)) return MODIFIER_EVENT_MAP[hk.key](event);
      return pressed.has(hk.code);
    }

    /* Is the Hotkey held *right now*, with no event to read? Regular keys are
       answerable from the tracked set; modifier hotkeys cannot be polled, so we
       defer to the host's active state. */
    function isHeldNow() {
      var hk = hotkey();
      if (!hk) return false;
      if (isModifierKey(hk.key)) return isActive();
      return pressed.has(hk.code);
    }

    function isActionKey(event) {
      var s = getSettings();
      var code = s && s.actionKey && s.actionKey.code;
      return !!code && event.code === code;
    }

    return {
      trackKeyDown: trackKeyDown,
      trackKeyUp: trackKeyUp,
      clear: clear,
      isHeld: isHeld,
      isHeldNow: isHeldNow,
      isActionKey: isActionKey,
      isPageScrollKey: isPageScrollKey
    };
  }

  var api = { createMatcher: createMatcher, isPageScrollKey: isPageScrollKey };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.HotkeyMatcher = api;
  }
})();
