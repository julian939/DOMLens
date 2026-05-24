// Open the options page when the user clicks the DOMLens toolbar icon.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'captureVisibleTab') return undefined;

  // captureVisibleTab targets the focused window; passing null uses the current window.
  const windowId = sender.tab && typeof sender.tab.windowId === 'number'
    ? sender.tab.windowId
    : null;

  const cb = (dataUrl) => {
    const err = chrome.runtime.lastError;
    if (err || !dataUrl) {
      sendResponse({ ok: false, error: (err && err.message) || 'capture failed' });
      return;
    }
    sendResponse({ ok: true, dataUrl });
  };

  try {
    if (windowId == null) {
      chrome.tabs.captureVisibleTab({ format: 'png' }, cb);
    } else {
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, cb);
    }
  } catch (e) {
    sendResponse({ ok: false, error: String(e && e.message || e) });
    return false;
  }
  return true;
});
