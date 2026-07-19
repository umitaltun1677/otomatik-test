const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://globalmarketsbrief.blogspot.com';
const LOAD_THRESHOLD = 8;

async function monitor() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotDir = path.join(process.cwd(), 'screenshots');
  
  // Klasörü kesin oluştur
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ 
    viewport: { width: 1920, height: 1080 } 
  });
  const page = await context.newPage();

  let hasIssue = false;
  const issues = [];

  try {
    console.log('Ana sayfa taranıyor...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    const posts = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="blogspot.com/202"]'));
      return [...new Set(links.map(a => a.href))].slice(0, 8);
    });

    console.log(`${posts.length} yazı tespit edildi.`);

    for (let i = 0; i < posts.length; i++) {
      const url = posts[i];
      console.log(`[${i+1}/${posts.length}] Kontrol: ${url}`);

      const startTime = Date.now();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const loadTime = (Date.now() - startTime) / 1000;

      const fileName = `${timestamp}-post-${i+1}`;
      const screenshotPath = path.join(screenshotDir, `${fileName}.png`);
      
      await page.screenshot({ path: screenshotPath, fullPage: true });

      if (loadTime > LOAD_THRESHOLD) {
        hasIssue = true;
        issues.push({ url, loadTime: loadTime.toFixed(1) });
        console.log(`⚠️ SORUN: ${loadTime.toFixed(1)}s`);
      } else {
        console.log(`✅ ${loadTime.toFixed(1)}s`);
      }
    }

    if (hasIssue) {
      fs.writeFileSync(path.join(screenshotDir, `${timestamp}-ISSUES.txt`), 
        `SORUNLAR:\n` + issues.map(i => `${i.loadTime}s → ${i.url}`).join('\n'));
      fs.writeFileSync('has_issue.txt', 'true');
    }

  } catch (error) {
    console.error('Hata:', error.message);
    fs.writeFileSync('has_issue.txt', 'true');
  } finally {
    await browser.close();
  }

  console.log('Monitoring tamamlandı.');
}

monitor();
