'use strict';

const assert = require('assert');
const { createNavigator, buildChain } = require('../src/shared/scroll-navigator.js');

function fakeEl(tagName, parent) {
  const el = {
    tagName: tagName.toUpperCase(),
    nodeName: tagName.toUpperCase(),
    parentElement: parent || null,
    children: [],
    isConnected: true,
    ownerDocument: { documentElement: { contains: () => true } }
  };
  if (parent) {
    if (!parent.children) parent.children = [];
    parent.children.push(el);
  }
  return el;
}

function makeTree() {
  const body = fakeEl('body', null);
  const div = fakeEl('div', body);
  const button = fakeEl('button', div);
  const span = fakeEl('span', button);
  body.contains = () => true;
  return { body, div, button, span };
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

test('anchors at leaf depth 0', () => {
  const { body, div, button, span } = makeTree();
  const nav = createNavigator();
  nav.setLeaf(span);
  assert.strictEqual(nav.current(), span);
  assert.deepStrictEqual(buildChain(span), [span, button, div, body]);
});

test('step +1 walks to parent', () => {
  const { body, div, button, span } = makeTree();
  const nav = createNavigator();
  nav.setLeaf(span);
  assert.strictEqual(nav.step(1), true);
  assert.strictEqual(nav.current(), button);
  assert.strictEqual(nav.step(1), true);
  assert.strictEqual(nav.current(), div);
});

test('step -1 walks back toward leaf', () => {
  const { span, button } = makeTree();
  const nav = createNavigator();
  nav.setLeaf(span);
  nav.step(1);
  assert.strictEqual(nav.step(-1), true);
  assert.strictEqual(nav.current(), span);
});

test('clamps at body (top)', () => {
  const { body, span } = makeTree();
  const nav = createNavigator();
  nav.setLeaf(span);
  nav.step(1);
  nav.step(1);
  nav.step(1);
  assert.strictEqual(nav.current(), body);
  assert.strictEqual(nav.step(1), false);
  assert.strictEqual(nav.current(), body);
});

test('clamps at leaf (bottom)', () => {
  const { span } = makeTree();
  const nav = createNavigator();
  nav.setLeaf(span);
  assert.strictEqual(nav.step(-1), false);
  assert.strictEqual(nav.current(), span);
});

test('setLeaf same node preserves depth', () => {
  const { span, button } = makeTree();
  const nav = createNavigator();
  nav.setLeaf(span);
  nav.step(1);
  nav.setLeaf(span);
  assert.strictEqual(nav.current(), button);
});

test('setLeaf different node resets depth', () => {
  const { span, button, div } = makeTree();
  const nav = createNavigator();
  nav.setLeaf(span);
  nav.step(2);
  nav.setLeaf(button);
  assert.strictEqual(nav.current(), button);
  nav.setLeaf(div);
  assert.strictEqual(nav.current(), div);
});

test('single-element chain (body leaf) clamps without throwing', () => {
  const body = fakeEl('body', null);
  const nav = createNavigator();
  nav.setLeaf(body);
  assert.strictEqual(nav.current(), body);
  assert.strictEqual(nav.step(1), false);
  assert.strictEqual(nav.step(-1), false);
});

test('detached anchor is treated as gone', () => {
  const detached = fakeEl('span', null);
  detached.isConnected = false;
  const nav = createNavigator();
  nav.setLeaf(detached);
  assert.strictEqual(nav.current(), null);
  assert.strictEqual(nav.step(1), false);
});

test('step -1 descends into closest child based on coordinates', () => {
  const parent = fakeEl('div', null);
  const child1 = fakeEl('span', parent);
  const child2 = fakeEl('span', parent);

  // Set mock getBoundingClientRect
  child1.getBoundingClientRect = () => ({ left: 10, right: 20, top: 10, bottom: 20 });
  child2.getBoundingClientRect = () => ({ left: 50, right: 60, top: 50, bottom: 60 });

  const nav = createNavigator();
  nav.setLeaf(parent);

  // Close to child1 (at x=15, y=15)
  assert.strictEqual(nav.step(-1, 15, 15), true);
  assert.strictEqual(nav.current(), child1);
});

test('step -1 falls back to first child if no coordinates', () => {
  const parent = fakeEl('div', null);
  const child1 = fakeEl('span', parent);
  const child2 = fakeEl('span', parent);

  const nav = createNavigator();
  nav.setLeaf(parent);

  assert.strictEqual(nav.step(-1), true);
  assert.strictEqual(nav.current(), child1);
});

test('jitter tracking: setLeaf on parent does not reset anchor if same leaf is hovered', () => {
  const parent = fakeEl('div', null);
  const child = fakeEl('span', parent);

  const nav = createNavigator();
  // Initially hovered element is parent
  nav.setLeaf(parent);
  assert.strictEqual(nav.current(), parent);

  // Scroll down to child
  assert.strictEqual(nav.step(-1), true);
  assert.strictEqual(nav.current(), child);

  // Hover is still parent (cursor moved slightly over parent), setLeaf(parent) called
  nav.setLeaf(parent);
  // Should keep child selected because hovered leaf (parent) didn't change!
  assert.strictEqual(nav.current(), child);

  // Moving mouse to a different element resets
  const other = fakeEl('div', null);
  nav.setLeaf(other);
  assert.strictEqual(nav.current(), other);
});

test('step -1 skips zero-sized child elements when descending', () => {
  const parent = fakeEl('div', null);
  const child1 = fakeEl('span', parent);
  const child2 = fakeEl('span', parent);

  // child1 has zero size (hidden)
  child1.offsetWidth = 0;
  child1.offsetHeight = 0;

  // child2 has non-zero size (visible)
  child2.offsetWidth = 10;
  child2.offsetHeight = 10;
  child2.getBoundingClientRect = () => ({ left: 50, right: 60, top: 50, bottom: 60 });

  const nav = createNavigator();
  nav.setLeaf(parent);

  // Even if cursor is close to child1, it should skip child1 and select child2
  assert.strictEqual(nav.step(-1, 15, 15), true);
  assert.strictEqual(nav.current(), child2);
});

let failed = 0;
for (const { name, fn } of cases) {
  try {
    fn();
    console.log('ok', name);
  } catch (err) {
    failed++;
    console.error('FAIL', name, err.message);
  }
}
if (failed) process.exit(1);
