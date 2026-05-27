#!/usr/bin/env node
/**
 * ebay-ktype-scraper.mjs
 * ==========================================
 * "Hacker Mode": Scrape K-type fra eBay listings (GRATIS!)
 *
 * eBay bruker TecDoc K-type i vehicle compatibility på:
 *   eBay.de (77), eBay.co.uk (3), eBay.fr (71), eBay.it (101), eBay.es (186)
 *
 * Strategi:
 *   1. Bruk eBay Finding API til å søke etter deler
 *   2. Hent item details (Shopping API / Trading API)
 *   3. Parse ItemCompatibilityList etter NameValueList med Name="KType"
 *   4. Bygg mapping: KType → {brand, model, year, engine}
 *
 * eBay Developer Program (GRATIS):
 *   - https://developer.ebay.com/join/
 *   - App ID: 5,000 calls/day (Finding + Shopping)
 *   - Trading API: 1,500 calls/day (krever auth token)
 *
 * Viktig: Trading API GetItem er den eneste som returnerer
 *   ItemCompatibilityList med KType. Den krever:
 *   - AppID, CertID, DevID
 *   - OAuth auth token (eller legacy auth token)
 *
 * Alternativ (lettere): RapidAPI K-Type Finder
 *   https://rapidapi.com/autowaysnet/api/ktype-finder-tecdoc
 *   (allerede integrert i Worker)
 *
 * Bruk:
 *   EBAY_APP_ID=xxx EBAY_AUTH_TOKEN=yyy node scripts/ebay-ktype-scraper.mjs
 */

// ---------------------------------------------------------------------------
// Konfigurasjon
// ---------------------------------------------------------------------------
const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_AUTH_TOKEN = process.env.EBAY_AUTH_TOKEN;

// eBay markedsplasser med K-type støtte
const MARKETPLACES = [
  { id: 'EBAY_DE', name: 'Germany', siteId: 77, domain: 'de' },
  { id: 'EBAY_GB', name: 'UK', siteId: 3, domain: 'co.uk' },
];

const SEARCH_QUERIES = [
  { brand: 'Volkswagen', model: 'Golf', keyword: 'windshield' },
  { brand: 'Volvo', model: 'V70', keyword: 'windscreen' },
  { brand: 'BMW', model: '3 Series', keyword: 'windshield' },
  { brand: 'Audi', model: 'A4', keyword: 'windshield' },
  { brand: 'Ford', model: 'Focus', keyword: 'windscreen' },
];

