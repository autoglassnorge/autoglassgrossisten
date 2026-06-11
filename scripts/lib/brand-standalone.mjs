/**
 * Brand normalization and alias expansion.
 */

const BRAND_MAP = {
  VOLKSWAGEN: "VW",
  "VW TRUCKS": "VW",
  "MERCEDES-BENZ": "MERCEDES",
  "MERCEDES BENZ": "MERCEDES",
  "LAND ROVER": "LANDROVER",
  "ROLLS ROYCE": "ROLLS ROYCE",
  VAUXHALL: "OPEL",
  "VAUXHALL/OPEL": "OPEL",
  "OPEL/VAUXHALL": "OPEL",
  CITROËN: "CITROEN",
  DS: "CITROEN",
  ALFA: "ALFA ROMEO",
  ABARTH: "FIAT",
  "LAMBORGH.": "LAMBORGHINI",
  "MITS.": "MITSUBISHI",
  MITS: "MITSUBISHI",
  NISS: "NISSAN",
  NISSA: "NISSAN",
  HON: "HONDA",
  TOY: "TOYOTA",
  TOYOT: "TOYOTA",
  REN: "RENAULT",
  "REN.": "RENAULT",
  RENAU: "RENAULT",
  HYUNADI: "HYUNDAI",
  "HYUN.": "HYUNDAI",
  PEUG: "PEUGEOT",
  PEUGE: "PEUGEOT",
  CHEV: "CHEVROLET",
  CHEVR: "CHEVROLET",
  "CHEVR.": "CHEVROLET",
  CHEVROLET: "DAEWOO (CHEVROLET)",
  DAEWOO: "DAEWOO (CHEVROLET)",
  SUZ: "SUZUKI",
  FOR: "FORD",
  "FORD,": "FORD",
  FORDA: "FORD",
  "KIA.": "KIA",
  "SUB.": "SUBARU",
  "MAZ.": "MAZDA",
  "MAZDA.": "MAZDA",
  "LEX.": "LEXUS",
  JAG: "JAGUAR",
  POR: "PORSCHE",
  PORSCH: "PORSCHE",
  "AUDI.": "AUDI",
  "BMW.": "BMW",
  "MERC.": "MERCEDES",
  MERC: "MERCEDES",
  MERCE: "MERCEDES",
  "VOLVO.": "VOLVO",
  "SEAT.": "SEAT",
  "SKODA.": "SKODA",
  "MINI.": "MINI",
  "SAAB.": "SAAB",
  "DODGE.": "DODGE",
  CHRY: "CHRYSLER",
  CHRSYLER: "CHRYSLER",
  HUM: "HUMMER",
  PONT: "PONTIAC",
  "JEEP.": "JEEP",
  CAD: "CADILLAC",
  "LINCOLN.": "LINCOLN",
  "BUICK.": "BUICK",
  "GMC,": "GMC",
  GMC: "GMC",
  "HOLDEN.": "HOLDEN",
  HOLDE: "HOLDEN",
  "ISUZU.": "ISUZU",
  "DAIHATSU.": "DAIHATSU",
  LADA: "LADA / TOGLIATTI",
  ZASTAVA: "LADA / TOGLIATTI",
  "DACIA.": "DACIA",
  "LADA / TOGLIATTI": "LADA / TOGLIATTI",
  SSANYONG: "SSANGYONG",
  "SSAN.": "SSANGYONG",
  "SMART.": "SMART",
  "TESLA.": "TESLA",
  "FERRARI.": "FERRARI",
  "MASERATI.": "MASERATI",
  "LAMBORGHINI.": "LAMBORGHINI",
  "BENTLEY.": "BENTLEY",
  ASTON: "ASTON MARTIN",
  "LOTUS.": "LOTUS",
  "MG.": "MG",
  "ROVER.": "ROVER",
  "MC LAREN": "McLAREN",
  MCLAREN: "McLAREN",
  "INEOS.": "INEOS",
  "MAXUS.": "MAXUS",
  "POLESTAR.": "POLESTAR",
  "CUPRA.": "CUPRA",
  "HONGQI.": "HONGQI",
  "VOYAH.": "VOYAH",
  "XPENG.": "XPENG",
  "ZEEKR.": "ZEEKR",
  "BYD.": "BYD",
  "ORA.": "ORA",
  "NIO.": "NIO",
  "THINK.": "THINK",
  "FISKER.": "FISKER",
  RIVIAN: "USA CARS",
  LUCID: "USA CARS",
  "TVR.": "TVR",
  TVR: "TVR",
  "JC INDIGO": "JC INDIGO",
  KEWET: "KEWET",
  AIXAM: "AIXAM",
  AIWAYS: "AIWAYS",
  "DFSK (SERES)": "DFSK (SERES)",
  DONGFENG: "DONGFENG",
  EXLANTIX: "EXLANTIX",
  "JAC (CH)": "JAC (CH)",
  "LYNK & CO": "LYNK & CO",
  MAN: "MAN",
  SCANIA: "SCANIA TRUCKS",
  DAF: "DAF",
  IVECO: "IVECO (FIAT) TRUCKS",
  HINO: "HINO TRUCKS",
  "ISUZU TRUCKS": "ISUZU",
};

/** Build reverse alias map once at module load */
const ALIAS_REVERSE = new Map();
for (const [key, val] of Object.entries(BRAND_MAP)) {
  if (!ALIAS_REVERSE.has(val)) ALIAS_REVERSE.set(val, new Set());
  ALIAS_REVERSE.get(val).add(key);
  ALIAS_REVERSE.get(val).add(val);
}

/**
 * @param {string} brand
 * @returns {string}
 */
export function normalizeBrand(brand) {
  const b = brand.toUpperCase().trim();
  return BRAND_MAP[b] || b;
}

/**
 * @param {string} brand
 * @returns {string[]}
 */
export function getBrandAliases(brand) {
  const normalized = normalizeBrand(brand);
  const aliases = ALIAS_REVERSE.get(normalized);
  return aliases ? Array.from(aliases) : [normalized];
}
