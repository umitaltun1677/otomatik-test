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
      console.log(`[BİLGİ] Yerel proxies.txt dosyasından ${proxies.length} proxy yüklendi.`);
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

  // ÖNCE ANA SAYFADAKİ LİNKLERİ PROXY'SİZ VEYA TEK BİR PROXY İLE ALALIM
  let initialProxy = getRandomPlaywrightProxy();
  let baseBrowser;
  let postLinks = [];

  try {
    baseBrowser = await chromium.launch({ proxy: initialProxy ? initialProxy : undefined });
    const baseContext = await baseBrowser.newContext();
    const basePage = await baseContext.newPage();
    console.log(`[BİLGİ] Ana sayfadan linkler toplanıyor...`);
    await basePage.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    postLinks = await basePage.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="://blogspot.com"]'));
      return [...new Set(links.map(a => a.href))];
    });
    console.log(`[BAŞARILI] Toplam ${postLinks.length} adet yazı linki bulundu.`);
  } catch (err) {
    console.error(`❌ Ana sayfa linkleri alınırken hata oluştu:`, err.message);
  } finally {
    if (baseBrowser) await baseBrowser.close();
  }

  // Eğer link bulunamadıysa işlemi bitir
  if (postLinks.length === 0) {
    console.log("⚠️ Tarancak link bulunamadığı için işlem sonlandırıldı.");
    return;
  }

  // CİHAZ DÖNGÜSÜ
  for (const config of testConfigs) {
    console.log(`\n=== ${config.name.toUpperCase()} TESTİ BAŞLADI ===`);

    // YAZI LİNKLERİ DÖNGÜSÜ
    for (let i = 0; i < postLinks.length; i++) {
      const url = postLinks[i];
      
      // === DEĞİŞİKLİK BURADA: HER YAZI LİNKİ İÇİN YENİ BİR PROXY SEÇİLİR ===
      const selectedProxy = getRandomPlaywrightProxy();
      if (selectedProxy) {
        console.log(`[İSTEK #${i+1}] Yeni Proxy Talep Edildi -> Server: ${selectedProxy.server}`);
      }

      let browser;
      try {
        // Her istek için tarayıcıyı yeni proxy ile sıfırdan ayağa kaldırıyoruz
        browser = await chromium.launch({
          proxy: selectedProxy ? selectedProxy : undefined,
          args: ['--disable-blink-features=AutomationControlled']
        });

        const context = await browser.newContext({
          viewport: { width: config.width, height: config.height },
          isMobile: config.isMobile,
          userAgent: config.isMobile 
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });

        const page = await context.newPage();
        const start = Date.now();
        
        console.log(`[BAĞLANTI] ${config.name} cihazıyla sayfaya gidiliyor: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const loadTime = (Date.now() - start) / 1000;
        totalScans++;

        const filename = `${timestamp}-${config.name}-post-${i+1}.png`;
        await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: true });

        if (loadTime > LOAD_THRESHOLD) {
          hasIssue = true;
          issues.push({ device: config.name, loadTime: loadTime.toFixed(1), url });
          console.log(`⚠️ SORUN TESPİTİ [${config.name}] Yüklenme: ${loadTime.toFixed(1)}s`);
        } else {
          console.log(`✅ ONAYLANDI [${config.name}] Yüklenme: ${loadTime.toFixed(1)}s`);
        }

      } catch (err) {
        console.error(`❌ [BAĞLANTI HATASI] Link: ${url} | Hata:`, err.message);
      } finally {
        if (browser) await browser.close(); // Tarayıcıyı güvenli şekilde kapat ve proxy oturumunu sonlandır
      }
    }
  }

  console.log(`\n🏁 İşlem bitti. Toplam ${totalScans} tarama farklı proxylerle tamamlandı.`);

  if (hasIssue) {
    fs.writeFileSync(path.join(screenshotDir, `${timestamp}-ISSUES.txt`), 
      `🚨 SORUN TESPİT EDİLDİ - Toplam ${totalScans} tarama\n\n` +
      issues.map(i => `[${i.device}] ${i.loadTime}s → ${i.url}`).join('\n'));
    fs.writeFileSync('has_issue.txt', 'true');
  }
}

monitor().catch(console.error);
