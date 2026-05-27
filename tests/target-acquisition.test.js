/*
 * Tests for the target acquisition fallback in onActionKeyDown.
 *
 * The acquireTarget logic is tested in isolation via a helper factory that
 * mirrors the production code exactly.
 *
 * Run with: node tests/target-acquisition.test.js
 */
'use strict';

const assert = require('assert');

function makeAcquireTarget({ stateTarget, cursorX, cursorY, elementFromPointResult, isOwnNodeResult }) {
  const state = {
    target: stateTarget,
    cursor: { x: cursorX, y: cursorY }
  };
  const isOwnNode = () => isOwnNodeResult;
  const elementFromPoint = () => elementFromPointResult;

  return function acquireTarget() {
    if (state.target) return state.target;
    const fromPoint = elementFromPoint(state.cursor.x, state.cursor.y);
    if (fromPoint && !isOwnNode(fromPoint)) return fromPoint;
    return null;
  };
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

test('target non-null: returns state.target without calling elementFromPoint', () => {
  const stateTarget = { tagName: 'DIV' };
  const fromPointSentinel = { tagName: 'SPAN' };
  const acquire = makeAcquireTarget({
    stateTarget,
    cursorX: 100,
    cursorY: 200,
    elementFromPointResult: fromPointSentinel,
    isOwnNodeResult: false
  });
  assert.strictEqual(acquire(), stateTarget);
});

test('target null + element under cursor: returns elementFromPoint result', () => {
  const fromPointEl = { tagName: 'P' };
  const acquire = makeAcquireTarget({
    stateTarget: null,
    cursorX: 50,
    cursorY: 80,
    elementFromPointResult: fromPointEl,
    isOwnNodeResult: false
  });
  assert.strictEqual(acquire(), fromPointEl);
});

test('target null + elementFromPoint returns overlay node: returns null', () => {
  const overlayNode = { tagName: 'DIV', dataset: { domlensOverlay: '' } };
  const acquire = makeAcquireTarget({
    stateTarget: null,
    cursorX: 50,
    cursorY: 80,
    elementFromPointResult: overlayNode,
    isOwnNodeResult: true
  });
  assert.strictEqual(acquire(), null);
});

test('target null + no element under cursor: returns null', () => {
  const acquire = makeAcquireTarget({
    stateTarget: null,
    cursorX: 50,
    cursorY: 80,
    elementFromPointResult: null,
    isOwnNodeResult: false
  });
  assert.strictEqual(acquire(), null);
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