// ---------------------------------------------------------------------------
// Hoved-funksjon
// ---------------------------------------------------------------------------
async function main() {
  if (!EBAY_APP_ID) {
    console.error('❌ EBAY_APP_ID mangler.');
    console.error('   Skaff gratis på: https://developer.ebay.com/join/');
    console.error('   Sett: export EBAY_APP_ID=din_app_id');
    process.exit(1);
  }

  if (!EBAY_AUTH_TOKEN) {
    console.warn('⚠️  EBAY_AUTH_TOKEN mangler.');
    console.warn('   Trading API krever auth token for ItemCompatibilityList.');
    console.warn('   Alternativ: Bruk RapidAPI (allerede integrert i Worker).');
    console.warn('');
    console.warn('   For å skaffe eBay auth token:');
    console.warn('   1. Gå til https://developer.ebay.com/my/keys');
    console.warn('   2. Generer User Token (OAuth)');
    console.warn('   3. Sett: export EBAY_AUTH_TOKEN=token');
    process.exit(1);
  }

  console.log('🚀 eBay K-type Scraper');
  console.log(`   App ID: ${EBAY_APP_ID.slice(0, 8)}...`);

  let totalKtypes = 0;
  const ktypeMap = new Map();

  for (const mp of MARKETPLACES) {
    console.log(`\n🇪🇺 ${mp.name} (ebay.${mp.domain})`);

    for (const query of SEARCH_QUERIES) {
      process.stdout.write(`   🔍 ${query.brand} ${query.model} ... `);

      try {
        // 1. Søk etter deler med Finding API
        const items = await findItems(mp, query);
        if (items.length === 0) {
          console.log('ingen treff');
          continue;
        }
        console.log(`${items.length} listings`);

        // 2. Hent ItemCompatibilityList med Trading API
        for (const item of items.slice(0, 3)) {
          try {
            const compat = await getItemCompatibilityTradingApi(mp, item.itemId);
            if (compat && compat.ktypes.length > 0) {
              for (const kt of compat.ktypes) {
                totalKtypes++;
                const key = `${kt.ktype}`;
                if (!ktypeMap.has(key)) {
                  ktypeMap.set(key, {
                    ktype: kt.ktype,
                    brand: kt.brand || query.brand,
                    model: kt.model || query.model,
                    years: kt.years || [],
                    engines: kt.engines || [],
                    source: mp.domain,
                  });
                }
              }
            }
          } catch (e) {
            // Skip
          }
          await sleep(1200);
        }
      } catch (e) {
        console.log(`feil: ${e.message}`);
      }

      await sleep(1200);
    }
  }

  // Resultater
  console.log(`\n📊 RESULTATER:`);
  console.log(`   Unike K-types funnet: ${ktypeMap.size}`);
  console.log(`   Totale entries: ${totalKtypes}`);

  if (ktypeMap.size > 0) {
    console.log(`\n   Eksempler:`);
    let i = 0;
    for (const [_, data] of ktypeMap) {
      console.log(`   - K${data.ktype}: ${data.brand} ${data.model} [${data.years.join('-')}]`);
      if (++i >= 10) break;
    }

    const fs = await import('fs/promises');
    const output = {
      scraped_at: new Date().toISOString(),
      source: 'ebay',
      total_unique: ktypeMap.size,
      ktypes: Array.from(ktypeMap.values()),
    };
    await fs.mkdir('scripts/data', { recursive: true });
    await fs.writeFile('scripts/data/ebay-ktypes.json', JSON.stringify(output, null, 2));
    console.log(`\n💾 Lagret til scripts/data/ebay-ktypes.json`);
  }
}

// ---------------------------------------------------------------------------
// eBay Finding API (SOAP/REST hybrid)
// ---------------------------------------------------------------------------
async function findItems(marketplace, query) {
  const endpoint = 'https://svcs.ebay.com/services/search/FindingService/v1';
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findItemsByKeywords',
    'SERVICE-VERSION': '1.13.0',
    'SECURITY-APPNAME': EBAY_APP_ID,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': 'true',
    'GLOBAL-ID': marketplace.id,
    'keywords': `${query.brand} ${query.model} ${query.keyword}`,
    'paginationInput.entriesPerPage': '10',
  });

  const res = await fetch(`${endpoint}?${params}`);
  if (!res.ok) throw new Error(`Finding API: ${res.status}`);

  const data = await res.json();
  const items = data.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];

  return items.map(item => ({
    itemId: item.itemId?.[0],
    title: item.title?.[0],
  })).filter(i => i.itemId);
}

// ---------------------------------------------------------------------------
// eBay Trading API: GetItem med ItemCompatibilityList
// ---------------------------------------------------------------------------
async function getItemCompatibilityTradingApi(marketplace, itemId) {
  const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${EBAY_AUTH_TOKEN}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Version>1155</Version>
  <ItemID>${itemId}</ItemID>
  <IncludeItemCompatibilityList>true</IncludeItemCompatibilityList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`;

  const res = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'GetItem',
      'X-EBAY-API-SITEID': marketplace.siteId.toString(),
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1155',
      'X-EBAY-API-APP-NAME': EBAY_APP_ID,
      'Content-Type': 'text/xml',
    },
    body: xmlPayload,
  });

  if (!res.ok) throw new Error(`Trading API: ${res.status}`);

  const xml = await res.text();

  // Enkel XML-parsing for KType
  const ktypes = [];
  const ktypeMatches = xml.match(/<NameValueList>\s*<Name>KType<\/Name>\s*<Value>(\d+)<\/Value>/gi);

  if (ktypeMatches) {
    for (const match of ktypeMatches) {
      const ktype = match.match(/<Value>(\d+)<\/Value>/)?.[1];
      if (ktype) {
        ktypes.push({ ktype: parseInt(ktype) });
      }
    }
  }

  return { ktypes };
}

// ---------------------------------------------------------------------------
// Hjelpefunksjoner
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Kjør
main().catch(e => {
  console.error('💥 Fatal feil:', e);
  process.exit(1);
});
