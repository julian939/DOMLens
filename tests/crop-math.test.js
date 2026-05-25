/*
 * Tests for the screenshot crop's pure math.
 *
 * The canvas/decoding portion of the Worker requires a browser environment
 * and is verified manually. These tests cover the deterministic part:
 * coordinate mapping, DPR scaling, off-screen clamping, zero-area rejection.
 *
 * Run with: node tests/crop-math.test.js
 */
'use strict';

const assert = require('assert');
const { computeCropRect } = require('../src/shared/crop-math.js');

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

test('1x DPR maps coordinates 1:1', () => {
  const r = computeCropRect({ x: 10, y: 20, width: 100, height: 50 }, 1, 1000, 1000);
  assert.deepStrictEqual(r, { x: 10, y: 20, width: 100, height: 50 });
});

test('2x DPR doubles all coordinates', () => {
  const r = computeCropRect({ x: 10, y: 20, width: 100, height: 50 }, 2, 1000, 1000);
  assert.deepStrictEqual(r, { x: 20, y: 40, width: 200, height: 100 });
});

test('fractional DPR rounds correctly', () => {
  const r = computeCropRect({ x: 10, y: 10, width: 100, height: 50 }, 1.5, 1000, 1000);
  assert.deepStrictEqual(r, { x: 15, y: 15, width: 150, height: 75 });
});

test('box partially off-screen on the left is clamped', () => {
  const r = computeCropRect({ x: -20, y: 10, width: 100, height: 50 }, 1, 1000, 1000);
  assert.deepStrictEqual(r, { x: 0, y: 10, width: 80, height: 50 });
});

test('box partially off-screen on the right is clamped', () => {
  const r = computeCropRect({ x: 950, y: 10, width: 100, height: 50 }, 1, 1000, 1000);
  assert.deepStrictEqual(r, { x: 950, y: 10, width: 50, height: 50 });
});

test('box partially off-screen on top and bottom is clamped', () => {
  const r = computeCropRect({ x: 10, y: -10, width: 50, height: 1020 }, 1, 1000, 1000);
  assert.deepStrictEqual(r, { x: 10, y: 0, width: 50, height: 1000 });
});

test('zero-width box is rejected', () => {
  assert.strictEqual(computeCropRect({ x: 0, y: 0, width: 0, height: 50 }, 1, 1000, 1000), null);
});

test('zero-height box is rejected', () => {
  assert.strictEqual(computeCropRect({ x: 0, y: 0, width: 50, height: 0 }, 1, 1000, 1000), null);
});

test('negative dimensions are rejected', () => {
  assert.strictEqual(computeCropRect({ x: 0, y: 0, width: -10, height: 50 }, 1, 1000, 1000), null);
});

test('box entirely off-screen returns null', () => {
  assert.strictEqual(computeCropRect({ x: 2000, y: 2000, width: 100, height: 100 }, 1, 1000, 1000), null);
});

test('high-DPR box that exceeds image is clamped to image bounds', () => {
  const r = computeCropRect({ x: 0, y: 0, width: 600, height: 400 }, 2, 1000, 700);
  /* At DPR=2, the unclamped rect would be 1200x800, but the image is 1000x700. */
  assert.deepStrictEqual(r, { x: 0, y: 0, width: 1000, height: 700 });
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
