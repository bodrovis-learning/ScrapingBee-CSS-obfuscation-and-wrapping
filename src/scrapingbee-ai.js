
const API_KEY = process.env.SCRAPINGBEE_API_KEY;
const API_URL = 'https://app.scrapingbee.com/api/v1';

if (!API_KEY) {
  throw new Error('Missing SCRAPINGBEE_API_KEY');
}

const tests = [
  {
    name: 'Experiment 1 — Flexbox',
    id: 1,
    selector: '#obfuscated-price',
    expected: '$49.99',
  },
  {
    name: 'Experiment 2 — Pseudo-elements',
    id: 2,
    selector: '#obfuscated-price',
    expected: '$79.50',
  },
  ...['display: none', 'visibility: hidden', 'opacity: 0', 'font-size: 0']
    .map((technique, index) => ({
      name: `Experiment 3 — ${technique}`,
      id: 3,
      selector: `.case-list > .card:nth-child(${index + 1}) .price`,
      expected: '$79.50',
    })),
  {
    name: 'Experiment 4 — Bidi override',
    id: 4,
    selector: '#obfuscated-price',
    expected: '$79.50',
  },
  {
    name: 'Experiment 5 — Combined',
    id: 5,
    selector: '#obfuscated-price',
    expected: '$79.50',
  },
];

async function extractWithAI(test) {
  const params = new URLSearchParams({
    url: `https://bodrovis.tech/obfs-lab/experiment${test.id}/`,
    render_js: 'true',
    block_resources: 'false',
    ai_selector: test.selector,
    ai_extract_rules: JSON.stringify({
      price: {
        description:
          'The price visually displayed to the visitor in the selected element, including its currency symbol.',
        type: 'string',
      },
    }),
  });

  const response = await fetch(`${API_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    signal: AbortSignal.timeout(120_000),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  return JSON.parse(body);
}

for (const test of tests) {
  console.log(`\n${test.name}`);
  console.log('Selector:', test.selector);
  console.log('Expected:', test.expected);

  try {
    const result = await extractWithAI(test);
    const extracted = result?.price;

    console.log('ScrapingBee AI:', result);

    // Keep currency symbols: a missing "$" should not pass.
    const normalize = (value) =>
      String(value ?? '').trim().replace(/\s+/g, '');

    const passed =
      normalize(extracted) === normalize(test.expected);

    console.log('Result:', passed ? 'PASS' : 'FAIL / REVIEW');
  } catch (error) {
    console.error('Error:', error.message);
  }
}
