const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://blogspot.com';
const LOAD_THRESHOLD = 8;

function loadProxies() {
  try {
    if (process.env.PROXY_LIST_SECRET) {
      const proxies = process.env.PROXY_LIST_SECRET
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      console.log(`[BİLGİ] GitHub Secrets üzerinden ${proxies.length} proxy algılandı.`);
      return proxies;
    }
    const filePath = path.join(process.cwd(), 'proxies.txt');
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const proxies = fileContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      return proxies;
    }
    return [];
  } catch (error) {
    return [];
  }
}

const ALL_PROXIES = loadProxies();

function getRandomPlaywrightProxy() {
  if (ALL_PROXIES.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * ALL_PROXIES.length);
  const rawProxy = ALL_PROXIES[randomIndex];
  const parts = rawProxy.split(':');
  
  if (parts.length === 4) {
    const [host, port, username, password] = parts;
    return { server: `http://${host}:${port}`, username, password };
  } else if (parts.length === 2) {
    const [host, port] = parts;
    return { server: `http://${host}:${port}` };
  } else {
    ALL_PROXIES.splice(randomIndex, 1);
    return getRandomPlaywrightProxy();
  }
}

async function monitor() {
  console.log(`🚀 Bot başlatıldı. Hedef: ${BASE_URL}`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotDir = path.join(process.cwd(), 'screenshots');
  
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const testConfigs = [
    { name: 'desktop-us', width: 1920, height: 1080, isMobile: false },
    { name: 'mobile-android', width: 390, height: 844, isMobile: true },
    { name: 'mobile-ios', width: 414, height: 896, isMobile: true }
  ];

  let hasIssue = false;
  const issues = [];
  let totalScans = 0;
  let postLinks = [];

  // ANA SAYFADAN LİNKLERİ ÇEKME (GARANTİLİ YÖNTEM)
  const initialProxy = getRandomPlaywrightProxy();
  let baseBrowser;
  try {
    baseBrowser = await chromium.launch({ proxy: initialProxy ? initialProxy : undefined });
    const baseContext = await baseBrowser.newContext();
    const basePage = await baseContext.newPage();
    console.log(`[BİLGİ] Ana sayfa yükleniyor (Proxy: ${initialProxy?.server})...`);
    
    // Ağ trafiğinin tamamen durmasını bekliyoruz ki linkler yüklensin
    await basePage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 45000 });
    
    postLinks = await basePage.evaluate(() => {
      // Sitedeki tüm linkleri tarayalım ve Blogger formatına uyanları ayıklayalım
      const allLinks = Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
      const filtered = allLinks.filter(href => href.includes('://blogspot.com') || href.includes('globalmarketsbrief.://blogspot.com'));
      return [...new Set(filtered)];
    });
    
    console.log(`[BAŞARILI] Ana sayfada toplam ${postLinks.length} adet geçerli yazı linki bulundu.`);
  } catch (err) {
    console.error(`❌ Ana sayfa taranırken hata:`, err.message);
  } finally {
    if (baseBrowser) await baseBrowser.close();
  }

  // Eğer link bulunamadıysa test amaçlı sabit birkaç link ekleyelim ki döngü çalışsın ve proxy tüketsin
  if (postLinks.length === 0) {
    console.log("⚠️ Siteden otomatik link toplanamadı. Manuel koruma linkleri devreye alınıyor...");
    postLinks = [
      `${BASE_URL}/`, // Ana sayfa
      `${BASE_URL}/search` // Arama sayfası
    ];
  }

  // HER BİR CİHAZ VE LİNK İÇİN KESİN PROXY DEĞİŞİMİ
  for (const config of testConfigs) {
    console.log(`\n=== ${config.name.toUpperCase()} CİHAZ TESTİ BAŞLADI ===`);

    for (let i = 0; i < postLinks.length; i++) {
      const url = postLinks[i];
      
      // Her bir iç döngü adımında KESİN olarak yeni proxy seçilir
      const currentProxy = getRandomPlaywrightProxy();
      console.log(`🚨 [YENİ PROXY TALEBİ] URL: ${url} | Seçilen Sunucu: ${currentProxy?.server}`);

      let loopBrowser;
      try {
        loopBrowser = await chromium.launch({
          proxy: currentProxy ? currentProxy : undefined,
          args: ['--disable-blink-features=AutomationControlled']
        });

        const context = await loopBrowser.newContext({
          viewport: { width: config.width, height: config.height },
          isMobile: config.isMobile,
          userAgent: config.isMobile 
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });

        const page = await context.newPage();
        const start = Date.now();
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
        const loadTime = (Date.now() - start) / 1000;
        totalScans++;

        const filename = `${timestamp}-${config.name}-item-${i+1}.png`;
        await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: true });

        if (loadTime > LOAD_THRESHOLD) {
          hasIssue = true;
          issues.push({ device: config.name, loadTime: loadTime.toFixed(1), url });
          console.log(`⚠️ SORUN [${config.name}] ${loadTime.toFixed(1)}s`);
        } else {
          console.log(`✅ ONAY [${config.name}] ${loadTime.toFixed(1)}s`);
        }

      } catch (loopError) {
        console.error(`❌ [BAĞLANTI BAŞARISIZ] Proxy veya Sayfa Hatası:`, loopError.message);
      } finally {
        // Tarayıcıyı tamamen yok ederek sonraki adımdaki proxy'nin önbelleğe (cache) takılmasını engelliyoruz
        if (loopBrowser) {
          await loopBrowser.close();
        }
      }
    }
  }

  console.log(`\n🏁 Tüm süreç bitti. Toplam ${totalScans} farklı sayfa/cihaz kombinasyonu tarandı.`);

  if (hasIssue) {
    fs.writeFileSync(path.join(screenshotDir, `${timestamp}-ISSUES.txt`), 
      `🚨 SORUN TESPİT EDİLDİ - Toplam ${totalScans} tarama\n\n` +
      issues.map(i => `[${i.device}] ${i.loadTime}s → ${i.url}`).join('\n'));
    fs.writeFileSync('has_issue.txt', 'true');
  }
}

monitor().catch(console.error);
