(function () {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'translatePage') {
      const scope = message.scope || 'main';
      LLMTranslate.Translator.translatePage(scope).then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true; // Keep message channel open for async response
    }

    if (message.type === 'restorePage') {
      LLMTranslate.Translator.restorePage();
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'getStatus') {
      sendResponse(LLMTranslate.Translator.getStatus());
      return false;
    }
  });
})();
