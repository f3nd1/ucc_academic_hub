import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-user-timetable/90b0d0e3-75db-591d-bbe9-f5765c32c227/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext({ viewport: { width: 1440, height: 960 } }).then((c) => c.newPage());
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.click('.tour__card button:has-text("Don\'t show again")').catch(() => {});
await page.click('button:has-text("Skip wizard, use full form")');
await page.click('button:has-text("Load demo data")');
// 1. Holiday tables + renamed label + relabelled export buttons in one shot
await page.click('button:has-text("Generate timetable")');
await page.waitForSelector('.view-switch');
await page.screenshot({ path: `${OUT}/v6-1-holiday-tables.png`, fullPage: true });
// 2. Add-row interaction visible
const ph = page.locator('.holiday-table').nth(1);
await ph.locator('button:has-text("+ Add holiday")').click();
await ph.locator('input[type="date"]').nth(2).fill('2026-10-05');
await ph.locator('input[aria-label*="name"]').nth(2).fill('Deepavali');
await page.screenshot({ path: `${OUT}/v6-2-holiday-add-row.png`, fullPage: false });
console.log('saved');
await browser.close();
