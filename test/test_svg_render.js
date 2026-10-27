const fs = require('fs');
const puppeteer = require('puppeteer-core');
const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function verifySanitizedFurniture() {
  const token = jwt.sign(
    { id: '60d0fe4f5311236168a109ca', role: 'Admin', username: 'TestAdmin' },
    process.env.JWT_SECRET || 'abcdefghijklmnopqrstuvwxyz'
  );
  const res = await fetch('http://127.0.0.1:8080/api/furniture', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const furnitures = await res.json();
  const wardrobe = furnitures.find(f => (f.furnitureTypeName || '').includes('2-door sliding'));

  const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const dompurifyPath = '../techbeeps-crm-frontend/node_modules/dompurify/dist/purify.min.js';
  const dompurifyCode = fs.readFileSync(dompurifyPath, 'utf8');
  await page.evaluate(dompurifyCode);

  const sanitized = await page.evaluate((svg) => {
    return DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: [
        'use', 'pattern', 'defs', 'image', 'g', 'path', 'circle', 'rect',
        'polygon', 'polyline', 'line', 'svg', 'clipPath', 'linearGradient', 'radialGradient', 'stop'
      ],
      ADD_ATTR: [
        'style', 'class', 'id', 'fill', 'stroke', 'stroke-width', 'viewBox',
        'xmlns', 'xmlns:xlink', 'xlink:href', 'href', 'd', 'width', 'height',
        'transform', 'preserveAspectRatio', 'patternContentUnits', 'x', 'y', 'r', 'cx', 'cy',
        'x1', 'y1', 'x2', 'y2', 'offset', 'stop-color', 'stop-opacity'
      ],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick'],
    });
  }, wardrobe.icon);

  console.log('Sanitized Wardrobe length:', sanitized.length);
  console.log('Has <use> tag:', sanitized.includes('<use'));
  console.log('Has <pattern> tag:', sanitized.includes('<pattern'));
  console.log('Has <image> tag:', sanitized.includes('<image'));
  console.log('Has xlink:href:', sanitized.includes('xlink:href'));
  console.log('Has base64 image data:', sanitized.includes('data:image/png;base64'));

  await page.setContent('<div id="icon-container">' + sanitized + '</div>');
  const renderedSvg = await page.evaluate(() => {
    const el = document.getElementById('icon-container');
    const svg = el.querySelector('svg');
    const use = el.querySelector('use');
    const img = el.querySelector('image');
    return {
      svgFound: !!svg,
      useExists: !!use,
      imgExists: !!img
    };
  });
  console.log('Wardrobe rendered in DOM element:', renderedSvg);

  await browser.close();
  process.exit(0);
}
verifySanitizedFurniture().catch(e => { console.error(e); process.exit(1); });
