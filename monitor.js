const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://globalmarketsbrief.blogspot.com';
const LOAD_THRESHOLD = 8;

async function monitor() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotDir = path.join(process.cwd(), 'screenshots');
  
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const tests = [
    { name: 'desktop', width: 1920, height: 1080, isMobile: false },
    { name: 'mobile', width: 390, height: 844, isMobile: true }
  ];

  let hasIssue = false;
  const issues = [];

  for (const test of tests) {
    console.log(`\n=== ${test.name.toUpperCase()} TESTİ BAŞLADI ===`);

    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: test.width, height: test.height },
      isMobile: test.isMobile,
      userAgent: test.isMobile 
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    const page = await context.newPage();

    try {
      // Ana sayfa
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

      const posts = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="blogspot.com/202"]'));
        return [...new Set(links.map(a => a.href))].slice(0, 6); // 6 yazı yeter
      });

      for (let i = 0; i < posts.length; i++) {
        const url = posts[i];
        const startTime = Date.now();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        const loadTime = (Date.now() - startTime) / 1000;

        const fileName = `${timestamp}-${test.name}-post-${i+1}`;
        await page.screenshot({ 
          path: `${screenshotDir}/${fileName}.png`, 
          fullPage: true 
        });

        if (loadTime > LOAD_THRESHOLD) {
          hasIssue = true;
          issues.push({ device: test.name, url, loadTime: loadTime.toFixed(1) });
          console.log(`⚠️ SORUN [${test.name}] ${loadTime.toFixed(1)}s`);
        } else {
          console.log(`✅ [${test.name}] ${loadTime.toFixed(1)}s`);
        }
      }
    } catch (e) {
      console.error(`Hata (${test.name}):`, e.message);
    } finally {
      await browser.close();
    }
  }

  if (hasIssue) {
    fs.writeFileSync(`${screenshotDir}/${timestamp}-ISSUES.txt`, 
      `🚨 SORUN TESPİT EDİLDİ!\n\n` + 
      issues.map(i => `[${i.device}] ${i.loadTime}s → ${i.url}`).join('\n'));
    fs.writeFileSync('has_issue.txt', 'true');
  }

  console.log('\nTüm testler tamamlandı.');
}

monitor();
