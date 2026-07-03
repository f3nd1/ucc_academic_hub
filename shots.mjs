import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-user-timetable/90b0d0e3-75db-591d-bbe9-f5765c32c227/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' });
await page.click('.tour__card button:has-text("Don\'t show again")').catch(() => {});
await page.check('input[name="theme"] >> nth=2'); // Dark
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/theme-dark-settings.png`, fullPage: true });
console.log('saved');
await browser.close();
