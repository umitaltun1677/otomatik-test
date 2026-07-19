const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://globalmarketsbrief.blogspot.com';
const LOAD_THRESHOLD = 8;

const testConfigs = [
  { 
    name: 'desktop-us', 
    width: 1920, 
    height: 1080, 
    isMobile: false,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  },
  { 
    name: 'mobile-android', 
    width: 390, 
    height: 844, 
    isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36'
  },
  { 
    name: 'mobile-ios', 
    width: 414, 
    height: 896, 
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
  }
];

async function monitor() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotDir = path.join(process.cwd(), 'screenshots');
  
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  let hasIssue = false;
  const issues = [];

  for (const config of testConfigs) {
    console.log(`\n=== ${config.name.toUpperCase()} TESTİ ===`);

    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: config.width, height: config.height },
      isMobile: config.isMobile,
      userAgent: config.userAgent
    });

    const page = await context.newPage();

    try {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

      const posts = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="blogspot.com/202"]'));
        return [...new Set(links.map(a => a.href))].slice(0, 5);
      });

      for (let i = 0; i < posts.length; i++) {
        const url = posts[i];
        const start = Date.now();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        const loadTime = (Date.now() - start) / 1000;

        const filename = `${timestamp}-${config.name}-post-${i+1}.png`;
        await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: true });

        if (loadTime > LOAD_THRESHOLD) {
          hasIssue = true;
          issues.push({ device: config.name, loadTime: loadTime.toFixed(1), url });
          console.log(`⚠️ SORUN [${config.name}] ${loadTime.toFixed(1)}s`);
        } else {
          console.log(`✅ [${config.name}] ${loadTime.toFixed(1)}s`);
        }
      }
    } catch (err) {
      console.error(`Hata ${config.name}:`, err.message);
    } finally {
      await browser.close();
    }
  }

  if (hasIssue) {
    fs.writeFileSync(path.join(screenshotDir, `${timestamp}-ISSUES.txt`), 
      `🚨 SORUN TESPİT EDİLDİ (${new Date().toLocaleString()})\n\n` +
      issues.map(i => `[${i.device}] ${i.loadTime}s → ${i.url}`).join('\n'));
    fs.writeFileSync('has_issue.txt', 'true');
  }

  console.log('Tüm testler tamamlandı.');
}

monitor().catch(console.error);
