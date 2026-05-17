# LLM Translate Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension (Manifest V3) that translates web pages into Chinese using any OpenAI-compatible LLM API, displaying results in bilingual mode.

**Architecture:** Content Script主导 — content scripts handle DOM extraction, segmentation, translation orchestration, and bilingual rendering. Background service worker acts as a lightweight API proxy (bypassing CORS) and translation cache. Popup provides settings UI and translate/restore controls.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript, Jest + jsdom for unit tests, chrome.storage for persistence.

---

## File Structure

```
src/
├── manifest.json                 # Manifest V3 config
├── background/
│   └── service-worker.js         # API proxy + translation cache
├── content/
│   ├── extractor.js              # DOM text extraction + smart segmentation
│   ├── renderer.js               # Bilingual rendering + restore
│   ├── translator.js             # Translation orchestration + concurrency
│   └── index.js                  # Entry point: message listener
├── popup/
│   ├── popup.html                # Settings UI
│   ├── popup.js                  # Settings logic + translate/restore
│   └── popup.css                 # Settings styles
├── assets/
│   ├── icon-16.png               # Toolbar icon
│   ├── icon-48.png               # Extensions page icon
│   └── icon-128.png              # Chrome Web Store icon
└── styles/
    └── content.css               # Bilingual display injected styles

tests/
├── extractor.test.js             # Extractor unit tests
├── renderer.test.js              # Renderer unit tests
└── cache.test.js                 # Cache unit tests (extracted for testability)

package.json
jest.config.js
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `jest.config.js`
- Create: `src/manifest.json`
- Create: `src/assets/icon-16.png`
- Create: `src/assets/icon-48.png`
- Create: `src/assets/icon-128.png`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/{background,content,popup,assets,styles} tests
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "llm-translate",
  "version": "1.0.0",
  "description": "LLM-powered web page translator Chrome extension",
  "private": true,
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0"
  }
}
```

- [ ] **Step 3: Create jest.config.js**

```js
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  transform: {},
};
```

- [ ] **Step 4: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "LLM Translate",
  "version": "1.0.0",
  "description": "Translate web pages using LLM APIs with bilingual display",
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "https://*/*",
    "http://*/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": [
        "content/extractor.js",
        "content/renderer.js",
        "content/translator.js",
        "content/index.js"
      ],
      "css": ["styles/content.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "assets/icon-16.png",
      "48": "assets/icon-48.png",
      "128": "assets/icon-128.png"
    }
  },
  "icons": {
    "16": "assets/icon-16.png",
    "48": "assets/icon-48.png",
    "128": "assets/icon-128.png"
  }
}
```

- [ ] **Step 5: Create placeholder icon files**

Create a Node.js script to generate minimal valid PNG icons:

```bash
node -e "
const fs = require('fs');
// Minimal 1x1 blue PNG (base64 encoded)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync('src/assets/icon-16.png', png);
fs.writeFileSync('src/assets/icon-48.png', png);
fs.writeFileSync('src/assets/icon-128.png', png);
"
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

- [ ] **Step 7: Verify Jest runs**

```bash
npx jest --passWithNoTests
```

Expected: "No tests found" but exit code 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: project scaffold with manifest, jest config, placeholder icons"
```

---

### Task 2: Content — DOM Extractor (TDD)

**Files:**
- Create: `src/content/extractor.js`
- Create: `tests/extractor.test.js`

The extractor collects text from the page, identifies the main content area, and groups text nodes into translation-friendly segments.

- [ ] **Step 1: Write failing tests for `collectTextNodes`**

```js
// tests/extractor.test.js
require('../src/content/extractor');

const { Extractor } = window.LLMTranslate;

