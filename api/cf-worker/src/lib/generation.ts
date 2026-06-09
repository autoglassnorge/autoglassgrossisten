/**
 * Generation parsing and inference from descriptions / year ranges.
 */

export function parseYearRangeFromDescription(desc: string | null): { from: number | null; to: number | null } {
  if (!desc) return { from: null, to: null };
  const d = desc;

  // Pattern 1: "2015-2019;" or "2015-2019 " or "2015 - 2019"
  const m1 = d.match(/(?:^|\s|\()(\d{4})\s*[-–]\s*(\d{4})\s*[;\)\s]/);
  if (m1) {
    return { from: parseInt(m1[1], 10), to: parseInt(m1[2], 10) };
  }

  // Pattern 2: "T3 79-91" or "90-03" (2-digit years)
  const m2 = d.match(/(?:^|\s|\()(\d{2})\s*[-–]\s*(\d{2})\s*[;\)\s]/);
  if (m2) {
    let from = parseInt(m2[1], 10);
    let to = parseInt(m2[2], 10);
    if (from < 50) from += 2000; else from += 1900;
    if (to < 50) to += 2000; else to += 1900;
    return { from, to };
  }

  // Pattern 3: "2009-" or "2015- " (open-ended)
  const m3 = d.match(/(?:^|\s|\()(\d{4})\s*[-–]\s*[;\)\s]/);
  if (m3) {
    return { from: parseInt(m3[1], 10), to: null };
  }

  // Pattern 4: "2015;" or " 2016 " or "(2017)"
  const m4 = d.match(/(?:^|\s|\()(19\d{2}|20\d{2})(?:\s*[;\)\s]|$)/);
  if (m4) {
    return { from: parseInt(m4[1], 10), to: null };
  }

  return { from: null, to: null };
}

