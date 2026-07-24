const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Capture console messages
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  page.on('response', response => {
    console.log(`RESPONSE: ${response.status()} ${response.url()}`);
  });

  try {
    await page.goto('http://localhost:3500', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: 'screenshot_local.png' });
    console.log("Successfully loaded and captured screenshot.");
  } catch (err) {
    console.log("Navigation failed:", err.message);
  }

  await browser.close();
})();
