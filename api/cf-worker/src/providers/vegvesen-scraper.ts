/**
 * Vegvesen.no Scraper
 * ===================
 * Backup-løsning når SVV API er nede.
 * Scraper https://www.vegvesen.no/kjoretoy/kjop-og-salg/kjoretoyopplysninger/sjekk-kjoretoyopplysninger/
 * 
 * ADVARSEL: Dette er en midlertidig nødløsning. Avhengig av vegvesen.no sin HTML-struktur.
 */

import type { TecdocVehicle } from "./svv";

export interface VegvesenScrapeResult {
  status: "ok" | "not_found" | "error";
  vehicle?: TecdocVehicle;
  error?: string;
}

/**
 * Scraper kjøretøydata fra vegvesen.no
 * @param regnr - Registreringsnummer
 * @returns ScrapeResult med kjøretøydata eller feil
 */
export async function scrapeVegvesen(regnr: string): Promise<VegvesenScrapeResult> {
  const cleanRegnr = regnr.toUpperCase().replace(/[^A-Z0-9]/g, "");
  
  try {
    // Steg 1: Hent initial side for å få cookies/token
    const initRes = await fetch(
      "https://www.vegvesen.no/kjoretoy/kjop-og-salg/kjoretoyopplysninger/sjekk-kjoretoyopplysninger/",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,en-US;q=0.7,en;q=0.6",
        },
      }
    );

    if (!initRes.ok) {
      return { status: "error", error: `Init failed: ${initRes.status}` };
    }

    // Steg 2: POST søk med regnr
    // NB: Dette er en forenklet implementasjon. Vegvesen kan ha CSRF-token, reCAPTCHA, etc.
    const searchUrl = `https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/kjop-og-salg/kjoretoyopplysninger/sjekk-kjoretoyopplysninger/_/attachment/download/46ee4d02-5d75-3199-b25e-9f7acd06a387:3f5e1c56e5a1f7a6411f25b8042e9608c38308e1/app.js`;
    
    // Alternative: Bruk deres API-endepunkt hvis tilgjengelig
    const apiRes = await fetch(
      `https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke=${encodeURIComponent(cleanRegnr)}`,
      {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    if (apiRes.status === 404) {
      return { status: "not_found" };
    }

    if (!apiRes.ok) {
      return { status: "error", error: `API error: ${apiRes.status}` };
    }

    const data = await apiRes.json();
    
    // Parse SVV-format (samme som før)
    const vehicle = parseVegvesenData(data, cleanRegnr);
    
    if (!vehicle) {
      return { status: "not_found" };
    }

    return { status: "ok", vehicle };

  } catch (e) {
    return { 
      status: "error", 
      error: e instanceof Error ? e.message : "Unknown error" 
    };
  }
}

/**
 * Parser vegvesen JSON til TecdocVehicle format
 */
function parseVegvesenData(data: any, regnr: string): TecdocVehicle | null {
  try {
    const k = data.kjoretoydataListe?.[0];
    if (!k) return null;

    const td = k.godkjenning?.tekniskGodkjenning?.tekniskeData;
    if (!td) return null;

    const merkeRaw = td.generelt?.merke?.[0]?.merke || "";
    const merke = merkeRaw.toUpperCase();
    const model = (td.generelt?.handelsbetegnelse?.[0] || "").toUpperCase();
    
    const regDate = k.forstegangsregistrering?.registrertForstegangNorgeDato || "";
    const year = regDate ? parseInt(regDate.split("-")[0], 10) : 0;
    
    const vin = k.kjoretoyId?.understellsnummer || "";
    const typeCode = td.generelt?.typebetegnelse || "";

    return {
      regno: regnr,
      vin,
      make: merke,
      model,
      year,
      k_type: 0,
      typeCode,
    };
  } catch {
    return null;
  }
}
