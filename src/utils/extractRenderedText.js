import { extractVisibleText } from './extractVisibleText.js';

export async function extractRenderedText(locator) {
  // Extract visible DOM characters using their screen coordinates.
  const dom = await extractVisibleText(locator);

  // Discover generated content on the root and all descendants.
  const css = await locator.evaluate((root) => {
    const generatedFragments = [];
    const elements = [root, ...root.querySelectorAll('*')];

    function isVisible(element) {
      if (getComputedStyle(element).visibility !== 'visible') {
        return false;
      }

      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);

        if (style.display === 'none' || Number(style.opacity) === 0) {
          return false;
        }
      }

      return true;
    }

    function inspectPseudo(element, type) {
      const style = getComputedStyle(element, `::${type}`);
      const raw = style.content;

      const visible =
        raw !== 'none' &&
        raw !== 'normal' &&
        raw !== '' &&
        style.display !== 'none' &&
        style.visibility === 'visible' &&
        Number(style.opacity) > 0 &&
        parseFloat(style.fontSize) > 0 &&
        isVisible(element);

      let text = '';

      if (visible && raw.startsWith('"') && raw.endsWith('"')) {
        try {
          text = JSON.parse(raw);
        } catch {
          // Unsupported CSS string syntax.
        }
      }

      return { raw, text, visible };
    }

    for (const [hostIndex, element] of elements.entries()) {
      if (!isVisible(element)) continue;

      const rects = [...element.getClientRects()].filter(
        (rect) => rect.width > 0 && rect.height > 0
      );

      if (rects.length === 0) continue;

      for (const type of ['before', 'after']) {
        const pseudo = inspectPseudo(element, type);

        if (!pseudo.text) continue;

        // The pseudo-element has no DOM node of its own.
        // Approximate its position using the host's boxes.
        const rect =
          type === 'before' ? rects[0] : rects[rects.length - 1];

        generatedFragments.push({
          text: pseudo.text,
          source: `::${type}`,
          hostIndex,
          x: type === 'before' ? rect.left : rect.right,
          y: rect.top,
        });
      }
    }

    return {
      rootPseudo: {
        before: inspectPseudo(root, 'before'),
        after: inspectPseudo(root, 'after'),
      },
      generatedFragments,
    };
  });

  // Combine DOM characters and generated CSS text.
  const fragments = [
    ...dom.fragments.map((fragment) => ({
      ...fragment,
      source: 'dom',
    })),
    ...css.generatedFragments,
  ];

  // Approximate left-to-right visual reading order.
  const sorted = fragments.sort((a, b) => {
    if (Math.abs(a.y - b.y) >= 4) {
      return a.y - b.y;
    }

    if (a.x !== b.x) {
      return a.x - b.x;
    }

    // At the same position, ::before precedes DOM text.
    const priority = {
      '::before': 0,
      dom: 1,
      '::after': 2,
    };

    return priority[a.source] - priority[b.source];
  });

  return {
    rawText: dom.rawText,
    innerText: dom.innerText,
    visibleDomText: dom.visualText,
    pseudo: css.rootPseudo,
    generatedFragments: css.generatedFragments,
    renderedText: sorted.map((fragment) => fragment.text).join(''),
  };
}
