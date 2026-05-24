(() => {
  const PSEUDO_ELEMENTS = ['::before', '::after'];

  const SKIP_PROPS = new Set([
    'perspective-origin',
    'transform-origin',
    '-webkit-border-image',
    '-webkit-locale',
    '-webkit-text-decorations-in-effect',
    '-webkit-tap-highlight-color',
    '-webkit-text-size-adjust'
  ]);

  function createDefaultsResolver() {
    const cache = new Map();
    let iframe = null;
    let iframeDoc = null;

    function ensureIframe() {
      if (iframe && iframe.isConnected && iframeDoc) return;
      iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;pointer-events:none;left:-9999px;top:-9999px;';
      (document.body || document.documentElement).appendChild(iframe);
      iframeDoc = iframe.contentDocument;
      if (iframeDoc && iframeDoc.body) {
        iframeDoc.body.style.margin = '0';
      }
    }

    function resolveFor(tagName) {
      const key = tagName.toLowerCase();
      const cached = cache.get(key);
      if (cached) return cached;
      ensureIframe();
      const probe = iframeDoc.createElement(key);
      iframeDoc.body.appendChild(probe);
      const cs = iframe.contentWindow.getComputedStyle(probe);
      const map = new Map();
      for (let i = 0; i < cs.length; i++) {
        const prop = cs.item(i);
        map.set(prop, cs.getPropertyValue(prop));
      }
      iframeDoc.body.removeChild(probe);
      cache.set(key, map);
      return map;
    }

    function dispose() {
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
      iframe = null;
      iframeDoc = null;
      cache.clear();
    }

    return { resolveFor, dispose };
  }

  function diffProps(computed, defaults) {
    const out = {};
    for (let i = 0; i < computed.length; i++) {
      const prop = computed.item(i);
      if (SKIP_PROPS.has(prop)) continue;
      const value = computed.getPropertyValue(prop);
      const def = defaults.get(prop);
      if (def === undefined || value !== def) {
        out[prop] = value;
      }
    }
    return out;
  }

  function collectPseudo(el) {
    const result = {};
    for (const pseudo of PSEUDO_ELEMENTS) {
      const cs = getComputedStyle(el, pseudo);
      const content = cs.getPropertyValue('content');
      const trimmed = (content || '').trim();
      if (!trimmed || trimmed === 'none' || trimmed === 'normal') continue;
      const baseCs = getComputedStyle(el);
      const props = {};
      for (let i = 0; i < cs.length; i++) {
        const prop = cs.item(i);
        if (SKIP_PROPS.has(prop)) continue;
        const value = cs.getPropertyValue(prop);
        const baseValue = baseCs.getPropertyValue(prop);
        if (value !== baseValue) props[prop] = value;
      }
      props.content = trimmed;
      result[pseudo === '::before' ? 'before' : 'after'] = {
        content: trimmed,
        props
      };
    }
    return result;
  }

  function buildNode(el, resolver) {
    const tag = el.tagName.toLowerCase();
    const defaults = resolver.resolveFor(tag);
    const computed = getComputedStyle(el);
    const props = diffProps(computed, defaults);

    const node = { tag, props };

    const pseudo = collectPseudo(el);
    if (pseudo.before || pseudo.after) node.pseudo = pseudo;

    const children = [];
    for (const child of el.children) {
      if (child.nodeType !== 1) continue;
      children.push(buildNode(child, resolver));
    }
    if (children.length) node.children = children;

    return node;
  }

  function buildTree(el) {
    if (!el || el.nodeType !== 1) return null;
    const resolver = createDefaultsResolver();
    try {
      return buildNode(el, resolver);
    } finally {
      resolver.dispose();
    }
  }

  globalThis.ComputedStylesDiff = { buildTree };
})();