describe('Extractor.collectTextNodes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('collects text from paragraph elements', () => {
    document.body.innerHTML = '<p>Hello world</p><p>Second paragraph</p>';
    const nodes = Extractor.collectTextNodes(document.body);
    const texts = nodes.map(n => n.textContent.trim());
    expect(texts).toContain('Hello world');
    expect(texts).toContain('Second paragraph');
  });

  test('skips script and style tags', () => {
    document.body.innerHTML = '<p>Visible text</p><script>var x=1</script><style>.x{}</style>';
    const nodes = Extractor.collectTextNodes(document.body);
    const texts = nodes.map(n => n.textContent.trim());
    expect(texts).toEqual(['Visible text']);
  });

  test('skips code and pre tags', () => {
    document.body.innerHTML = '<p>Text</p><code>const x=1</code><pre>block code</pre>';
    const nodes = Extractor.collectTextNodes(document.body);
    const texts = nodes.map(n => n.textContent.trim());
    expect(texts).toEqual(['Text']);
  });

  test('skips nodes with data-translated attribute', () => {
    document.body.innerHTML = '<p>Original</p><p data-translated="true">Already translated</p>';
    const nodes = Extractor.collectTextNodes(document.body);
    const texts = nodes.map(n => n.textContent.trim());
    expect(texts).toEqual(['Original']);
  });

  test('skips empty text nodes', () => {
    document.body.innerHTML = '<p></p><p>   </p><p>Content</p>';
    const nodes = Extractor.collectTextNodes(document.body);
    const texts = nodes.map(n => n.textContent.trim());
    expect(texts).toEqual(['Content']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/extractor.test.js
```

Expected: FAIL — `LLMTranslate` is not defined.

- [ ] **Step 3: Implement `extractor.js` with `collectTextNodes`**

```js
// src/content/extractor.js
(function () {
  const LLMTranslate = (window.LLMTranslate = window.LLMTranslate || {});

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'TEXTAREA', 'SVG',
    'KBD', 'SAMP', 'VAR', 'INPUT', 'SELECT', 'BUTTON', 'IMG',
  ]);

  const TEXT_TAGS = new Set([
    'P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI', 'TD', 'TH', 'A', 'STRONG', 'EM', 'B', 'I',
    'BLOCKQUOTE', 'FIGCAPTION', 'DD', 'DT', 'LABEL',
    'DIV',
  ]);

  LLMTranslate.Extractor = {
    collectTextNodes(root) {
      const results = [];
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode(node) {
            if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
            if (node.hasAttribute('data-translated')) return NodeFilter.FILTER_REJECT;
            if (!TEXT_TAGS.has(node.tagName)) return NodeFilter.FILTER_SKIP;
            const text = node.textContent.trim();
            if (!text) return NodeFilter.FILTER_REJECT;
            // Skip if this node's text is entirely inside a child TEXT_TAGS element
            // (avoid double-counting: <div><p>text</p></div>)
            for (const child of node.children) {
              if (TEXT_TAGS.has(child.tagName) && child.textContent.trim() === text) {
                return NodeFilter.FILTER_REJECT;
              }
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );
      let node;
      while ((node = walker.nextNode())) {
        results.push(node);
      }
      return results;
    },

    findMainContent(root) {
      // 1. Check for <article> or <main>
      const article = root.querySelector('article');
      if (article) return article;
      const main = root.querySelector('main');
      if (main) return main;

      // 2. Find block with highest text density (chars / child element count)
      const candidates = root.querySelectorAll('div, section');
      let best = root;
      let bestDensity = 0;
      for (const el of candidates) {
        // Skip nav, header, footer, aside
        const tag = el.tagName;
        if (['NAV', 'HEADER', 'FOOTER', 'ASIDE'].includes(tag)) continue;
        const text = el.textContent.trim();
        const childCount = el.querySelectorAll('*').length || 1;
        const density = text.length / childCount;
        if (density > bestDensity) {
          bestDensity = density;
          best = el;
        }
      }
      return best;
    },

    segmentNodes(nodes) {
      if (!nodes.length) return [];

      const segments = [];
      let currentSegment = { nodes: [], text: '' };

      for (const node of nodes) {
        const nodeText = node.textContent.trim();
        const potentialLength = currentSegment.text.length + (currentSegment.text ? ' ' : '') + nodeText.length;

        if (potentialLength > 1000 && currentSegment.nodes.length > 0) {
          segments.push({ ...currentSegment });
          currentSegment = { nodes: [], text: '' };
        }

        if (currentSegment.text) {
          currentSegment.text += '\n\n';
        }
        currentSegment.text += nodeText;
        currentSegment.nodes.push(node);
      }

      if (currentSegment.nodes.length > 0) {
        segments.push(currentSegment);
      }

      return segments;
    },

    extractSegments(root, scope) {
      const container = scope === 'full' ? root : this.findMainContent(root);
      const nodes = this.collectTextNodes(container);
      return this.segmentNodes(nodes);
    },
  };
})();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/extractor.test.js
```

Expected: 5 tests PASS.

- [ ] **Step 5: Write failing tests for `findMainContent`**

Add to `tests/extractor.test.js`:

```js
describe('Extractor.findMainContent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('returns <article> element if present', () => {
    document.body.innerHTML = `
      <nav>Navigation</nav>
      <article><p>Article content with enough text to be meaningful</p></article>
      <aside>Sidebar</aside>
    `;
    const result = Extractor.findMainContent(document.body);
    expect(result.tagName).toBe('ARTICLE');
  });

  test('returns <main> element if no article', () => {
    document.body.innerHTML = `
      <nav>Nav</nav>
      <main><p>Main content with enough text to be meaningful</p></main>
    `;
    const result = Extractor.findMainContent(document.body);
    expect(result.tagName).toBe('MAIN');
  });

  test('falls back to highest text-density div', () => {
    document.body.innerHTML = `
      <div class="sidebar"><p>Short</p></div>
      <div class="content"><p>This is a much longer piece of content that has significantly more text than the sidebar element</p></div>
    `;
    const result = Extractor.findMainContent(document.body);
    expect(result.classList.contains('content')).toBe(true);
  });

  test('skips nav, header, footer, aside as candidates', () => {
    document.body.innerHTML = `
      <nav><p>Navigation links here</p></nav>
      <header><p>Header text here</p></header>
      <div><p>Regular content here</p></div>
      <footer><p>Footer text here</p></footer>
    `;
    const result = Extractor.findMainContent(document.body);
    expect(result.tagName).not.toBe('NAV');
    expect(result.tagName).not.toBe('HEADER');
    expect(result.tagName).not.toBe('FOOTER');
  });
});
```

- [ ] **Step 6: Run tests**

```bash
npx jest tests/extractor.test.js
```

Expected: All PASS (implementation already written in Step 3).

- [ ] **Step 7: Write failing tests for `segmentNodes`**

Add to `tests/extractor.test.js`:

```js
describe('Extractor.segmentNodes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('creates one segment for short text', () => {
    document.body.innerHTML = '<p>Short text</p>';
    const nodes = Extractor.collectTextNodes(document.body);
    const segments = Extractor.segmentNodes(nodes);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Short text');
  });

  test('groups multiple nodes into one segment under limit', () => {
    document.body.innerHTML = '<p>First paragraph</p><p>Second paragraph</p>';
    const nodes = Extractor.collectTextNodes(document.body);
    const segments = Extractor.segmentNodes(nodes);
    expect(segments).toHaveLength(1);
    expect(segments[0].nodes).toHaveLength(2);
  });

  test('splits into multiple segments when exceeding 1000 chars', () => {
    const longText = 'A'.repeat(600);
    document.body.innerHTML = `<p>${longText}</p><p>${longText}</p><p>${longText}</p>`;
    const nodes = Extractor.collectTextNodes(document.body);
    const segments = Extractor.segmentNodes(nodes);
    expect(segments.length).toBeGreaterThan(1);
  });

  test('returns empty array for empty input', () => {
    const segments = Extractor.segmentNodes([]);
    expect(segments).toEqual([]);
  });
});
```

- [ ] **Step 8: Run tests**

```bash
npx jest tests/extractor.test.js
```

Expected: All PASS.

- [ ] **Step 9: Write failing test for `extractSegments`**

Add to `tests/extractor.test.js`:

```js
describe('Extractor.extractSegments', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('extracts segments with scope=full', () => {
    document.body.innerHTML = '<p>Hello</p><p>World</p>';
    const segments = Extractor.extractSegments(document.body, 'full');
    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(segments[0].text).toContain('Hello');
  });

  test('extracts segments with scope=main (default)', () => {
    document.body.innerHTML = '<article><p>Article text</p></article>';
    const segments = Extractor.extractSegments(document.body, 'main');
    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(segments[0].text).toContain('Article text');
  });
});
```

- [ ] **Step 10: Run all extractor tests**

```bash
npx jest tests/extractor.test.js
```

Expected: All 14 tests PASS.

- [ ] **Step 11: Commit**

```bash
git add src/content/extractor.js tests/extractor.test.js
git commit -m "feat: DOM extractor with text collection, main content detection, segmentation"
```

---

### Task 3: Content — Bilingual Renderer

**Files:**
- Create: `src/content/renderer.js`
- Create: `tests/renderer.test.js`

- [ ] **Step 1: Write failing tests for `renderTranslation`**

```js
// tests/renderer.test.js
require('../src/content/renderer');

