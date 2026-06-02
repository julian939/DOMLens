'use strict';

const assert = require('assert');
const { accumulateWheel } = require('../src/shared/wheel-step.js');

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

test('accumulates delta until threshold', () => {
  const r = accumulateWheel(30, { accum: 0, lastStepAt: 0 }, 50, 100, 1000);
  assert.strictEqual(r.steps, 0);
  assert.strictEqual(r.state.accum, 30);
});

test('emits one step per threshold crossing with cooldown', () => {
  let state = { accum: 0, lastStepAt: 0 };
  let r = accumulateWheel(60, state, 50, 100, 1000);
  assert.strictEqual(r.steps, 1);
  state = r.state;
  r = accumulateWheel(60, state, 50, 100, 1050);
  assert.strictEqual(r.steps, 0);
  r = accumulateWheel(60, state, 50, 100, 1101);
  assert.strictEqual(r.steps, 1);
});

test('negative delta emits negative steps (toward leaf)', () => {
  const r = accumulateWheel(-55, { accum: 0, lastStepAt: 0 }, 50, 0, 1000);
  assert.strictEqual(r.steps, -1);
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
