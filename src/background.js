// Open the options page when the user clicks the DOMLens toolbar icon.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