const { Renderer } = window.LLMTranslate;

describe('Renderer.renderTranslation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('inserts a bilingual div after the original node', () => {
    document.body.innerHTML = '<p id="original">Hello world</p>';
    const original = document.getElementById('original');
    Renderer.renderTranslation(original, '你好世界');
    const bilingual = original.nextElementSibling;
    expect(bilingual).not.toBeNull();
    expect(bilingual.classList.contains('llm-translate-bilingual')).toBe(true);
    expect(bilingual.getAttribute('data-translated')).toBe('true');
    expect(bilingual.textContent).toBe('你好世界');
  });

  test('marks the original node with data-translated to avoid re-translation', () => {
    document.body.innerHTML = '<p id="original">Hello</p>';
    const original = document.getElementById('original');
    Renderer.renderTranslation(original, '你好');
    expect(original.hasAttribute('data-translated')).toBe(true);
  });

  test('does not create duplicate translations for the same node', () => {
    document.body.innerHTML = '<p id="original">Hello</p>';
    const original = document.getElementById('original');
    Renderer.renderTranslation(original, '你好');
    Renderer.renderTranslation(original, '你好2');
    const bilinguals = document.querySelectorAll('.llm-translate-bilingual');
    expect(bilinguals).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/renderer.test.js
```

Expected: FAIL — `LLMTranslate.Renderer` is not defined.

- [ ] **Step 3: Implement `renderer.js`**

```js
// src/content/renderer.js
(function () {
  const LLMTranslate = (window.LLMTranslate = window.LLMTranslate || {});

  LLMTranslate.Renderer = {
    renderTranslation(originalNode, translatedText) {
      // Skip if already translated
      if (originalNode.hasAttribute('data-translated')) return;

      originalNode.setAttribute('data-translated', 'true');

      const bilingual = document.createElement('div');
      bilingual.className = 'llm-translate-bilingual';
      bilingual.setAttribute('data-translated', 'true');

      const target = document.createElement('span');
      target.className = 'llm-translate-target';
      target.textContent = translatedText;

      bilingual.appendChild(target);
      originalNode.parentNode.insertBefore(bilingual, originalNode.nextSibling);
    },

    renderError(originalNode, errorMessage) {
      if (originalNode.hasAttribute('data-translated')) return;

      originalNode.setAttribute('data-translated', 'true');

      const errorDiv = document.createElement('div');
      errorDiv.className = 'llm-translate-bilingual llm-translate-error';
      errorDiv.setAttribute('data-translated', 'true');

      const target = document.createElement('span');
      target.className = 'llm-translate-target';
      target.textContent = `⚠ ${errorMessage}`;

      errorDiv.appendChild(target);
      originalNode.parentNode.insertBefore(errorDiv, originalNode.nextSibling);
    },

    restoreAll() {
      // Remove all bilingual nodes
      const bilinguals = document.querySelectorAll('.llm-translate-bilingual');
      bilinguals.forEach(node => node.remove());

      // Remove data-translated from original nodes
      const translated = document.querySelectorAll('[data-translated]');
      translated.forEach(node => node.removeAttribute('data-translated'));
    },
  };
})();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest tests/renderer.test.js
```

Expected: 3 tests PASS.

- [ ] **Step 5: Write failing tests for `renderError` and `restoreAll`**

Add to `tests/renderer.test.js`:

```js
describe('Renderer.renderError', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('inserts an error div with error message', () => {
    document.body.innerHTML = '<p id="original">Hello</p>';
    const original = document.getElementById('original');
    Renderer.renderError(original, 'API error');
    const errorDiv = original.nextElementSibling;
    expect(errorDiv.classList.contains('llm-translate-error')).toBe(true);
    expect(errorDiv.textContent).toContain('API error');
  });
});

describe('Renderer.restoreAll', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('removes all bilingual nodes', () => {
    document.body.innerHTML = '<div><p id="a">Hello</p><p id="b">World</p></div>';
    Renderer.renderTranslation(document.getElementById('a'), '你好');
    Renderer.renderTranslation(document.getElementById('b'), '世界');
    expect(document.querySelectorAll('.llm-translate-bilingual')).toHaveLength(2);

    Renderer.restoreAll();

    expect(document.querySelectorAll('.llm-translate-bilingual')).toHaveLength(0);
  });

  test('removes data-translated attributes from original nodes', () => {
    document.body.innerHTML = '<p id="original">Hello</p>';
    const original = document.getElementById('original');
    Renderer.renderTranslation(original, '你好');
    expect(original.hasAttribute('data-translated')).toBe(true);

    Renderer.restoreAll();

    expect(original.hasAttribute('data-translated')).toBe(false);
  });
});
```

- [ ] **Step 6: Run all renderer tests**

```bash
npx jest tests/renderer.test.js
```

Expected: All 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/content/renderer.js tests/renderer.test.js
git commit -m "feat: bilingual renderer with translation display, error display, and restore"
```

