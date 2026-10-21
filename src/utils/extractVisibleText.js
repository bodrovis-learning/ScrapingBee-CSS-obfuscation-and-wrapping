export async function extractVisibleText(locator) {
  return locator.evaluate((root) => {
    const fragments = [];

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT
    );

    const segmenter = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    });

    let node;

    while ((node = walker.nextNode())) {
      const parent = node.parentElement;

      if (!parent || !node.nodeValue) continue;

      if (getComputedStyle(parent).visibility !== 'visible') {
        continue;
      }

      // Check whether an ancestor makes the text transparent.
      let transparent = false;

      for (let el = parent; el; el = el.parentElement) {
        if (Number(getComputedStyle(el).opacity) === 0) {
          transparent = true;
          break;
        }
      }

      if (transparent) continue;

      const range = document.createRange();

      // Measure individual characters instead of entire text nodes.
      for (const { segment, index } of segmenter.segment(node.nodeValue)) {
        range.setStart(node, index);
        range.setEnd(node, index + segment.length);

        const rect = [...range.getClientRects()].find(
          (r) => r.width > 0 && r.height > 0
        );

        if (!rect) continue;

        fragments.push({
          text: segment,
          x: rect.x,
          y: rect.y,
          domIndex: fragments.length,
        });
      }
    }

    // Approximate visual reading order for horizontal LTR text.
    const sorted = [...fragments].sort((a, b) => {
      if (Math.abs(a.y - b.y) < 4) {
        return a.x - b.x || a.domIndex - b.domIndex;
      }

      return a.y - b.y;
    });

    return {
      rawText: root.textContent,
      innerText: root.innerText,
      fragments,
      visualText: sorted.map((f) => f.text).join(''),
    };
  });
}