(function () {
  /**
   * Accumulate wheel deltaY into discrete chain steps with cooldown.
   * @returns {{ steps: number, state: { accum: number, lastStepAt: number } }}
   */
  function accumulateWheel(deltaY, wheelState, threshold, cooldownMs, nowMs) {
    var state = wheelState || { accum: 0, lastStepAt: 0 };
    var steps = 0;

    state.accum += deltaY;
    while (Math.abs(state.accum) >= threshold) {
      if (nowMs - state.lastStepAt < cooldownMs) break;
      steps += state.accum > 0 ? 1 : -1;
      state.accum += state.accum > 0 ? -threshold : threshold;
      state.lastStepAt = nowMs;
      break;
    }

    return { steps: steps, state: state };
  }

  var api = { accumulateWheel: accumulateWheel };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.WheelStep = api;
  }
})();
