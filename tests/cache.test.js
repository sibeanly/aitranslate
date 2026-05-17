const { TextEncoder } = require('util');
const nodeCrypto = require('crypto');

global.TextEncoder = TextEncoder;
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: nodeCrypto.webcrypto.subtle,
  },
  writable: true,
});

global.chrome = {
  storage: {
    local: {
      _data: {},
      get(keys, callback) {
        const result = {};
        if (keys === null) {
          Object.assign(result, this._data);
        } else {
          if (typeof keys === 'string') keys = [keys];
          for (const key of keys) {
            if (this._data[key] !== undefined) {
              result[key] = this._data[key];
            }
          }
        }
        callback(result);
      },
      set(items, callback) {
        Object.assign(this._data, items);
        if (callback) callback();
      },
      remove(keys, callback) {
        if (typeof keys === 'string') keys = [keys];
        for (const key of keys) {
          delete this._data[key];
        }
        if (callback) callback();
      },
      clear(callback) {
        this._data = {};
        if (callback) callback();
      },
    },
  },
  runtime: {
    onMessage: {
      addListener() {},
    },
  },
};

const { TranslationCache } = require('../src/background/service-worker');

describe('TranslationCache', () => {
  beforeEach(() => {
    chrome.storage.local._data = {};
  });

  test('set and get a translation', async () => {
    await TranslationCache.set('Hello', 'zh-CN', 'gpt-4o-mini', '你好');
    const result = await TranslationCache.get('Hello', 'zh-CN', 'gpt-4o-mini');
    expect(result).toBe('你好');
  });

  test('returns null for cache miss', async () => {
    const result = await TranslationCache.get('missing', 'zh-CN', 'gpt-4o-mini');
    expect(result).toBeNull();
  });

  test('different languages produce different cache keys', async () => {
    await TranslationCache.set('Hello', 'zh-CN', 'gpt-4o-mini', '你好');
    await TranslationCache.set('Hello', 'ja', 'gpt-4o-mini', 'こんにちは');
    const zh = await TranslationCache.get('Hello', 'zh-CN', 'gpt-4o-mini');
    const ja = await TranslationCache.get('Hello', 'ja', 'gpt-4o-mini');
    expect(zh).toBe('你好');
    expect(ja).toBe('こんにちは');
  });

  test('expired entries return null', async () => {
    const key = await TranslationCache._hashKey('Hello', 'zh-CN', 'gpt-4o-mini');
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    chrome.storage.local._data[key] = {
      translated: '你好',
      timestamp: eightDaysAgo,
    };
    const result = await TranslationCache.get('Hello', 'zh-CN', 'gpt-4o-mini');
    expect(result).toBeNull();
  });

  test('clear removes all entries', async () => {
    await TranslationCache.set('Hello', 'zh-CN', 'gpt-4o-mini', '你好');
    await TranslationCache.clear();
    const result = await TranslationCache.get('Hello', 'zh-CN', 'gpt-4o-mini');
    expect(result).toBeNull();
  });
});
