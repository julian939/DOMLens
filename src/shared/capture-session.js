/*
 * Capture Session.
 *
 * The single owner of one complete capture act, cradle-to-grave: from the
 * Action Key going down (begin) through the Gesture Dispatcher's terminal to
 * the end of the feedback window. See ADR 0004 and CONTEXT.md → Capture Session.
 *
 * It wraps the Gesture Dispatcher and owns the downstream arc the dispatcher's
 * terminal kicks off: the Capture Ring's states, the Capture Toast, the
 * clipboard write, the Element Snapshot pre-compute, and the shared feedback
 * timing. It signals the host back through two callbacks:
 *
 *   onInspectExit() — fired immediately on a commit (snippet/snapshot). The
 *                     host ends Inspect Mode and engages the Capture Latch.
 *   onSettled()     — fired when the feedback window closes (or immediately for
 *                     a non-Dead-Zone cancel). The host releases its lock.
 *
 * A cancel writes no clipboard, shows no toast, and never fires onInspectExit —
 * cancels do not engage the Capture Latch (ADR 0002).
 *
 * Collaborators (ring, toast, clipboard, pipeline, elementCopy) and the clock
 * (now/setTimer/clearTimer, shared with the internal dispatcher) are injected,
 * so the whole arc is testable without a browser — the same discipline the
 * Gesture Dispatcher already uses.
 */
(function () {
  function createSession(deps) {
    var ring = deps.ring;
    var toast = deps.toast;
    var clipboard = deps.clipboard;
    var pipeline = deps.snapshotPipeline;
    var elementCopy = deps.elementCopy;
    var getSettings = deps.getSettings || function () { return null; };
    var onInspectExit = deps.onInspectExit || function () {};
    var onSettled = deps.onSettled || function () {};
    var setTimer = deps.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = deps.clearTimer || function (id) { clearTimeout(id); };
    var createDispatcher = deps.createDispatcher
      || (globalThis.GestureDispatcher && globalThis.GestureDispatcher.createDispatcher);

    var holdTarget = null;
    var preCompute = null;
    var settleTimerId = null;

    var dispatcher = createDispatcher({
      now: deps.now,
      setTimer: deps.setTimer,
      clearTimer: deps.clearTimer
    });

    function abortPreCompute() {
      if (preCompute) {
        preCompute.abort();
        preCompute = null;
      }
    }

    function scheduleSettle(delayMs) {
      if (settleTimerId !== null) clearTimer(settleTimerId);
      settleTimerId = setTimer(function () {
        settleTimerId = null;
        onSettled();
      }, delayMs);
    }

    function handleSnippet(target) {
      /* End Inspect Mode immediately, then pop the ring + toast over the shared
         feedback window. Pre-Compute is abandoned — the snippet path never
         writes its result to the clipboard. */
      onInspectExit();
      var el = target || holdTarget;
      holdTarget = null;
      abortPreCompute();
      if (el) {
        var settings = getSettings();
        var wrapTripleQuote = !settings || settings.snippetTripleQuoteBlock !== false;
        var line = elementCopy.buildSnippet(el, { snippetTripleQuoteBlock: wrapTripleQuote });
        clipboard.write(line);
        ring.pop();
        toast.show('Copied!', el.getBoundingClientRect());
      }
      scheduleSettle(ring.POP_MS + 20);
    }

    function handleSnapshot(target) {
      /* Snapshot fired at threshold-cross. Pre-Compute is already running; the
         ring is already visible (deep-blue active) — startScan swaps it to the
         rotating gradient. Toast fires synchronously so both end together
         (ADR 0002). */
      var pc = preCompute;
      preCompute = null;
      holdTarget = null;
      onInspectExit();
      ring.startScan(target);
      toast.show('Snapshot Copied!', target.getBoundingClientRect());
      scheduleSettle(ring.SCAN_MS + 20);
      if (!pc) return;
      commitSnapshot(pc, target);
    }

    async function commitSnapshot(pc, target) {
      var settings = getSettings();
      var includeScreenshot = !!(settings && settings.snapshot && settings.snapshot.includeScreenshot);
      try {
        var captureResult;
        if (includeScreenshot) {
          captureResult = await pipeline.capture(target);
        } else {
          captureResult = { box: elementCopy.boxFromRect(target), dataUrl: null };
        }
        var payload = await pipeline.commit(pc, captureResult);
        if (!payload) return;
        clipboard.write(payload);
      } catch (_) {
        /* Capture failure produces no toast — silent, regression-safe. */
      }
    }

    function handleCancel(reason) {
      holdTarget = null;
      abortPreCompute();
      if (reason === 'dead-zone-release') {
        /* Dead Zone cancel: ring was charging — fade it out cleanly. No
           clipboard, no toast, no latch. Lock releases on fade-end. */
        ring.fadeFromCharging();
        scheduleSettle(ring.FADE_MS + 20);
        return;
      }
      /* Other cancels (blur, tab-switch, esc, hotkey-release): hide the ring
         and release the lock at once. */
      ring.hide();
      onSettled();
    }

    dispatcher.onTerminal(function (kind, payload) {
      if (kind === 'snippet') handleSnippet(payload);
      else if (kind === 'snapshot') handleSnapshot(payload);
      else if (kind === 'cancel') handleCancel(payload);
    });

    /* Hold-progress ticks are intentionally ignored: the deep-blue ring's mere
       presence says "key is pressed"; the colour switch at threshold-cross is
       itself the indicator. Only the Dead Zone needs the charging build-up. */
    dispatcher.onZoneChange(function (zone) {
      if (zone === 'dead-zone' && holdTarget) ring.startCharging(holdTarget);
    });

    function begin(target) {
      if (!target) return;
      holdTarget = target;
      /* Ring becomes visible the instant the Action Key is pressed. Pre-Compute
         is speculative — abandoned if the gesture cancels or commits a snippet. */
      ring.show(target);
      preCompute = pipeline.startPreCompute(target);
      dispatcher.actionKeyDown(target);
    }

    function actionKeyUp() {
      dispatcher.actionKeyUp();
    }

    function cancel(reason) {
      dispatcher.cancel(reason);
    }

    function isHolding() {
      return dispatcher.isHolding();
    }

    function clearVisuals() {
      /* Hard reset for the host's deactivate paths (blur, tab-switch,
         hotkey-release, settings change). Mirrors the legacy clearGestureState:
         it tears down the visible/speculative state but leaves the dispatcher
         alone (those paths either cancelled first or aren't mid-hold). */
      if (settleTimerId !== null) {
        clearTimer(settleTimerId);
        settleTimerId = null;
      }
      ring.hide();
      abortPreCompute();
      holdTarget = null;
    }

    return {
      begin: begin,
      actionKeyUp: actionKeyUp,
      cancel: cancel,
      isHolding: isHolding,
      clearVisuals: clearVisuals
    };
  }

  var api = { createSession: createSession };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.CaptureSession = api;
  }
})();
