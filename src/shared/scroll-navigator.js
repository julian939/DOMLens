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

  function distanceToRect(x, y, rect) {
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function findClosestChild(parentEl, x, y) {
    if (!parentEl || !parentEl.children) return null;
    const children = parentEl.children;
    const len = children.length;
    if (len === 0) return null;

    if (typeof x !== 'number' || typeof y !== 'number') {
      // Find the first visible/non-zero child, or fallback to first child
      for (let i = 0; i < len; i++) {
        const child = children[i];
        if (child.offsetWidth !== 0 || child.offsetHeight !== 0) {
          return child;
        }
      }
      return children[0] || null;
    }
    let closestChild = null;
    let minDistance = Infinity;

    for (let i = 0; i < len; i++) {
      const child = children[i];
      // Skip hidden/unrendered elements
      if (child.offsetWidth === 0 && child.offsetHeight === 0) {
        continue;
      }
      const rect = typeof child.getBoundingClientRect === 'function'
        ? child.getBoundingClientRect()
        : { left: 0, right: 0, top: 0, bottom: 0 };
      const dist = distanceToRect(x, y, rect);
      if (dist < minDistance) {
        minDistance = dist;
        closestChild = child;
      }
    }
    return closestChild || children[0] || null;
  }

  function createNavigator() {
    var anchorLeaf = null;
    var hoveredLeaf = null;
    var depth = 0;
    var chain = [];

    function clearAnchor() {
      anchorLeaf = null;
      hoveredLeaf = null;
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
      if (el !== hoveredLeaf) {
        hoveredLeaf = el;
        anchorLeaf = el;
        depth = 0;
        chain = buildChain(anchorLeaf);
      }
    }

    function step(units, x, y) {
      if (!anchorLeaf || !isConnected(anchorLeaf)) return false;
      const liveChain = ensureChain();
      if (!liveChain.length) return false;
      const maxDepth = liveChain.length - 1;

      let next = depth + units;
      if (next < 0) {
        // We are at depth 0 (or trying to descend further).
        // Try to descend to the closest child of the current anchorLeaf.
        const child = findClosestChild(anchorLeaf, x, y);
        if (child) {
          anchorLeaf = child;
          chain = buildChain(anchorLeaf);
          depth = 0;
          return true;
        }
        next = 0;
      }

      next = Math.max(0, Math.min(maxDepth, next));
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
