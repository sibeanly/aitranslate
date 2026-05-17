(function () {
  const DEFAULTS = {
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    modelName: 'gpt-4o-mini',
    targetLang: 'zh-CN',
    scope: 'main',
  };

  const elements = {
    apiKey: document.getElementById('apiKey'),
    apiEndpoint: document.getElementById('apiEndpoint'),
    modelName: document.getElementById('modelName'),
    targetLang: document.getElementById('targetLang'),
    translateBtn: document.getElementById('translateBtn'),
    restoreBtn: document.getElementById('restoreBtn'),
    status: document.getElementById('status'),
    error: document.getElementById('error'),
    apiKeySection: document.getElementById('apiKeySection'),
  };

  async function loadSettings() {
    const settings = await chrome.storage.sync.get(DEFAULTS);
    elements.apiKey.value = settings.apiKey;
    elements.apiEndpoint.value = settings.apiEndpoint;
    elements.modelName.value = settings.modelName;
    elements.targetLang.value = settings.targetLang;

    const scopeRadio = document.querySelector(`input[name="scope"][value="${settings.scope}"]`);
    if (scopeRadio) scopeRadio.checked = true;

    updateApiKeyState(settings.apiKey);
  }

  function updateApiKeyState(apiKey) {
    if (apiKey) {
      elements.apiKeySection.classList.add('configured');
      elements.translateBtn.disabled = false;
    } else {
      elements.apiKeySection.classList.remove('configured');
      elements.translateBtn.disabled = true;
    }
  }

  async function saveSettings() {
    const scope = document.querySelector('input[name="scope"]:checked').value;
    const settings = {
      apiEndpoint: elements.apiEndpoint.value.trim() || DEFAULTS.apiEndpoint,
      apiKey: elements.apiKey.value.trim(),
      modelName: elements.modelName.value.trim() || DEFAULTS.modelName,
      targetLang: elements.targetLang.value,
      scope: scope,
    };
    await chrome.storage.sync.set(settings);
    updateApiKeyState(settings.apiKey);
  }

  async function sendToActiveTab(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showError('无法获取当前标签页');
      return null;
    }

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      showError('此页面不支持翻译（浏览器内部页面）');
      return null;
    }

    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      showError('无法连接到页面，请刷新页面后重试');
      return null;
    }
  }

  function showStatus(text) {
    elements.status.textContent = text;
    elements.error.textContent = '';
  }

  function showError(text) {
    elements.error.textContent = text;
    elements.status.textContent = '';
  }

  function clearMessages() {
    elements.status.textContent = '';
    elements.error.textContent = '';
  }

  elements.translateBtn.addEventListener('click', async () => {
    await saveSettings();
    clearMessages();
    showStatus('翻译中...');
    elements.translateBtn.disabled = true;

    const scope = document.querySelector('input[name="scope"]:checked').value;
    const response = await sendToActiveTab({ type: 'translatePage', scope });

    elements.translateBtn.disabled = false;

    if (response && response.success) {
      showStatus('翻译完成');
    } else if (response && !response.success) {
      showError(response.error || '翻译失败');
    }
  });

  elements.restoreBtn.addEventListener('click', async () => {
    clearMessages();
    await sendToActiveTab({ type: 'restorePage' });
    showStatus('已还原');
  });

  const autoSaveElements = [elements.apiKey, elements.apiEndpoint, elements.modelName];
  autoSaveElements.forEach(el => {
    el.addEventListener('change', saveSettings);
    el.addEventListener('blur', saveSettings);
  });
  elements.targetLang.addEventListener('change', saveSettings);
  document.querySelectorAll('input[name="scope"]').forEach(radio => {
    radio.addEventListener('change', saveSettings);
  });

  loadSettings();
})();
