/*
 * Tests for the Action Key Gesture Dispatcher.
 *
 * Pure command-line tests. Run with: node tests/gesture-dispatcher.test.js
 */
'use strict';

const assert = require('assert');
const { createDispatcher, HOLD_THRESHOLD_MS } = require('../src/shared/gesture-dispatcher.js');

/* Deterministic fake clock that the dispatcher accepts via injection. */
function createFakeClock() {
  let nowMs = 0;
  let nextId = 1;
  const timers = new Map();

  function now() { return nowMs; }

  function setTimer(fn, delay) {
    const id = nextId++;
    timers.set(id, { fireAt: nowMs + delay, fn });
    return id;
  }

  function clearTimer(id) { timers.delete(id); }

  function advance(ms) {
    const targetMs = nowMs + ms;
    /* Fire timers strictly in due-time order. New timers scheduled by a firing
       handler must be picked up in the same advance call if their fireAt
       falls inside the window. */
    while (true) {
      let earliestId = null;
      let earliestAt = Infinity;
      for (const [id, t] of timers) {
        if (t.fireAt <= targetMs && t.fireAt < earliestAt) {
          earliestAt = t.fireAt;
          earliestId = id;
        }
      }
      if (earliestId === null) break;
      const t = timers.get(earliestId);
      timers.delete(earliestId);
      nowMs = t.fireAt;
      t.fn();
    }
    nowMs = targetMs;
  }

  return { now, setTimer, clearTimer, advance };
}

function makeRecorder() {
  const progress = [];
  const terminal = [];
  return {
    progress,
    terminal,
    onProgress(f) { progress.push(f); },
    onTerminal(kind, payload) { terminal.push({ kind, payload }); }
  };
}

function newDispatcher(clock) {
  const d = createDispatcher({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });
  const rec = makeRecorder();
  d.onProgress(rec.onProgress);
  d.onTerminal(rec.onTerminal);
  return { d, rec };
}

const cases = [];

function test(name, fn) { cases.push({ name, fn }); }

test('tap below threshold emits exactly one snippet', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  const target = { tag: 'div' };
  d.actionKeyDown(target);
  clock.advance(100);
  d.actionKeyUp();
  clock.advance(500); /* nothing further should fire */
  assert.strictEqual(rec.terminal.length, 1);
  assert.deepStrictEqual(rec.terminal[0], { kind: 'snippet', payload: target });
});

test('hold past threshold emits exactly one snapshot at threshold-cross', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  const target = { tag: 'section' };
  d.actionKeyDown(target);
  clock.advance(HOLD_THRESHOLD_MS);
  /* terminal must have fired exactly at the threshold tick */
  assert.strictEqual(rec.terminal.length, 1);
  assert.deepStrictEqual(rec.terminal[0], { kind: 'snapshot', payload: target });
  /* subsequent key-up is a no-op */
  d.actionKeyUp();
  assert.strictEqual(rec.terminal.length, 1);
});

test('release at exactly threshold: snapshot wins (timer fires first)', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(HOLD_THRESHOLD_MS);
  d.actionKeyUp();
  assert.strictEqual(rec.terminal.length, 1);
  assert.strictEqual(rec.terminal[0].kind, 'snapshot');
});

test('cancel during a hold suppresses both terminals and emits cancel', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(100);
  d.cancel('esc');
  clock.advance(1000);
  d.actionKeyUp();
  assert.strictEqual(rec.terminal.length, 1);
  assert.deepStrictEqual(rec.terminal[0], { kind: 'cancel', payload: 'esc' });
});

test('progress ticks are monotonically non-decreasing and reach 1.0 at snapshot', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(HOLD_THRESHOLD_MS);
  /* monotonic */
  for (let i = 1; i < rec.progress.length; i++) {
    assert.ok(rec.progress[i] >= rec.progress[i - 1],
      `progress not monotonic at i=${i}: ${rec.progress[i - 1]} -> ${rec.progress[i]}`);
  }
  /* final progress before the terminal snapshot is 1.0 */
  assert.strictEqual(rec.progress[rec.progress.length - 1], 1);
  assert.strictEqual(rec.terminal.length, 1);
  assert.strictEqual(rec.terminal[0].kind, 'snapshot');
});

test('sequential gestures do not leak state', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('a');
  clock.advance(50);
  d.actionKeyUp();
  d.actionKeyDown('b');
  clock.advance(HOLD_THRESHOLD_MS);
  d.actionKeyDown('c');
  clock.advance(30);
  d.cancel('blur');
  assert.deepStrictEqual(rec.terminal.map((e) => e.kind),
    ['snippet', 'snapshot', 'cancel']);
  assert.deepStrictEqual(rec.terminal.map((e) => e.payload),
    ['a', 'b', 'blur']);
});

test('actionKeyDown during a hold is ignored (no retarget)', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('first');
  clock.advance(50);
  d.actionKeyDown('second');
  clock.advance(50);
  d.actionKeyUp();
  assert.strictEqual(rec.terminal.length, 1);
  assert.deepStrictEqual(rec.terminal[0], { kind: 'snippet', payload: 'first' });
});

test('cancel outside a hold is inert', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.cancel('esc');
  d.actionKeyUp();
  clock.advance(500);
  assert.strictEqual(rec.terminal.length, 0);
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
