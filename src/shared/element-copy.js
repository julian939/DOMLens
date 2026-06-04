(() => {
  const SNIPPET_TEXT_MAX_LEN = 120;
  const SNIPPET_PARENT_MAX_DEPTH = 3;
  const SNIPPET_HREF_MAX_LEN = 40;

  const VOID_ELEMENT_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  const SNIPPET_PRIORITY_ATTRS = [
    'id',
    'data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-component',
    'role',
    'aria-label',
    'name',
    'type',
    'alt',
    'placeholder',
    'href'
  ];

  const UTILITY_CLASS_PREFIXES = [
    'text-', 'bg-', 'border-', 'rounded-', 'shadow-', 'ring-', 'opacity-',
    'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-', 'ps-', 'pe-',
    'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-', 'ms-', 'me-',
    'w-', 'h-', 'min-w-', 'min-h-', 'max-w-', 'max-h-', 'size-',
    'gap-', 'gap-x-', 'gap-y-', 'space-x-', 'space-y-',
    'items-', 'justify-', 'self-', 'place-', 'content-',
    'top-', 'bottom-', 'left-', 'right-', 'inset-', 'z-',
    'cursor-', 'select-', 'pointer-', 'overflow-', 'whitespace-',
    'duration-', 'ease-', 'animate-', 'delay-',
    'translate-', 'rotate-', 'scale-', 'skew-', 'origin-',
    'font-', 'tracking-', 'leading-', 'line-clamp-', 'list-',
    'fill-', 'stroke-', 'aspect-',
    'col-', 'row-', 'order-', 'divide-',
    'grid-cols-', 'grid-rows-', 'auto-cols-', 'auto-rows-', 'auto-flow-',
    'basis-', 'grow-', 'shrink-', 'flex-',
    'object-', 'isolate-', 'mix-blend-', 'bg-blend-',
    'backdrop-', 'filter-', 'blur-', 'brightness-', 'contrast-',
    'transition-', 'transform-'
  ];

  const UTILITY_CLASS_KEYWORDS = new Set([
    'flex', 'grid', 'hidden', 'block', 'inline', 'inline-block',
    'inline-flex', 'inline-grid', 'table', 'table-row', 'table-cell',
    'absolute', 'relative', 'fixed', 'sticky', 'static',
    'transition', 'transform', 'transform-gpu',
    'truncate', 'uppercase', 'lowercase', 'capitalize', 'italic',
    'underline', 'line-through', 'no-underline',
    'overflow-hidden', 'overflow-visible', 'overflow-auto', 'overflow-scroll',
    'sr-only', 'not-sr-only',
    'rounded', 'border', 'shadow', 'ring',
    'antialiased', 'subpixel-antialiased',
    'visible', 'invisible', 'collapse',
    'isolate', 'group', 'peer',
    'container'
  ]);

  const HASH_CLASS_PATTERNS = [
    /^css-[a-z0-9]+$/i,
    /^sc-[a-zA-Z0-9]+$/,
    /^_[A-Za-z0-9_-]{4,}$/,
    /^[a-z][a-zA-Z0-9]*__[A-Za-z0-9_-]+--[A-Za-z0-9]+$/,
    /[a-f0-9]{6,}/i
  ];

  const escapeHtml = (typeof module !== 'undefined' && module.exports)
    ? require('./escape-html.js').escapeHtml
    : globalThis.EscapeHtml.escapeHtml;

  function truncateAtWordBoundary(text, maxLen) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    const slice = text.slice(0, maxLen);
    const lastSpace = slice.lastIndexOf(' ');
    const cut = lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice;
    return cut.replace(/[\s…]+$/, '') + '…';
  }

  function isSemanticClass(name) {
    if (!name) return false;
    if (name.includes('[') || name.includes(':') || name.includes('/')) return false;
    if (UTILITY_CLASS_KEYWORDS.has(name)) return false;
    for (const prefix of UTILITY_CLASS_PREFIXES) {
      if (name.startsWith(prefix)) return false;
    }
    for (const pattern of HASH_CLASS_PATTERNS) {
      if (pattern.test(name)) return false;
    }
    return true;
  }

  function filterSemanticClasses(classList) {
    const out = [];
    for (const name of classList) {
      if (isSemanticClass(name)) out.push(name);
    }
    return out;
  }

  function getElementOwnText(el) {
    let out = '';
    for (const node of el.childNodes) {
      if (node.nodeType === 3) out += node.nodeValue;
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  function extractElementText(el) {
    if (!el) return '';
    const own = getElementOwnText(el);
    if (own) return own;
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function getDisplayText(el, maxLen) {
    const text = extractElementText(el);
    if (!text) return null;
    return truncateAtWordBoundary(text, maxLen == null ? SNIPPET_TEXT_MAX_LEN : maxLen);
  }

  function getSnippetText(el) {
    return extractElementText(el);
  }

  function wrapSnippetBlock(snippet) {
    return `"""\n${snippet}\n"""`;
  }

  function collectSnippetAttrs(el) {
    const pairs = [];
    for (const name of SNIPPET_PRIORITY_ATTRS) {
      if (!el.hasAttribute(name)) continue;
      let value = el.getAttribute(name) || '';
      if (name === 'href' && value.length > SNIPPET_HREF_MAX_LEN) {
        value = value.slice(0, SNIPPET_HREF_MAX_LEN - 1) + '…';
      }
      pairs.push([name, value]);
    }
    const classes = el.classList && el.classList.length
      ? filterSemanticClasses(Array.from(el.classList))
      : [];
    if (classes.length) pairs.push(['class', classes.join(' ')]);
    return pairs;
  }

  function shortAncestorSelector(node) {
    if (!node || node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    if (node.id) return `${tag}#${node.id}`;
    const testid = node.getAttribute && node.getAttribute('data-testid');
    if (testid) return `${tag}[data-testid="${testid}"]`;
    if (node.classList && node.classList.length) {
      const semantic = filterSemanticClasses(Array.from(node.classList));
      if (semantic.length) return `${tag}.${semantic[0]}`;
    }
    return tag;
  }

  function buildParentBreadcrumb(el) {
    const segments = [];
    let node = el.parentElement;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < SNIPPET_PARENT_MAX_DEPTH) {
      if (node === document.documentElement || node === document.body) break;
      const seg = shortAncestorSelector(node);
      segments.unshift(seg);
      const hasAnchor = node.id
        || (node.getAttribute && node.getAttribute('data-testid'))
        || (node.classList && filterSemanticClasses(Array.from(node.classList)).length > 0);
      if (hasAnchor) break;
      node = node.parentElement;
      depth++;
    }
    if (!segments.length) return '';
    return segments.join(' > ');
  }

  function buildSnippet(el, options) {
    if (!el || el.nodeType !== 1) return '';
    const wrapBlock = !options || options.snippetTripleQuoteBlock !== false;
    const finish = wrapBlock ? wrapSnippetBlock : (s) => s;

    if (el === document.documentElement) return finish('<html>');
    if (el === document.body) return finish('<body>');

    const tag = el.tagName.toLowerCase();
    const attrs = collectSnippetAttrs(el);
    const attrStr = attrs.map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join('');
    const isVoid = VOID_ELEMENT_TAGS.has(tag);
    const text = isVoid ? '' : getSnippetText(el);

    let snippet;
    if (isVoid) {
      snippet = `<${tag}${attrStr} />`;
    } else {
      snippet = `<${tag}${attrStr}>${escapeHtml(text)}</${tag}>`;
    }

    const hasIdentifier = attrs.some(([k]) => k === 'id'
      || k === 'aria-label'
      || k.startsWith('data-'));
    const textIsMeaningful = text && text.length > 2;
    if (!hasIdentifier && !textIsMeaningful) {
      const breadcrumb = buildParentBreadcrumb(el);
      if (breadcrumb) snippet += `  ← in ${breadcrumb}`;
    }
    return finish(snippet);
  }

  function idSelector(el) {
    const id = el.id;
    if (/^[A-Za-z_][\w-]*$/.test(id)) {
      return `#${CSS.escape(id)}`;
    }
    return `[id="${id.replace(/"/g, '\\"')}"]`;
  }

  function isUnique(el, selector) {
    try {
      const matches = (el.ownerDocument || document).querySelectorAll(selector);
      return matches.length === 1 && matches[0] === el;
    } catch (_) {
      return false;
    }
  }

  function buildFullPath(el) {
    const segments = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      let segment = tag;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (c) => c.tagName === node.tagName
        );
        if (sameTagSiblings.length > 1) {
          segment += `:nth-of-type(${sameTagSiblings.indexOf(node) + 1})`;
        }
      }
      segments.unshift(segment);
      node = node.parentElement;
    }
    segments.unshift('html');
    return segments.join(' > ');
  }

  function buildUniqueSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el === document.documentElement) return 'html';
    if (el === document.body) return 'body';

    if (el.id && isUnique(el, idSelector(el))) {
      return idSelector(el);
    }

    const tag = el.tagName.toLowerCase();
    if (el.classList.length) {
      const classSel = tag + '.' + Array.from(el.classList).map(CSS.escape).join('.');
      if (isUnique(el, classSel)) return classSel;
    }

    const segments = [];
    let node = el;
    let anchorFound = false;

    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node.id && isUnique(node, idSelector(node))) {
        segments.unshift(idSelector(node));
        anchorFound = true;
        break;
      }

      const nodeTag = node.tagName.toLowerCase();
      let segment = nodeTag;

      if (node.classList.length) {
        const candidate = nodeTag + '.' + Array.from(node.classList).map(CSS.escape).join('.');
        if (isUnique(node, candidate)) {
          segments.unshift(candidate);
          anchorFound = true;
          break;
        }
      }

      const parent = node.parentElement;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (c) => c.tagName === node.tagName
        );
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(node) + 1;
          segment += `:nth-of-type(${index})`;
        }
      }

      segments.unshift(segment);
      node = node.parentElement;
    }

    if (!anchorFound) segments.unshift('html');

    const joined = segments.join(' > ');
    if (isUnique(el, joined)) return joined;

    return buildFullPath(el);
  }

  function extractFullVisibleText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function buildMeta() {
    return {
      url: location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      devicePixelRatio: window.devicePixelRatio || 1,
      capturedAt: new Date().toISOString()
    };
  }

  function requestViewportCapture() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'captureVisibleTab' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          if (!response || !response.ok || !response.dataUrl) {
            resolve(null);
            return;
          }
          resolve(response.dataUrl);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function captureElementScreenshot(box, devicePixelRatio) {
    if (box.width <= 0 || box.height <= 0) return null;
    const dataUrl = await requestViewportCapture();
    if (!dataUrl) return null;
    try {
      const base64 = await globalThis.ScreenshotCrop.cropViewportPng(dataUrl, box, devicePixelRatio);
      if (!base64) return null;
      return {
        mimeType: 'image/png',
        encoding: 'base64',
        data: base64
      };
    } catch (_) {
      return null;
    }
  }

  /*
   * Build everything in a snapshot except the screenshot. Used by the new
   * pipeline (issue 06) as the Pre-Compute phase — kicked off at key-down,
   * safe to abandon if the gesture cancels.
   */
  function buildSnapshotSansScreenshot(el) {
    const selector = buildUniqueSelector(el);
    const rect = el.getBoundingClientRect();
    const box = {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      x: Math.round(rect.left),
      y: Math.round(rect.top)
    };
    const meta = buildMeta();
    return {
      selector,
      box,
      html: el.outerHTML || '',
      text: extractFullVisibleText(el),
      styles: globalThis.ComputedStylesDiff.buildTree(el),
      assets: globalThis.AssetCollector.collect(el),
      meta
    };
  }

  function boxFromRect(el) {
    const rect = el.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      x: Math.round(rect.left),
      y: Math.round(rect.top)
    };
  }

  async function buildSnapshot(el, options) {
    const includeScreenshot = !options || options.includeScreenshot !== false;
    const snapshot = buildSnapshotSansScreenshot(el);
    if (includeScreenshot) {
      const screenshot = await captureElementScreenshot(snapshot.box, snapshot.meta.devicePixelRatio);
      if (screenshot) snapshot.screenshot = screenshot;
    }
    return JSON.stringify(snapshot);
  }

  const api = {
    buildSnippet,
    buildSnapshot,
    buildSnapshotSansScreenshot,
    boxFromRect,
    requestViewportCapture,
    extractElementText,
    getDisplayText,
    getElementOwnText,
    truncateAtWordBoundary,
    SNIPPET_TEXT_MAX_LEN,
    SNIPPET_HREF_MAX_LEN
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.ElementCopy = api;
  }
})();
