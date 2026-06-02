'use strict';

const assert = require('assert');
const { createNavigator, buildChain } = require('../src/shared/scroll-navigator.js');

function fakeEl(tagName, parent) {
  return {
    tagName: tagName.toUpperCase(),
    nodeName: tagName.toUpperCase(),
    parentElement: parent || null,
    isConnected: true,
    ownerDocument: { documentElement: { contains: () => true } }
  };
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
  const { body } = makeTree();
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
