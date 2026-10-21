
import { chromium } from 'playwright';
import { extractRenderedText } from './utils/extractRenderedText.js';
import { waitForStableContent } from './utils/waitForStableContent.js';

const BASE_URL = 'https://bodrovis.tech/obfs-lab/';
const CSS_PATH = '/obfs-lab/styles.css';
const EXPERIMENTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const EXPECTED_PRICE = '$79.50';

// Parse CLI arguments.
const args = process.argv.slice(2);
const headed = args.includes('--headed');
const selections = args.filter((arg) => !arg.startsWith('--'));
const selection = selections[0] ?? '1';

if (
  selections.length > 1 ||
  args.some((arg) => arg.startsWith('--') && arg !== '--headed') ||
  (selection !== 'all' && !EXPERIMENTS.includes(Number(selection)))
) {
  console.error('Usage: npm start -- [1|2|3|4|5|6|7|8|9|all] [--headed]');
  process.exit(1);
}

const selectedExperiments = selection === 'all' ? EXPERIMENTS : [Number(selection)];

function logExtraction(label, result) {
  console.log(`  ${label}:`);
  console.dir(result, { depth: null });
}

function reportChecks(checks) {
  for (const [name, passed] of Object.entries(checks)) {
    console.log(`  ${name}: ${passed ? 'OK' : 'FAILED'}`);
  }

  const passed = Object.values(checks).every(Boolean);
  console.log(`  Result: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

// Experiments 1–5: static CSS obfuscation (four cases in Experiment 3).
async function runStaticExperiment(page, number) {
  const selector = number === 3
    ? '.case-list > .card .price'
    : number === 4
      ? '.price.is-obfuscated'
      : '#obfuscated-price';

  const prices = page.locator(selector);
  const expectedCount = number === 3 ? 4 : 1;
  const count = await prices.count();

  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} price element(s), found ${count}`);
  }

  const expectedPrice = number === 1 ? '$49.99' : EXPECTED_PRICE;
  const checks = {};

  for (let index = 0; index < count; index++) {
    const result = await extractRenderedText(prices.nth(index));
    logExtraction(`Price ${index + 1}`, result);
    checks[`Price ${index + 1}`] = result.renderedText === expectedPrice;
  }

  return reportChecks(checks);
}

// Experiments 6–7: randomized markup regenerated on demand.
async function runWrappingExperiment(page, number) {
  const price = page.locator('#dynamic-price[data-ready="true"]');
  const button = page.locator(number === 6 ? '#rebuild' : '#reshuffle');

  await price.waitFor();

  const first = await extractRenderedText(price);
  const initialMarkup = await price.innerHTML();
  logExtraction('Initial extraction', first);

  await button.click();

  const second = await extractRenderedText(price);
  const rebuiltMarkup = await price.innerHTML();
  logExtraction('After regeneration', second);

  return reportChecks({
    'Initial price': first.renderedText === EXPECTED_PRICE,
    'Regenerated price': second.renderedText === EXPECTED_PRICE,
    'Markup changed': initialMarkup !== rebuiltMarkup,
    ...(number === 7 ? {
      'Raw text scrambled':
        first.rawText !== EXPECTED_PRICE && second.rawText !== EXPECTED_PRICE,
    } : {}),
  });
}

// Experiments 8–9: asynchronous updates and content stabilization.
async function runAsyncExperiment(page, number) {
  const price = page.locator('#dynamic-price');
  const button = page.locator(number === 8 ? '#refresh' : '#rebuild');

  const options = {
    quietMs: 500,
    timeoutMs: number === 9 ? 12_000 : 10_000,
    validate: (text) => /^\$\d+\.\d{2}$/.test(text),
    ...(number === 9 ? {
      // Experiment 9 never contains a correct raw DOM price.
      read: async (target) =>
        (await extractRenderedText(target)).renderedText,
    } : {}),
  };

  console.log('  Immediately after load:', await price.textContent());

  const firstValue = await waitForStableContent(price, options);
  const first = await extractRenderedText(price);
  const initialMarkup = await price.innerHTML();
  console.log('  First validated value:', firstValue);
  logExtraction('First stable extraction', first);

  await button.click();
  console.log('  During regeneration:', await price.textContent());

  const secondValue = await waitForStableContent(price, options);
  const second = await extractRenderedText(price);
  const rebuiltMarkup = await price.innerHTML();
  console.log('  Second validated value:', secondValue);
  logExtraction('After regeneration', second);

  return reportChecks({
    'Initial validated value': firstValue === EXPECTED_PRICE,
    'Regenerated validated value': secondValue === EXPECTED_PRICE,
    'Initial rendered price': first.renderedText === EXPECTED_PRICE,
    'Regenerated rendered price': second.renderedText === EXPECTED_PRICE,
    'Markup changed': initialMarkup !== rebuiltMarkup,
    ...(number === 9 ? {
      'Raw text obfuscated':
        first.rawText !== EXPECTED_PRICE && second.rawText !== EXPECTED_PRICE,
    } : {}),
  });
}

async function runExperiment(browser, number) {
  const page = await browser.newPage();
  const url = new URL(`experiment${number}/`, BASE_URL).href;
  let cssResponse;

  page.on('response', (response) => {
    if (new URL(response.url()).pathname === CSS_PATH) {
      cssResponse = response;
    }
  });

  console.log(`\nExperiment ${number}`);

  try {
    const response = await page.goto(url, {
      waitUntil: 'load',
      timeout: 30_000,
    });

    if (!response?.ok()) {
      throw new Error(`Page returned HTTP ${response?.status() ?? 'unknown'}`);
    }

    const contentType = cssResponse?.headers()['content-type'] ?? '';
    const cssLoaded = Boolean(
      cssResponse?.ok() && contentType.includes('text/css'),
    );

    console.log(`  URL:   ${page.url()}`);
    console.log(`  Title: ${await page.title()}`);
    console.log(`  CSS:   ${cssLoaded ? 'OK' : 'FAILED'} (${cssResponse?.status() ?? 'no response'}, ${contentType || 'unknown MIME'})`);

    if (!cssLoaded) {
      throw new Error('Shared stylesheet failed to load');
    }

    let passed;

    if (number <= 5) {
      passed = await runStaticExperiment(page, number);
    } else if (number <= 7) {
      passed = await runWrappingExperiment(page, number);
    } else {
      passed = await runAsyncExperiment(page, number);
    }

    if (headed) {
      console.log('  Browser paused. Resume in Playwright Inspector to continue.');
      await page.pause();
    }

    return passed;
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ headless: !headed });
let failed = false;

try {
  for (const number of selectedExperiments) {
    try {
      if (!(await runExperiment(browser, number))) {
        failed = true;
      }
    } catch (error) {
      failed = true;
      console.error(`  Experiment ${number} failed: ${error.message}`);
    }
  }
} finally {
  await browser.close();
}

if (failed) process.exitCode = 1;
