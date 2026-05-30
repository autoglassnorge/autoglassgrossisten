import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Prøv WordPress admin login med riktig brukernavn
  await page.goto('https://auto-glass.no/wp-login.php');
  await page.waitForSelector('#user_login', { timeout: 10000 });
  
  await page.type('#user_login', 'post@alfa-glass.no', { delay: 50 });
  await page.type('#user_pass', 'Surpomp24', { delay: 50 });
  
  await page.click('#wp-submit');
  await page.waitForTimeout(5000);
  
  await page.screenshot({ path: '/tmp/wp-login-alfa.png' });
  
  console.log('URL:', page.url());
  console.log('Tittel:', await page.title());
  
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Inneholder "Dashboard":', bodyText.includes('Dashboard'));
  console.log('Inneholder "FEIL":', bodyText.includes('FEIL'));
  console.log('Inneholder "Logg ut":', bodyText.includes('Logg ut'));
  
  // Hvis innlogget, gå til produktsiden
  if (bodyText.includes('Dashboard') || bodyText.includes('Velkommen') || bodyText.includes('Logg ut')) {
    console.log('INNLOGGET!');
    await page.goto('https://auto-glass.no/produkt/bmw-8-series-2d-cpe-g15-18-fr-aku-sensor-hud-ldw-coated/');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/product-alfa.png', fullPage: true });
    
    const productText = await page.evaluate(() => document.body.innerText);
    const lines = productText.split('\n').filter(l => 
      l.includes('Eurokode') || l.includes('Varenummer') || l.includes('Pris') || l.includes('Typekode')
    );
    console.log('\nProduktdata:');
    lines.forEach(l => console.log(l.trim()));
    
    // Hent også alle eurokode-mønstre fra HTML
    const html = await page.content();
    const eurocodes = html.match(/\b[0-9]{4}[A-Z]{4,}[A-Z0-9]*\b/g);
    if (eurocodes) {
      console.log('\nAlle koder funnet:', [...new Set(eurocodes)].slice(0, 20));
    }
  }
  
  await browser.close();
})();
