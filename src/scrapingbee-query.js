
const API_KEY = process.env.SCRAPINGBEE_API_KEY;
const API_URL = 'https://app.scrapingbee.com/api/v1';

if (!API_KEY) {
  throw new Error('Missing SCRAPINGBEE_API_KEY');
}

const tests = [
  {
    name: 'Experiment 2 — CSS pseudo-elements',
    id: 2,
    selector: '#obfuscated-price',
    expected: '$79.50',
  },
  ...[
    'display: none',
    'visibility: hidden',
    'opacity: 0',
    'font-size: 0',
  ].map((technique, index) => ({
    name: `Experiment 3 — ${technique}`,
    id: 3,
    selector: `.case-list > .card:nth-child(${index + 1}) .price`,
    expected: '$79.50',
  })),
];

const prompt = `
What exact price does a visitor SEE after CSS rendering?
HTML may contain hidden digits or CSS-generated text.
Ignore invisible characters and don't copy raw HTML text.
Include the currency symbol.
Return only the price or UNKNOWN.
`.trim();

async function extractWithQuery(test) {
  const params = new URLSearchParams({
    url: `https://bodrovis.tech/obfs-lab/experiment${test.id}/`,
    render_js: 'true',
    block_resources: 'false',
    ai_selector: test.selector,
    ai_query: prompt,
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

  return body.trim();
}

for (const test of tests) {
  console.log(`\n${test.name}`);
  console.log('Expected:', test.expected);

  try {
    const result = await extractWithQuery(test);

    console.log('AI Query:', result);

    // Only an exact price match counts as an automatic pass.
    const extracted = result.replace(/^["']|["']$/g, '').trim();

    console.log(
      'Result:',
      extracted === test.expected ? 'PASS' : 'FAIL / REVIEW'
    );
  } catch (error) {
    console.error('Error:', error.message);
  }
}
