(function () {
  const PROVIDERS = {
    openai: {
      apiEndpoint: 'https://api.openai.com/v1/chat/completions',
      modelName: 'gpt-4o-mini',
    },
    deepseek: {
      apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
      modelName: 'deepseek-chat',
    },
    custom: null,
  };

  const DEFAULTS = {
    apiProvider: 'openai',
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    modelName: 'gpt-4o-mini',
    targetLang: 'zh-CN',
    scope: 'main',
  };

  const elements = {
    apiKey: document.getElementById('apiKey'),
    apiProvider: document.getElementById('apiProvider'),
    apiEndpoint: document.getElementById('apiEndpoint'),
    modelName: document.getElementById('modelName'),
    targetLang: document.getElementById('targetLang'),
    translateBtn: document.getElementById('translateBtn'),
    restoreBtn: document.getElementById('restoreBtn'),
    testBtn: document.getElementById('testBtn'),
    status: document.getElementById('status'),
    error: document.getElementById('error'),
    apiKeySection: document.getElementById('apiKeySection'),
  };

  function detectProvider(endpoint, modelName) {
    for (const [key, preset] of Object.entries(PROVIDERS)) {
      if (preset && preset.apiEndpoint === endpoint && preset.modelName === modelName) {
        return key;
      }
    }
    return 'custom';
  }

  function onProviderChange() {
    const provider = elements.apiProvider.value;
    const preset = PROVIDERS[provider];
    if (preset) {
      elements.apiEndpoint.value = preset.apiEndpoint;
      elements.modelName.value = preset.modelName;
    }
    saveSettings();
  }

  async function loadSettings() {
    const settings = await chrome.storage.sync.get(DEFAULTS);
    elements.apiKey.value = settings.apiKey;
    elements.apiEndpoint.value = settings.apiEndpoint;
    elements.modelName.value = settings.modelName;
    elements.targetLang.value = settings.targetLang;

    elements.apiProvider.value = detectProvider(
      settings.apiEndpoint || DEFAULTS.apiEndpoint,
      settings.modelName || DEFAULTS.modelName
    );

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
      apiProvider: elements.apiProvider.value,
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

  elements.testBtn.addEventListener('click', async () => {
    await saveSettings();
    clearMessages();
    showStatus('测试连接中...');
    elements.testBtn.disabled = true;

    const apiEndpoint = elements.apiEndpoint.value.trim() || DEFAULTS.apiEndpoint;
    const apiKey = elements.apiKey.value.trim();
    const modelName = elements.modelName.value.trim() || DEFAULTS.modelName;

    if (!apiKey) {
      showError('请先配置 API Key');
      elements.testBtn.disabled = false;
      return;
    }

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        showStatus(`连接成功 ✓ 模型：${modelName}`);
      } else if (response.status === 401 || response.status === 403) {
        showError('API Key 无效，请检查设置');
      } else if (response.status === 404) {
        showError(`端点或模型不存在 (404)。端点：${apiEndpoint}，模型：${modelName}`);
      } else {
        const errorBody = await response.text();
        try {
          const errJson = JSON.parse(errorBody);
          showError(errJson.error?.message || `HTTP ${response.status}`);
        } catch {
          showError(`HTTP ${response.status}: ${errorBody.substring(0, 100)}`);
        }
      }
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        showError('连接超时，请检查网络或代理设置');
      } else {
        showError(`网络请求失败：${err.message}`);
      }
    } finally {
      elements.testBtn.disabled = false;
    }
  });

  elements.apiProvider.addEventListener('change', onProviderChange);

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
