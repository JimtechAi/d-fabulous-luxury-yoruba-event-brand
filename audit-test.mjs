import { chromium } from 'playwright';

const baseUrl = 'http://localhost:3000';

const pages = [
  { path: '/', name: 'Home' },
  { path: '/services', name: 'Services' },
  { path: '/about', name: 'About' },
  { path: '/experience', name: 'Experience' },
  { path: '/gallery', name: 'Gallery' },
  { path: '/gallery/videos', name: 'Videos' },
  { path: '/testimonials', name: 'Testimonials' },
  { path: '/faq', name: 'FAQ' },
  { path: '/book', name: 'Book a Service' },
  { path: '/contact', name: 'Contact' },
  { path: '/admin/login', name: 'Admin Login' },
];

// Service pages to test
const services = [
  'alaga-iduro',
  'asho-oke-coordination',
  'bridal-makeup-coverage',
  'bridal-styling',
  'engagement-party-coordination',
  'gele-tying-service',
  'getup-gele-makeover',
  'group-coordination',
  'guest-coordination',
  'hair-styling-coverage',
  'henna-application',
  'mens-traditional-styling',
  'post-wedding-coordination',
  'preparation-room-coordination',
  'professional-photography',
  'professional-videography',
  'rehearsal-dinner-coordination',
  'styling-makeup-nail-coordination',
  'traditional-dance-coordination',
  'traditional-entrance-coordination',
  'traditional-reception-coordination',
  'villa-bride-coordination',
  'villa-groom-coordination',
  'villa-coordination',
  'vendor-coordination-management',
  'video-editing-thumbnails',
  'wedding-decor-coordination',
  'wedding-photography-packages',
];

const testResults = {
  passed: [],
  failed: [],
  errors: [],
  assetErrors: [],
  consoleErrors: [],
};

async function testPage(browser, url, name) {
  try {
    const page = await browser.newPage();
    const consoleMessages = [];
    const networkErrors = [];
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
      }
    });

    page.on('response', (response) => {
      if (response.status() === 404) {
        const url = response.url();
        if (!url.includes('favicon') && !url.includes('__vite')) {
          networkErrors.push(`404: ${url}`);
        }
      }
    });

    const response = await page.goto(url, { waitUntil: 'networkidle' });
    
    if (!response || !response.ok()) {
      testResults.failed.push(`${name}: HTTP ${response?.status() || 'unknown'}`);
      await page.close();
      return;
    }

    // Wait a moment for async content to load
    await page.waitForTimeout(1000);

    // Check for images and verify they load
    const imageElements = await page.$$eval('img', (imgs) =>
      imgs.map((img) => ({
        src: img.src,
        alt: img.alt,
        complete: img.complete,
      }))
    );

    for (const img of imageElements) {
      if (!img.complete && img.src) {
        networkErrors.push(`Image not loaded: ${img.src}`);
      }
    }

    if (consoleMessages.length > 0) {
      testResults.consoleErrors.push({ page: name, errors: consoleMessages });
    }

    if (networkErrors.length > 0) {
      testResults.assetErrors.push({ page: name, errors: networkErrors });
    }

    testResults.passed.push(name);
    await page.close();
  } catch (error) {
    testResults.errors.push({ page: name, error: error.message });
  }
}

async function runTests() {
  console.log('Starting Playwright audit tests...\n');
  const browser = await chromium.launch({ headless: true });

  // Test main pages
  console.log('Testing main pages...');
  for (const page of pages) {
    process.stdout.write(`  Testing ${page.name}...`);
    await testPage(browser, `${baseUrl}${page.path}`, page.name);
    console.log(' ✓');
  }

  // Test service pages
  console.log('\nTesting service pages...');
  for (const service of services) {
    process.stdout.write(`  Testing /services/${service}...`);
    await testPage(browser, `${baseUrl}/services/${service}`, `Service: ${service}`);
    console.log(' ✓');
  }

  await browser.close();

  // Print results
  console.log('\n' + '='.repeat(70));
  console.log('AUDIT TEST RESULTS');
  console.log('='.repeat(70));

  console.log(`\n✓ PASSED: ${testResults.passed.length} pages`);
  console.log(`✗ FAILED: ${testResults.failed.length} pages`);
  console.log(`⚠ ERRORS: ${testResults.errors.length} pages`);
  console.log(`⚠ ASSET ISSUES: ${testResults.assetErrors.length} pages`);
  console.log(`⚠ CONSOLE ERRORS: ${testResults.consoleErrors.length} pages`);

  if (testResults.failed.length > 0) {
    console.log('\nFailed pages:');
    testResults.failed.forEach((f) => console.log(`  - ${f}`));
  }

  if (testResults.errors.length > 0) {
    console.log('\nPage errors:');
    testResults.errors.forEach((e) => console.log(`  - ${e.page}: ${e.error}`));
  }

  if (testResults.assetErrors.length > 0) {
    console.log('\nAsset/Network errors:');
    testResults.assetErrors.forEach((a) => {
      console.log(`  ${a.page}:`);
      a.errors.forEach((err) => console.log(`    - ${err}`));
    });
  }

  if (testResults.consoleErrors.length > 0) {
    console.log('\nConsole errors on pages:');
    testResults.consoleErrors.forEach((c) => {
      console.log(`  ${c.page}:`);
      c.errors.forEach((err) => console.log(`    - ${err}`));
    });
  }

  console.log('\n' + '='.repeat(70));
  process.exit(testResults.failed.length > 0 || testResults.errors.length > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
