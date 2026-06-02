(function () {
  function isConnected(el) {
    if (!el) return false;
    if (typeof el.isConnected === 'boolean') return el.isConnected;
    return !!(el.ownerDocument && el.ownerDocument.documentElement
      && el.ownerDocument.documentElement.contains(el));
  }

  function buildChain(leaf) {
    if (!leaf || !isConnected(leaf)) return [];
    const chain = [];
    let node = leaf;
    while (node) {
      chain.push(node);
      const name = (node.nodeName || node.tagName || '').toUpperCase();
      if (name === 'BODY') break;
      node = node.parentElement;
    }
    return chain;
  }

  function createNavigator() {
    var anchorLeaf = null;
    var depth = 0;
    var chain = [];

    function clearAnchor() {
      anchorLeaf = null;
      depth = 0;
      chain = [];
    }

    function ensureChain() {
      if (!anchorLeaf || !isConnected(anchorLeaf)) return [];
      if (!chain.length || chain[0] !== anchorLeaf || !isConnected(chain[depth])) {
        chain = buildChain(anchorLeaf);
        if (depth >= chain.length) depth = Math.max(0, chain.length - 1);
      }
      return chain;
    }

    function setLeaf(el) {
      if (!el || !isConnected(el)) {
        clearAnchor();
        return;
      }
      if (el !== anchorLeaf) {
        anchorLeaf = el;
        depth = 0;
        chain = buildChain(anchorLeaf);
      }
    }

    function step(units) {
      if (!anchorLeaf || !isConnected(anchorLeaf)) return false;
      const liveChain = ensureChain();
      if (!liveChain.length) return false;
      const maxDepth = liveChain.length - 1;
      const next = Math.max(0, Math.min(maxDepth, depth + units));
      if (next === depth) return false;
      depth = next;
      return true;
    }

    function current() {
      if (!anchorLeaf || !isConnected(anchorLeaf)) return null;
      const liveChain = ensureChain();
      if (!liveChain.length) return null;
      return liveChain[depth];
    }

    function reset() {
      clearAnchor();
    }

    return {
      setLeaf: setLeaf,
      step: step,
      current: current,
      reset: reset
    };
  }

  var api = { createNavigator: createNavigator, buildChain: buildChain };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.ScrollNavigator = api;
  }
})();
