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
      const article = root.querySelector('article');
      if (article) return article;
      const main = root.querySelector('main');
      if (main) return main;
      const candidates = root.querySelectorAll('div, section');
      let best = root;
      let bestDensity = 0;
      for (const el of candidates) {
        if (['NAV', 'HEADER', 'FOOTER', 'ASIDE'].includes(el.tagName)) continue;
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
        const potentialLength = currentSegment.text.length + (currentSegment.text ? 2 : 0) + nodeText.length;
        if (potentialLength > 1000 && currentSegment.nodes.length > 0) {
          segments.push({ ...currentSegment });
          currentSegment = { nodes: [], text: '' };
        }
        if (currentSegment.text) currentSegment.text += '\n\n';
        currentSegment.text += nodeText;
        currentSegment.nodes.push(node);
      }
      if (currentSegment.nodes.length > 0) {
        segments.push(currentSegment);
      }
      return segments;
    },

    MATH_SELECTORS: [
      'mjx-container', '[class*="MathJax"]', '.katex', '.katex-display',
      'math', '.ltx_Math', '.ltx_equationgroup', '.ltx_eqn_table',
      '.ltx_equation', '[data-latex]',
    ].join(','),

    _getMathText(el) {
      const dataLatex = el.getAttribute('data-latex');
      if (dataLatex && dataLatex.trim()) return dataLatex.trim();

      const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
      if (annotation) return annotation.textContent.trim();

      // Fallback: clone and remove annotation/script elements to get clean text
      const clone = el.cloneNode(true);
      clone.querySelectorAll('annotation, script, style, [aria-hidden="true"]').forEach(e => e.remove());
      const clean = clone.textContent.trim();
      return clean || el.textContent.trim();
    },

    splitByMath(node) {
      if (!node.querySelector(this.MATH_SELECTORS)) return null;

      const chunks = [];
      let currentText = '';
      const self = this;

      function walk(el) {
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            currentText += child.textContent;
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            if (child.matches && child.matches(self.MATH_SELECTORS)) {
              if (currentText.trim()) {
                chunks.push({ text: currentText });
                currentText = '';
              }
              chunks.push({
                mathNode: child.cloneNode(true),
                mathText: self._getMathText(child),
              });
            } else if (child.querySelector && child.querySelector(self.MATH_SELECTORS)) {
              walk(child);
            } else {
              currentText += child.textContent;
            }
          }
        }
      }

      walk(node);
      if (currentText.trim()) {
        chunks.push({ text: currentText });
      }

      return chunks.some(c => c.mathNode) ? chunks : null;
    },

    _removeAncestorDuplicates(nodes, root) {
      const nodeSet = new Set(nodes);
      return nodes.filter(node => {
        let parent = node.parentElement;
        while (parent && parent !== root) {
          if (nodeSet.has(parent)) return false;
          parent = parent.parentElement;
        }
        return true;
      });
    },

    extractSegments(root, scope) {
      const container = scope === 'full' ? root : this.findMainContent(root);
      const nodes = this.collectTextNodes(container);
      const deduped = this._removeAncestorDuplicates(nodes, container);
      return this.segmentNodes(deduped);
    },
  };
})();
