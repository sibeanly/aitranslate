const fs = require('fs');
const path = require('path');

// Load the extractor module
const extractorCode = fs.readFileSync(
  path.join(__dirname, '../src/content/extractor.js'),
  'utf8'
);

beforeEach(() => {
  // Reset LLMTranslate before each test
  delete window.LLMTranslate;
  // Execute the IIFE to attach the module
  const script = new Function(extractorCode);
  script();
});

function getExtractor() {
  return window.LLMTranslate.Extractor;
}

// ── collectTextNodes ──────────────────────────────────────────────

describe('collectTextNodes', () => {
  test('collects text from paragraph elements', () => {
    document.body.innerHTML = '<p>Hello world</p><p>Another paragraph</p>';
    const nodes = getExtractor().collectTextNodes(document.body);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].textContent.trim()).toBe('Hello world');
    expect(nodes[1].textContent.trim()).toBe('Another paragraph');
  });

  test('skips script and style tags', () => {
    document.body.innerHTML =
      '<p>Visible text</p><script>var x = 1;</script><style>.cls{color:red;}</style>';
    const nodes = getExtractor().collectTextNodes(document.body);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].textContent.trim()).toBe('Visible text');
  });

  test('skips code and pre tags', () => {
    document.body.innerHTML =
      '<p>Regular text</p><code>const a = 1;</code><pre>formatted code</pre>';
    const nodes = getExtractor().collectTextNodes(document.body);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].textContent.trim()).toBe('Regular text');
  });

  test('skips nodes with data-translated attribute', () => {
    document.body.innerHTML =
      '<p>Translated</p><p data-translated>Already done</p>';
    const nodes = getExtractor().collectTextNodes(document.body);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].textContent.trim()).toBe('Translated');
  });

  test('skips empty text nodes', () => {
    document.body.innerHTML = '<p></p><p>   </p><p>Content</p>';
    const nodes = getExtractor().collectTextNodes(document.body);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].textContent.trim()).toBe('Content');
  });
});

// ── findMainContent ───────────────────────────────────────────────

describe('findMainContent', () => {
  test('returns <article> element if present', () => {
    document.body.innerHTML =
      '<div><p>Side content</p></div><article><p>Main article</p></article>';
    const result = getExtractor().findMainContent(document.body);
    expect(result.tagName).toBe('ARTICLE');
  });

  test('returns <main> element if no article', () => {
    document.body.innerHTML =
      '<div><p>Side content</p></div><main><p>Main content</p></main>';
    const result = getExtractor().findMainContent(document.body);
    expect(result.tagName).toBe('MAIN');
  });

  test('falls back to highest text-density div', () => {
    document.body.innerHTML = `
      <div><p>Short</p></div>
      <div>
        <p>This div has a lot more text content to increase its density score significantly</p>
        <p>Adding even more text here to make sure this div wins the density calculation</p>
      </div>
    `;
    const result = getExtractor().findMainContent(document.body);
    // The second div should have higher text density
    expect(result.textContent.trim()).toContain('lot more text content');
  });

  test('skips nav, header, footer, aside as candidates', () => {
    document.body.innerHTML = `
      <nav>Navigation link text that is somewhat long</nav>
      <header>Header text that is also somewhat long</header>
      <footer>Footer text that is also somewhat long</footer>
      <aside>Aside text that is also somewhat long</aside>
      <div><p>Main content here with enough text to have higher density than the skipped elements</p></div>
    `;
    const result = getExtractor().findMainContent(document.body);
    // nav, header, footer, aside should be skipped; the div with "Main content" should win
    expect(result.tagName).toBe('DIV');
    expect(result.textContent.trim()).toContain('Main content here');
  });
});

// ── segmentNodes ──────────────────────────────────────────────────

describe('segmentNodes', () => {
  test('creates one segment for short text', () => {
    const p = document.createElement('p');
    p.textContent = 'Short text';
    const segments = getExtractor().segmentNodes([p]);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Short text');
    expect(segments[0].nodes).toHaveLength(1);
  });

  test('groups multiple nodes into one segment under limit', () => {
    const p1 = document.createElement('p');
    p1.textContent = 'First paragraph';
    const p2 = document.createElement('p');
    p2.textContent = 'Second paragraph';
    const segments = getExtractor().segmentNodes([p1, p2]);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('First paragraph\n\nSecond paragraph');
    expect(segments[0].nodes).toHaveLength(2);
  });

  test('splits into multiple segments when exceeding 1000 chars', () => {
    const nodes = [];
    // Create 3 nodes of ~500 chars each; first two fit in one segment, third starts new
    for (let i = 0; i < 3; i++) {
      const p = document.createElement('p');
      p.textContent = 'A'.repeat(500);
      nodes.push(p);
    }
    const segments = getExtractor().segmentNodes(nodes);
    // 500 + 2 + 500 = 1002 > 1000, so first two should be in separate segments
    // Actually: first node (500) fits, then 500 + 2 + 500 = 1002 > 1000, so split
    expect(segments.length).toBeGreaterThanOrEqual(2);
    // Each segment should have text
    for (const seg of segments) {
      expect(seg.text.length).toBeGreaterThan(0);
      expect(seg.nodes.length).toBeGreaterThan(0);
    }
  });

  test('returns empty array for empty input', () => {
    const segments = getExtractor().segmentNodes([]);
    expect(segments).toEqual([]);
  });
});

// ── splitByMath ────────────────────────────────────────────────────

describe('splitByMath', () => {
  test('returns text chunks and math DOM chunks for arxiv-style inline math', () => {
    const p = document.createElement('p');
    p.innerHTML = 'The model <span class="ltx_Math"><math><mi>π</mi><mn>0.5</mn></math></span> generalizes.';

    const chunks = getExtractor().splitByMath(p);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ text: 'The model ' });
    expect(chunks[1].mathNode).toBeInstanceOf(Element);
    expect(chunks[1].mathNode.className).toBe('ltx_Math');
    expect(chunks[1].mathText).toBe('π0.5');
    expect(chunks[2]).toEqual({ text: ' generalizes.' });
  });
});

// ── extractSegments ───────────────────────────────────────────────

describe('extractSegments', () => {
  test('extracts segments with scope=full', () => {
    document.body.innerHTML = '<p>Hello world</p><p>More text</p>';
    const segments = getExtractor().extractSegments(document.body, 'full');
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0].text).toContain('Hello world');
  });

  test('extracts segments with scope=main', () => {
    document.body.innerHTML =
      '<nav><p>Nav text</p></nav><main><p>Main text here</p></main>';
    const segments = getExtractor().extractSegments(document.body, 'main');
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0].text).toContain('Main text here');
  });
});
