/*
 * Tests for the Hotkey Matcher — the keyboard matching content.js used to
 * inline. Driven with synthetic KeyboardEvent-shaped objects, so the fiddly
 * modifier-vs-tracked-key logic is finally asserted directly.
 *
 * Run with: node tests/hotkey-matcher.test.js
 */
'use strict';

const assert = require('assert');
const { createMatcher, isPageScrollKey } = require('../src/shared/hotkey-matcher.js');

/* A KeyboardEvent stand-in: code + key, plus the modifier flags the real event
   carries. */
function ev(code, key, mods) {
  mods = mods || {};
  return {
    code,
    key,
    altKey: !!mods.alt,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    shiftKey: !!mods.shift
  };
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

/* ── modifier-key hotkey (the default: Alt) ───────────── */

test('modifier hotkey: isHeld reads the event flag', () => {
  const m = createMatcher({ getSettings: () => ({ hotkey: { code: 'AltLeft', key: 'Alt' } }) });
  assert.strictEqual(m.isHeld(ev('KeyC', 'c', { alt: true })), true);
  assert.strictEqual(m.isHeld(ev('KeyC', 'c', { alt: false })), false);
});

test('modifier hotkey: isHeldNow falls back to isActive (cannot poll)', () => {
  let active = false;
  const m = createMatcher({
    getSettings: () => ({ hotkey: { code: 'AltLeft', key: 'Alt' } }),
    isActive: () => active
  });
  assert.strictEqual(m.isHeldNow(), false);
  active = true;
  assert.strictEqual(m.isHeldNow(), true);
});

/* ── regular-key hotkey (tracked set) ─────────────────── */

test('regular hotkey: isHeld follows the tracked set', () => {
  const m = createMatcher({ getSettings: () => ({ hotkey: { code: 'Backquote', key: '`' } }) });
  assert.strictEqual(m.isHeld(ev('Backquote', '`')), false);
  m.trackKeyDown(ev('Backquote', '`'));
  assert.strictEqual(m.isHeld(ev('Backquote', '`')), true);
  assert.strictEqual(m.isHeldNow(), true, 'regular keys are pollable without an event');
  m.trackKeyUp(ev('Backquote', '`'));
  assert.strictEqual(m.isHeld(ev('Backquote', '`')), false);
});

test('clear() drops all tracked keys', () => {
  const m = createMatcher({ getSettings: () => ({ hotkey: { code: 'Backquote', key: '`' } }) });
  m.trackKeyDown(ev('Backquote', '`'));
  m.clear();
  assert.strictEqual(m.isHeldNow(), false);
});

test('modifier keys are not added to the tracked set', () => {
  const m = createMatcher({ getSettings: () => ({ hotkey: { code: 'AltLeft', key: 'Alt' } }) });
  m.trackKeyDown(ev('AltLeft', 'Alt', { alt: true }));
  // The tracked set stays empty; modifier hotkeys never rely on it.
  assert.strictEqual(m.isHeld(ev('AltLeft', 'Alt', { alt: false })), false);
});

/* ── action key ───────────────────────────────────────── */

test('isActionKey matches the configured action code', () => {
  const m = createMatcher({ getSettings: () => ({ hotkey: { code: 'AltLeft', key: 'Alt' }, actionKey: { code: 'KeyC', key: 'c' } }) });
  assert.strictEqual(m.isActionKey(ev('KeyC', 'c')), true);
  assert.strictEqual(m.isActionKey(ev('KeyX', 'x')), false);
});

/* ── guards & page-scroll keys ────────────────────────── */

test('no settings → never held, never action key', () => {
  const m = createMatcher({ getSettings: () => null });
  assert.strictEqual(m.isHeld(ev('KeyC', 'c', { alt: true })), false);
  assert.strictEqual(m.isHeldNow(), false);
  assert.strictEqual(m.isActionKey(ev('KeyC', 'c')), false);
});

test('page-scroll keys are recognised', () => {
  for (const k of [' ', 'PageUp', 'PageDown', 'Home', 'End']) {
    assert.strictEqual(isPageScrollKey({ key: k }), true, `expected ${k} to be a page-scroll key`);
  }
  assert.strictEqual(isPageScrollKey({ key: 'a' }), false);
  assert.strictEqual(isPageScrollKey({ key: 'ArrowDown' }), false, 'arrows are left alone (browser shortcuts)');
});

let failed = 0;
for (const c of cases) {
  try {
    c.fn();
    console.log(`  ok  ${c.name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${c.name}`);
    console.error(e && e.stack ? e.stack : e);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log(`\nAll ${cases.length} tests passed`);
}
