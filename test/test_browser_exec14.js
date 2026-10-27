const puppeteer = require('puppeteer-core');
const path = require('path');
const jwt = require('jsonwebtoken');

const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const JWT_SECRET = 'abcdefghijklmnopqrstuvwxyz';

async function captureJobUI() {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const testToken = jwt.sign(
    { userId: '67c05a32a7cf083dc7f2fbd6', role: 'Admin', email: 'mprofessionalwfh@gmail.com' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate((token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({
      id: '67c05a32a7cf083dc7f2fbd6',
      role: 'Admin',
      username: 'techbeeps',
      email: 'mprofessionalwfh@gmail.com'
    }));
  }, testToken);

  await page.goto('http://localhost:5173/jobs', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  const screenshotPath = path.join(__dirname, '../../exec14_job_consistency.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Saved screenshot: ${screenshotPath}`);

  await browser.close();
  process.exit(0);
}

captureJobUI().catch(err => {
  console.error(err);
  process.exit(1);
});
