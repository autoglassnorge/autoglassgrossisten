/**
 * Autodoc Probe Config
 * Manuelt definerte test-URL-er for lavvolum-analyse.
 * Ingen crawler-logikk — kun enkeltstående produktsider.
 */

export const CONFIG = {
  // Playwright-innstillinger
  headless: false,          // headed mode først for visuell inspeksjon
  slowMo: 200,              // brems ned for menneskelig hastighet
  timeout: 30000,

  // Output
  outDir: "data/autodoc-probe",

  // Test-URL-er — representative produktkategorier
  urls: [
    // Frontrute — VW Golf VII (vanlig europeisk bil)
    "https://www.autodoc.eu/no/pilkington/6689658",

    // Dørglass — BMW 3-serie (E90)
    "https://www.autodoc.eu/no/borsehung/10636349",

    // Bakrute — Ford Focus
    "https://www.autodoc.eu/no/pilkington/7676695",

    // Sideglass — Mercedes C-Class (W204)
    "https://www.autodoc.eu/no/pilkington/6686074",

    // En til — Audi A4 (B8) frontrute med regnsensor/ADAS
    "https://www.autodoc.eu/no/pilkington/6690686",
  ],

  // Interessante URL-mønstre å fange (case-insensitive substring-match)
  interestPatterns: [
    "api", "graphql", "compatibility", "vehicle", "product",
    "related", "criteria", "oem", "spec", "fitment", "linkage",
    "article", " TecDoc", "ktype", "euro", "cross", "detail",
  ],

  // Interessante content-types
  interestContentTypes: [
    "application/json",
    "application/graphql",
    "text/plain",
    "text/json",
  ],
};
