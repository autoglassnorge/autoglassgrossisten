/**
 * FAQ Knowledge Base for Professor Autoglass
 * B2B grossist-kontekst: Autoglass AS selger glass til verksteder,
 * vi bytter IKKE glass selv.
 *
 * Phase 1: Simple keyword-based search over 92 embedded articles.
 * Phase 2 (future): Vector embeddings + RAG.
 */

export interface FaqArticle {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
}

const STOP_WORDS = new Set([
  "hva", "er", "den", "det", "jeg", "du", "en", "et", "og", "eller",
  "som", "til", "fra", "med", "på", "i", "å", "for", "om", "av",
  "ikke", "har", "kan", "skal", "vil", "hvordan", "når", "hvor",
  "hvilken", "hvem", "hvorfor", "hva", "the", "is", "a", "an",
  "and", "or", "to", "of", "in", "for", "with", "at", "by", "from"
]);

const FAQ_ARTICLES: FaqArticle[] = [
  {
    id: "hva-kan-du-gjore",
    category: "generelt",
    question: "Hva kan du hjelpe meg med?",
    answer: "Hei! Jeg er din AI-ordremottaker hos Autoglass AS. Jeg kan hjelpe deg med to ting: (1) Finne riktig glass til din kunde — oppgi regnr, så finner jeg eksakt glass med utstyr og eurocode. Alternativt merke, modell, år og posisjon. (2) Svare på spørsmål om produkter, garanti, levering, OEM vs aftermarket, ADAS-kalibrering, priser, lagerstatus, og mer. Hva trenger du hjelp med?",
    keywords: ["hjelpe", "hva kan du", "hva gjør du", "funksjon", "muligheter", "capabilit", "hva er du", "hvem er du", "professor", "autoglass", "ekspert"]
  },
  {
    id: "oem-vs-aftermarket",
    category: "produkter",
    question: "Hva er forskjellen på OEM og aftermarket glass?",
    answer: "OEM (Original Equipment Manufacturer) er glass produsert av samme fabrikk som originalen på bilen — ofte med bilprodusentens logo. Aftermarket er glass fra samme eller annen produsent, men uten bilmerkets logo. Kvalitetsmessig er de ofte identiske. OEM koster typisk 30-50% mer. Som verksted velger du aftermarket for kostnadseffektivitet og konkurransekraft, mens leasing-biler og premium-kunder ofte foretrekker OEM. Autoglass AS fører begge deler og kan rådgi deg basert på kundesegment.",
    keywords: ["oem", "aftermarket", "original", "logo", "kvalitet", "pris", "forskjell", "verksted", "kostnad", "konkurranse", "leasing"]
  },
  {
    id: "laminert-vs-herdet",
    category: "teknisk",
    question: "Hva er forskjellen på laminert og herdet glass?",
    answer: "Laminert glass brukes på frontruter. Det består av to glasslag med en plastfilm (PVB) mellom. Ved knusing sitter fragmentene fast i filmen — dette beskytter passasjerene. Herdet glass brukes på sideruter og bakrute. Det er varmebehandlet for å bli 4-5 ganger sterkere enn vanlig glass, men knuser i små, relativt harmløse biter. Som leverandør må du sikre at verkstedet ditt alltid velger riktig type — frontruter kan aldri byttes med herdet glass, det er ulovlig og livsfarlig.",
    keywords: ["laminert", "herdet", "frontrute", "siderute", "bakrute", "pvb", "film", "sikkerhet", "styrke", "ulykke", "lov"]
  },
  {
    id: "pris-forskjell",
    category: "produkter",
    question: "Hvorfor varierer prisen så mye på frontruter?",
    answer: "Prisen på en frontrute avhenger av flere faktorer: (1) OEM vs aftermarket — OEM er 30-50% dyrere, (2) Utstyr — ADAS-kamera, regnsensor, oppvarming, HUD, antenne, akustisk film, solfilm øker prisen trinnvis, (3) Bilmerke — premium-merker har dyrere glass, (4) Tilgjengelighet — sjeldne biler har færre aftermarket-alternativer. En enkel frontrute til en VW Golf kan koste 2.500 kr, mens en ADAS+varme+HUD+akustisk frontrute til en Mercedes S-Klasse kan koste 15.000+ kr. Vi hjelper deg med å finne riktig glass til riktig pris for kundesegmentet ditt.",
    keywords: ["pris", "kostnad", "dyr", "billig", "variasjon", "forskjell", "golf", "mercedes", "premium", "utstyr", "adas", "hud", "varme"]
  },
  {
    id: "adas-kalibrering",
    category: "tjenester",
    question: "Hva er ADAS-kalibrering, og når trengs det?",
    answer: "ADAS (Advanced Driver Assistance Systems) inkluderer kamera og sensorer bak frontruten — filskiftevarsel, adaptiv cruisekontroll, trafikkskiltgjenkjenning, etc. Når frontruten byttes, flyttes kameraet noen millimeter. Selv små avvik kan gjøre at systemene ikke fungerer korrekt. Kalibrering kreves ALLTID etter frontrutebytte på biler med ADAS. Som leverandør bør du informere verkstedet ditt om dette, slik at de kan prise det inn til sluttkunden. Noen biler krever dynamisk kalibrering (kjøring på vei), andre statisk kalibrering (foran target-plate).",
    keywords: ["adas", "kalibrering", "kamera", "sensor", "cruisekontroll", "filskifte", "lane", "assist", "pris", "montering", "verksted"]
  },
  {
    id: "garanti",
    category: "tjenester",
    question: "Hva slags garanti får jeg som verksted på glass fra Autoglass AS?",
    answer: "Autoglass AS gir deg som B2B-kunde produktgaranti på alle glass vi leverer. Garantien dekker produktfeil, lekkasje i limfugen, og løsning fra karosseriet. Garantien dekker IKKE nye steinsprut eller skader etter levering, eller feil montering utført av tredjepart. Ved reklamasjon: kontakt oss med bilens regnr og eurocode, så ordner vi bytte eller refusjon. Vi står bak produktene våre — din kunde skal aldri få problemer på grunn av vårt glass.",
    keywords: ["garanti", "reklamasjon", "feil", "lekkasje", "limfuge", "produkt", "bytte", "refusjon", "verksted", "b2b", "dekning"]
  },
  {
    id: "regnsensor",
    category: "teknisk",
    question: "Hva er en regnsensor, og hvordan vet jeg om bilen har det?",
    answer: "En regnsensor er en optisk sensor montert bak frontruten (ofte ved bakspeilet). Den registrerer vanndråper på ruten og aktiverer vindusviskerne automatisk. For å sjekke om en bil har regnsensor: (1) Se etter en liten rund «øye» bak frontruten ved bakspeilet, (2) Sjekk om viskerbryteren har AUTO-innstilling, (3) Spør oss med regnr — vi kan slå det opp. Som leverandør: husk at hvis bilen har regnsensor, MÅ du bestille frontrute med sensor-feste. En standard frontrute uten sensor-hull passer ikke.",
    keywords: ["regnsensor", "rain", "sensor", "vindusvisker", "auto", "øye", "bakspeil", "feste", "bestille", "verksted"]
  },
  {
    id: "oppvarmet-glass",
    category: "teknisk",
    question: "Hva er oppvarmet frontrute, og hva er forskjellen på full varme og kamera-varme?",
    answer: "Oppvarmet frontrute har tynne varmetråder eller en varmefilm integrert i glasset. Det finnes to typer: (1) Full varme — varmeelementer dekker hele frontruten. Gir best effekt i vinterkulda. (2) Kamera-varme — en liten varmesone foran ADAS-kameraet. Hindrer at is og dugg blokkerer kameraet. Billigere enn full varme. Som leverandør: sørg for at verkstedet ditt bestiller riktig type — du kan ikke bytte fra full varme til kamera-varme, de har ulike tilkoblinger og styreenheter.",
    keywords: ["oppvarmet", "varme", "herdet", "kamera-varme", "full", "sone", "vinter", "is", "dugg", "tilkobling", "bestille"]
  },
  {
    id: "hud-glass",
    category: "teknisk",
    question: "Hva er HUD-glass, og hvorfor er det dyrere?",
    answer: "HUD (Head-Up Display) projiserer hastighet, navigasjon og andre data direkte i frontruten. HUD-glass har en spesiell coating (vanligvis i nedre del av ruten) som reflekterer projeksjonen klart. Standard frontrute uten HUD-coating vil gi dobbeltbilde eller uklar projeksjon. HUD-glass er 20-40% dyrere enn standard glass. Som leverandør: påse at verkstedet ditt aldri bytter til standard glass hvis bilen har HUD — det vil gjøre displayet uleselig og kunden blir misfornøyd.",
    keywords: ["hud", "head-up", "display", "coating", "projeksjon", "refleksjon", "dyr", "standard", "bestille", "verksted"]
  },
  {
    id: "akustisk-glass",
    category: "teknisk",
    question: "Hva er akustisk glass, og når bør jeg tilby det?",
    answer: "Akustisk glass (støydempet/Silent glass) har en spesiell plastfilm mellom glasslagene som demper vibrasjoner og reduserer støy med 3-5 dB. Det er standard på mange premium-biler og tilvalg på andre. Som leverandør bør du tilby akustisk glass til: (1) Premium-kunder som verdsetter komfort, (2) Hybrid/EL-biler der kabinstøy allerede er lav, (3) Kunder som kjører mye på motorvei. Prisdifferansen er 10-20% vs standard — enkel oppgradering med god margin.",
    keywords: ["akustisk", "støydempet", "silent", "støy", "komfort", "premium", "hybrid", "elbil", "margin", "tilbud", "bestille"]
  },
  {
    id: "leveringstid",
    category: "logistikk",
    question: "Hvor lang er leveringstiden på bilglass?",
    answer: "Leveringstiden avhenger av glassets tilgjengelighet: (1) På lager — vi har 2.500+ artikler på lager i Oslo. Levering neste virkedag til hele Norge. (2) Bestillingsvare, Europa — 3-5 virkedager for vanlige biler. (3) Bestillingsvare, sjeldne biler — 1-3 uker for spesielle biler. (4) Import fra Asia/USA — 2-6 uker for noen OEM-glass. Som B2B-kunde kan du alltid kontakte oss med regnr for umiddelbar lagerstatus. Vi jobber kontinuerlig med å utvide lageret for å redusere ventetid for dine kunder.",
    keywords: ["levering", "tid", "lager", "oslo", "norge", "bestilling", "europa", "asia", "vente", "tilgjengelig"]
  },
  {
    id: "eurocode",
    category: "teknisk",
    question: "Hva er en eurocode, og hvorfor er den viktig?",
    answer: "Eurocode (E-code/ECE-kode) er en standardisert kode som identifiserer et spesifikt bilglass. Koden ser slik ut: M0080AGNCMV. Den forteller: (1) Godkjenningsmerke (E) — godkjent for EU/EØS, (2) Produsent-kode, (3) Dimensjoner og form, (4) Utstyrskoder — ADAS, varme, regnsensor, HUD, etc. Som leverandør bruker du eurocode for å sikre at glasset er eksakt riktig. To glass kan se like ut, men ha ulik eurocode på grunn av forskjellig utstyr. Vi hjelper deg med å finne riktig eurocode basert på regnr, VIN eller kjøretøydata.",
    keywords: ["eurocode", "e-code", "ece", "kode", "identifisere", "standard", "godkjenning", "utstyr", "regnr", "vin"]
  },
  {
    id: "produsent-pilkington",
    category: "produkter",
    question: "Hvem er Pilkington?",
    answer: "Pilkington ble grunnlagt i 1826 i Storbritannia og er en av verdens største produsenter av bilglass. Selskapet eies av NSG Group og leverer både OEM-glass til bilfabrikker og reservedelsglass til aftermarket. Vi fører et bredt utvalg av Pilkington-produkter til ditt verksted.",
    keywords: ["Pilkington", "produsent", "historie", "NSG", "OEM", "aftermarket", "merke"]
  },
  {
    id: "produsent-glavista",
    category: "produkter",
    question: "Hvem er Glavista?",
    answer: "Glavista er en europeisk produsent som spesialiserer seg på bilglass og har sterk dekning av europeiske bilmerker. Kvaliteten er høy og prisene er konkurransedyktige. Selskapet er en del av Dura Automotive. Vi tilbyr Glavista-glass som et godt alternativ for verkstedet ditt.",
    keywords: ["Glavista", "europeisk", "bilglass", "Dura", "produsent", "merke"]
  },
  {
    id: "produsent-euroglass",
    category: "produkter",
    question: "Hvem er Euroglass?",
    answer: "Euroglass fokuserer på aftermarket-bilglass og tilbyr rimeligere alternativer uten at kvaliteten blir kompromittert. Selskapet er en del av Uniglass|Ziebart-gruppen. For verksteder som vil holde kostnadene nede er Euroglass et solid valg, og vi har deres produkter på lager.",
    keywords: ["Euroglass", "aftermarket", "rimelig", "bilglass", "produsent", "merke"]
  },
  {
    id: "produsent-sekurit",
    category: "produkter",
    question: "Hvem er Saint-Gobain Sekurit?",
    answer: "Saint-Gobain Sekurit er verdens største OEM-produsent av bilglass og har hovedkontor i Frankrike. De leverer originalglass til de fleste bilfabrikker globalt. Skal du ha OEM-kvalitet er dette toppvalget, og vi kan skaffe Sekurit-glass direkte til verkstedet ditt.",
    keywords: ["Saint-Gobain", "Sekurit", "OEM", "original", "produsent", "merke"]
  },
  {
    id: "produsent-agc",
    category: "produkter",
    question: "Hvem er AGC Automotive?",
    answer: "AGC Automotive er en japansk produsent og verdens nest største innen bilglass. Selskapet er spesielt sterke på asiatiske bilmerker, men dekker også europeiske og amerikanske modeller. Vi fører AGC-glass som et pålitelig alternativ for verkstedet ditt.",
    keywords: ["AGC", "japansk", "bilglass", "asiatisk", "produsent", "merke"]
  },
  {
    id: "produsent-compare",
    category: "produkter",
    question: "Hvilken produsent skal jeg velge?",
    answer: "Valget avhenger av behovet ditt. Saint-Gobain Sekurit er beste OEM-kvalitet. Pilkington er en allrounder med både OEM og aftermarket. Glavista gir god europeisk kvalitet til konkurransedyktig pris. AGC er sterkt på asiatiske biler. Euroglass er det rimeligste aftermarket-alternativet. Vi hjelper deg å finne riktig glass til riktig pris for verkstedet ditt.",
    keywords: ["sammenligne", "produsenter", "OEM", "aftermarket", "velge", "pris", "kvalitet"]
  },
  {
    id: "pilkington-glavista",
    category: "produkter",
    question: "Hva er forskjellen på Pilkington, Glavista og Euroglass?",
    answer: "Dette er tre av de største produsentene av aftermarket bilglass vi fører: (1) Pilkington — en av verdens eldste glassprodusenter, god kvalitet, bredt utvalg. Produserer både OEM og aftermarket. (2) Glavista — spesialisert på bilglass, sterkt på europeiske biler. God kvalitet og konkurransedyktig pris. (3) Euroglass — fokus på aftermarket, rimeligere alternativ, god kvalitet for prisen. Alle tre oppfyller ECE-godkjenninger. Forskjellen i kvalitet er minimal for vanlig bruk. Som leverandør kan du tilby alle tre og la kunden velge basert på budsjett og preferanse.",
    keywords: ["pilkington", "glavista", "euroglass", "produsent", "merke", "kvalitet", "pris", "ece", "godkjenning", "aftermarket", "oem"]
  },
  {
    id: "bestille-regnr",
    category: "bestilling",
    question: "Hvordan bestiller jeg glass fra Autoglass AS?",
    answer: "Du kan bestille glass fra oss på flere måter: (1) Web-chat med AI-ordremottakeren — oppgi regnr, posisjon og utstyr, så finner vi riktig glass umiddelbart. (2) E-post til ordre@autoglass.no med regnr, posisjon, og ønsket merke (OEM/aftermarket). (3) Telefon: Vi hjelper deg med å finne riktig glass basert på regnr eller eurocode. (4) Direkte i nettbutikken — søk på regnr eller eurocode. Vi leverer til verksteder over hele Norge. Som B2B-kunde får du avtalepriser og rask levering.",
    keywords: ["bestille", "ordre", "kjøpe", "bestilling", "web", "chat", "e-post", "telefon", "nettbutikk", "regnr", "eurocode"]
  },
  {
    id: "avtalepriser",
    category: "priser",
    question: "Hvordan får jeg avtalepriser som verksted?",
    answer: "Som B2B-kunde (verksted, mekaniker, bilglass-bedrift) kan du søke om avtalepriser hos Autoglass AS. Prosessen: (1) Send en e-post til kundeservice@autoglass.no med org.nr, firmanavn, og kontaktperson. (2) Vi vurderer søknaden og setter opp en prisavtale basert på volum og kundesegment. (3) Du får tilgang til B2B-priser i nettbutikken og via chat. Avtalepriser gir typisk 15-30% rabatt på standardpriser, avhengig av volum. Jo mer du handler, jo bedre pris. Vi har også lojalitetsprogram for store kunder.",
    keywords: ["avtalepriser", "rabatt", "b2b", "verksted", "mekaniker", "org.nr", "firma", "volum", "lojalitet", "prisavtale"]
  },
  {
    id: "retur-bytting",
    category: "priser",
    question: "Kan jeg returnere eller bytte glass jeg har bestilt?",
    answer: "Ja, som B2B-kunde kan du returnere eller bytte glass under følgende betingelser: (1) Uåpnet/emballasje intakt — full refusjon innen 30 dager. (2) Feilbestilling — bytte til riktig glass er gratis hvis du kontakter oss innen 14 dager. (3) Produktfeil — vi bytter gratis og dekker returfrakt. (4) Spesialbestillinger (import fra Asia/USA) — kan ikke returneres med mindre det er feil på produktet. Kontakt alltid kundeservice før retur — vi sender deg en returseddel. Glasset må pakkes forsvarlig for å unngå skader under transport.",
    keywords: ["retur", "bytte", "refusjon", "feilbestilling", "spesialbestilling", "emballasje", "frakt", "transport", "reklamasjon"]
  },
  {
    id: "lagerstatus-sjekk",
    category: "logistikk",
    question: "Hvordan sjekker jeg lagerstatus på et glass?",
    answer: "Du kan sjekke lagerstatus på flere måter: (1) AI-ordremottakeren i chat — oppgi regnr, så ser vi umiddelbart om glasset er på lager. (2) Nettbutikken — søk på regnr eller eurocode, lagerstatus vises i sanntid. (3) E-post til lager@autoglass.no — vi svarer innen 1 time i åpningstiden. (4) Telefon — ring oss for umiddelbar status. Vi har 2.500+ artikler på lager i Oslo og kan levere neste virkedag til hele Norge. For bestillingsvarer gir vi deg alltid estimert leveringstid.",
    keywords: ["lager", "status", "tilgjengelig", "på lager", "sanntid", "chat", "nettbutikk", "e-post", "telefon", "oslo", "norge"]
  },
  {
    id: "sporing-levering",
    category: "logistikk",
    question: "Hvordan sporer jeg min leveranse?",
    answer: "Når din bestilling sendes fra vårt lager i Oslo, mottar du en e-post med sporingsnummer og lenke til transportselskapet. Du kan også logge inn på Min Konto for å se status på alle dine bestillinger. For B2B-kunder med store volum: vi tilbyr EDI-integrasjon som gir deg sanntidsoppdateringer direkte i ditt system. Hvis leveransen er forsinket, kontakter vi deg proaktivt. Vi samarbeider med pålitelige transportører som håndterer glass med største forsiktighet.",
    keywords: ["sporing", "tracking", "levering", "transport", "forsinkelse", "edi", "min konto", "e-post", "sporingsnummer"]
  },
  {
    id: "mva-faktura",
    category: "priser",
    question: "Får jeg faktura med MVA som B2B-kunde?",
    answer: "Ja, alle våre B2B-fakturaer inkluderer MVA og oppfyller kravene til bokføring. Ved første bestilling må du oppgi org.nr og fakturaadresse. Deretter lagres informasjonen på kundeforholdet ditt. Vi tilbyr: (1) EHF-faktura (elektronisk faktura) — sendes direkte til ditt økonomisystem, (2) PDF-faktura per e-post, (3) Fakturabetaling med 14 dagers kreditt for godkjente B2B-kunder. For store ordrer kan vi tilpasse betalingsvilkår etter avtale.",
    keywords: ["mva", "faktura", "ehf", "pdf", "bokføring", "org.nr", "kreditt", "betaling", "økonomisystem", "b2b"]
  },
  {
    id: "kontakt-oss",
    category: "kundeservice",
    question: "Hvordan kontakter jeg Autoglass AS?",
    answer: "Du kan kontakte oss på følgende måter: (1) AI-ordremottakeren i chat — tilgjengelig 24/7 for bestilling og produktspørsmål. (2) E-post: ordre@autoglass.no for bestillinger, kundeservice@autoglass.no for spørsmål, og reklamasjon@autoglass.no for garantisaker. (3) Telefon: Ring oss i åpningstiden (man-fre 08:00-16:00). (4) Kontaktskjema på nettsiden. Som B2B-kunde har du også tilgang til en dedikert kontaktperson ved større volum. Vi svarer på e-post innen 4 timer i åpningstiden.",
    keywords: ["kontakt", "telefon", "e-post", "chat", "åpningstid", "kundeservice", "reklamasjon", "ordre", "dedikert", "kontaktperson"]
  },
  {
    id: "ece-r43-hva-er",
    category: "regelverk",
    question: "Hva er ECE R43 og hva regulerer den?",
    answer: "ECE R43 er FNs regulering nr. 43 for sikkerhetsglass i kjøretøy. Den fastsetter krav til både glassmaterialet og monteringen på biler og tilhengere. Reguleringen sikrer at glasset tåler påkjørsel, gir tilstrekkelig sikt og ikke splintrer farlig ved knusing. Alle glass som selges i EU/EØS, inkludert Norge, må være ECE-godkjent. Autoglass AS selger kun E-godkjent glass som oppfyller R43 til ditt verksted.",
    keywords: ["ECE R43", "sikkerhetsglass", "FN regulering", "godkjenning", "regelverk"]
  },
  {
    id: "ece-merking",
    category: "regelverk",
    question: "Hva betyr E-merket på bilglass?",
    answer: "E-merket viser at glasset er typegodkjent etter ECE R43. Merket inneholder et landnummer (E1 = Tyskland, E16 = Norge), godkjenningsnummer og glasstypekode. For frontruter står det II for laminert glass, mens VII betyr herdet glass for saktegående kjøretøy. E-merket skal være permanent påført og synlig etter montering. Glass uten gyldig E-merke er ulovlig å montere på kjøretøy i Norge. Autoglass AS leverer glass med korrekt E-merking til ditt verksted.",
    keywords: ["E-merke", "ECE godkjenning", "landnummer", "glasstypekode", "typegodkjenning"]
  },
  {
    id: "ece-godkjenning",
    category: "regelverk",
    question: "Hvordan vet jeg om et glass er ECE-godkjent?",
    answer: "Se etter E-merket i hjørnet på glasset. Merket skal være gravert eller påført på en måte som ikke kan fjernes. Det består av en sirkel med E + landnummer, et godkjenningsnummer og en typekode. Du kan også sjekke leverandørens dokumentasjon eller spørre oss hos Autoglass AS. Hvis glasset mangler E-merke eller merket er uklart, avvis det. Montering av ikke-godkjent glass kan føre til bruksforbud ved kontroll og erstatningsansvar ved ulykke.",
    keywords: ["ECE godkjenning", "E-merke", "kontrollere glass", "typegodkjenning", "godkjent glass"]
  },
  {
    id: "ece-frontrute-krav",
    category: "regelverk",
    question: "Hvilke krav stilles til frontruter etter ECE R43?",
    answer: "Frontruter for kjøretøy over 40 km/t må være laminert glass, aldri herdet. De må tåle balltreff med 2,26 kg stålkule fra 4 meters høyde uten gjennomtrengning. Lysgjennomgangen skal være minst 70%. Ved knusing må glasset beholde sikt nok til at føreren kan bremse og stoppe trygt. Autoglass AS selger kun E-godkjente laminerte frontruter med riktige tykkelser og PVB-lag til ditt verksted.",
    keywords: ["frontrute", "laminert glass", "ECE R43 krav", "lysgjennomgang", "sikkerhetsglass"]
  },
  {
    id: "ece-siderute-krav",
    category: "regelverk",
    question: "Krav til side- og bakruter etter ECE R43?",
    answer: "Side- og bakruter kan være enten herdet eller laminert glass etter ECE R43. Frontsideruter i førerens siktsfelt må ha minst 70% lysgjennomgang. Herdet glass skal ved knusing dele seg i små, stumpede fragmenter for å redusere kuttskader. Bakre sideruter og bakrute kan ha mørkere toner. Ruter med lysgjennomgang under 70% skal merkes med V. Autoglass AS lagerfører både herdet og laminert side- og bakglass for de fleste bilmodeller.",
    keywords: ["siderute", "bakrute", "herdet glass", "laminert glass", "lysgjennomgang"]
  },
  {
    id: "ece-herdet-vs-laminert",
    category: "regelverk",
    question: "Når krever ECE herdet vs laminert glass?",
    answer: "Frontruter må være laminert for alle kjøretøy over 40 km/t. Herdet frontrute er kun tillatt for saktegående kjøretøy og merkes med VII. Side- og bakruter kan være begge deler – herdet er mest vanlig på grunn av lavere pris, mens laminert brukes der ekstra sikkerhet eller støydemping ønskes. Autoglass AS kan hjelpe ditt verksted med å velge riktig type glass til riktig posisjon for hvert kjøretøy.",
    keywords: ["herdet glass", "laminert glass", "frontrute", "sikkerhet", "glassvalg"]
  },
  {
    id: "ece-montering-krav",
    category: "regelverk",
    question: "Monteringskrav etter ECE R43 (lim, tørketid, temperatur)?",
    answer: "ECE R43 stiller krav til at monteringen skal sikre tilstrekkelig sikt og holdbarhet. Bruk kun godkjent bilglasslim beregnet på direkte montering. Overflaten må rengjøres grundig og primer påføres etter produsentens anvisning. Limet påføres i triangulært mønster eller ved kontinuerlig fuge. Tørketiden varierer fra 1 til 24 timer avhengig av limtype og temperatur. Mange produsenter krever minst 5-10°C. Kontakt Autoglass AS for anbefaling av riktig lim og tørketid til ditt verksted.",
    keywords: ["montering", "bilglasslim", "tørketid", "temperatur", "direkte montering"]
  },
  {
    id: "ece-skadet-glass",
    category: "regelverk",
    question: "Når må et skadet glass byttes etter regelverket?",
    answer: "ECE R43 krever at glasset er tilstrekkelig transparent og ikke forårsaker synlig deformasjon. Frontruter med sprekker i førerens siktsfelt må byttes. Riper som forstyrrer sikten eller sprekker som kan spre seg ved temperatur- eller vibrasjonspåkjenning bør også skiftes. For herdet sideruter gjelder nulltoleranse – selv små sprekker svekker hele ruta. Autoglass AS har rask levering av erstatningsglass slik at ditt verksted kan tilby kunden trygg og regelrett løsning.",
    keywords: ["skadet glass", "bytte glass", "frontrute sprekk", "siktsfelt", "glassbytte"]
  },
  {
    id: "ece-steinsprut",
    category: "regelverk",
    question: "Regler for steinsprutreparasjon vs utskifting?",
    answer: "ECE R43 regulerer glasskvalitet, ikke reparasjonsmetoder. En reparasjon er akseptabel hvis skaden er mindre enn en mynt, ligger utenfor førerens primære siktsfelt, og ikke har penetrert det innerste glasslaget. Reparasjon i førerens siktsfelt eller på sprekker over 3-4 cm bør unngås – det kan påvirke lysgjennomgang og gi optisk deformasjon. Ved tvil: skift glass. Autoglass AS selger originale og alternativ frontruter for rask utskifting når reparasjon ikke er tilstrekkelig.",
    keywords: ["steinsprut", "reparasjon", "utskifting", "frontrute", "siktsfelt"]
  },
  {
    id: "ece-ce-merking",
    category: "regelverk",
    question: "CE-merking av bilglass (EU-forordning)?",
    answer: "CE-merking gjelder under EU-forordning 2019/2144 og viser at kjøretøyet eller komponenten oppfyller EUs grunnleggende sikkerhetskrav. For bilglass er det E-merket etter ECE R43 som er det praktiske kravet verkstedet forholder seg til. CE-merket finnes typisk på hele kjøretøyet, mens hvert enkelt glass bærer sitt E-merke. Når du handler glass hos Autoglass AS, er E-godkjenningen garantert – dette er det eneste merket du trenger å kontrollere ved montering.",
    keywords: ["CE-merking", "EU-forordning", "E-merke", "typegodkjenning", "sikkerhetskrav"]
  },
  {
    id: "ece-import-glass",
    category: "regelverk",
    question: "Kan jeg importere glass fra USA/Asia til Norge?",
    answer: "Glass med kun DOT-merking (USA) eller CCC-merking (Kina) er IKKE gyldig for montering i EU/EØS, inkludert Norge. Kun E-godkjent glass etter ECE R43 er lovlig. Ved import kan tollmyndigheter beslaglegge glass uten gyldig E-merke. Ønsker du å importere glass selv, må du sikre at leverandøren har E-godkjenning og at E-merket er korrekt påført. Autoglass AS importerer kun E-godkjent glass fra godkjente produsenter og håndterer all dokumentasjon for ditt verksted.",
    keywords: ["import glass", "DOT", "CCC", "E-godkjenning", "toll"]
  },
  {
    id: "ece-tyskland-vs-norge",
    category: "regelverk",
    question: "Forskjeller mellom tyske og norske godkjenninger?",
    answer: "Det er ingen teknisk forskjell. Både Tyskland (E1) og Norge (E16) er medlemmer av FNs 1958-avtale og godtar hverandres ECE R43-godkjenninger gjennom gjensidig anerkjennelse. Norge følger ECE R43 via EØS-avtalen. Et glass godkjent i Tyskland med E1-merke er fullt ut gyldig i Norge, og omvendt. Forskjellen ligger kun i landnummeret. Autoglass AS selger glass med godkjenning fra flere ECE-land – alle er likeverdige og lovlige å montere i Norge.",
    keywords: ["Tyskland", "Norge", "E1", "E16", "EØS", "gjensidig anerkjennelse"]
  },
  {
    id: "montering-lim",
    category: "montering",
    question: "Hvilket lim skal jeg bruke til ulike glass?",
    answer: "Polyuretan-lim (PU) er standard for frontruter og de fleste side-/bakruter. Sika, Dow, 3M og Teroson er ledende merker vi fører. Velg et lim med riktig elastisitet og herdetid for kjøretøytypen. Til lastebiler og busser bruker du ofte tykkere PU-lim med høyere elasticitet. Sjekk alltid bilprodusentens spesifikasjoner før du velger limtype — feil lim kan gi lekkasje eller svekket karosseristivhet.",
    keywords: ["polyuretan-lim", "PU-lim", "Sika", "Dow", "3M", "Teroson", "frontrute-lim"]
  },
  {
    id: "montering-primer",
    category: "montering",
    question: "Når og hvor bruker jeg primer?",
    answer: "Primer påføres på karosseriet der det tidligere var lim, samt på porselenskant eller keramisk belegg på glasset. Den sikrer adhesjon og blokkerer fuktighet. Påfør alltid primer på rene, avfattede flater — aldri på synlig lakk. La primeren tørke til den er matt (ca. 5–10 minutter) før du legger lim. Bruk riktig primer til riktig underlag: metallprimer på karosseri, glassprimer på keramisk belegg. Manglende eller feil primer er en av de vanligste årsakene til limfeil.",
    keywords: ["primer", "adhesjon", "karosseri", "keramisk belegg", "metallprimer", "glassprimer", "limfuge"]
  },
  {
    id: "montering-torkeid",
    category: "montering",
    question: "Hvor lang tørketid trenger limet?",
    answer: "Vanligvis 1–3 timer til kjørefast, og 24–48 timer til full herding. Tørketiden avhenger av temperatur, luftfuktighet og limtype. Ved +20°C og normal fuktighet er de fleste PU-limer kjørefaste etter 1–2 timer. Ved lavere temperaturer eller høy luftfuktighet øker tiden. Les alltid databladet for det spesifikke limet du bruker. Gi kunden klare instruksjoner: unngå høye hastigheter, automatvask og hard nedbremsing de første 24 timene.",
    keywords: ["tørketid", "herdetid", "kjørefast", "PU-lim", "temperatur", "luftfuktighet", "datablad"]
  },
  {
    id: "montering-temperatur",
    category: "montering",
    question: "Hvilken minimumstemperatur kreves for montering?",
    answer: "Minimum +5°C til +10°C avhengig av limtype. Under 0°C anbefales IKKE montering. PU-lim herder ved reaksjon med fuktighet i luften, og kaldt vær bremser prosessen kraftig. Hvis du må jobbe ved lave temperaturer, varm opp lim og karosseri til minst +10°C før påføring. Noen hurtigherdende lim tåler lavere temperaturer — sjekk databladet. Husk at tørketiden øker betydelig når temperaturen er under +15°C.",
    keywords: ["minimumstemperatur", "monteringstemperatur", "PU-lim", "kaldt vær", "hurtigherdende lim", "herding"]
  },
  {
    id: "montering-klips",
    category: "montering",
    question: "Hvilke klips og tetningslister brukes til ulike glass?",
    answer: "U-klips, push-in klips og snap-on klips varierer etter bilmerke og modell. Frontruter bruker ofte integrerte klips i gummilisten, mens sidevinduer kan ha push-in klips i dørkarosseriet. Eldre biler bruker ofte gummilister med innpressede klips i karosseriets spor. Sjekk alltid det originale monteringsmønsteret før du bestiller glass fra oss — vi leverer glass med riktig klipskonfigurasjon når det er tilgjengelig. Bytt alltid ut slitte tetningslister for å unngå lekkasje og vindstøy.",
    keywords: ["U-klips", "push-in klips", "snap-on klips", "tetningslist", "gummiliste", "sidevindu", "frontrute"]
  },
  {
    id: "montering-list",
    category: "montering",
    question: "Når trengs pyntelister, og hvilke typer finnes?",
    answer: "Pyntelister dekker limfugen og gir et rent visuelt resultat. Noen biler har integrerte lister i glasset — da trenger du ikke separat list. Andre krever separate plast- eller gummilister som klemmes eller limes på etter montering. Sjekk alltid om glasset du bestiller har integrert list eller om du trenger tilleggsdel. Ved liming av lister bruker du kontaktlim eller spesiallim for plast. Ikke bruk silikon — det gir dårlig holdbarhet og kan løsne i kulde.",
    keywords: ["pyntelist", "integrert list", "limfuge", "plastlist", "gummilist", "kontaktlim", "silikon"]
  },
  {
    id: "montering-verktoy",
    category: "montering",
    question: "Hvilket verktøy trenger jeg for profesjonell glassmontering?",
    answer: "Grunnutstyret inkluderer vindusklipper (wire og håndtak), sugekopper for løft, skrape for fjerning av gammelt lim, primerpensel og limsprøyte eller -pistol. Til frontruter trenger du wire med to håndtak for skjæring gjennom limfugen. Bruk alltid verktøy i god stand — sløve skraper og ødelagte wirehåndtak gir dårlige resultater og kan skade lakken. En varmepistol er nyttig for å mykgjøre gammelt lim ved fjerning, spesielt om vinteren.",
    keywords: ["vindusklipper", "sugekopper", "skrape", "primerpensel", "limsprøyte", "wire", "verktøy"]
  },
  {
    id: "montering-feil",
    category: "montering",
    question: "Hva er vanlige monteringsfeil, og hvordan unngår jeg dem?",
    answer: "De vanligste feilene er: for lite primer, for kort tørketid, for kald montering og manglende rengjøring av overflater. Sørg for at både karosseri og glass er avfettet med isopropanol før primer og lim. Bruk riktig mengde primer — for lite gir dårlig adhesjon, for mye kan gi flekker. Overhold alltid minimumstemperatur og tørketid fra limprodusenten. Feil montering kan føre til lekkasje, vindstøy og i verste fall at ruten løsner under kjøring.",
    keywords: ["monteringsfeil", "primer", "tørketid", "avfetting", "adhesjon", "lekkasje", "vindstøy"]
  },
  {
    id: "montering-vinter",
    category: "montering",
    question: "Hvilke spesielle hensyn gjelder ved vintermontering?",
    answer: "Forvarm lim og karosseri til minst +10°C før påføring. Bruk hurtigherdende lim beregnet for lave temperaturer når det er tilgjengelig. Øk tørketiden betydelig — regn med dobbelt så lang tid som ved sommerstemperatur. Unngå åpning og lukking av dører rett etter montering — lufttrykkvariasjoner kan påvirke uherdet lim. Dekk til bilen hvis den står ute. Ikke bruk varmeblåser rett på limfugen — det gir ujevn herding.",
    keywords: ["vintermontering", "forvarming", "hurtigherdende lim", "tørketid", "varmeblåser", "vinter", "kulde"]
  },
  {
    id: "montering-eldre-bil",
    category: "montering",
    question: "Hva må jeg passe på ved montering på eldre biler?",
    answer: "Sjekk alltid vindusåpningen for rust, særlig i bunnkanten. Bruk rustkonverterer og grunning på angrepne områder før primer og lim. Reparer små deformasjoner i karosseriet — selv millimeteravvik kan gi lekkasje og vindstøy. Eldre biler har ofte tykkere lakk og kan trenge ekstra avfetting. Vær obs på at originalgummilister kan være utgått — da kan du ofte bruke universallister med tilpasning. Kontakt oss hvis du er usikker på riktig glass til eldre modeller.",
    keywords: ["eldre bil", "rust", "rustkonverterer", "deformasjon", "vindusåpning", "karosseri", "universallist"]
  },
  {
    id: "glass-pvb-film",
    category: "teknisk",
    question: "Hva er PVB og hvorfor brukes det i frontruter?",
    answer: "PVB (polyvinylbutyral) er en plastfilm som limes mellom to glasslag i laminerte frontruter. Filmen er 0,38–1,52 mm tykk og holder glasset sammen ved kollisjon, slik at det ikke knuser i skarpe fragmenter. Som grossist leverer vi laminerte ruter med original PVB-kvalitet som tilsvarer fabrikkspesifikasjonene.",
    keywords: ["PVB", "polyvinylbutyral", "laminert glass", "frontrute", "glassfilm"]
  },
  {
    id: "glass-varmetrader",
    category: "teknisk",
    question: "Hvordan fungerer varmetråder i bilglass?",
    answer: "Varmetråder er tynne tungsten-tråder (15–25 mikrometer) integrert i bakruten eller frontruten. De har en motstand på 0,5–2,5 ohm og trekker 5–15A ved 12V. Når verkstedet kobler ruten til defroster-kretsen, avgir trådene varme som fjerner is og dug. Sjekk alltid at utskiftingen dekker hele defroster-sonen, ellers får du reklamasjon.",
    keywords: ["tungsten", "defroster", "bakrute", "elektrisk oppvarming"]
  },
  {
    id: "glass-antenne-integrert",
    category: "teknisk",
    question: "Hva slags integrerte antenner finnes i moderne bilglass?",
    answer: "Moderne ruter kan ha innebygde AM/FM-antenner (tynne kobbertråder), GPS (aktiv antenne), DAB, mobil og TV. Signalene hentes via kontaktpunkter langs glasskanten. Ved bytte må du overføre antenneforsterker og koble eksakt som originalt. Feilkobling gir dårlig mottak og frustrerte kunder.",
    keywords: ["integrert antenne", "GPS-antenne", "DAB", "AM/FM", "antenneforsterker"]
  },
  {
    id: "glass-solar-coated",
    category: "teknisk",
    question: "Hvordan fungerer solar/coated glass?",
    answer: "Solar- eller coated-glass har tynne metalloksidlag, oftest indium-tinn-oksid (ITO), på innsiden. Disse reflekterer infrarød stråling og reduserer varmeinnslipp med 30–50%. For verkstedet betyr det færre klager på overopphetet kupe, men pass på: nope ruter kan ha annerledes tykkelse og krever riktig lim.",
    keywords: ["solar coated", "ITO", "infrarød", "varmerefleksjon", "coated glass"]
  },
  {
    id: "glass-tykkelse",
    category: "teknisk",
    question: "Varierer glasstykkelsen mellom ulike biler?",
    answer: "Ja, tykkelsen varierer. Frontruter er typisk 4,5–6,0 mm (to glasslag på 2,1–3,0 mm plus PVB). Sideruter er 3,0–4,5 mm. Bakruter er 3,5–5,0 mm. Bruk alltid den tykkelsen som passer kjøretøyets byggeår og modell. Feil tykkelse gir dårlig passform og kan påvirke karosseriets stivhet.",
    keywords: ["glasstykkelse", "frontrute tykkelse", "siderute", "bakrute", "mm"]
  },
  {
    id: "glass-farge-gronn-blaa",
    category: "teknisk",
    question: "Hva betyr det at glasset er grønt eller blått?",
    answer: "Grønt glass inneholder jernoksid, mens blått glass inneholder koboltoksid. Fargen påvirker ikke sikkerheten, men blått glass gir noe mer lysdemping og kan redusere blending. Når du bestiller, oppgi eksakt fargekode fra det gamle glasset. Blandede farger i samme bil ser uprofesjonelt ut.",
    keywords: ["grønt glass", "blått glass", "jernoksid", "koboltoksid", "farget glass"]
  },
  {
    id: "glass-encapsulated",
    category: "teknisk",
    question: "Hva er encapsulated glass?",
    answer: "Encapsulated glass er ruter med en fabrikkmontert gummiramme i EPDM eller PVC langs kanten. Rammen fungerer som tetningslist og reduserer monteringstiden fordi du slipper å legge separat fuge. Pass på at rammens profil passer bilens karosseriåpning, ellers får du lekkasje eller vindstøy.",
    keywords: ["encapsulated glass", "gummiramme", "EPDM", "PVC", "flettet glass"]
  },
  {
    id: "glass-kollisjon-sikkerhet",
    category: "teknisk",
    question: "Hvordan beskytter frontruten ved kollisjon?",
    answer: "Frontruten bidrar til cirka 30% av karosseriets stivhet, spesielt ved frontkollisjon og rollover. PVB-filmen i laminert glass holder fragmenter fast slik at de ikke flyr inn i kupeen. Et riktig montert og ubeskadiget glass er avgjørende for at kollisjonsputene skal fungere som tiltenkt. Bytt skadet glass umiddelbart.",
    keywords: ["kollisjonssikkerhet", "frontrute stivhet", "PVB", "rulleovertrykk", "kollisjonspute"]
  },
  {
    id: "glass-steinsprut-utbedring",
    category: "teknisk",
    question: "Når er steinsprututbedring mulig?",
    answer: "Reparasjon er mulig hvis skaden er under 25 mm i synsfeltet og under 40 mm utenfor. Skader i førersynsfeltet bør som hovedregel ikke repareres, da det kan gi optiske forvrengninger. Stjerne- og bulls-eye-skader med intakte lag er best egnet. Hvis du er i tvil, bytt ruten — kundens sikkerhet går foran.",
    keywords: ["steinsprut", "reparasjon", "bulls-eye", "stjerneskade", "synsfelt"]
  },
  {
    id: "glass-levetid",
    category: "teknisk",
    question: "Hvor lenge holder et bilglass?",
    answer: "Teoretisk holder bilglass 10–15 år, men i praksis byttes det nesten utelukkende ved skade, ikke alder. Slitasje på overflaten, små steinsprut og delaminering ved kantene er vanlige årsaker. Oppbevar glass tørt og unngå hardhåndtering før montering. Vi leverer alltid ferskt lagerført glass med full sporbarhet.",
    keywords: ["levetid", "bilglass alder", "delaminering", "slitasje", "lagerføring"]
  },
  {
    id: "adas-kameratyper",
    category: "teknisk",
    question: "Hvilke typer ADAS-kamera finnes, og hvor sitter de?",
    answer: "Det finnes mono- og stereokameraer. Mono-kamera har én linse, sitter bak frontruten 1,2–1,8 meter over bakken, og gjenkjenner 2D-objekter som trafikkskilt og filmerker. Stereokamera har to linser, gir dybdesyn og er mer presist, men dyrere. Vi leverer frontruter med korrekt monteringsvindu og åpning tilpasset ditt kameratype.",
    keywords: ["ADAS-kamera", "mono-kamera", "stereokamera", "frontrute", "kameraplassering", "lane assist", "filmerker"]
  },
  {
    id: "adas-statisk-kalibrering",
    category: "teknisk",
    question: "Hvordan utfører jeg statisk kalibrering av ADAS-kamera?",
    answer: "Parkér bilen i vater foran target-platen på riktig avstand og høyde. Koble til kalibreringsverktøyet, følg produsentens stegvise guide, og la systemet justere kameravinkelen. Prosessen tar 15–30 minutter. Sørg for nivå underlag og korrekt dekktrykk — feil justering gir feil i ADAS-systemet.",
    keywords: ["statisk kalibrering", "ADAS-kalibrering", "target-plate", "kalibreringsverktøy", "kameravinkel", "frontrutebytte"]
  },
  {
    id: "adas-dynamisk-kalibrering",
    category: "teknisk",
    question: "Hva kreves for dynamisk kalibrering av ADAS-kamera?",
    answer: "Dynamisk kalibrering krever kjøring på vei med tydelige kjørefelt i 10–30 minutter ved varierende hastighet. Systemet lærer seg selv underveis. Sørg for godt vær, tørre veier og synlige feltmerker. Noen biler krever også statisk kalibrering i tillegg — sjekk alltid verkstedhåndboken før du bytter rute.",
    keywords: ["dynamisk kalibrering", "ADAS-kalibrering", "kjørefelt", "lane assist", "frontrute", "verkstedhåndbok"]
  },
  {
    id: "adas-target-plate",
    category: "teknisk",
    question: "Hva er en target-plate, og hvor får jeg tak i den?",
    answer: "Target-platen er en spesiell plate med et fast geometrisk mønster som ADAS-kameraet gjenkjenner under kalibrering. Du får den fra bilprodusenten eller fra leverandøren av kalibreringsverktøyet ditt. Platen må være i perfekt stand — skader eller falming gir feil kalibrering. Oppbevar den tørt og unngå riper.",
    keywords: ["target-plate", "ADAS-kalibrering", "kalibreringsmønster", "kameragjenkjenning", "statisk kalibrering", "verktøyleverandør"]
  },
  {
    id: "adas-kalibreringsverktoy",
    category: "teknisk",
    question: "Hvilke verktøy trenger jeg for ADAS-kalibrering?",
    answer: "Du trenger et godkjent kalibreringsverktøy som Autel, Bosch, Hella Gutmann eller TEXA, pluss merkespesifikke target-plater. Investeringskostnaden ligger mellom 50 000 og 500 000 kr avhengig av merke og dekning. Vi selger frontruter med korrekte kameravinduer — men kalibrering må utføres med eget verktøy etter hvert bytte.",
    keywords: ["kalibreringsverktøy", "ADAS-verktøy", "Autel", "Bosch", "Hella Gutmann", "TEXA", "target-plate", "verkstedutstyr"]
  },
  {
    id: "adas-ikke-kalibrert",
    category: "teknisk",
    question: "Hva skjer hvis jeg ikke kalibrerer ADAS-kameraet etter frontrutebytte?",
    answer: "Uten kalibrering fungerer ikke ADAS-systemene korrekt. Kameraet kan gi falske alarmer, eller verre — ikke varsle når det virkelig trengs. Dette er en direkte trafikksikkerhetsrisiko. Kalibrering er påkrevd etter hvert frontrutebytte uten unntak. Det er ditt ansvar som verksted å dokumentere at kalibrering er utført.",
    keywords: ["ADAS-kalibrering", "trafikksikkerhet", "falske alarmer", "frontrutebytte", "kalibreringsplikt", "dokumentasjon"]
  },
  {
    id: "adas-rain-light-sensor",
    category: "teknisk",
    question: "Hva er en kombinert regn- og lyssensor, og hva må jeg passe på ved bytte?",
    answer: "Sensoren er en optisk enhet som sitter bak frontruten og måler både lysforhold og vann på ruten. Den krever en frontrute med spesiell åpning og riktig limflate. Ved montering må sensorflaten og ruten være helt rene — selv små fingeravtrykk gir feilavlesning. Vi leverer ruter med korrekt sensoråpning for de fleste modeller.",
    keywords: ["regn- og lyssensor", "optisk sensor", "frontrute", "sensoråpning", "ADAS-sensor", "automatisk lys", "regnsensor"]
  },
  {
    id: "adas-filholder-vs-cruise",
    category: "teknisk",
    question: "Hva er forskjellen på lane assist og adaptive cruise control?",
    answer: "Lane assist holder bilen i kjørefeltet ved å styre mot filmerker, mens adaptive cruise control justerer hastigheten automatisk etter forankjørende. Begge bruker ofte det samme frontrutemonterte kameraet, men har ulike funksjoner. Ved frontrutebytte påvirkes begge systemene — derfor er kalibrering kritisk uansett hvilken funksjon kunden bruker mest.",
    keywords: ["lane assist", "adaptive cruise control", "ADAS-funksjoner", "filholder", "frontrute", "kamerakalibrering", "trafikksikkerhet"]
  },
  {
    id: "feil-lekkasje",
    category: "feilsoking",
    question: "Lekkasje etter montering — hva er vanlige årsaker og hvordan fikser jeg det?",
    answer: "Lekkasje skyldes ofte for lite primer, uren glasskant eller karosseri, for kort tørketid på lim, eller feilmontert tetningslist. Sjekk at overflaten er ren og tørr før påføring. Bruk riktig mengde primer og overhold limprodusentens tørketid. Inspiser tetningslisten for skjevheter eller luftspalter. Ved vedvarende lekkasje: fjern glasset, rengjør grundig, og monter på nytt med friskt lim. Bestill erstatningsglass og forbruksmateriell hos oss.",
    keywords: ["lekkasje", "lekker", "vann", "primer", "tetningslist", "lim", "montering", "fukt", "fuktig"]
  },
  {
    id: "feil-vindstoy",
    category: "feilsoking",
    question: "Vindstøy etter montering — hva er vanlige årsaker?",
    answer: "Vindstøy kommer som regel fra løse eller manglende klips, feilplassert tetningslist, eller glasstetning som ikke sitter tett mot karosseriet. Kontroller at alle klips og holder er på plass og i god stand. Sjekk at tetningslisten ligger jevnt langs hele rammen og ikke er vridd. Trykk glasset forsiktig inn mot karosseriet mens en medarbeider lytter — lyden avslører ofte hvor luften slipper inn. Bytt ut slitte eller ødelagte deler før du remonterer.",
    keywords: ["vindstøy", "vind", "støy", "tetningslist", "klips", "glasstetning", "luftlekkasje", "tett"]
  },
  {
    id: "feil-fukt-inni",
    category: "feilsoking",
    question: "Fukt mellom glasslagene — hva gjør jeg?",
    answer: "Fukt mellom lagene betyr at lamineringen (PVB-filmen) er skadet. Dette er ikke reparerbart — glasset må byttes. Forsøk på å tørke ut fukt vil bare forsinke problemet, og synet blir stadig dårligere. Skadet laminering svekker også rutens strukturelle styrke. Bestill nytt laminert glass fra oss og monter i henhold til produsentens instruks. Sørg for at det nye glasset ikke har skader før montering.",
    keywords: ["fukt", "fuktig", "laminering", "PVB", "frontrute", "glassbytte", "delaminering", "dugg"]
  },
  {
    id: "feil-risser",
    category: "feilsoking",
    question: "Risser i frontruten — når er det et problem?",
    answer: "Risser i førersynsfeltet krever alltid bytte. Utenfor synsfeltet gjelder: under 40 mm er som regel akseptabelt, over 40 mm eller i synsfeltet skal byttes. Husk at steinsprutskader kan sprekke videre i kulde eller ved vibrasjoner. En riss nær kanten svekker ruten og kan gi lekkasje. Vurder om kunden har kasko eller frontruteforsikring. Vi leverer raskt riktig erstatningsglass med riktig eurocode og utstyr.",
    keywords: ["risser", "riss", "steinsprut", "førersynsfelt", "frontrute", "bytte", "skade", "reparasjon"]
  },
  {
    id: "feil-antenne",
    category: "feilsoking",
    question: "Dårlig radio/mobildekning etter montering — hva kan være galt?",
    answer: "Sjekk først at antennekontakten er korrekt tilkoblet og ikke bøyd. Mange moderne biler har integrert antenne i frontruten — da trenger du glass med riktige antenne-tråder. Feil glasstype gir svak eller ingen signal. Kontroller også at eventuelle forsterkere eller antennemoduler er koblet til. Sammenlign det gamle og nye glasset: ser du antennetråder eller tilkoblingspunkter på begge? Bestill riktig glass hos oss med komplett utstyrsliste for bilmodellen.",
    keywords: ["antenne", "radio", "mobildekning", "mobil", "signal", "tilkobling", "integrert", "dårlig"]
  },
  {
    id: "feil-advarselslampe",
    category: "feilsoking",
    question: "ADAS-varsellampe lyser etter montering — hva nå?",
    answer: "ADAS-varsellampen betyr at kameraet eller sensoren bak frontruten er ukalibrert etter byttet. Kalibrering MÅ gjennomføres med riktig utstyr for at systemene skal fungere korrekt. Statisk kalibrering gjøres med kalibreringspanel, dynamisk kalibrering krever testkjøring etter produsentens prosedyre. Ikke lever bilen til kunden før kalibrering er verifisert. Sørg for at det monterte glasset har riktig kamerafeste og optisk kvalitet. Vi kan levere glass med korrekt ADAS-forberedelse for de fleste modeller.",
    keywords: ["ADAS", "varsellampe", "lampe", "kalibrering", "kamera", "frontrute", "feilkode", "advarsel"]
  },
  {
    id: "feil-riktig-glass",
    category: "feilsoking",
    question: "Hvordan sjekker jeg at jeg har riktig glass før montering?",
    answer: "Sammenlign eurocode, typekode og produsentmerke på det gamle og nye glasset. To glass kan se identiske ut, men ha ulikt utstyr som regnsensor, kamerabrakett, antenne eller HUD. Sjekk også fargenyansen — grønt, blått eller klart glass skal matche. Mål dimensjonene dersom du er i tvil. Bruk vår regnr-søk eller oppgi kjøretøyets merke, modell, år og utstyr ved bestilling, så finner vi eksakt riktig glass.",
    keywords: ["riktig", "glass", "eurocode", "typekode", "kontroll", "dimensjoner", "utstyr", "sjekk"]
  },
  {
    id: "feil-eldre-ersattning",
    category: "feilsoking",
    question: "Kan jeg bytte til annet glass på en eldre bil?",
    answer: "Aftermarket-glass passer ofte på eldre biler, men du må sjekke dimensjoner, tykkelse og eventuelt utstyr som antenne eller fargetoner. Noen eldre modeller har spesielle krav til kurvature eller kantprofil som ikke alle alternativer dekker. Sammenlign alltid det gamle glasset med det nye før montering. Pass på at tetningslist og klips passer til begge typer. Ta kontakt med oss med regnr eller kjøretøydata, så finner vi riktig eller tilsvarende glass.",
    keywords: ["eldre", "bil", "aftermarket", "erstatning", "dimensjoner", "kompatibilitet", "glassbytte"]
  },
  {
    id: "eurocode-dekoding",
    category: "teknisk",
    question: "Hvordan leser jeg en eurocode?",
    answer: "En eurocode er en standardisert kode som identifiserer et bilglass. Formatet varierer noe mellom produsenter, men typisk inneholder koden typekode, dimensjoner, produsentkode, utstyrskoder og E-merke. Ved å dele koden i deler kan du raskt se hvilken rute det gjelder, hvilke funksjoner den har, og hvilken produsent som har laget den.",
    keywords: ["eurocode", "dekoding", "lese", "kode", "tolke", "forstå"]
  },
  {
    id: "eurocode-typer",
    category: "teknisk",
    question: "Hva betyr type-kodene i eurocode?",
    answer: "Type-koden forteller hvilken posisjon glasset skal monteres i. F = frontrute, B = bakrute, DF = dør foran, DP = dør bak, DFF = dør foran fremre, DPF = dør foran bakre, SF = siderute foran, og V = ventilrute. Denne koden er alltid det første leddet i eurocoden og avgjør hvilken rute du skal bestille.",
    keywords: ["eurocode", "typekoder", "frontrute", "bakrute", "dørrute", "ventilrute", "typer"]
  },
  {
    id: "eurocode-utstyr",
    category: "teknisk",
    question: "Hva betyr utstyrskodene i eurocode?",
    answer: "Utstyrskodene beskriver funksjoner og utstyr på glasset. H = heated (varme), R = rain sensor (regnsensor), A = ADAS (kamerafunksjon), V = ventilated (ventilert), S = shade band (solskjerming), C = coated/solar (belegg), E = encapsulated (innkapslet list), T = tinted (tonet). Det er kritisk at du velger riktige koder for å unngå feilmontering på kundens bil.",
    keywords: ["eurocode", "utstyrskoder", "varme", "regnsensor", "ADAS", "tonet", "utstyr"]
  },
  {
    id: "eurocode-dimensjoner",
    category: "teknisk",
    question: "Hva forteller dimensjonskodene i eurocode?",
    answer: "Dimensjonsdelen av eurocoden angir glassets størrelse og form, vanligvis som en serie tall som representerer lengde, bredde og kurvatur. Kodene varierer mellom produsenter, men de sikrer at glasset passer nøyaktig i bilens åpning. Sjekk alltid dimensjonskoden mot bilens modell og årsmodell før du bestiller.",
    keywords: ["eurocode", "dimensjoner", "størrelse", "kurvatur", "passform", "mål"]
  },
  {
    id: "eurocode-produsent",
    category: "teknisk",
    question: "Hva er produsentkoder i eurocode?",
    answer: "Produsentkoden i eurocoden identifiserer hvilken leverandør som har produsert glasset. Hver produsent har egne koder, for eksempel Pilkington, Glavista, Saint-Gobain Sekurit, AGC og Euroglass. Ved å lese produsentkoden kan du raskt se om du holder et originalt OEM-glass eller et aftermarket-alternativ.",
    keywords: ["eurocode", "produsentkode", "Pilkington", "Saint-Gobain", "AGC", "produsent"]
  },
  {
    id: "eurocode-nags",
    category: "teknisk",
    question: "Hva er NAGS-koder?",
    answer: "NAGS står for National Auto Glass Specifications og er et amerikansk kodesystem for bilglass. I motsetning til eurocode bruker NAGS en 10-sifret numerisk kode. Systemet er utbredt i Nord-Amerika, men mindre vanlig i Europa. Dersom du mottar en NAGS-kode fra en kunde, kan vi hjelpe deg å konvertere den til riktig eurocode for bestilling.",
    keywords: ["NAGS", "National", "Auto", "Glass", "amerikansk", "kode", "konvertere"]
  },
  {
    id: "import-eu",
    category: "logistikk",
    question: "Hva koster import av glass fra EU?",
    answer: "Ingen toll på glass fra EU-land, da Norge er med i EØS. Du betaler 25 % moms som er fradragsberettiget for bedrifter. Glasset må ha E-merking for å være godkjent i EU. Vi hjelper deg med dokumentasjonen når du handler hos oss.",
    keywords: ["import", "EU", "toll", "moms", "E-merking", "EØS", "logistikk", "Europa", "importere"]
  },
  {
    id: "import-utlandet",
    category: "logistikk",
    question: "Hva må jeg vite ved import av glass fra Asia eller USA?",
    answer: "Glass fra Asia eller USA kan påløpe toll på 2–10 %. E-merking er påkrevd for EU-godkjenning. DOT-merket glass fra USA er ikke gyldig i EU. Kontakt oss før bestilling så sjekker vi at glasset oppfyller alle krav.",
    keywords: ["import", "Asia", "USA", "Amerika", "toll", "E-merking", "DOT", "logistikk", "utlandet", "importere"]
  },
  {
    id: "import-forsinkelse",
    category: "logistikk",
    question: "Hvorfor tar import fra Asia 4–6 uker?",
    answer: "Sjøfrakt tar 3–5 uker. Deretter kommer tollbehandling (1–2 uker) og terminalhåndtering. Samlet blir dette 4–6 uker. Planlegg derfor med god margin ved bestilling fra Asia.",
    keywords: ["import", "forsinkelse", "sjøfrakt", "toll", "Asia", "logistikk", "vente"]
  },
  {
    id: "import-oevregrense",
    category: "logistikk",
    question: "Er det et maksbeløp for import uten toll?",
    answer: "For bedrifter finnes det ingen maksbeløp for tollfri import. Privatpersoner har en grense på 3 500 kr. Som verksted betaler du toll på alle varer fra land utenfor EØS, men du får fradrag for mva.",
    keywords: ["import", "tollfri", "grense", "bedrift", "privat", "EØS", "maksbeløp"]
  },
  {
    id: "lagring-temperatur",
    category: "logistikk",
    question: "Hvilken temperatur skal bilglass lagres i?",
    answer: "Bilglass skal lagres mellom +5 °C og +25 °C. Unngå direkte sollys og høy luftfuktighet. Feil lagring kan føre til delaminering eller skader på coating.",
    keywords: ["lagring", "temperatur", "lager", "lagre", "oppbevare", "sollys", "fuktighet", "bilglass"]
  },
  {
    id: "lagring-staende-liggende",
    category: "logistikk",
    question: "Skal glass stå eller ligge på lageret?",
    answer: "Frontruter bør stå på høykant, ikke ligge flatt. Sideruter kan ligge flatt. Stående lagring reduserer risikoen for spenningssprekker og overflateskader.",
    keywords: ["lagring", "stående", "liggende", "lager", "lagre", "oppbevare", "frontrute", "bilglass"]
  },
  {
    id: "lagring-emballasje",
    category: "logistikk",
    question: "Hvilke emballasjekrav gjelder for bilglass?",
    answer: "Hver rute skal ligge i egen papp- eller treemballasje med hjørnebeskyttere. Ikke stakk mer enn fem glass i høyden. God emballasje forhindrer kantskader og brudd under lagring.",
    keywords: ["emballasje", "lagring", "lager", "lagre", "oppbevare", "hjørnebeskyttere", "papp", "tre", "bilglass"]
  },
  {
    id: "lagring-transport",
    category: "logistikk",
    question: "Hvordan sikrer jeg trygg transport av bilglass?",
    answer: "Bruk paller med hjørnebeskyttere. Ikke stakk over 1,5 meter i høyden. Sørg for at lasten er sikret med stropper. Unngå hard støt og vibrasjon under transporten.",
    keywords: ["transport", "pall", "lager", "lagre", "oppbevare", "stropper", "sikker", "hjørnebeskyttere", "bilglass"]
  },
  {
    id: "trend-lydglass",
    category: "teknisk",
    question: "Hva er lydsperrende bilglass?",
    answer: "Lydsperrende glass bruker en spesiell akustisk PVB-film (typisk 0,76 mm) mellom lagene. Det reduserer støy med 3–5 dB og gir mer komfort for sjåføren. Vi fører flere modeller med denne teknologien.",
    keywords: ["lydglass", "lydsperrende", "akustisk", "støy", "PVB", "film"]
  },
  {
    id: "trend-selvhelende",
    category: "teknisk",
    question: "Finnes det selvhelende bilglass?",
    answer: "Selvhelende glass finnes som konsept fra mobiltelefoner, men er praktisk talt ikke tilgjengelig for bilglass i dag. Små steinsprutreparasjoner er fortsatt beste løsning. Vi følger utviklingen tett.",
    keywords: ["selvhelende", "glass", "konsept", "reparasjon", "steinsprut"]
  },
  {
    id: "trend-panoramarute",
    category: "teknisk",
    question: "Hvilke spesielle hensyn gjelder for panoramatak?",
    answer: "Panoramatak er stort laminert glass, ofte med mørk solar coating. Mange har tynne, rammeløse design som krever nøyaktig passform og spesialverktøy for montering. Bestill riktig variant for kjøretøymodellen.",
    keywords: ["panoramatak", "panoramarute", "tak", "laminert", "solar"]
  },
  {
    id: "trend-elektrokromt",
    category: "teknisk",
    question: "Hva er elektrokromt glass?",
    answer: "Elektrokromt glass har elektrisk justerbar tint ved hjelp av SPD-teknologi. Det finnes som standard på noen Mercedes og Ferrari-modeller. Teknologien er fortsatt dyr og kompleks, men vi kan skaffe reservedeler ved behov.",
    keywords: ["elektrokromt", "justerbar", "tint", "SPD", "mørk", "lys"]
  },
];

