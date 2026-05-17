require('../src/content/renderer');

const { renderTranslation, renderError, restoreAll } = window.LLMTranslate.Renderer;

describe('Renderer', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="original">Hello world</div>
    `;
  });

  describe('renderTranslation', () => {
    test('inserts a bilingual div after the original node', () => {
      const originalNode = document.getElementById('original');
      renderTranslation(originalNode, 'Bonjour le monde');

      const bilingual = originalNode.nextSibling;
      expect(bilingual).not.toBeNull();
      expect(bilingual.className).toBe('llm-translate-bilingual');
      expect(bilingual.getAttribute('data-translated')).toBe('true');

      const target = bilingual.querySelector('.llm-translate-target');
      expect(target).not.toBeNull();
      expect(target.textContent).toBe('Bonjour le monde');
    });

    test('marks the original node with data-translated to avoid re-translation', () => {
      const originalNode = document.getElementById('original');
      renderTranslation(originalNode, 'Bonjour le monde');

      expect(originalNode.getAttribute('data-translated')).toBe('true');
    });

    test('does not create duplicate translations for the same node', () => {
      const originalNode = document.getElementById('original');
      renderTranslation(originalNode, 'Bonjour le monde');
      renderTranslation(originalNode, 'Hola mundo');

      const bilinguals = document.querySelectorAll('.llm-translate-bilingual');
      expect(bilinguals.length).toBe(1);
      expect(bilinguals[0].querySelector('.llm-translate-target').textContent).toBe('Bonjour le monde');
    });
  });

  describe('renderStructuredTranslation', () => {
    test('preserves cloned math markup between translated text chunks', () => {
      const originalNode = document.getElementById('original');
      const math = document.createElement('span');
      math.className = 'ltx_Math';
      math.innerHTML = '<math><mi>π</mi><mn>0.5</mn></math>';

      window.LLMTranslate.Renderer.renderStructuredTranslation(originalNode, [
        { text: '该架构能够表示' },
        { mathNode: math },
        { text: '的分布。' },
      ]);

      const target = document.querySelector('.llm-translate-target');
      const renderedMath = target.querySelector('.ltx_Math math');
      expect(renderedMath).not.toBeNull();
      expect(target.textContent).toBe('该架构能够表示 π0.5 的分布。');
      expect(renderedMath).not.toBe(math.querySelector('math'));
    });

    test('does not add a space before Chinese punctuation after math', () => {
      const originalNode = document.getElementById('original');
      const math = document.createElement('span');
      math.className = 'ltx_Math';
      math.textContent = 'π0.5';

      window.LLMTranslate.Renderer.renderStructuredTranslation(originalNode, [
        { text: '模型' },
        { mathNode: math },
        { text: '，能够泛化。' },
      ]);

      const target = document.querySelector('.llm-translate-target');
      expect(target.textContent).toBe('模型 π0.5，能够泛化。');
    });
  });

  describe('renderError', () => {
    test('inserts an error div with error message', () => {
      const originalNode = document.getElementById('original');
      renderError(originalNode, 'Translation failed');

      const errorDiv = originalNode.nextSibling;
      expect(errorDiv).not.toBeNull();
      expect(errorDiv.classList.contains('llm-translate-bilingual')).toBe(true);
      expect(errorDiv.classList.contains('llm-translate-error')).toBe(true);
      expect(errorDiv.getAttribute('data-translated')).toBe('true');

      const target = errorDiv.querySelector('.llm-translate-target');
      expect(target).not.toBeNull();
      expect(target.textContent).toContain('Translation failed');
    });
  });

  describe('restoreAll', () => {
    test('removes all bilingual nodes', () => {
      const originalNode = document.getElementById('original');
      renderTranslation(originalNode, 'Bonjour le monde');

      expect(document.querySelectorAll('.llm-translate-bilingual').length).toBe(1);

      restoreAll();

      expect(document.querySelectorAll('.llm-translate-bilingual').length).toBe(0);
    });

    test('removes data-translated attributes from original nodes', () => {
      const originalNode = document.getElementById('original');
      renderTranslation(originalNode, 'Bonjour le monde');

      expect(originalNode.hasAttribute('data-translated')).toBe(true);

      restoreAll();

      expect(originalNode.hasAttribute('data-translated')).toBe(false);
    });
  });
});
