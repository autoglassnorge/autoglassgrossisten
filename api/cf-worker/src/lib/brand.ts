/**
 * Brand normalization and alias expansion.
 */

const BRAND_MAP: Record<string, string> = {
  VOLKSWAGEN: "VW",
  "VW TRUCKS": "VW",
  "MERCEDES-BENZ": "MERCEDES",
  "MERCEDES BENZ": "MERCEDES",
  "MERCEDES-AMG": "MERCEDES",
  "MERCEDES AMG": "MERCEDES",
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
  "FORD TRUCKS": "FORD",
  "TOYOTA TRUCKS": "TOYOTA",
  "PEUGEOT TRUCKS": "PEUGEOT",
  "CITROEN TRUCKS": "CITROEN",
  "MERCEDES TRUCKS": "MERCEDES",
  "VOLVO TRUCKS": "VOLVO",
  "AUDI TRUCKS": "AUDI",
  "BMW TRUCKS": "BMW",
  "NISSAN TRUCKS": "NISSAN",
  "FIAT TRUCKS": "FIAT",
  "RENAULT TRUCKS": "RENAULT",
  "MITSUBISHI TRUCKS": "MITSUBISHI",
  "MAZDA TRUCKS": "MAZDA",
  SCANIA: "SCANIA TRUCKS",
  DAF: "DAF",
  IVECO: "IVECO (FIAT) TRUCKS",
  HINO: "HINO TRUCKS",
  "ISUZU TRUCKS": "ISUZU",
};

/** Build reverse alias map once at module load */
const ALIAS_REVERSE = new Map<string, Set<string>>();
for (const [key, val] of Object.entries(BRAND_MAP)) {
  if (!ALIAS_REVERSE.has(val)) ALIAS_REVERSE.set(val, new Set());
  ALIAS_REVERSE.get(val)!.add(key);
  ALIAS_REVERSE.get(val)!.add(val);
}

export function normalizeBrand(brand: string): string {
  const b = brand.toUpperCase().trim();
  return BRAND_MAP[b] || b;
}

export function getBrandAliases(brand: string): string[] {
  const normalized = normalizeBrand(brand);
  const aliases = ALIAS_REVERSE.get(normalized);
  const result = aliases ? Array.from(aliases) : [normalized];
  // Mini models are stored under BMW in D1 glass_catalog — cross-search both brands
  if (normalized === "MINI" && !result.includes("BMW")) result.push("BMW");
  if (normalized === "BMW" && !result.includes("MINI")) result.push("MINI");
  // American brands consolidated under USA CARS in D1 — cross-search both
  const USA_CARS_BRANDS = ["CHEVROLET", "FORD", "JEEP", "CHRYSLER", "DODGE", "CADILLAC", "GMC", "HUMMER"];
  const rawUpper = brand.toUpperCase().trim();
  // Check BOTH normalized and raw brand against USA_CARS list (CHEVROLET normalizes to DAEWOO)
  if ((USA_CARS_BRANDS.includes(normalized) || USA_CARS_BRANDS.includes(rawUpper)) && !result.includes("USA CARS")) {
    result.push("USA CARS");
  }
  if (normalized === "USA CARS") {
    for (const b of USA_CARS_BRANDS) {
      if (!result.includes(b)) result.push(b);
    }
  }
  return result;
}
