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

    extractSegments(root, scope) {
      const container = scope === 'full' ? root : this.findMainContent(root);
      const nodes = this.collectTextNodes(container);
      return this.segmentNodes(nodes);
    },
  };
})();