---

### Task 4: Content — Translator + Entry Point

**Files:**
- Create: `src/content/translator.js`
- Create: `src/content/index.js`

The translator orchestrates: extract segments → send to background for translation → render results. The entry point listens for messages from the popup.

- [ ] **Step 1: Implement `translator.js`**

```js
// src/content/translator.js
(function () {
  const LLMTranslate = (window.LLMTranslate = window.LLMTranslate || {});

  LLMTranslate.Translator = {
    isTranslating: false,
    _abortController: null,

    async translatePage(scope) {
      if (this.isTranslating) return;
      this.isTranslating = true;
      this._abortController = new AbortController();

      try {
        const segments = LLMTranslate.Extractor.extractSegments(document.body, scope);

        if (segments.length === 0) {
          this.isTranslating = false;
          return;
        }

        await this._translateSegmentsWithConcurrency(segments, 3);
      } finally {
        this.isTranslating = false;
        this._abortController = null;
      }
    },

    async _translateSegmentsWithConcurrency(segments, concurrency) {
      let index = 0;

      async function worker() {
        while (index < segments.length) {
          const currentIndex = index++;
          const segment = segments[currentIndex];
          await LLMTranslate.Translator._translateSegment(segment);
        }
      }

      const workers = [];
      for (let i = 0; i < Math.min(concurrency, segments.length); i++) {
        workers.push(worker());
      }
      await Promise.all(workers);
    },

    async _translateSegment(segment) {
      for (const node of segment.nodes) {
        const text = node.textContent.trim();
        if (!text) continue;

        try {
          const response = await chrome.runtime.sendMessage({
            type: 'translate',
            text: text,
          });

          if (response && response.success) {
            LLMTranslate.Renderer.renderTranslation(node, response.translated);
          } else {
            const errorMsg = response ? response.error : 'Unknown error';
            LLMTranslate.Renderer.renderError(node, errorMsg);
          }
        } catch (err) {
          LLMTranslate.Renderer.renderError(node, err.message || 'Translation failed');
        }
      }
    },

    restorePage() {
      LLMTranslate.Renderer.restoreAll();
    },

    getStatus() {
      return {
        isTranslating: this.isTranslating,
      };
    },
  };
})();
```

