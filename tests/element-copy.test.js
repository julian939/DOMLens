'use strict';

const assert = require('assert');

const htmlEl = { nodeType: 1, tagName: 'HTML' };
const bodyEl = { nodeType: 1, tagName: 'BODY', parentElement: null };

global.document = {
  documentElement: htmlEl,
  body: bodyEl
};

const {
  buildSnippet,
  extractElementText,
  getDisplayText,
  truncateAtWordBoundary,
  SNIPPET_TEXT_MAX_LEN,
  SNIPPET_HREF_MAX_LEN
} = require('../src/shared/element-copy.js');

function fakeClassList(names) {
  const list = names || [];
  return {
    length: list.length,
    [Symbol.iterator]: function* () { yield* list; }
  };
}

function fakeElement(opts) {
  const attrs = opts.attrs || {};
  const el = {
    nodeType: 1,
    tagName: (opts.tag || 'div').toUpperCase(),
    id: opts.id || '',
    classList: fakeClassList(opts.classes),
    childNodes: opts.childNodes || [],
    parentElement: opts.parent || null,
    innerText: opts.innerText,
    textContent: opts.textContent,
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    getAttribute(name) { return attrs[name] || ''; }
  };
  return el;
}

const cases = [];
function test(name, fn) { cases.push({ name, fn }); }

test('buildSnippet omits triple-quote block when disabled', () => {
  const el = fakeElement({
    tag: 'button',
    attrs: { id: 'cta' },
    childNodes: [{ nodeType: 3, nodeValue: 'Submit' }]
  });
  const out = buildSnippet(el, { snippetTripleQuoteBlock: false });
  assert.strictEqual(out, '<button id="cta">Submit</button>');
  assert.ok(!out.startsWith('"""'));
});

test('buildSnippet wraps output in triple-quote block by default', () => {
  const el = fakeElement({
    tag: 'button',
    attrs: { id: 'cta' },
    childNodes: [{ nodeType: 3, nodeValue: 'Submit' }]
  });
  const out = buildSnippet(el);
  assert.ok(out.startsWith('"""\n'));
  assert.ok(out.endsWith('\n"""'));
  assert.ok(out.includes('<button id="cta">Submit</button>'));
});

test('buildSnippet includes full text beyond 120 chars', () => {
  const longText = 'A'.repeat(150);
  const el = fakeElement({
    tag: 'p',
    childNodes: [{ nodeType: 3, nodeValue: longText }]
  });
  const out = buildSnippet(el);
  assert.ok(out.includes(longText));
  assert.ok(!out.includes('…'));
});

test('buildSnippet still truncates long href', () => {
  const href = 'https://example.com/' + 'x'.repeat(80);
  const el = fakeElement({
    tag: 'a',
    attrs: { href },
    childNodes: [{ nodeType: 3, nodeValue: 'Link' }]
  });
  const out = buildSnippet(el);
  assert.ok(out.includes('href="https://example.com/'));
  assert.ok(out.length < href.length + 40);
  const hrefMatch = out.match(/href="([^"]+)"/);
  assert.ok(hrefMatch);
  assert.ok(hrefMatch[1].length <= SNIPPET_HREF_MAX_LEN);
});

test('buildSnippet wraps void elements', () => {
  const el = fakeElement({ tag: 'img', attrs: { alt: 'Logo', src: '/logo.png' } });
  const out = buildSnippet(el);
  assert.ok(out.startsWith('"""\n'));
  assert.ok(out.includes('<img alt="Logo" />'));
  assert.ok(out.endsWith('\n"""'));
});

test('buildSnippet wraps html and body shortcuts', () => {
  assert.strictEqual(buildSnippet(htmlEl), '"""\n<html>\n"""');
  assert.strictEqual(buildSnippet(bodyEl), '"""\n<body>\n"""');
});

test('buildSnippet keeps breadcrumb inside block', () => {
  const parent = fakeElement({ tag: 'div', id: 'card' });
  const el = fakeElement({
    tag: 'span',
    parent,
    childNodes: [{ nodeType: 3, nodeValue: 'x' }]
  });
  const out = buildSnippet(el);
  assert.ok(out.includes('← in div#card'));
  assert.ok(out.endsWith('\n"""'));
});

test('extractElementText prefers own direct text', () => {
  const el = fakeElement({
    childNodes: [{ nodeType: 3, nodeValue: 'Own' }],
    innerText: 'Own Descendant',
    textContent: 'Own Descendant'
  });
  assert.strictEqual(extractElementText(el), 'Own');
});

test('extractElementText falls back to full visible text', () => {
  const el = fakeElement({
    childNodes: [],
    innerText: 'Add to cart',
    textContent: 'Add to cart'
  });
  assert.strictEqual(extractElementText(el), 'Add to cart');
});

test('extractElementText collapses whitespace', () => {
  const el = fakeElement({
    childNodes: [{ nodeType: 3, nodeValue: '  Hello\n  world  ' }]
  });
  assert.strictEqual(extractElementText(el), 'Hello world');
});

test('getDisplayText returns null for empty text', () => {
  const el = fakeElement({ childNodes: [], innerText: '   ', textContent: '   ' });
  assert.strictEqual(getDisplayText(el), null);
});

test('getDisplayText truncates at word boundary with ellipsis', () => {
  const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
  const truncated = getDisplayText(fakeElement({
    childNodes: [{ nodeType: 3, nodeValue: words }]
  }));
  assert.ok(truncated.endsWith('…'));
  assert.ok(truncated.length <= SNIPPET_TEXT_MAX_LEN + 3);
});

test('truncateAtWordBoundary leaves short text untouched', () => {
  assert.strictEqual(truncateAtWordBoundary('hello world', 120), 'hello world');
});

let failed = 0;
for (const { name, fn } of cases) {
  try {
    fn();
    console.log('ok', name);
  } catch (err) {
    failed++;
    console.error('FAIL', name, err.message);
  }
}
if (failed) process.exit(1);
