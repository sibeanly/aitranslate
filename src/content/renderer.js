(function () {
  const LLMTranslate = (window.LLMTranslate = window.LLMTranslate || {});

  function shouldInsertSeparator(previousChunk, nextChunk) {
    if (!previousChunk || !nextChunk) return false;
    if (!(previousChunk.mathNode || nextChunk.mathNode)) return false;

    const nextText = nextChunk.text || '';
    if (/^[，。！？；：、,.!?;:)]/.test(nextText.trimStart())) return false;

    const previousText = previousChunk.text || '';
    if (/\s$/.test(previousText) || /^\s/.test(nextText)) return false;

    return true;
  }

  LLMTranslate.Renderer = {
    renderTranslation(originalNode, translatedText) {
      if (originalNode.hasAttribute('data-translated')) return;
      if (!originalNode.parentNode) return;
      originalNode.setAttribute('data-translated', 'true');

      const bilingual = document.createElement('div');
      bilingual.className = 'llm-translate-bilingual';
      bilingual.setAttribute('data-translated', 'true');

      const target = document.createElement('span');
      target.className = 'llm-translate-target';
      target.textContent = translatedText;

      bilingual.appendChild(target);
      originalNode.insertAdjacentElement('afterend', bilingual);
    },

    renderStructuredTranslation(originalNode, chunks) {
      if (originalNode.hasAttribute('data-translated')) return;
      if (!originalNode.parentNode) return;
      originalNode.setAttribute('data-translated', 'true');

      const bilingual = document.createElement('div');
      bilingual.className = 'llm-translate-bilingual';
      bilingual.setAttribute('data-translated', 'true');

      const target = document.createElement('span');
      target.className = 'llm-translate-target';

      chunks.forEach((chunk, index) => {
        if (shouldInsertSeparator(chunks[index - 1], chunk)) {
          target.appendChild(document.createTextNode(' '));
        }

        if (chunk.mathNode) {
          target.appendChild(chunk.mathNode.cloneNode(true));
        } else if (chunk.text) {
          target.appendChild(document.createTextNode(chunk.text));
        }
      });

      bilingual.appendChild(target);
      originalNode.insertAdjacentElement('afterend', bilingual);
    },

    renderError(originalNode, errorMessage) {
      if (originalNode.hasAttribute('data-translated')) return;
      if (!originalNode.parentNode) return;
      originalNode.setAttribute('data-translated', 'true');

      const errorDiv = document.createElement('div');
      errorDiv.className = 'llm-translate-bilingual llm-translate-error';
      errorDiv.setAttribute('data-translated', 'true');

      const target = document.createElement('span');
      target.className = 'llm-translate-target';
      target.textContent = `⚠ ${errorMessage}`;

      errorDiv.appendChild(target);
      originalNode.insertAdjacentElement('afterend', errorDiv);
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
