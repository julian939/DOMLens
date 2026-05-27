'use strict';

const assert = require('assert');
const { createDispatcher, SNIPPET_MAX_MS, SNAPSHOT_MIN_MS } = require('../src/shared/gesture-dispatcher.js');

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
  const zones = [];
  return {
    progress,
    terminal,
    zones,
    onProgress(f) { progress.push(f); },
    onTerminal(kind, payload) { terminal.push({ kind, payload }); },
    onZoneChange(zone) { zones.push(zone); }
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
  d.onZoneChange(rec.onZoneChange);
  return { d, rec };
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

test('release at 0 ms emits snippet (Zone A)', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  const target = { tag: 'div' };
  d.actionKeyDown(target);
  d.actionKeyUp();
  clock.advance(2000);
  assert.strictEqual(rec.terminal.length, 1);
  assert.deepStrictEqual(rec.terminal[0], { kind: 'snippet', payload: target });
});

test('release at 50 ms emits snippet (Zone A)', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(50);
  d.actionKeyUp();
  clock.advance(2000);
  assert.strictEqual(rec.terminal.length, 1);
  assert.strictEqual(rec.terminal[0].kind, 'snippet');
});

test('release at 299 ms emits snippet (Zone A boundary)', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(299);
  d.actionKeyUp();
  clock.advance(2000);
  assert.strictEqual(rec.terminal.length, 1);
  assert.strictEqual(rec.terminal[0].kind, 'snippet');
});

test('release at 300 ms emits cancel(dead-zone-release) (Zone B)', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(300);
  d.actionKeyUp();
  clock.advance(2000);
  assert.strictEqual(rec.terminal.length, 1);
  assert.deepStrictEqual(rec.terminal[0], { kind: 'cancel', payload: 'dead-zone-release' });
});

test('release at 500 ms emits cancel(dead-zone-release) (Zone B mid)', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(500);
  d.actionKeyUp();
  clock.advance(2000);
  assert.strictEqual(rec.terminal.length, 1);
  assert.deepStrictEqual(rec.terminal[0], { kind: 'cancel', payload: 'dead-zone-release' });
});

test('release at 1299 ms emits cancel(dead-zone-release), never snapshot (Zone B end)', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(1299);
  d.actionKeyUp();
  clock.advance(2000);
  assert.strictEqual(rec.terminal.length, 1);
  assert.deepStrictEqual(rec.terminal[0], { kind: 'cancel', payload: 'dead-zone-release' });
});

test('hold past 1300 ms emits snapshot exactly once (Zone C)', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  const target = { tag: 'section' };
  d.actionKeyDown(target);
  clock.advance(SNAPSHOT_MIN_MS);
  assert.strictEqual(rec.terminal.length, 1);
  assert.deepStrictEqual(rec.terminal[0], { kind: 'snapshot', payload: target });
});

test('release at 1301 ms after snapshot fired is a no-op', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(SNAPSHOT_MIN_MS);
  d.actionKeyUp();
  clock.advance(1000);
  assert.strictEqual(rec.terminal.length, 1);
  assert.strictEqual(rec.terminal[0].kind, 'snapshot');
});

test('onZoneChange emits each zone string exactly once per hold', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  assert.deepStrictEqual(rec.zones, ['snippet-zone']);
  clock.advance(SNIPPET_MAX_MS);
  assert.deepStrictEqual(rec.zones, ['snippet-zone', 'dead-zone']);
  clock.advance(SNAPSHOT_MIN_MS - SNIPPET_MAX_MS);
  assert.deepStrictEqual(rec.zones, ['snippet-zone', 'dead-zone', 'snapshot-zone']);
});

test('onZoneChange: snippet-zone emitted immediately at key-down', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  assert.strictEqual(rec.zones[0], 'snippet-zone');
});

test('cancel(blur) from snippet-zone suppresses snippet and emits cancel', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(50);
  d.cancel('blur');
  clock.advance(2000);
  d.actionKeyUp();
  assert.strictEqual(rec.terminal.length, 1);
  assert.deepStrictEqual(rec.terminal[0], { kind: 'cancel', payload: 'blur' });
});

test('cancel(tab-switch) from dead-zone suppresses cancel(dead-zone-release)', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(300);
  d.cancel('tab-switch');
  clock.advance(2000);
  assert.strictEqual(rec.terminal.length, 1);
  assert.deepStrictEqual(rec.terminal[0], { kind: 'cancel', payload: 'tab-switch' });
});

test('cancel(esc) from snapshot-zone is inert (snapshot already emitted)', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(SNAPSHOT_MIN_MS);
  d.cancel('esc');
  assert.strictEqual(rec.terminal.length, 1);
  assert.strictEqual(rec.terminal[0].kind, 'snapshot');
});

test('cancel(hotkey-release) from any zone emits cancel', () => {
  for (const advanceMs of [50, 300, 1100]) {
    const clock = createFakeClock();
    const { d, rec } = newDispatcher(clock);
    d.actionKeyDown('t');
    clock.advance(advanceMs);
    if (advanceMs < SNAPSHOT_MIN_MS) {
      d.cancel('hotkey-release');
      assert.strictEqual(rec.terminal.length, 1, `advanceMs=${advanceMs}`);
      assert.deepStrictEqual(rec.terminal[0], { kind: 'cancel', payload: 'hotkey-release' }, `advanceMs=${advanceMs}`);
    }
  }
});

test('sequential gestures do not leak state', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('a');
  clock.advance(50);
  d.actionKeyUp();
  d.actionKeyDown('b');
  clock.advance(SNAPSHOT_MIN_MS);
  d.actionKeyDown('c');
  clock.advance(30);
  d.cancel('blur');
  assert.deepStrictEqual(rec.terminal.map((e) => e.kind), ['snippet', 'snapshot', 'cancel']);
  assert.deepStrictEqual(rec.terminal.map((e) => e.payload), ['a', 'b', 'blur']);
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
  clock.advance(2000);
  assert.strictEqual(rec.terminal.length, 0);
});

test('progress is monotonically non-decreasing during snippet/dead zone and reaches 1.0 at snapshot', () => {
  const clock = createFakeClock();
  const { d, rec } = newDispatcher(clock);
  d.actionKeyDown('t');
  clock.advance(SNAPSHOT_MIN_MS);
  for (let i = 1; i < rec.progress.length; i++) {
    assert.ok(rec.progress[i] >= rec.progress[i - 1],
      `progress not monotonic at i=${i}: ${rec.progress[i - 1]} -> ${rec.progress[i]}`);
  }
  assert.strictEqual(rec.progress[rec.progress.length - 1], 1);
  assert.strictEqual(rec.terminal[0].kind, 'snapshot');
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
