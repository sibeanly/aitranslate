const fs = require('fs');
const path = require('path');

const extractorCode = fs.readFileSync(
  path.join(__dirname, '../src/content/extractor.js'),
  'utf8'
);
const rendererCode = fs.readFileSync(
  path.join(__dirname, '../src/content/renderer.js'),
  'utf8'
);
const translatorCode = fs.readFileSync(
  path.join(__dirname, '../src/content/translator.js'),
  'utf8'
);

beforeEach(() => {
  delete window.LLMTranslate;
  global.chrome = {
    runtime: {
      sendMessage: jest.fn(({ text }) => Promise.resolve({
        success: true,
        translated: text === 'The model' ? '该模型' : '能够泛化。',
      })),
    },
  };

  new Function(extractorCode)();
  new Function(rendererCode)();
  new Function(translatorCode)();
});

describe('Translator', () => {
  test('renders translated text with original math DOM preserved', async () => {
    document.body.innerHTML = `
      <p id="source">The model <span class="ltx_Math"><math><mi>π</mi><mn>0.5</mn></math></span> generalizes.</p>
    `;

    const source = document.getElementById('source');
    await window.LLMTranslate.Translator._translateSegment({ nodes: [source] });

    const target = document.querySelector('.llm-translate-target');
    expect(target.textContent).toBe('该模型 π0.5 能够泛化。');
    expect(target.querySelector('.ltx_Math math')).not.toBeNull();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(1, {
      type: 'translate',
      text: 'The model',
    });
    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(2, {
      type: 'translate',
      text: 'generalizes.',
    });
  });
});
