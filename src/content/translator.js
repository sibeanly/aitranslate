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
      return { isTranslating: this.isTranslating };
    },
  };
})();
