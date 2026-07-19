const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://globalmarketsbrief.blogspot.com';

async function monitor() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotDir = './screenshots';
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  console.log('Ana sayfa taranıyor...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Tüm yazıları bul
  const posts = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="blogspot.com/202"]'));
    const uniqueLinks = [...new Set(links.map(a => a.href))];
    return uniqueLinks.slice(0, 8); // İlk 8 yazıyı kontrol et (çok fazla olmasın)
  });

  console.log(`${posts.length} yazı tespit edildi.`);

  const results = [];

  for (let i = 0; i < posts.length; i++) {
    const url = posts[i];
    console.log(`\n[${i+1}/${posts.length}] Kontrol ediliyor: ${url}`);

    const startTime = Date.now();
    await page.goto(url, { waitUntil: 'networkidle' });
    const loadTime = (Date.now() - startTime) / 1000;

    const title = await page.title();

    // Tam sayfa screenshot
    const fileName = `${timestamp}-post-${i+1}`;
    await page.screenshot({ 
      path: `${screenshotDir}/${fileName}.png`,
      fullPage: true 
    });

    // İçerik özeti
    const content = await page.innerText('body').then(text => text.slice(0, 500));

    results.push({
      title: title,
      url: url,
      loadTime: loadTime,
      status: loadTime < 8 ? '✅ İyi' : '⚠️ Yavaş'
    });

    console.log(`   Yüklenme: ${loadTime.toFixed(1)}s - ${results[i].status}`);
  }

  // Özet raporu kaydet
  fs.writeFileSync(`${screenshotDir}/${timestamp}-SUMMARY.txt`, 
    `Blog Monitoring Raporu - ${new Date().toLocaleString()}\n\n` +
    results.map(r => `${r.status} | ${r.loadTime}s | ${r.title}`).join('\n')
  );

  await browser.close();
  console.log('\nTüm işlemler tamamlandı!');
}

monitor().catch(console.error);
