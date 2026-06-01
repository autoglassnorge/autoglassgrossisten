#!/usr/bin/env node
/**
 * Sekurit Service API Explorer
 * ============================
 * Hjelper deg å kartlegge API-et til Sekurit Service
 * 
 * BRUK:
 *   node explore-sekurit-api.mjs
 * 
 * Du må logge inn manuelt i nettleseren først og kopiere:
 * 1. Session cookie
 * 2. Auth token (fra DevTools Network tab)
 */

import https from 'https';

const BASE_URL = 'www.sekurit-service.com';

// Vanlige API-endepunkter å teste
const ENDPOINTS_TO_TEST = [
  '/api/products',
  '/api/products/search',
  '/api/catalog',
  '/api/glasses',
  '/api/vehicles',
  '/api/vin',
  '/api/customer/products',
  '/rest/v2/products',
  '/rest/products',
  '/services/rest/products',
];

// Hjelpefunksjon for HTTPS requests
function makeRequest(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'nb-NO,nb;q=0.9,no;q=0.8,nn;q=0.7,en-US;q=0.6,en;q=0.5',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `https://${BASE_URL}/`,
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data.substring(0, 500) // Limit output
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Sjekk om endepunkt eksisterer
async function probeEndpoint(path, authHeaders) {
  try {
    const result = await makeRequest(path, authHeaders);
    return {
      path,
      status: result.status,
      found: result.status === 200,
      contentType: result.headers['content-type'],
      preview: result.body
    };
  } catch (e) {
    return { path, status: 'ERROR', found: false, error: e.message };
  }
}

console.log(`
╔══════════════════════════════════════════════════════════╗
║      Sekurit Service API Explorer                        ║
╚══════════════════════════════════════════════════════════╝

Dette verktøyet hjelper deg å finne API-endepunkter.

STEG 1: Logg inn på https://www.sekurit-service.com/nb-no
        med din Alfa Glass-konto

STEG 2: Åpne DevTools (F12) → Network tab

STEG 3: Gjør et søk etter bilglass på nettsiden

STEG 4: Se etter API-kall i Network-taben. Se etter:
        - Request URL (f.eks. /api/...)
        - Request Headers (Authorization, Cookie)
        - Response JSON-struktur

STEG 5: Kopier session-cookie eller auth-token

STEG 6: Lim inn her og kjør scriptet på nytt
`);

// Hvis brukeren har satt AUTH_TOKEN miljøvariabel
const AUTH_TOKEN = process.env.SEKURIT_AUTH_TOKEN;
const SESSION_COOKIE = process.env.SEKURIT_COOKIE;

if (!AUTH_TOKEN && !SESSION_COOKIE) {
  console.log(`
❌ Ingen autentisering funnet.

For å fortsette, sett en av disse miljøvariablene:

  export SEKURIT_COOKIE="JSESSIONID=abc123; ..."
  
Eller:

  export SEKURIT_AUTH_TOKEN="Bearer eyJhbG..."

Deretter kjør scriptet på nytt.
`);
  process.exit(0);
}

const authHeaders = {};
if (SESSION_COOKIE) {
  authHeaders['Cookie'] = SESSION_COOKIE;
}
if (AUTH_TOKEN) {
  authHeaders['Authorization'] = AUTH_TOKEN;
}

console.log('\n🔍 Prober API-endepunkter...\n');

// Test alle endepunkter
for (const endpoint of ENDPOINTS_TO_TEST) {
  const result = await probeEndpoint(endpoint, authHeaders);
  const icon = result.found ? '✅' : result.status === 404 ? '❌' : '⚠️';
  console.log(`${icon} ${result.path}`);
  if (result.found) {
    console.log(`   Status: ${result.status}`);
    console.log(`   Content-Type: ${result.contentType}`);
    console.log(`   Preview: ${result.preview.substring(0, 100)}...`);
  }
}

console.log(`
\n📋 Neste steg:
1. Noter hvilke endepunkter som returnerte 200
2. Kopier JSON-responsen fra DevTools
3. Del med meg så jeg kan bygge integrasjonen
`);