- [ ] **Step 2: Implement `index.js` (content script entry point)**

```js
// src/content/index.js
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
```

- [ ] **Step 3: Commit**

```bash
git add src/content/translator.js src/content/index.js
git commit -m "feat: translation orchestrator with concurrency control and message listener"
```

---

### Task 5: Background — Service Worker (Cache + API Proxy)

**Files:**
- Create: `src/background/service-worker.js`
- Create: `tests/cache.test.js`

The service worker handles: translation cache (chrome.storage.local), API proxy (fetch to LLM endpoint), and message routing.

- [ ] **Step 1: Write failing cache tests**

For testability, the cache logic will be duplicated in a testable form. The service worker uses `chrome.storage.local` which we mock in tests.

```js
// tests/cache.test.js
// We test cache logic by requiring the service worker and testing its
// internal cache behavior via the message interface.
// For unit tests, we mock chrome.storage.local.

// Mock chrome APIs
global.chrome = {
  storage: {
    local: {
      _data: {},
      get(keys, callback) {
        const result = {};
        if (typeof keys === 'string') keys = [keys];
        for (const key of keys) {
          if (this._data[key] !== undefined) {
            result[key] = this._data[key];
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

// We test the cache functions directly by extracting them
// Since service-worker.js uses top-level code, we test the cache logic separately
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
    // Set entry with timestamp 8 days ago
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest tests/cache.test.js
```

Expected: FAIL — module not found or `TranslationCache` not exported.

- [ ] **Step 3: Implement `service-worker.js`**

