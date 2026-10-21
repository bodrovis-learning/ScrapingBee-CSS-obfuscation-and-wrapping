export async function extractExperiment1(page) {
  return page.evaluate(() => {
    const product = document.querySelector(
      'section[aria-labelledby="product-title"]'
    );

    if (!product) {
      throw new Error('Product not found');
    }

    const price = product.querySelector('#obfuscated-price');

    if (!price) {
      throw new Error('Price not found');
    }

    const containerStyle = getComputedStyle(price);

    // Inspect each price fragment in DOM order.
    const fragments = Array.from(price.children).map((element, domIndex) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return {
        domIndex,
        text: element.textContent,
        order: Number(style.order),
        x: rect.x,
        y: rect.y,
      };
    });

    // Strategy 1: Reconstruct using CSS flex order.
    const byCssOrder = [...fragments]
      .sort((a, b) => a.order - b.order || a.domIndex - b.domIndex)
      .map((fragment) => fragment.text)
      .join('');

    // Strategy 2: Reconstruct using actual screen coordinates.
    const byPosition = [...fragments]
      .sort((a, b) => a.x - b.x)
      .map((fragment) => fragment.text)
      .join('');

    return {
      productName: product.querySelector('.product-name')?.textContent.trim(),

      rawText: price.textContent,
      innerText: price.innerText,

      layout: {
        display: containerStyle.display,
        flexDirection: containerStyle.flexDirection,
      },

      fragments,

      extractedPrice: {
        byCssOrder,
        byPosition,
      },
    };
  });
}