/** Tokenize text into lowercase alphanumeric tokens, removing stop words */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\sæøåéäöü]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

/** Simple TF-IDF-like scoring */
function scoreArticle(query: string, article: FaqArticle): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  let score = 0;
  const allText = `${article.question} ${article.answer} ${article.keywords.join(' ')}`;
  const textTokens = tokenize(allText);

  for (const qt of queryTokens) {
    if (article.keywords.some(k => k.toLowerCase() === qt)) {
      score += 3;
      continue;
    }
    if (article.keywords.some(k => k.toLowerCase().includes(qt))) {
      score += 2;
      continue;
    }
    if (textTokens.some(t => t === qt)) {
      score += 1;
    } else if (textTokens.some(t => t.includes(qt) || qt.includes(t))) {
      score += 0.5;
    }
  }
  return score / queryTokens.length;
}

export function searchFaq(query: string): { article: FaqArticle; score: number } | null {
  if (!query || query.trim().length < 2) return null;
  let best: { article: FaqArticle; score: number } | null = null;
  for (const article of FAQ_ARTICLES) {
    const score = scoreArticle(query, article);
    if (score > (best?.score ?? 0)) best = { article, score };
  }
  if (best && best.score >= 0.3) return best;
  return null;
}

export function looksLikeKnowledgeQuestion(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const questionWords = [
    "hva", "hva er", "hvordan", "hvorfor", "når", "hvor", "hvilken",
    "hvem", "forklar", "forklaring", "forskjell", "forskjellen",
    "hva betyr", "hva koster", "hvor lang", "kan jeg", "får jeg",
    "trekker", "betyr", "er det", "trenger jeg", "må jeg",
    "what is", "how", "why", "when", "where", "which", "explain",
    "difference", "does", "can i", "do i need"
  ];
  if (questionWords.some(w => lower.startsWith(w) || lower.includes(" " + w + " "))) {
    return true;
  }
  const knowledgeKeywords = [
    "garanti", "reklamasjon", "retur", "bytte", "levering", "lager",
    "sporing", "tracking", "faktura", "ehf", "mva", "pris", "avtale",
    "rabatt", "kontakt", "telefon", "e-post", "leveringstid", "import",
    "oem", "aftermarket", "pilkington", "glavista", "euroglass",
    "eurocode", "e-code", "laminert", "herdet", "akustisk", "hud",
    "adas", "kalibrering", 
    "verksted", "grossist", "leverandør", "b2b", "ece", "montering",
    "primer", "tørketid", "pvb", "target-plate",
    "encapsulated", "solar", "coated", "steinsprut", "lekkasje",
    "vindstøy", "klips", "tetningslist", "pyntelist"
  ];
  const orderKeywords = [
    "bestill", "kjøp", "trenger", "mangler", "skal ha", "vil ha",
    "ny", "nytt", "ordre", "handlekurv", "kasse", "frontrute",
    "bakrute", "siderute", "dørrute", "ventilrute", "vindskjerm",
    "regnr", "vin", "merke", "modell", "år", "årsmodell"
  ];
  const hasKnowledgeKw = knowledgeKeywords.some(k => lower.includes(k));
  const hasOrderKw = orderKeywords.some(k => lower.includes(k));
  if (hasKnowledgeKw && !hasOrderKw) return true;
  return false;
}