export function parseGenerationFromDescription(desc: string | null): string | null {
  if (!desc) return null;
  const d = desc.toLowerCase();

  // VW Golf: GOLF I-VIII (before T-check, more specific)
  const vwGolf = desc.match(/\bGOLF\s+([IVX]+)\b/i);
  if (vwGolf) {
    const roman = vwGolf[1].toUpperCase();
    const map: Record<string, string> = { I: "Mk1", II: "Mk2", III: "Mk3", IV: "Mk4", V: "Mk5", VI: "Mk6", VII: "Mk7", VIII: "Mk8" };
    if (map[roman]) return map[roman];
  }
  // VW: T1-T6 (Transporter)
  const vw = desc.match(/\b(T[1-6])\b/i);
  if (vw) return vw[1].toUpperCase();

  // BMW 3-series: E30, E36, E46, E90, F30, G20
  const bmw3 = desc.match(/\b(E30|E36|E46|E90|F30|G20)\b/i);
  if (bmw3 && d.includes("bmw") && (d.includes("3") || d.includes("tre"))) return bmw3[1].toUpperCase();
  // BMW 5-series: E34, E39, E60, F10, G30
  const bmw5 = desc.match(/\b(E34|E39|E60|F10|G30)\b/i);
  if (bmw5 && d.includes("bmw") && (d.includes("5") || d.includes("fem"))) return bmw5[1].toUpperCase();
  // BMW 1-series: E87, F20, F40
  const bmw1 = desc.match(/\b(E87|F20|F40)\b/i);
  if (bmw1 && d.includes("bmw") && (d.includes("1") || d.includes("en"))) return bmw1[1].toUpperCase();
  // BMW X-series: E53, E70, E71, F15, F16, G01, G02, G05, G06, G07
  const bmwX = desc.match(/\b(E53|E70|E71|F15|F16|G01|G02|G05|G06|G07)\b/i);
  if (bmwX && d.includes("bmw")) return bmwX[1].toUpperCase();
  // BMW 7-series: E32, E38, E65, F01, F02, G11, G12
  const bmw7 = desc.match(/\b(E32|E38|E65|F01|F02|G11|G12)\b/i);
  if (bmw7 && d.includes("bmw") && (d.includes("7") || d.includes("syv"))) return bmw7[1].toUpperCase();

  // Mercedes C-Class: W201, W202, W203, W204, W205, W206
  const mercC = desc.match(/\b(W20[1-6])\b/i);
  if (mercC && d.includes("mercedes") && (d.includes("c") || d.includes("190"))) return mercC[1].toUpperCase();
  // Mercedes E-Class: W124, W210, W211, W212, W213
  const mercE = desc.match(/\b(W124|W21[0-3])\b/i);
  if (mercE && d.includes("mercedes") && (d.includes("e") || d.includes("klasse"))) return mercE[1].toUpperCase();
  // Mercedes A-Class: W168, W169, W176, W177
  const mercA = desc.match(/\b(W1[67][689])\b/i);
  if (mercA && d.includes("mercedes") && d.includes("a")) return mercA[1].toUpperCase();
  // Mercedes S-Class: W116, W126, W140, W220, W221, W222, W223
  const mercS = desc.match(/\b(W116|W126|W140|W22[0-3])\b/i);
  if (mercS && d.includes("mercedes") && (d.includes("s") || d.includes("sel"))) return mercS[1].toUpperCase();

  // Audi A3: 8L, 8P, 8V, 8Y
  const audiA3 = desc.match(/\b(8[LPVY])\b/i);
  if (audiA3 && d.includes("audi") && d.includes("3")) return audiA3[1].toUpperCase();
  // Audi A4: B5, B6, B7, B8, B9
  const audiA4 = desc.match(/\b(B[5-9])\b/i);
  if (audiA4 && d.includes("audi") && d.includes("4")) return audiA4[1].toUpperCase();
  // Audi A6: C4, C5, C6, C7, C8
  const audiA6 = desc.match(/\b(C[4-8])\b/i);
  if (audiA6 && d.includes("audi") && d.includes("6")) return audiA6[1].toUpperCase();

  // Ford Focus: MK1-MK4
  const fordFocus = desc.match(/\b(MK\s*[1-4])\b/i);
  if (fordFocus && d.includes("ford") && d.includes("focus")) return fordFocus[1].toUpperCase().replace(/\s/g, "");
  // Ford Fiesta: MK5-MK8
  const fordFiesta = desc.match(/\b(MK\s*[5-8])\b/i);
  if (fordFiesta && d.includes("ford") && d.includes("fiesta")) return fordFiesta[1].toUpperCase().replace(/\s/g, "");
  // Ford Mondeo: MK1-MK5
  const fordMondeo = desc.match(/\b(MK\s*[1-5])\b/i);
  if (fordMondeo && d.includes("ford") && d.includes("mondeo")) return fordMondeo[1].toUpperCase().replace(/\s/g, "");

  // Volvo V70: P80, P2, P3
  const volvoV70 = desc.match(/\b(P80|P2|P3)\b/i);
  if (volvoV70 && d.includes("volvo") && d.includes("70")) return volvoV70[1].toUpperCase();
  // Volvo XC60/XC90: P2, P3, SPA
  const volvoXC = desc.match(/\b(P2|P3|SPA)\b/i);
  if (volvoXC && d.includes("volvo") && (d.includes("xc") || d.includes("60") || d.includes("90"))) return volvoXC[1].toUpperCase();
  // Volvo S60/V60: P2, P3, SPA
  const volvoS60 = desc.match(/\b(P2|P3|SPA)\b/i);
  if (volvoS60 && d.includes("volvo") && d.includes("60")) return volvoS60[1].toUpperCase();

  // Nissan Qashqai: J10, J11, J12
  const nissanQ = desc.match(/\b(J1[0-2])\b/i);
  if (nissanQ && d.includes("nissan") && d.includes("qashqai")) return nissanQ[1].toUpperCase();
  // Nissan Micra: K10-K14
  const nissanMicra = desc.match(/\b(K1[0-4])\b/i);
  if (nissanMicra && d.includes("nissan") && d.includes("micra")) return nissanMicra[1].toUpperCase();
  // Nissan X-Trail: T30-T33
  const nissanX = desc.match(/\b(T3[0-3])\b/i);
  if (nissanX && d.includes("nissan") && d.includes("x-trail")) return nissanX[1].toUpperCase();

  // Mazda 3: BK, BL, BM, BP
  const mazda3 = desc.match(/\b(BK|BL|BM|BP)\b/i);
  if (mazda3 && d.includes("mazda") && d.includes("3")) return mazda3[1].toUpperCase();

  // Skoda Octavia: 1U, 1Z, 5E, NX
  const skodaOct = desc.match(/\b(1U|1Z|5E|NX)\b/i);
  if (skodaOct && d.includes("skoda") && d.includes("octavia")) return skodaOct[1].toUpperCase();

  // Seat Leon: 1M, 1P, 5F, KL
  const seatLeon = desc.match(/\b(1M|1P|5F|KL)\b/i);
  if (seatLeon && d.includes("seat") && d.includes("leon")) return seatLeon[1].toUpperCase();

  // Honda Civic: EU, FL, FN, FK, FB
  const hondaCivic = desc.match(/\b(EU|FL|FN|FK|FB)\b/i);
  if (hondaCivic && d.includes("honda") && d.includes("civic")) return hondaCivic[1].toUpperCase();

  // Hyundai i30: FD, GD, PD
  const hyundaiI30 = desc.match(/\b(FD|GD|PD)\b/i);
  if (hyundaiI30 && d.includes("hyundai") && d.includes("i30")) return hyundaiI30[1].toUpperCase();

  // Generic: MK I, MK II, GENERATION 1
  const generic = desc.match(/\b(MK\s*[IVX]+|SERIES\s+[A-Z]\d*|GENERATION\s+\d+)\b/i);
  if (generic) return generic[1].toUpperCase();
  return null;
}

