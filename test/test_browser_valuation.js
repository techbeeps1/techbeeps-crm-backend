const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const puppeteer = require('puppeteer-core');
const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

async function testValuationUI() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const token = jwt.sign(
    { id: '67c05a32a7cf083dc7f2fbd6', role: 'Admin', username: 'techbeeps' },
    process.env.JWT_SECRET || 'abcdefghijklmnopqrstuvwxyz'
  );

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify({
      id: '67c05a32a7cf083dc7f2fbd6',
      _id: '67c05a32a7cf083dc7f2fbd6',
      role: 'Admin',
      name: 'techbeeps',
      email: 'mprofessionalwfh@gmail.com'
    }));
  }, token);

  await page.goto('http://localhost:5173/intake', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  await page.screenshot({ path: path.join(__dirname, '../valuation_step0_initial.png'), fullPage: true });
  console.log('Saved valuation_step0_initial.png');

  // Click 'Existing Customer' card
  const cards = await page.$$('h3');
  for (const card of cards) {
    const text = await page.evaluate(el => el.textContent, card);
    if (text && text.includes('Existing Customer')) {
      await card.click();
      await new Promise(r => setTimeout(r, 1200));
      break;
    }
  }

  // Type in searchCustomer input
  const searchInput = await page.$('input[placeholder="Search customer..."]');
  if (searchInput) {
    await searchInput.type('a', { delay: 100 });
    await new Promise(r => setTimeout(r, 1500));
  }

  await page.screenshot({ path: path.join(__dirname, '../valuation_customer_search.png'), fullPage: true });
  console.log('Saved valuation_customer_search.png');

  // Click on the first search result in dropdown
  const firstItem = await page.$('div.hover\\:bg-slate-50');
  if (firstItem) {
    await firstItem.click();
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(__dirname, '../valuation_customer_selected.png'), fullPage: true });
    console.log('Saved valuation_customer_selected.png');
  }

  // Click Next button to move to Step 1 (Move from Address)
  const nextBtn = await page.$('button[type="button"].MuiButton-containedPrimary');
  if (nextBtn) {
    await nextBtn.click();
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(__dirname, '../valuation_step1_address.png'), fullPage: true });
    console.log('Saved valuation_step1_address.png');
  }

  await browser.close();
  console.log('Browser valuation check complete!');
}

testValuationUI().catch(console.error);
