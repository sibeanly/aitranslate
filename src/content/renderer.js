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
