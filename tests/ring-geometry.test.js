/*
 * Tests for the Capture Ring's pure geometry.
 *
 * The DOM portion of the ring (reading the bounding rect and border-radius,
 * setting styles) runs in the browser and is verified manually. These tests
 * cover the deterministic part: band scaling, radius parsing, and placement
 * under viewport clipping.
 *
 * Run with: node tests/ring-geometry.test.js
 */
'use strict';

const assert = require('assert');
const { computeBandWidth, parseRadiusValue, computeRingPlacement } = require('../src/shared/ring-geometry.js');

const BAND = { min: 2, max: 4, factor: 0.02 };
const VIEWPORT = { width: 1000, height: 800 };

/* A rect well inside a 1000x800 viewport, with right/bottom derived. */
function rectAt(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

/* ── computeBandWidth ─────────────────────────────────── */

test('band clamps to min on a tiny element', () => {
  assert.strictEqual(computeBandWidth(rectAt(0, 0, 10, 10), BAND), 2);
});

test('band clamps to max on a large element', () => {
  assert.strictEqual(computeBandWidth(rectAt(0, 0, 800, 600), BAND), 4);
});

test('band scales linearly between the bounds', () => {
  // avg side = 150 → 150 * 0.02 = 3, inside [2, 4]
  assert.strictEqual(computeBandWidth(rectAt(0, 0, 100, 200), BAND), 3);
});

test('band defaults match the legacy constants when no opts given', () => {
  assert.strictEqual(computeBandWidth(rectAt(0, 0, 10, 10)), 2);
  assert.strictEqual(computeBandWidth(rectAt(0, 0, 800, 600)), 4);
});

/* ── parseRadiusValue ─────────────────────────────────── */

test('parses a px radius', () => {
  assert.strictEqual(parseRadiusValue('8px', 100), 8);
});

test('parses a percentage radius against the reference size', () => {
  assert.strictEqual(parseRadiusValue('50%', 100), 50);
});

test('uses only the first token', () => {
  assert.strictEqual(parseRadiusValue('12px 4px', 100), 12);
});

test('falls back to 0 on empty or garbage', () => {
  assert.strictEqual(parseRadiusValue('', 100), 0);
  assert.strictEqual(parseRadiusValue(null, 100), 0);
  assert.strictEqual(parseRadiusValue('auto', 100), 0);
});

/* ── computeRingPlacement ─────────────────────────────── */

test('zero-area rect returns null (ring hides)', () => {
  assert.strictEqual(computeRingPlacement({ rect: rectAt(10, 10, 0, 50), radii: {}, band: 4, viewport: VIEWPORT }), null);
  assert.strictEqual(computeRingPlacement({ rect: rectAt(10, 10, 50, 0), radii: {}, band: 4, viewport: VIEWPORT }), null);
});

test('non-clipped element draws the band around the bounds', () => {
  const out = computeRingPlacement({
    rect: rectAt(100, 100, 200, 80),
    radii: { tl: 0, tr: 0, br: 0, bl: 0 },
    band: 4,
    viewport: VIEWPORT
  });
  assert.strictEqual(out.clipped, false);
  assert.deepStrictEqual(out.box, { top: 96, left: 96, width: 208, height: 88 });
  assert.deepStrictEqual(out.outerRadius, [0, 0, 0, 0]);
  assert.deepStrictEqual(out.innerRadius, [0, 0, 0, 0]);
});

test('non-clipped: rounded corners grow outward by the band, inner stays', () => {
  const out = computeRingPlacement({
    rect: rectAt(100, 100, 200, 80),
    radii: { tl: 10, tr: 10, br: 10, bl: 10 },
    band: 4,
    viewport: VIEWPORT
  });
  assert.deepStrictEqual(out.outerRadius, [14, 14, 14, 14]);
  assert.deepStrictEqual(out.innerRadius, [10, 10, 10, 10]);
});

test('element flush against the top-left edge is clipped → drawn inside', () => {
  const out = computeRingPlacement({
    rect: rectAt(0, 0, 200, 80),
    radii: { tl: 10, tr: 10, br: 10, bl: 10 },
    band: 4,
    viewport: VIEWPORT
  });
  assert.strictEqual(out.clipped, true);
  // box stays the element's own bounds (no outward expansion)
  assert.deepStrictEqual(out.box, { top: 0, left: 0, width: 200, height: 80 });
  // radii shrink so the corners stay concentric
  assert.deepStrictEqual(out.outerRadius, [6, 6, 6, 6]);
  assert.deepStrictEqual(out.innerRadius, [2, 2, 2, 2]);
});

test('clipped radii never go negative', () => {
  const out = computeRingPlacement({
    rect: rectAt(0, 0, 200, 80),
    radii: { tl: 3, tr: 3, br: 3, bl: 3 },
    band: 4,
    viewport: VIEWPORT
  });
  assert.deepStrictEqual(out.outerRadius, [0, 0, 0, 0]);
  assert.deepStrictEqual(out.innerRadius, [0, 0, 0, 0]);
});

test('element touching the right edge clips', () => {
  // right = 1000 = vw, plus band → overflow
  const out = computeRingPlacement({
    rect: rectAt(800, 100, 200, 80),
    radii: {},
    band: 4,
    viewport: VIEWPORT
  });
  assert.strictEqual(out.clipped, true);
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
