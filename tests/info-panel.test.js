/*
 * Tests for the Info Panel's pure HTML builder. The container (mounting,
 * positioning) is the Overlay's job and verified in the browser; htmlFor is
 * pure — element + computed style + settings in, HTML string out — so it is
 * asserted as a string here, the way Element Copy's snippet builder is.
 *
 * Run with: node tests/info-panel.test.js
 */
'use strict';

const assert = require('assert');

/* The text field calls ElementCopy.getDisplayText in production; the fake
   registry below supplies its own getValue, so no globals beyond InfoFields
   are needed. */
global.InfoFields = {
  GROUPS: [
    { id: 'box', label: 'Box' },
    { id: 'colors', label: 'Colors' },
    { id: 'content', label: 'Content' }
  ],
  REGISTRY: [
    { id: 'text', group: 'content', label: 'Text', getValue: () => ({ kind: 'content', text: 'hello world' }) },
    { id: 'dimensions', group: 'box', label: 'Dimensions', getValue: () => ({ kind: 'text', text: '10 x 20 px' }) },
    { id: 'color', group: 'colors', label: 'Color', getValue: () => ({ kind: 'color', color: 'rgb(0, 0, 0)', text: 'rgb(0, 0, 0)' }) },
    { id: 'boom', group: 'box', label: 'Boom', getValue: () => { throw new Error('field blew up'); } }
  ]
};

const { htmlFor } = require('../src/shared/info-panel.js');

function fakeEl(tag, id, classes) {
  return { tagName: tag.toUpperCase(), id: id || '', classList: classes || [] };
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

test('renders the selector with tag, id, and classes', () => {
  const html = htmlFor(fakeEl('div', 'main', ['card', 'big']), {}, { infoFields: {} });
  assert.ok(html.includes('<span class="sel-tag">div</span>'));
  assert.ok(html.includes('<span class="sel-id">#main</span>'));
  assert.ok(html.includes('<span class="sel-class">.card.big</span>'));
});

test('omits id and class spans when absent', () => {
  const html = htmlFor(fakeEl('span'), {}, { infoFields: {} });
  assert.ok(html.includes('<span class="sel-tag">span</span>'));
  assert.ok(!html.includes('sel-id'));
  assert.ok(!html.includes('sel-class'));
});

test('renders an enabled text field as a content row', () => {
  const html = htmlFor(fakeEl('p'), {}, { infoFields: { text: true } });
  assert.ok(html.includes('content-row'));
  assert.ok(html.includes('hello world'));
});

test('renders an enabled value field as a labelled row', () => {
  const html = htmlFor(fakeEl('div'), {}, { infoFields: { dimensions: true } });
  assert.ok(html.includes('<span class="label">Dimensions</span>'));
  assert.ok(html.includes('10 x 20 px'));
});

test('color field renders a swatch', () => {
  const html = htmlFor(fakeEl('div'), {}, { infoFields: { color: true } });
  assert.ok(html.includes('class="swatch"'));
  assert.ok(html.includes('rgb(0, 0, 0)'));
});

test('disabled fields are omitted', () => {
  const html = htmlFor(fakeEl('div'), {}, { infoFields: { dimensions: true } });
  assert.ok(!html.includes('Color'));
  assert.ok(!html.includes('hello world'));
});

test('escapes html-significant characters in the selector', () => {
  const html = htmlFor(fakeEl('div', '', ['x<y']), {}, { infoFields: {} });
  assert.ok(html.includes('.x&lt;y'));
  assert.ok(!html.includes('.x<y'));
});

test('a throwing field is swallowed, not propagated', () => {
  // "boom" throws; enabling it must not crash, and the rest still renders.
  const html = htmlFor(fakeEl('div'), {}, { infoFields: { boom: true, dimensions: true } });
  assert.ok(html.includes('10 x 20 px'));
  assert.ok(!html.includes('Boom'));
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
