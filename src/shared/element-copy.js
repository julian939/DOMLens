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

  const CURATED_STYLE_PROPS = [
    'display', 'position', 'top', 'right', 'bottom', 'left',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'padding', 'border', 'border-radius', 'box-sizing',
    'box-shadow', 'opacity', 'visibility', 'overflow', 'z-index',
    'background', 'background-color', 'background-image',
    'color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'line-height', 'letter-spacing', 'text-align', 'text-decoration',
    'text-transform', 'white-space',
    'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
    'align-content', 'align-self', 'gap', 'order',
    'grid-template-columns', 'grid-template-rows', 'grid-area',
    'grid-column', 'grid-row',
    'transform', 'transform-origin', 'transition', 'animation',
    'cursor', 'pointer-events', 'user-select'
  ];

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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

  function getSnippetText(el) {
    const own = getElementOwnText(el);
    if (own) return truncateAtWordBoundary(own, SNIPPET_TEXT_MAX_LEN);
    const full = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return truncateAtWordBoundary(full, SNIPPET_TEXT_MAX_LEN);
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

  function buildSnippet(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el === document.documentElement) return '<html>';
    if (el === document.body) return '<body>';

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
    return snippet;
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

  function collectCuratedStyles(el) {
    const cs = getComputedStyle(el);
    const lines = [];
    for (const prop of CURATED_STYLE_PROPS) {
      const value = cs.getPropertyValue(prop);
      if (!value) continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (trimmed === 'none' || trimmed === 'normal' || trimmed === 'auto' ||
          trimmed === '0px' || trimmed === 'rgba(0, 0, 0, 0)') {
        continue;
      }
      lines.push(`${prop}: ${trimmed}`);
    }
    return lines.join('\n');
  }

  function extractFullVisibleText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function buildSnapshot(el) {
    const selector = buildUniqueSelector(el);
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const x = Math.round(rect.left);
    const y = Math.round(rect.top);
    const html = el.outerHTML || '';
    const styles = collectCuratedStyles(el);
    const text = extractFullVisibleText(el);

    const parts = [];
    parts.push('# DOMLens — Element snapshot');
    parts.push('');
    parts.push('## Selector');
    parts.push(selector);
    parts.push('');
    parts.push('## Box');
    parts.push(`width: ${width}px  height: ${height}px  x: ${x}  y: ${y}`);
    parts.push('');
    parts.push('## HTML');
    parts.push(html);
    parts.push('');
    parts.push('## Computed styles');
    parts.push(styles);
    if (text) {
      parts.push('');
      parts.push('## Text');
      parts.push(text);
    }
    return parts.join('\n');
  }

  globalThis.ElementCopy = {
    buildSnippet,
    buildSnapshot
  };
})();
