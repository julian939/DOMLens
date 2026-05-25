/*
 * Action Key Gesture Dispatcher.
 *
 * Pure-logic state machine: translates a stream of Action Key events
 * (`actionKeyDown`, `actionKeyUp`, `cancel`) into terminal gesture outcomes
 * (`snippet`, `snapshot`, `cancel`). Knows nothing about DOM, clipboard, or
 * overlay. Threshold is 300 ms, fixed.
 *
 * Boundary semantics: a release strictly before 300 ms emits `snippet`. The
 * snapshot fires at the threshold timer's tick. At exactly 300 ms the timer
 * wins (snapshot) because the dispatcher resets state before any same-tick
 * key-up can be processed by the caller.
 */
(function () {
  var HOLD_THRESHOLD_MS = 300;
  var PROGRESS_INTERVAL_MS = 16;

  function createDispatcher(opts) {
    opts = opts || {};
    var now = opts.now || function () { return Date.now(); };
    var setTimer = opts.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = opts.clearTimer || function (id) { clearTimeout(id); };

    var progressListeners = [];
    var terminalListeners = [];

    var state = 'idle';
    var target = null;
    var startedAt = 0;
    var thresholdTimerId = null;
    var progressTimerId = null;

    function onProgress(fn) { progressListeners.push(fn); }
    function onTerminal(fn) { terminalListeners.push(fn); }

    function emitProgress(fraction) {
      for (var i = 0; i < progressListeners.length; i++) progressListeners[i](fraction);
    }
    function emitTerminal(kind, payload) {
      for (var i = 0; i < terminalListeners.length; i++) terminalListeners[i](kind, payload);
    }

    function resetTimers() {
      if (thresholdTimerId !== null) { clearTimer(thresholdTimerId); thresholdTimerId = null; }
      if (progressTimerId !== null) { clearTimer(progressTimerId); progressTimerId = null; }
    }

    function resetAll() {
      resetTimers();
      state = 'idle';
      target = null;
      startedAt = 0;
    }

    function tickProgress() {
      progressTimerId = null;
      if (state !== 'holding') return;
      var elapsed = now() - startedAt;
      var fraction = elapsed / HOLD_THRESHOLD_MS;
      if (fraction > 1) fraction = 1;
      if (fraction < 0) fraction = 0;
      emitProgress(fraction);
      if (fraction < 1) {
        progressTimerId = setTimer(tickProgress, PROGRESS_INTERVAL_MS);
      }
    }

    function onThresholdCross() {
      thresholdTimerId = null;
      if (state !== 'holding') return;
      var t = target;
      emitProgress(1);
      resetAll();
      emitTerminal('snapshot', t);
    }

    function actionKeyDown(t) {
      if (state !== 'idle') return;
      target = t;
      state = 'holding';
      startedAt = now();
      emitProgress(0);
      thresholdTimerId = setTimer(onThresholdCross, HOLD_THRESHOLD_MS);
      progressTimerId = setTimer(tickProgress, PROGRESS_INTERVAL_MS);
    }

    function actionKeyUp() {
      if (state !== 'holding') return;
      var elapsed = now() - startedAt;
      if (elapsed >= HOLD_THRESHOLD_MS) return;
      var t = target;
      resetAll();
      emitTerminal('snippet', t);
    }

    function cancel(reason) {
      if (state !== 'holding') return;
      resetAll();
      emitTerminal('cancel', reason);
    }

    function isHolding() { return state === 'holding'; }

    return {
      actionKeyDown: actionKeyDown,
      actionKeyUp: actionKeyUp,
      cancel: cancel,
      onProgress: onProgress,
      onTerminal: onTerminal,
      isHolding: isHolding,
      HOLD_THRESHOLD_MS: HOLD_THRESHOLD_MS
    };
  }

  var api = { createDispatcher: createDispatcher, HOLD_THRESHOLD_MS: HOLD_THRESHOLD_MS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.GestureDispatcher = api;
  }
})();
