const TranslationCache = {
  MAX_ENTRIES: 1000,
  EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,

  async _hashKey(text, lang, model) {
    const input = `${text}:${lang}:${model}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async get(text, lang, model) {
    const key = await this._hashKey(text, lang, model);
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        const entry = result[key];
        if (!entry) {
          resolve(null);
          return;
        }
        if (Date.now() - entry.timestamp > this.EXPIRY_MS) {
          chrome.storage.local.remove([key]);
          resolve(null);
          return;
        }
        resolve(entry.translated);
      });
    });
  },

  async set(text, lang, model, translated) {
    const key = await this._hashKey(text, lang, model);
    return new Promise((resolve) => {
      chrome.storage.local.set(
        { [key]: { translated, timestamp: Date.now() } },
        () => {
          this._cleanup();
          resolve();
        }
      );
    });
  },

  async clear() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(resolve);
    });
  },

  async _cleanup() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (all) => {
        const entries = Object.entries(all)
          .filter(([, v]) => v && v.timestamp)
          .sort((a, b) => b[1].timestamp - a[1].timestamp);

        if (entries.length <= this.MAX_ENTRIES) {
          resolve();
          return;
        }

        const toRemove = entries
          .slice(this.MAX_ENTRIES)
          .map(([key]) => key);

        if (toRemove.length > 0) {
          chrome.storage.local.remove(toRemove, resolve);
        } else {
          resolve();
        }
      });
    });
  },
};

async function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        modelName: 'gpt-4o-mini',
        targetLang: 'zh-CN',
      },
      resolve
    );
  });
}

async function callTranslateAPI(text, targetLang, config) {
  const systemPrompt =
    `你是一个专业翻译引擎。将以下文本翻译成${targetLang === 'zh-CN' ? '中文简体' : targetLang}。规则：\n` +
    '1. 只返回译文，不要添加任何解释或注释\n' +
    '2. 保持原文的段落结构和格式\n' +
    '3. 专有名词和代码保持不变\n' +
    '4. 如果原文已经是目标语言，直接返回原文';

  const response = await fetch(config.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMsg;
    try {
      const errorJson = JSON.parse(errorBody);
      errorMsg = errorJson.error?.message || `API error: ${response.status}`;
    } catch {
      errorMsg = `API error: ${response.status}`;
    }

    if (response.status === 401) {
      throw new Error('API Key 无效，请检查设置');
    }
    if (response.status === 429) {
      throw new Error('API 配额已用完，请稍后再试');
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const translated = data.choices?.[0]?.message?.content?.trim();
  if (!translated) {
    throw new Error('API 返回了空结果');
  }
  return translated;
}

async function handleTranslate(message) {
  const { text } = message;
  const config = await getStoredConfig();

  if (!config.apiKey) {
    return { success: false, error: '请先在设置中配置 API Key' };
  }

  const cached = await TranslationCache.get(text, config.targetLang, config.modelName);
  if (cached) {
    return { success: true, translated: cached };
  }

  try {
    const translated = await callTranslateAPI(text, config.targetLang, config);
    await TranslationCache.set(text, config.targetLang, config.modelName, translated);
    return { success: true, translated };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'translate') {
    handleTranslate(message).then(sendResponse);
    return true;
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TranslationCache };
}
