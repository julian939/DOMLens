/*
 * Tests for the Capture Session — the post-terminal capture arc that had no
 * test surface before ADR 0004. The session is driven through fake
 * collaborators (ring, toast, clipboard, pipeline) and a fake clock shared with
 * its internal Gesture Dispatcher, so the whole arc runs without a browser.
 *
 * Run with: node tests/capture-session.test.js
 */
'use strict';

const assert = require('assert');
const { createSession } = require('../src/shared/capture-session.js');
const { createDispatcher, SNAPSHOT_MIN_MS } = require('../src/shared/gesture-dispatcher.js');

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

function flush() {
  /* Let the async snapshot commit settle through a few microtask turns. */
  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());
}

function makeHarness(settings) {
  const ring = { calls: [], POP_MS: 1200, SCAN_MS: 1200, FADE_MS: 280 };
  ['show', 'pop', 'startCharging', 'startScan', 'fadeFromCharging', 'hide'].forEach((m) => {
    ring[m] = (arg) => ring.calls.push(arg === undefined ? [m] : [m, arg]);
  });

  const toast = { calls: [], show: (msg, rect) => toast.calls.push([msg, rect]) };
  const clipboard = { writes: [], write: (t) => clipboard.writes.push(t) };

  let aborted = false;
  const pipeline = {
    preComputeStarted: 0,
    startPreCompute: () => { pipeline.preComputeStarted++; return { promise: Promise.resolve({}), abort: () => { aborted = true; } }; },
    capture: () => Promise.resolve({ box: { x: 0, y: 0, width: 10, height: 10 }, dataUrl: 'data:x' }),
    commit: () => Promise.resolve('PAYLOAD'),
    wasAborted: () => aborted
  };

  const elementCopy = {
    buildSnippet: () => 'SNIPPET',
    boxFromRect: () => ({ x: 0, y: 0, width: 10, height: 10 })
  };

  const events = { inspectExit: 0, settled: 0 };
  const clock = createFakeClock();

  const session = createSession({
    ring,
    toast,
    clipboard,
    snapshotPipeline: pipeline,
    elementCopy,
    getSettings: () => settings,
    onInspectExit: () => { events.inspectExit++; },
    onSettled: () => { events.settled++; },
    createDispatcher,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });

  const target = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }) };
  return { session, ring, toast, clipboard, pipeline, events, clock, target };
}

function ringNames(ring) { return ring.calls.map((c) => c[0]); }

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

test('begin shows the ring and starts pre-compute', () => {
  const h = makeHarness({ snippetTripleQuoteBlock: true });
  h.session.begin(h.target);
  assert.deepStrictEqual(h.ring.calls[0], ['show', h.target]);
  assert.strictEqual(h.pipeline.preComputeStarted, 1);
});

test('snippet: exits inspect mode, writes clipboard, pops ring, toasts, settles', () => {
  const h = makeHarness({ snippetTripleQuoteBlock: true });
  h.session.begin(h.target);
  h.clock.advance(50);
  h.session.actionKeyUp();
  assert.strictEqual(h.events.inspectExit, 1, 'commit must exit inspect mode');
  assert.deepStrictEqual(h.clipboard.writes, ['SNIPPET']);
  assert.ok(ringNames(h.ring).includes('pop'));
  assert.deepStrictEqual(h.toast.calls[0][0], 'Copied!');
  assert.ok(h.pipeline.wasAborted(), 'snippet abandons pre-compute');
  assert.strictEqual(h.events.settled, 0, 'not settled until feedback window closes');
  h.clock.advance(h.ring.POP_MS + 20);
  assert.strictEqual(h.events.settled, 1);
});

test('snapshot: exits inspect mode, scans, toasts, writes payload, settles', async () => {
  const h = makeHarness({ snippetTripleQuoteBlock: true, snapshot: { includeScreenshot: false } });
  h.session.begin(h.target);
  h.clock.advance(SNAPSHOT_MIN_MS);
  assert.strictEqual(h.events.inspectExit, 1);
  assert.ok(ringNames(h.ring).includes('startScan'));
  assert.deepStrictEqual(h.toast.calls[0][0], 'Snapshot Copied!');
  await flush();
  assert.deepStrictEqual(h.clipboard.writes, ['PAYLOAD']);
  assert.strictEqual(h.events.settled, 0);
  h.clock.advance(h.ring.SCAN_MS + 20);
  assert.strictEqual(h.events.settled, 1);
});

test('dead-zone release: no commit, no clipboard, fades ring, settles late', () => {
  const h = makeHarness({ snippetTripleQuoteBlock: true });
  h.session.begin(h.target);
  h.clock.advance(500); // into the Dead Zone (charging fires at 300)
  assert.ok(ringNames(h.ring).includes('startCharging'), 'Dead Zone charges the ring');
  h.session.actionKeyUp();
  assert.strictEqual(h.events.inspectExit, 0, 'cancel never exits inspect mode (ADR 0002)');
  assert.deepStrictEqual(h.clipboard.writes, []);
  assert.deepStrictEqual(h.toast.calls, []);
  assert.ok(ringNames(h.ring).includes('fadeFromCharging'));
  assert.strictEqual(h.events.settled, 0);
  h.clock.advance(h.ring.FADE_MS + 20);
  assert.strictEqual(h.events.settled, 1);
});

test('blur cancel: hides ring, settles immediately, no commit', () => {
  const h = makeHarness({ snippetTripleQuoteBlock: true });
  h.session.begin(h.target);
  h.clock.advance(50);
  h.session.cancel('blur');
  assert.strictEqual(h.events.inspectExit, 0);
  assert.deepStrictEqual(h.clipboard.writes, []);
  assert.ok(ringNames(h.ring).includes('hide'));
  assert.strictEqual(h.events.settled, 1, 'non-Dead-Zone cancel settles at once');
});

test('the Capture Latch invariant: inspect-mode exit only on commits, never cancels', () => {
  // snippet → exit
  let h = makeHarness({ snippetTripleQuoteBlock: true });
  h.session.begin(h.target); h.clock.advance(50); h.session.actionKeyUp();
  assert.strictEqual(h.events.inspectExit, 1);
  // snapshot → exit
  h = makeHarness({ snippetTripleQuoteBlock: true, snapshot: { includeScreenshot: false } });
  h.session.begin(h.target); h.clock.advance(SNAPSHOT_MIN_MS);
  assert.strictEqual(h.events.inspectExit, 1);
  // dead-zone cancel → no exit
  h = makeHarness({ snippetTripleQuoteBlock: true });
  h.session.begin(h.target); h.clock.advance(500); h.session.actionKeyUp();
  assert.strictEqual(h.events.inspectExit, 0);
  // esc cancel → no exit
  h = makeHarness({ snippetTripleQuoteBlock: true });
  h.session.begin(h.target); h.clock.advance(50); h.session.cancel('esc');
  assert.strictEqual(h.events.inspectExit, 0);
});

test('clearVisuals resets without firing callbacks', () => {
  const h = makeHarness({ snippetTripleQuoteBlock: true });
  h.session.begin(h.target);
  h.session.clearVisuals();
  assert.ok(ringNames(h.ring).includes('hide'));
  assert.ok(h.pipeline.wasAborted());
  assert.strictEqual(h.events.inspectExit, 0);
  assert.strictEqual(h.events.settled, 0);
});

(async () => {
  let failed = 0;
  for (const c of cases) {
    try {
      await c.fn();
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
})();
