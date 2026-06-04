/*
 * Minimal HTML-escaping, shared so the Info Panel builder, the Element Copy
 * snippet builder, and the Options page all escape the same way instead of
 * keeping three identical copies.
 */
(function () {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var api = { escapeHtml: escapeHtml };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    globalThis.EscapeHtml = api;
  }
})();
