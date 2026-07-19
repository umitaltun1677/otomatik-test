const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://globalmarketsbrief.blogspot.com';

async function monitor() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotDir = './screenshots';
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);

  const devices = [
    { name: 'desktop-chrome', width: 1920, height: 1080 },
    { name: 'mobile-chrome', width: 390, height: 844, isMobile: true }
  ];

  for (const device of devices) {
    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      isMobile: device.isMobile || false,
      userAgent: device.isMobile 
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    const page = await context.newPage();
    
    console.log(`Testing ${device.name}...`);
    
    const startTime = Date.now();
    await page.goto(URL, { waitUntil: 'networkidle' });
    const loadTime = (Date.now() - startTime) / 1000;

    // Screenshot
    await page.screenshot({ 
      path: `${screenshotDir}/${timestamp}-${device.name}.png`,
      fullPage: true 
    });

    // İçerik kontrolü için metin kaydet
    const text = await page.innerText('body');
    fs.writeFileSync(`${screenshotDir}/${timestamp}-${device.name}-content.txt`, 
      `Load Time: ${loadTime}s\n\n${text}`);

    console.log(`${device.name} - Load Time: ${loadTime}s`);

    await browser.close();
  }
}

monitor().catch(console.error);