```js
// src/background/service-worker.js
const TranslationCache = {
  MAX_ENTRIES: 1000,
  EXPIRY_MS: 7 * 24 * 60 * 60 * 1000, // 7 days

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
        // Check expiry
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

        // Remove oldest entries beyond limit
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

  // Check cache
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
    return true; // Keep channel open for async response
  }
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TranslationCache };
}
```

- [ ] **Step 4: Run cache tests**

```bash
npx jest tests/cache.test.js
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/background/service-worker.js tests/cache.test.js
git commit -m "feat: background service worker with translation cache and API proxy"
```

---

### Task 6: Content Styles (CSS)

**Files:**
- Create: `src/styles/content.css`

- [ ] **Step 1: Create the bilingual display CSS**

```css
/* src/styles/content.css */
.llm-translate-bilingual {
  margin: 4px 0;
  padding: 6px 10px;
  background-color: rgba(0, 0, 0, 0.03);
  border-left: 3px solid #4a90d9;
  border-radius: 2px;
  font-size: 0.95em;
  line-height: 1.6;
  color: #333;
}

.llm-translate-bilingual .llm-translate-target {
  display: inline;
}

.llm-translate-error {
  border-left-color: #e74c3c;
  background-color: rgba(231, 76, 60, 0.05);
  color: #e74c3c;
  font-style: italic;
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  .llm-translate-bilingual {
    background-color: rgba(255, 255, 255, 0.05);
    border-left-color: #5ba3e6;
    color: #ccc;
  }

  .llm-translate-error {
    background-color: rgba(231, 76, 60, 0.1);
    color: #e74c3c;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/content.css
git commit -m "feat: bilingual display styles with dark mode support"
```

---

### Task 7: Popup — Settings UI + Logic

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/popup.js`

- [ ] **Step 1: Create `popup.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <h1 class="title">LLM Translate</h1>

    <div class="section" id="apiKeySection">
      <label for="apiKey">API Key</label>
      <input type="password" id="apiKey" placeholder="sk-..." autocomplete="off">
    </div>

    <div class="section">
      <label for="apiEndpoint">API 端点</label>
      <input type="text" id="apiEndpoint" placeholder="https://api.openai.com/v1/chat/completions">
    </div>

    <div class="section">
      <label for="modelName">模型名称</label>
      <input type="text" id="modelName" placeholder="gpt-4o-mini">
    </div>

    <div class="section">
      <label for="targetLang">目标语言</label>
      <select id="targetLang">
        <option value="zh-CN">中文简体</option>
        <option value="zh-TW">中文繁体</option>
        <option value="ja">日本語</option>
        <option value="ko">한국어</option>
        <option value="en">English</option>
        <option value="fr">Français</option>
        <option value="de">Deutsch</option>
      </select>
    </div>

    <div class="section">
      <label>翻译范围</label>
      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" name="scope" value="main" checked>
          仅主体内容
        </label>
        <label class="radio-label">
          <input type="radio" name="scope" value="full">
          全页翻译
        </label>
      </div>
    </div>

    <div class="actions">
      <button id="translateBtn" class="btn btn-primary">翻译当前页面</button>
      <button id="restoreBtn" class="btn btn-secondary">还原</button>
    </div>

    <div id="status" class="status"></div>
    <div id="error" class="error"></div>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `popup.css`**

```css
/* src/popup/popup.css */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 320px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #333;
  background: #fff;
}

.container {
  padding: 16px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #1a1a1a;
  border-bottom: 2px solid #4a90d9;
  padding-bottom: 8px;
}

.section {
  margin-bottom: 12px;
}

.section label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #666;
  margin-bottom: 4px;
}

.section input[type="text"],
.section input[type="password"],
.section select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.section input:focus,
.section select:focus {
  border-color: #4a90d9;
}

.radio-group {
  display: flex;
  gap: 16px;
  margin-top: 4px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
}

.radio-label input[type="radio"] {
  margin: 0;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #4a90d9;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background-color: #3a7bc8;
}

.btn-secondary {
  background-color: #f0f0f0;
  color: #333;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #e0e0e0;
}

.status {
  margin-top: 12px;
  font-size: 12px;
  color: #666;
  text-align: center;
}

.error {
  margin-top: 8px;
  font-size: 12px;
  color: #e74c3c;
  text-align: center;
}

#apiKeySection input {
  border-color: #e74c3c;
}

#apiKeySection.configured input {
  border-color: #ddd;
}
```

