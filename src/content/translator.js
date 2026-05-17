(function () {
  const LLMTranslate = (window.LLMTranslate = window.LLMTranslate || {});

  LLMTranslate.Translator = {
    isTranslating: false,

    async translatePage(scope) {
      if (this.isTranslating) return;
      this.isTranslating = true;

      try {
        const segments = LLMTranslate.Extractor.extractSegments(document.body, scope);
        if (segments.length === 0) {
          this.isTranslating = false;
          return;
        }
        await this._translateSegmentsWithConcurrency(segments, 3);
      } finally {
        this.isTranslating = false;
      }
    },

    async _translateSegmentsWithConcurrency(segments, concurrency) {
      let index = 0;
      const self = this;

      async function worker() {
        while (index < segments.length) {
          const currentIndex = index++;
          const segment = segments[currentIndex];
          await self._translateSegment(segment);
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
        try {
          const chunks = LLMTranslate.Extractor.splitByMath(node);

          if (!chunks) {
            // No math: translate normally
            const text = node.textContent.trim();
            if (!text) continue;
            const response = await chrome.runtime.sendMessage({
              type: 'translate',
              text: text,
            });
            if (response && response.success) {
              LLMTranslate.Renderer.renderTranslation(node, response.translated);
            } else {
              LLMTranslate.Renderer.renderError(node, response ? response.error : 'Unknown error');
            }
          } else {
            // Has math: translate only text chunks, keep math as-is
            const textIndices = [];
            const translatableTexts = [];
            for (let i = 0; i < chunks.length; i++) {
              if (chunks[i].text) {
                const t = chunks[i].text.trim();
                if (t.length > 2) {
                  textIndices.push(i);
                  translatableTexts.push(t);
                }
              }
            }

            if (translatableTexts.length > 0) {
              // Translate all text chunks in parallel
              const translations = await Promise.all(
                translatableTexts.map(t =>
                  chrome.runtime.sendMessage({ type: 'translate', text: t })
                )
              );

              // Reassemble: interleave translations with cloned math DOM.
              let ti = 0;
              const textIndexSet = new Set(textIndices);
              const resultChunks = chunks.map((chunk, i) => {
                if (chunk.text && textIndexSet.has(i)) {
                  const resp = translations[ti++];
                  return { text: resp && resp.success ? resp.translated : chunk.text };
                }
                if (chunk.mathNode) return { mathNode: chunk.mathNode };
                if (chunk.text && !textIndexSet.has(i)) return { text: chunk.text };
                return { text: '' };
              });

              LLMTranslate.Renderer.renderStructuredTranslation(node, resultChunks);
            }
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
      return { isTranslating: this.isTranslating };
    },
  };
})();
