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

function protectMath(text) {
  const placeholders = [];

  // Protect \[...\] display math
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (m) => {
    placeholders.push(m);
    return `【公式${placeholders.length}】`;
  });
  // Protect \(...\) inline math
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (m) => {
    placeholders.push(m);
    return `【公式${placeholders.length}】`;
  });
  // Protect $$...$$ display math
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (m) => {
    placeholders.push(m);
    return `【公式${placeholders.length}】`;
  });
  // Protect $...$ inline math (single-line only, avoid false positives)
  text = text.replace(/\$([^$\n]{1,200}?)\$/g, (m, inner) => {
    if (/^[\d.,\s]+$/.test(inner)) return m;
    placeholders.push(m);
    return `【公式${placeholders.length}】`;
  });
  // Protect Unicode math: capture contiguous non-CJK text that contains math symbols.
  // Use non-greedy and stop at sentence delimiters to avoid consuming English prose.
  text = text.replace(/([^\s,;:.!?一-鿿　-〿＀-￯]{0,80}[\u{1D400}-\u{1D7FF}][^\s,;:.!?一-鿿　-〿＀-￯]{0,300})/gu, (m) => {
    const trimmed = m.replace(/^[,\s]+|[,\s]+$/g, '');
    if (!trimmed || /^[\d\s.,;:!?]+$/.test(trimmed)) return m;
    placeholders.push(trimmed);
    return `【公式${placeholders.length}】`;
  });

  return { text, placeholders };
}

function restoreMath(text, placeholders) {
  if (!placeholders.length) return text;
  let result = text;
  placeholders.forEach((orig, i) => {
    result = result.replace(`【公式${i + 1}】`, orig);
  });
  return result;
}

async function callTranslateAPI(text, targetLang, config) {
  const protected = protectMath(text);

  const systemPrompt =
    `你是一个专业翻译引擎。将以下文本翻译成${targetLang === 'zh-CN' ? '中文简体' : targetLang}。规则：\n` +
    '1. 只返回译文，不要添加任何解释、注释、思考过程或前缀\n' +
    '2. 保持原文的段落结构和格式\n' +
    '3. 专有名词、代码、以及 {{MATH_N}} 和 【公式N】 标记必须原样保留\n' +
    '3a. 严禁自行添加 LaTeX 数学公式（如 \\(...\\) 或 \\[...\\]），严禁改写或补充任何数学符号\n' +
    '4. 如果原文已经是目标语言，直接返回原文\n' +
    '5. 禁止使用 <think> <thinking> 等标签\n' +
    '6. 原文中的【公式N】占位符必须原样保留在译文中';

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
        { role: 'user', content: protected.text },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMsg;
    let isJson = false;
    try {
      const errorJson = JSON.parse(errorBody);
      errorMsg = errorJson.error?.message || `API error: ${response.status}`;
      isJson = true;
    } catch {
      errorMsg = `API error: ${response.status}`;
    }

    if (response.status === 401) {
      throw new Error('API Key 无效，请检查设置');
    }
    if (response.status === 404) {
      if (!isJson) {
        throw new Error(`请求被拦截返回 404（可能是代理或网络问题）。请检查：1) 是否开启了代理/VPN 2) 端点 URL 是否正确：${config.apiEndpoint}`);
      }
      throw new Error(`API 端点或模型不存在 (404)。请检查：1) 端点 URL 是否正确 2) 模型名称 "${config.modelName}" 在该 API 提供商是否可用`);
    }
    if (response.status === 429) {
      throw new Error('API 配额已用完，请稍后再试');
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error('API 返回了空结果');
  }

  let content = message.content?.trim() || '';

  // Restore math placeholders
  content = restoreMath(content, protected.placeholders);

  // Strip LLM-generated LaTeX delimiters that weren't in the original.
  // Original LaTeX that was protected by placeholders is already restored.
  content = content
    .replace(/\\\([\s\S]*?\\\)/g, '')
    .replace(/\\\[[\s\S]*?\\\]/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/\$([^$\n]{1,500}?)\$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Strip reasoning/thinking markers that some models include in content
  content = content
    .replace(/<think[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning[\s\S]*?<\/reasoning>/gi, '')
    .trim();

  if (!content) {
    throw new Error('API 返回了空结果');
  }
  return content;
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

async function handleTestConnection() {
  const config = await getStoredConfig();

  if (!config.apiKey) {
    return { success: false, error: '请先配置 API Key' };
  }

  try {
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMsg;
      let isJson = false;
      try {
        const errorJson = JSON.parse(errorBody);
        errorMsg = errorJson.error?.message || `HTTP ${response.status}`;
        isJson = true;
      } catch {
        errorMsg = `HTTP ${response.status}`;
      }

      if (response.status === 401) {
        return { success: false, error: 'API Key 无效，请检查设置' };
      }
      if (response.status === 404) {
        if (!isJson) {
          return { success: false, error: `请求被拦截返回 404（可能是代理或网络问题）。端点：${config.apiEndpoint}` };
        }
        return { success: false, error: `端点或模型不存在。端点：${config.apiEndpoint}，模型：${config.modelName}` };
      }
      return { success: false, error: errorMsg };
    }

    const data = await response.json();
    const modelUsed = data.model || config.modelName;
    return { success: true, model: modelUsed };
  } catch (err) {
    return { success: false, error: `网络请求失败：${err.message}` };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'translate') {
    handleTranslate(message).then(sendResponse);
    return true;
  }
  if (message.type === 'testConnection') {
    handleTestConnection().then(sendResponse);
    return true;
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TranslationCache };
}