- [ ] **Step 3: Create `popup.js`**

```js
// src/popup/popup.js
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

  // Load saved settings
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

  // Save settings
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

  // Send message to active tab's content script
  async function sendToActiveTab(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showError('无法获取当前标签页');
      return null;
    }

    // Check if the URL is accessible
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

  // Translate button
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

  // Restore button
  elements.restoreBtn.addEventListener('click', async () => {
    clearMessages();
    await sendToActiveTab({ type: 'restorePage' });
    showStatus('已还原');
  });

  // Auto-save on input change
  const autoSaveElements = [elements.apiKey, elements.apiEndpoint, elements.modelName];
  autoSaveElements.forEach(el => {
    el.addEventListener('change', saveSettings);
    el.addEventListener('blur', saveSettings);
  });
  elements.targetLang.addEventListener('change', saveSettings);
  document.querySelectorAll('input[name="scope"]').forEach(radio => {
    radio.addEventListener('change', saveSettings);
  });

  // Initialize
  loadSettings();
})();
```

- [ ] **Step 4: Commit**

```bash
git add src/popup/ src/styles/content.css
git commit -m "feat: popup settings UI with translate/restore controls and auto-save"
```

---

### Task 8: Integration — Manual Testing

This task verifies the full extension works end-to-end in Chrome.

- [ ] **Step 1: Run all unit tests**

```bash
npx jest
```

Expected: All tests pass (extractor: 14, renderer: 6, cache: 5 = 25 total).

- [ ] **Step 2: Load extension in Chrome**

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `src/` directory

- [ ] **Step 3: Test popup settings**

1. Click the extension icon
2. Enter an API Key (e.g., a real OpenAI key or compatible endpoint)
3. Set API endpoint (e.g., `https://api.openai.com/v1/chat/completions`)
4. Set model name (e.g., `gpt-4o-mini`)
5. Close and reopen popup — verify settings persist

- [ ] **Step 4: Test translation on a simple page**

1. Navigate to any English article page (e.g., a Wikipedia article)
2. Click the extension icon → "翻译当前页面"
3. Verify: bilingual display appears below original text
4. Verify: translations have blue left border and light background
5. Verify: `code` and `pre` blocks are NOT translated

- [ ] **Step 5: Test "仅主体内容" vs "全页" modes**

1. Switch to "仅主体内容" mode → translate → verify sidebar/nav not translated
2. Switch to "全页" mode → restore → translate again → verify more content translated

- [ ] **Step 6: Test restore**

1. After translation, click "还原"
2. Verify all bilingual nodes are removed
3. Verify original text is intact
4. Click "翻译当前页面" again → verify it works (re-translation)

- [ ] **Step 7: Test error handling**

1. Remove API Key from settings
2. Try to translate → verify error message shown
3. Set an invalid API Key
4. Try to translate → verify error message in translation area

- [ ] **Step 8: Test on special pages**

1. Open `chrome://extensions` → click translate → verify graceful error message
2. Open a page with mostly Chinese text → verify it doesn't break (LLM should return original)

- [ ] **Step 9: Fix any issues found during manual testing**

If bugs are found, fix them and re-run the test cycle.

- [ ] **Step 10: Final commit**

```bash
git add -A
git commit -m "fix: address issues found during integration testing"
```

---

### Task 9: Generate Proper Icons

**Files:**
- Modify: `src/assets/icon-16.png`
- Modify: `src/assets/icon-48.png`
- Modify: `src/assets/icon-128.png`

- [ ] **Step 1: Create an SVG icon design and convert to PNG**

Create a simple "T" translation icon using a Node.js script with the `canvas` package, or use an online tool. The icon should be a blue "T" on a white/light background, representing translation.

If the `canvas` package is not available, create icons using a simple HTML canvas approach:

1. Create `scripts/generate-icons.html` that renders canvas icons
2. Open in browser, save each size as PNG
3. Copy to `src/assets/`

Alternative: Use any image tool to create 16x16, 48x48, and 128x128 PNG files with a "T" or "译" character.

- [ ] **Step 2: Verify icons appear in Chrome**

1. Reload the extension
2. Verify the icon appears in the Chrome toolbar
3. Verify the icon appears on the extensions page

- [ ] **Step 3: Commit**

```bash
git add src/assets/
git commit -m "feat: add proper extension icons"
```