export function expectedGeneration(brand: string, model: string, year: number): string | null {
  const key = `${brand} ${model}`.toLowerCase();
  // VW Transporter generations
  const isVw = key.includes("volkswagen") || key.includes("vw");
  const isVwTFamily =
    key.includes("transporter") ||
    key.includes("caravelle") ||
    key.includes("multivan") ||
    key.includes("california");
  if (isVw && isVwTFamily) {
    if (year <= 1991) return "T3";
    if (year <= 2002) return "T4";
    if (year <= 2015) return "T5";
    return "T6";
  }
  // BMW 3-series generations
  if (key.includes("bmw") && (key.includes("3") || key.includes("tre"))) {
    if (year <= 1990) return "E30";
    if (year <= 2000) return "E36";
    if (year <= 2006) return "E46";
    if (year <= 2012) return "E90";
    if (year <= 2018) return "F30";
    return "G20";
  }
  // BMW 5-series
  if (key.includes("bmw") && (key.includes("5") || key.includes("fem"))) {
    if (year <= 1995) return "E34";
    if (year <= 2003) return "E39";
    if (year <= 2010) return "E60";
    if (year <= 2016) return "F10";
    return "G30";
  }
  // Mercedes C-Class
  if (key.includes("mercedes") && (key.includes("c") || key.includes("190"))) {
    if (year <= 1993) return "W201";
    if (year <= 2000) return "W202";
    if (year <= 2007) return "W203";
    if (year <= 2014) return "W204";
    if (year <= 2021) return "W205";
    return "W206";
  }
  // Mercedes E-Class
  if (key.includes("mercedes") && (key.includes("e") || key.includes("klasse"))) {
    if (year <= 1995) return "W124";
    if (year <= 2002) return "W210";
    if (year <= 2009) return "W211";
    if (year <= 2016) return "W212";
    return "W213";
  }
  // Audi A3
  if (key.includes("audi") && key.includes("3")) {
    if (year <= 2003) return "8L";
    if (year <= 2012) return "8P";
    if (year <= 2020) return "8V";
    return "8Y";
  }
  // Audi A4
  if (key.includes("audi") && key.includes("4")) {
    if (year <= 2000) return "B5";
    if (year <= 2004) return "B6";
    if (year <= 2008) return "B7";
    if (year <= 2015) return "B8";
    return "B9";
  }
  // Volvo V70
  if (key.includes("volvo") && key.includes("70")) {
    if (year <= 2000) return "P80";
    if (year <= 2007) return "P2";
    return "P3";
  }
  // Volvo XC60
  if (key.includes("volvo") && key.includes("xc60")) {
    if (year <= 2017) return "P3";
    return "SPA";
  }
  // Volvo XC90
  if (key.includes("volvo") && key.includes("xc90")) {
    if (year <= 2014) return "P2";
    return "SPA";
  }
  // Ford Focus
  if (key.includes("ford") && key.includes("focus")) {
    if (year <= 2004) return "Mk1";
    if (year <= 2010) return "Mk2";
    if (year <= 2018) return "Mk3";
    return "Mk4";
  }
  // Nissan Qashqai
  if (key.includes("nissan") && key.includes("qashqai")) {
    if (year <= 2013) return "J10";
    if (year <= 2021) return "J11";
    return "J12";
  }
  // Mazda 3
  if (key.includes("mazda") && key.includes("3")) {
    if (year <= 2008) return "BK";
    if (year <= 2013) return "BL";
    if (year <= 2018) return "BM";
    return "BP";
  }
  // Skoda Octavia
  if (key.includes("skoda") && key.includes("octavia")) {
    if (year <= 2004) return "1U";
    if (year <= 2012) return "1Z";
    if (year <= 2020) return "5E";
    return "NX";
  }
  // VW Golf
  if (key.includes("volkswagen") && key.includes("golf")) {
    if (year <= 1991) return "Mk1";
    if (year <= 1997) return "Mk2";
    if (year <= 2003) return "Mk3";
    if (year <= 2008) return "Mk4";
    if (year <= 2012) return "Mk5";
    if (year <= 2019) return "Mk6/Mk7";
    return "Mk8";
  }
  // VW Polo
  if (key.includes("volkswagen") && key.includes("polo")) {
    if (year <= 1994) return "86C";
    if (year <= 1999) return "6N";
    if (year <= 2001) return "6N2";
    if (year <= 2005) return "9N";
    if (year <= 2009) return "9N3";
    if (year <= 2017) return "6R/6C";
    return "AW";
  }
  // VW Passat
  if (key.includes("volkswagen") && key.includes("passat")) {
    if (year <= 1980) return "B1";
    if (year <= 1988) return "B2";
    if (year <= 1993) return "B3";
    if (year <= 1996) return "B4";
    if (year <= 2000) return "B5";
    if (year <= 2005) return "B5.5";
    if (year <= 2010) return "B6";
    if (year <= 2014) return "B7";
    return "B8";
  }
  // Toyota Corolla
  if (key.includes("toyota") && key.includes("corolla")) {
    if (year <= 1983) return "E30";
    if (year <= 1987) return "E80";
    if (year <= 1991) return "E90";
    if (year <= 1997) return "E100";
    if (year <= 2000) return "E110";
    if (year <= 2006) return "E120";
    if (year <= 2013) return "E140";
    if (year <= 2018) return "E170";
    return "E210";
  }
  // Toyota Yaris
  if (key.includes("toyota") && key.includes("yaris")) {
    if (year <= 2005) return "P1";
    if (year <= 2011) return "P9";
    if (year <= 2020) return "XP13";
    return "XP21";
  }
  // Toyota Avensis
  if (key.includes("toyota") && key.includes("avensis")) {
    if (year <= 2003) return "T220";
    if (year <= 2009) return "T250";
    if (year <= 2018) return "T270";
    return null;
  }
  // Ford Mondeo
  if (key.includes("ford") && key.includes("mondeo")) {
    if (year <= 1996) return "Mk1";
    if (year <= 2000) return "Mk2";
    if (year <= 2007) return "Mk3";
    if (year <= 2014) return "Mk4";
    return "Mk5";
  }
  // Ford Fiesta
  if (key.includes("ford") && key.includes("fiesta")) {
    if (year <= 1983) return "Mk1";
    if (year <= 1989) return "Mk2";
    if (year <= 1995) return "Mk3";
    if (year <= 1999) return "Mk4";
    if (year <= 2002) return "Mk5";
    if (year <= 2008) return "Mk6";
    if (year <= 2017) return "Mk7";
    return "Mk8";
  }
  // Opel Astra
  if (key.includes("opel") && key.includes("astra")) {
    if (year <= 1991) return "F";
    if (year <= 1998) return "G";
    if (year <= 2004) return "H";
    if (year <= 2009) return "J";
    if (year <= 2021) return "K";
    return "L";
  }
  // Opel Corsa
  if (key.includes("opel") && key.includes("corsa")) {
    if (year <= 1993) return "A";
    if (year <= 2000) return "B";
    if (year <= 2006) return "C";
    if (year <= 2014) return "D";
    if (year <= 2019) return "E";
    return "F";
  }
  // Renault Clio
  if (key.includes("renault") && key.includes("clio")) {
    if (year <= 1998) return "I";
    if (year <= 2005) return "II";
    if (year <= 2012) return "III";
    if (year <= 2019) return "IV";
    return "V";
  }
  // Renault Megane
  if (key.includes("renault") && key.includes("megane")) {
    if (year <= 2002) return "I";
    if (year <= 2008) return "II";
    if (year <= 2015) return "III";
    if (year <= 2021) return "IV";
    return "V";
  }
  // Peugeot 307
  if (key.includes("peugeot") && key.includes("307")) {
    if (year <= 2008) return "307";
    return null;
  }
  // Peugeot 308
  if (key.includes("peugeot") && key.includes("308")) {
    if (year <= 2013) return "T7";
    if (year <= 2021) return "T9";
    return "P5";
  }
  // Peugeot 208
  if (key.includes("peugeot") && key.includes("208")) {
    if (year <= 2019) return "I";
    return "II";
  }
  // Honda Civic
  if (key.includes("honda") && key.includes("civic")) {
    if (year <= 1983) return "SB/SA";
    if (year <= 1987) return "AG/AH";
    if (year <= 1991) return "EC/ED/EE/EF";
    if (year <= 1995) return "EG/EH/EJ";
    if (year <= 2000) return "EK";
    if (year <= 2005) return "EP/EU/EM";
    if (year <= 2011) return "FN/FK";
    if (year <= 2016) return "FB/FG";
    return "FK/FL";
  }
  // Honda CR-V
  if (key.includes("honda") && key.includes("cr-v")) {
    if (year <= 2001) return "RD";
    if (year <= 2006) return "RD4";
    if (year <= 2012) return "RE";
    if (year <= 2016) return "RM";
    return "RW";
  }
  // Citroen C4
  if (key.includes("citroen") && key.includes("c4")) {
    if (year <= 2010) return "I";
    if (year <= 2020) return "II";
    return "III";
  }
  // Citroen C3
  if (key.includes("citroen") && key.includes("c3")) {
    if (year <= 2009) return "I";
    if (year <= 2016) return "II";
    return "III";
  }
  // Hyundai i30
  if (key.includes("hyundai") && key.includes("i30")) {
    if (year <= 2011) return "FD";
    if (year <= 2017) return "GD";
    if (year <= 2023) return "PD";
    return "BN7";
  }
  // Hyundai i20
  if (key.includes("hyundai") && key.includes("i20")) {
    if (year <= 2014) return "PB";
    if (year <= 2020) return "GB";
    return "BC3";
  }
  // Nissan Micra
  if (key.includes("nissan") && key.includes("micra")) {
    if (year <= 1992) return "K10";
    if (year <= 2002) return "K11";
    if (year <= 2010) return "K12";
    if (year <= 2016) return "K13";
    return "K14";
  }
  // Nissan X-Trail
  if (key.includes("nissan") && key.includes("x-trail")) {
    if (year <= 2007) return "T30";
    if (year <= 2013) return "T31";
    if (year <= 2021) return "T32";
    return "T33";
  }
  // Skoda Fabia
  if (key.includes("skoda") && key.includes("fabia")) {
    if (year <= 2007) return "6Y";
    if (year <= 2014) return "5J";
    if (year <= 2021) return "NJ";
    return "PJ";
  }
  // Seat Leon
  if (key.includes("seat") && key.includes("leon")) {
    if (year <= 2005) return "1M";
    if (year <= 2012) return "1P";
    if (year <= 2020) return "5F";
    return "KL";
  }
  // Mercedes A-Class
  if (key.includes("mercedes") && key.includes("a")) {
    if (year <= 1997) return "W168";
    if (year <= 2012) return "W169";
    if (year <= 2018) return "W176";
    return "W177";
  }
  // BMW 1-series
  if (key.includes("bmw") && (key.includes("1") || key.includes("en"))) {
    if (year <= 2011) return "E87";
    if (year <= 2019) return "F20";
    return "F40";
  }
  // Audi A6
  if (key.includes("audi") && key.includes("6")) {
    if (year <= 1997) return "C4";
    if (year <= 2004) return "C5";
    if (year <= 2011) return "C6";
    if (year <= 2018) return "C7";
    return "C8";
  }
  // Volvo S60/V60
  if (key.includes("volvo") && key.includes("60")) {
    if (year <= 2009) return "P2";
    if (year <= 2018) return "P3";
    return "SPA";
  }
  return null;
}

export function inferGenerationFromYearRange(brand: string, model: string, from: number, to: number): string | null {
  const key = `${brand} ${model}`.toLowerCase();
  if (key.includes("volkswagen") && key.includes("transporter")) {
    if (to <= 1991) return "T3";
    if (from >= 1990 && to <= 2003) return "T4";
    if (from >= 2003 && to <= 2015) return "T5";
    if (from >= 2015) return "T6";
  }
  if (key.includes("bmw") && (key.includes("3") || key.includes("tre"))) {
    if (to <= 1990) return "E30";
    if (from >= 1990 && to <= 2000) return "E36";
    if (from >= 1998 && to <= 2006) return "E46";
    if (from >= 2005 && to <= 2012) return "E90";
    if (from >= 2011 && to <= 2018) return "F30";
    if (from >= 2018) return "G20";
  }
  if (key.includes("mercedes") && (key.includes("c") || key.includes("190"))) {
    if (to <= 1993) return "W201";
    if (from >= 1993 && to <= 2000) return "W202";
    if (from >= 2000 && to <= 2007) return "W203";
    if (from >= 2007 && to <= 2014) return "W204";
    if (from >= 2014 && to <= 2021) return "W205";
    if (from >= 2021) return "W206";
  }
  return null;
}
