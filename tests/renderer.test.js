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
