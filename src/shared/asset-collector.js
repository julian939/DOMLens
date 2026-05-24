(() => {
  const GENERIC_FONT_FAMILIES = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
    'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
    'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert', 'revert-layer'
  ]);

  const ASSET_STYLE_PROPS_WITH_URLS = [
    'background-image',
    'border-image-source',
    'mask-image',
    '-webkit-mask-image',
    'list-style-image',
    'cursor'
  ];

  const PSEUDO_ELEMENTS = ['::before', '::after'];

  function stripFontFamilyName(raw) {
    if (!raw) return '';
    let s = raw.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1);
    }
    return s.trim();
  }

  function parseFontFamilyList(value) {
    if (!value) return [];
    const families = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (quote) {
        if (ch === quote) quote = null;
        else current += ch;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === ',') {
        const trimmed = stripFontFamilyName(current);
        if (trimmed) families.push(trimmed);
        current = '';
        continue;
      }
      current += ch;
    }
    const trimmed = stripFontFamilyName(current);
    if (trimmed) families.push(trimmed);
    return families;
  }

  function extractUrlsFromCssValue(value) {
    if (!value || value === 'none') return [];
    const urls = [];
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
    let m;
    while ((m = re.exec(value)) !== null) {
      const url = m[2].trim();
      if (url && !url.startsWith('data:')) urls.push(url);
    }
    return urls;
  }

  function toAbsoluteUrl(url) {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    try {
      return new URL(url, document.baseURI).href;
    } catch (_) {
      return url;
    }
  }

  function parseSrcset(value) {
    if (!value) return [];
    return value.split(',').map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return '';
      return trimmed.split(/\s+/)[0];
    }).filter(Boolean);
  }

  function findFontFaceMatches(family) {
    if (!document.fonts || typeof document.fonts.values !== 'function') return [];
    const matches = [];
    const target = family.toLowerCase();
    for (const face of document.fonts.values()) {
      const faceFamily = stripFontFamilyName(face.family).toLowerCase();
      if (faceFamily === target) matches.push(face);
    }
    return matches;
  }

  function extractFontFaceSource(face) {
    if (!face) return undefined;
    const src = face._src || face.src || '';
    if (!src || typeof src !== 'string') return undefined;
    const urls = extractUrlsFromCssValue(src);
    if (!urls.length) return undefined;
    return toAbsoluteUrl(urls[0]);
  }

  function collectFontEntriesForFamily(family) {
    if (GENERIC_FONT_FAMILIES.has(family.toLowerCase())) {
      return [{ family, weight: 'normal', style: 'normal' }];
    }
    const matches = findFontFaceMatches(family);
    if (!matches.length) {
      return [{ family, weight: 'normal', style: 'normal' }];
    }
    return matches.map((face) => {
      const entry = {
        family,
        weight: face.weight || 'normal',
        style: face.style || 'normal'
      };
      const source = extractFontFaceSource(face);
      if (source) entry.source = source;
      return entry;
    });
  }

  function collectImageEntries(root) {
    const entries = [];
    const seen = new Set();

    function push(url, extra) {
      if (!url || seen.has(url)) return;
      seen.add(url);
      entries.push(extra ? { url, ...extra } : { url });
    }

    function addImg(img) {
      const src = img.currentSrc || img.getAttribute('src');
      if (src) {
        const extra = {};
        if (img.naturalWidth) extra.naturalWidth = img.naturalWidth;
        if (img.naturalHeight) extra.naturalHeight = img.naturalHeight;
        push(toAbsoluteUrl(src), Object.keys(extra).length ? extra : undefined);
      }
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        for (const candidate of parseSrcset(srcset)) {
          push(toAbsoluteUrl(candidate));
        }
      }
    }

    function addSource(source) {
      const srcset = source.getAttribute('srcset');
      if (!srcset) return;
      for (const candidate of parseSrcset(srcset)) {
        push(toAbsoluteUrl(candidate));
      }
    }

    function addUse(el) {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (!href || href.startsWith('#')) return;
      push(toAbsoluteUrl(href.split('#')[0]));
    }

    function visitForBackgrounds(el) {
      const targets = [null, ...PSEUDO_ELEMENTS];
      for (const pseudo of targets) {
        const cs = getComputedStyle(el, pseudo);
        if (!cs) continue;
        for (const prop of ASSET_STYLE_PROPS_WITH_URLS) {
          const value = cs.getPropertyValue(prop);
          for (const raw of extractUrlsFromCssValue(value)) {
            push(toAbsoluteUrl(raw));
          }
        }
      }
    }

    function visitElement(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'img') addImg(el);
      else if (tag === 'source') addSource(el);
      else if (tag === 'use') addUse(el);
      visitForBackgrounds(el);
    }

    visitElement(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      visitElement(node);
      node = walker.nextNode();
    }

    return entries;
  }

  function collectFontsAndVariables(root) {
    const fontFamilies = new Set();
    const cssVariables = {};

    function visit(el) {
      const targets = [null, ...PSEUDO_ELEMENTS];
      for (const pseudo of targets) {
        const cs = getComputedStyle(el, pseudo);
        if (!cs) continue;
        if (!pseudo || cs.getPropertyValue('content') !== 'none') {
          const ff = cs.getPropertyValue('font-family');
          for (const name of parseFontFamilyList(ff)) {
            fontFamilies.add(name);
          }
        }
        for (let i = 0; i < cs.length; i++) {
          const prop = cs.item(i);
          if (prop && prop.startsWith('--')) {
            const value = cs.getPropertyValue(prop).trim();
            if (value && !(prop in cssVariables)) {
              cssVariables[prop] = value;
            }
          }
        }
      }
    }

    visit(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      visit(node);
      node = walker.nextNode();
    }

    const fonts = [];
    const seenKeys = new Set();
    for (const family of fontFamilies) {
      for (const entry of collectFontEntriesForFamily(family)) {
        const key = `${entry.family}|${entry.weight}|${entry.style}|${entry.source || ''}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        fonts.push(entry);
      }
    }
    return { fonts, cssVariables };
  }

  function collect(el) {
    if (!el || el.nodeType !== 1) {
      return { fonts: [], images: [], cssVariables: {} };
    }
    const { fonts, cssVariables } = collectFontsAndVariables(el);
    const images = collectImageEntries(el);
    return { fonts, images, cssVariables };
  }

  globalThis.AssetCollector = { collect };
})();
