/* ========================================================================
   Bilglassguide Content Config
   Sentral datakilde for landing page, undersider og SEO.
   Skalerbar til 50+ artikler uten å endre komponenter.
   ======================================================================== */

export interface CategoryCard {
  slug: string;
  title: string;
  desc: string;
  iconKey: string;
}

export interface PopularTopic {
  slug: string;
  title: string;
}

export interface Manufacturer {
  name: string;
  desc: string;
  origin: string;
  badge: 'OEM' | 'OEE' | 'PUR';
  initials: string;
  color: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export const CATEGORY_CARDS: CategoryCard[] = [
  { slug: 'frontrute', title: 'Frontrute', desc: 'Konstruksjon, laminering, smartglass og kompatibilitet.', iconKey: 'CarFront' },
  { slug: 'adas-sensorer', title: 'ADAS og sensorer', desc: 'Kamera, radar, filskifteassistent og regnsensorer.', iconKey: 'Shield' },
  { slug: 'hud-oppvarming', title: 'HUD og oppvarming', desc: 'Head-up display, varmekabler og akustiske ruter.', iconKey: 'Eye' },
  { slug: 'kalibrering', title: 'Kalibrering', desc: 'Hvorfor og hvordan ADAS kalibreres etter ruteskift.', iconKey: 'Wrench' },
  { slug: 'oem-vs-aftermarket', title: 'OEM vs aftermarket', desc: 'Forskjellen på original, OEM og kvalitetsaftermarket.', iconKey: 'Layers' },
  { slug: 'produsenter', title: 'Bilglassprodusenter', desc: 'AGC, Pilkington, Saint-Gobain, Fuyao og andre.', iconKey: 'Factory' },
  { slug: 'variantmatching', title: 'Variantmatching', desc: 'Hvorfor samme modell kan ha flere frontruter.', iconKey: 'Search' },
];

export const POPULAR_TOPICS: PopularTopic[] = [
  { slug: 'frontrute-adas-kamera', title: 'Frontrute med ADAS-kamera' },
  { slug: 'frontrute-hud', title: 'Frontrute med HUD' },
  { slug: 'oppvarmet-frontrute', title: 'Oppvarmet frontrute' },
  { slug: 'kalibrering-etter-ruteskift', title: 'Kalibrering etter ruteskift' },
  { slug: 'oem-vs-aftermarket', title: 'OEM vs aftermarket bilglass' },
  { slug: 'identifisere-riktig-bilglass', title: 'Hvordan identifisere riktig bilglass' },
  { slug: 'flere-frontruter-samme-modell', title: 'Hvorfor samme modell kan ha flere frontruter' },
  { slug: 'akustisk-bilglass', title: 'Akustisk bilglass' },
];

export const MANUFACTURERS: Manufacturer[] = [
  { name: 'Pilkington', desc: 'Britisk pioner innen laminert bilglass. Leverer OEM til premium-europeiske merker.', origin: 'Storbritannia', badge: 'OEM', initials: 'PI', color: '#1e3a5f' },
  { name: 'Saint-Gobain Sekurit', desc: 'Verdens største OEM-leverandør i Europa. Sekurit-brandet er standard på de fleste europeiske biler.', origin: 'Frankrike', badge: 'OEM', initials: 'SG', color: '#c41e3a' },
  { name: 'AGC', desc: 'Verdens største bilglassprodusent. Japansk teknologileder med fabrikker over hele Europa.', origin: 'Japan / Europa', badge: 'OEM', initials: 'AG', color: '#0066b3' },
  { name: 'Guardian', desc: 'Amerikansk produsent med sterk posisjon i Nord-Amerika og voksende europeisk tilstedeværelse.', origin: 'USA', badge: 'OEM', initials: 'GU', color: '#004d40' },
  { name: 'Fuyao', desc: 'Kinesisk produsent som vokser raskt i Europa med konkurransedyktig OEM-kvalitet og pris.', origin: 'Kina / Europa', badge: 'OEM', initials: 'FU', color: '#b71c1c' },
  { name: 'Xinyi', desc: 'Kinesisk produsent og raskt voksende aktør i global bilglass med fokus på OEM-kontrakter.', origin: 'Kina', badge: 'OEM', initials: 'XY', color: '#1565c0' },
  { name: 'NordGlass', desc: 'Nordisk produsent med solid posisjon i Skandinavia. OEE-kvalitet til konkurransedyktig pris.', origin: 'Norden', badge: 'OEE', initials: 'NG', color: '#2e7d32' },
  { name: 'Sika', desc: 'Ledende leverandør av strukturelle lim og klebere til bilglassmontering (PUR-basert).', origin: 'Sveits', badge: 'PUR', initials: 'SK', color: '#f9a825' },
  { name: 'Precision', desc: 'Spesialist på høypresisjonsbilglass og avanserte lamineringsteknologier for premium-segmentet.', origin: 'Europa', badge: 'OEM', initials: 'PR', color: '#6a1b9a' },
];

export const FAQS: FaqItem[] = [
  {
    q: 'Hvorfor er ikke alle frontruter like?',
    a: 'Samme bilmodell kan ha flere frontruter med ulikt utstyr — ADAS-kamera, HUD-projektor, regnsensor, oppvarming eller akustisk laminering. Feil rute gir feil kalibrering og svekket sikkerhet.',
  },
  {
    q: 'Må ADAS kalibreres etter ruteskift?',
    a: 'Ja. Kamera og radar som sitter i frontruten må kalibreres på nytt for å sikre at filskiftevarsel, nødbrems og adaptiv cruisekontroll fungerer korrekt.',
  },
  {
    q: 'Hva er forskjellen på OEM og aftermarket?',
    a: 'OEM er identisk med originalen — samme produsent, samme kvalitet, samme sertifisering. Aftermarket kan variere i optisk kvalitet, lamineringstykkelse og sensor-kompatibilitet.',
  },
];

/* --- Article registry (foundation for 50+ pages) --- */
export interface ArticleMeta {
  slug: string;
  title: string;
  description: string;
  category: string;
  publishedAt: string;
  modifiedAt: string;
}

export const ARTICLES: ArticleMeta[] = [
  {
    slug: 'frontrute',
    title: 'Frontrute — konstruksjon, laminering og smartglass',
    description: 'Alt du trenger å vite om frontruter: laminering, PVB, smartglass, akustikk, oppvarming og kompatibilitet med ADAS og HUD.',
    category: 'frontrute',
    publishedAt: '2025-05-28',
    modifiedAt: '2025-05-28',
  },
  {
    slug: 'frontrute-adas-kamera',
    title: 'Frontrute med ADAS-kamera — optisk sone og kalibrering',
    description: 'Alt du trenger å vite om frontruter med ADAS-kamera: optisk sone, monteringsvinkel, ECE R43, kalibrering og konsekvensen av feil glassvalg.',
    category: 'frontrute',
    publishedAt: '2025-05-28',
    modifiedAt: '2025-05-28',
  },
  {
    slug: 'kalibrering-etter-ruteskift',
    title: 'Kalibrering etter ruteskift — hvorfor og hvordan',
    description: 'Alt du trenger å vite om ADAS-kalibrering etter ruteskift: statisk vs dynamisk, CSC-verktøy, target-plate og konsekvenser av å utelate kalibrering.',
    category: 'adas',
    publishedAt: '2025-05-28',
    modifiedAt: '2025-05-28',
  },
  {
    slug: 'oem-vs-aftermarket',
    title: 'OEM vs aftermarket bilglass — hva er forskjellen?',
    description: 'Faktisk sammenligning av OEM, OEE og aftermarket bilglass: produsenter, sertifisering, kvalitetsforskjeller og når OEM er obligatorisk.',
    category: 'produsenter',
    publishedAt: '2025-05-28',
    modifiedAt: '2025-05-28',
  },
  {
    slug: 'frontrute-hud',
    title: 'Frontrute med HUD — Head-Up Display og spesiallaminering',
    description: 'Teknisk innhold om frontruter med HUD: refleksjonsgrad, PVB-spesifikasjon, wedge-laminering og kompatibilitet med projeksjonssystemer.',
    category: 'frontrute',
    publishedAt: '2025-05-28',
    modifiedAt: '2025-05-28',
  },
  {
    slug: 'oppvarmet-frontrute',
    title: 'Oppvarmet frontrute — varmekabler og effekt',
    description: 'Teknisk innhold om oppvarmede frontruter: varmekabler, effekt, tetthet, koblingsskjema og forskjeller mellom soner og soneløse systemer.',
    category: 'frontrute',
    publishedAt: '2025-05-28',
    modifiedAt: '2025-05-28',
  },
  {
    slug: 'identifisere-riktig-bilglass',
    title: 'Hvordan identifisere riktig bilglass — eurokode, VIN og typeCode',
    description: 'Lær hvordan du identifiserer riktig bilglass med eurokode, NAGS-kode, VIN-dekoding, typeCode og regnr-oppslag. Faktisk metode brukt av bransjen.',
    category: 'variantmatching',
    publishedAt: '2025-05-28',
    modifiedAt: '2025-05-28',
  },
  {
    slug: 'flere-frontruter-samme-modell',
    title: 'Hvorfor samme modell kan ha flere frontruter — variantlogikk',
    description: 'Forstå hvorfor samme bilmodell kan ha opptil 15 ulike frontruter. Utstyrsnivåer, produksjonsår, markedsregion og fabrikkvariasjoner forklart med data.',
    category: 'variantmatching',
    publishedAt: '2025-05-28',
    modifiedAt: '2025-05-28',
  },
  {
    slug: 'akustisk-bilglass',
    title: 'Akustisk bilglass — dB-dempering og frekvensrespons',
    description: 'Teknisk innhold om akustisk bilglass: PVB-tykkelse, dB-dempering, frekvensrespons og forskjellene mellom standard og premium laminering.',
    category: 'frontrute',
    publishedAt: '2025-05-28',
    modifiedAt: '2025-05-28',
  },
];
