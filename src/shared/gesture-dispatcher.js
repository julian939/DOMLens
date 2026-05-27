(function () {
  var SNIPPET_MAX_MS = 300;
  var SNAPSHOT_MIN_MS = 1300;
  var PROGRESS_INTERVAL_MS = 16;

  function createDispatcher(opts) {
    opts = opts || {};
    var now = opts.now || function () { return Date.now(); };
    var setTimer = opts.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = opts.clearTimer || function (id) { clearTimeout(id); };

    var progressListeners = [];
    var terminalListeners = [];
    var zoneListeners = [];

    var state = 'idle';
    var target = null;
    var startedAt = 0;
    var deadZoneTimerId = null;
    var snapshotTimerId = null;
    var progressTimerId = null;

    function onProgress(fn) { progressListeners.push(fn); }
    function onTerminal(fn) { terminalListeners.push(fn); }
    function onZoneChange(fn) { zoneListeners.push(fn); }

    function emitProgress(fraction) {
      for (var i = 0; i < progressListeners.length; i++) progressListeners[i](fraction);
    }
    function emitTerminal(kind, payload) {
      for (var i = 0; i < terminalListeners.length; i++) terminalListeners[i](kind, payload);
    }
    function emitZone(zone) {
      for (var i = 0; i < zoneListeners.length; i++) zoneListeners[i](zone);
    }

    function resetTimers() {
      if (deadZoneTimerId !== null) { clearTimer(deadZoneTimerId); deadZoneTimerId = null; }
      if (snapshotTimerId !== null) { clearTimer(snapshotTimerId); snapshotTimerId = null; }
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
      if (state !== 'snippet-zone' && state !== 'dead-zone') return;
      var elapsed = now() - startedAt;
      var fraction = elapsed / SNAPSHOT_MIN_MS;
      if (fraction > 1) fraction = 1;
      if (fraction < 0) fraction = 0;
      emitProgress(fraction);
      if (fraction < 1) {
        progressTimerId = setTimer(tickProgress, PROGRESS_INTERVAL_MS);
      }
    }

    function onDeadZone() {
      deadZoneTimerId = null;
      if (state !== 'snippet-zone') return;
      state = 'dead-zone';
      emitZone('dead-zone');
    }

    function onSnapshotThreshold() {
      snapshotTimerId = null;
      if (state !== 'dead-zone') return;
      var t = target;
      state = 'snapshot-zone';
      emitProgress(1);
      emitZone('snapshot-zone');
      resetAll();
      emitTerminal('snapshot', t);
    }

    function actionKeyDown(t) {
      if (state !== 'idle') return;
      target = t;
      state = 'snippet-zone';
      startedAt = now();
      emitZone('snippet-zone');
      emitProgress(0);
      deadZoneTimerId = setTimer(onDeadZone, SNIPPET_MAX_MS);
      snapshotTimerId = setTimer(onSnapshotThreshold, SNAPSHOT_MIN_MS);
      progressTimerId = setTimer(tickProgress, PROGRESS_INTERVAL_MS);
    }

    function actionKeyUp() {
      if (state === 'snippet-zone') {
        var t = target;
        resetAll();
        emitTerminal('snippet', t);
      } else if (state === 'dead-zone') {
        resetAll();
        emitTerminal('cancel', 'dead-zone-release');
      }
      /* snapshot-zone: no-op */
    }

    function cancel(reason) {
      if (state === 'idle') return;
      resetAll();
      emitTerminal('cancel', reason);
    }

    function isHolding() { return state !== 'idle'; }

    return {
      actionKeyDown: actionKeyDown,
      actionKeyUp: actionKeyUp,
      cancel: cancel,
      onProgress: onProgress,
      onTerminal: onTerminal,
      onZoneChange: onZoneChange,
      isHolding: isHolding,
      SNIPPET_MAX_MS: SNIPPET_MAX_MS,
      SNAPSHOT_MIN_MS: SNAPSHOT_MIN_MS
    };
  }

  var api = { createDispatcher: createDispatcher, SNIPPET_MAX_MS: SNIPPET_MAX_MS, SNAPSHOT_MIN_MS: SNAPSHOT_MIN_MS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.GestureDispatcher = api;
  }
})();