const GREETINGS = [
  "hei", "hallo", "god dag", "god morgen", "god ettermiddag",
  "morn", "morna", "heisann", "yo", "halla", "hej", "hello", "hi",
  "heihei", "hallois", "morn", "god kveld",
];

export function isGreeting(message: string): boolean {
  const lower = message.toLowerCase().trim().replace(/[!?.]/g, "");
  const words = lower.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return false;
  if (words.length > 5) return false;
  for (const phrase of GREETINGS) {
    if (lower === phrase) return true;
    if (lower.startsWith(phrase + " ")) {
      const rest = lower.slice(phrase.length).trim();
      const fillerWords = new Set([...GREETINGS, "der", "autoglass", "professor", "tomar", "du", "jeg", "med", "deg"]);
      const restWords = rest.split(/\s+/).filter(w => w.length > 0);
      if (restWords.every(w => fillerWords.has(w) || w.length <= 2)) return true;
    }
  }
  const greetingWords = new Set([...GREETINGS, "der", "autoglass", "professor", "tomar", "du", "jeg", "med", "deg"]);
  return words.every(w => greetingWords.has(w) || w.length <= 2);
}

export function buildGreetingResponse(): string {
  return "Hei! Jeg er din AI-ordremottaker hos Autoglass AS. Jeg kan hjelpe deg med å finne riktig glass til din kunde (oppgi regnr, så går det raskest) eller svare på spørsmål om produkter, garanti, levering, OEM vs aftermarket, og mer. Hva trenger du hjelp med?";
}
