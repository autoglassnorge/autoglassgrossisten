#!/usr/bin/env node
/**
 * Test equipment detection on sample descriptions
 */

const testCases = [
  { desc: "ALFA ROMEO GIULIA 2015; WS GN ACO CAMERA B", expected: { adas: false, camera: true, acoustic: true, heated: false, rainSensor: false } },
  { desc: "BMW 5 SERIES F10 2012;WS GN SOLAR HUD VIN", expected: { hud: true, shade: true, camera: false, heated: false } },
  { desc: "BMW X5 (F15) 5D SUV 2013; WS  CAMERA BRACK", expected: { camera: true, adas: false, shade: false } },
  { desc: "JAGUAR XK8 CONV 01-; WS GN HTD VIN 1P", expected: { heated: true, camera: false, shade: false } },
  { desc: "BMW 1 SERIES 3D/5D HBK (E81/E87) 10/2011 2", expected: { heated: false, camera: false, shade: false } },
  { desc: "FORD MONDEO 5D HBK/4D SAL/5D EST RHD 2014; WS GN ACO CAMERA", expected: { camera: true, acoustic: true, adas: false } },
  { desc: "VW TRANSPORTER T5 2010; WS GN RSN HTD", expected: { rainSensor: true, heated: true } },
  { desc: "VOLVO XC60 2018; WS GN SOLAR ACO CAMERA HUD", expected: { shade: true, acoustic: true, camera: true, hud: true } },
  { desc: "OPEL ZAFIRA MPV FROM VIN 32071251 98-;BL D", expected: { heated: false, camera: false } },
  { desc: "MERCEDES C-CLASS W205 2015; WS GN ACO CAMERA ADAS", expected: { camera: true, acoustic: true, adas: true } },
];

function detectFlags(description) {
  if (!description) {
    return { adas: false, rainSensor: false, heated: false, acoustic: false, antenna: false, camera: false, hud: false, shade: false };
  }
  const tokens = description.toUpperCase().split(/[\s;,.\[\]()]+/).filter(t => t.length >= 2);
  const s = new Set(tokens);
  return {
    adas: s.has("ADAS") || s.has("FILSKIFTE") || /\bLANE\s+ASSIST\b|\bLANE\s+DEPARTURE\b|\bCOLLISION\b|\bAUTO\s+BRAKE\b|\bEMERGENCY\s+BRAKE\b|\bDRIVE\s+ASSIST\b|\bPRO\s+PILOT\b|\bAUTOPILOT\b|\bTRAFFIC\s+ASSIST\b/.test(description.toUpperCase()),
    rainSensor: s.has("RSN") || s.has("RSNL") || s.has("RSNLSN") || /\bRAIN\b|\bREGNSENSOR\b|\bAUTOMATIC\s+WIPER\b/.test(description.toUpperCase()),
    heated: s.has("HTD") || s.has("HT") || s.has("UHTD") || /\bHEATED\b|\bOPPVARM\b|\bVARME\b|\bDEFROST\b|\bDEFOG\b|\bEL[\s-]?VARME\b|\bHEATING\b/.test(description.toUpperCase()),
    acoustic: s.has("ACO") || /\bACOUSTIC\b|\bAKUSTIK\b|\bQUIET\b|\bST[ØO]YDEMP\b|\bSILENT\b/.test(description.toUpperCase()),
    antenna: s.has("ANT") || /\bANTENNA\b|\bANTENNE\b|\bGPS\b|\bRADIO\b|\bFM\b|\bDAB\b|\bAERIAL\b/.test(description.toUpperCase()),
    camera: s.has("CAMERA") || s.has("CAM") || /\bKAMERA\b|\bSENSOR\b|\bBACKUP\b|\bREVERSING\b|\b360\b|\bFRONT\s+CAM\b|\bREAR\s+CAM\b/.test(description.toUpperCase()),
    hud: s.has("HUD") || /\bHEAD\s*UP\b|\bHEADUP\b|\bPROJEKSJON\b|\bPROJECTION\b|\bWINDSHIELD\s+DISPLAY\b/.test(description.toUpperCase()),
    shade: s.has("SOLAR") || s.has("SOL") || s.has("SOLA") ||
           s.has("PRIVACY") || s.has("PRIV") || s.has("PRIVA") || s.has("PRIVAC") ||
           s.has("DARK") || s.has("TOP") || s.has("TINT") ||
           s.has("COATED") || s.has("HMSL"),
  };
}

function detectCategory(description) {
  if (!description) return null;
  const d = description.toUpperCase();
  const TYPE_TO_CATEGORY = {
    "WS": "frontrute", "FD": "dørglass", "RD": "dørglass",
    "LFD": "dørglass", "RFD": "dørglass", "LRD": "dørglass", "RRD": "dørglass",
    "LRQ": "sideglass", "RRQ": "sideglass", "LFQ": "sideglass", "RFQ": "sideglass",
    "LRV": "sideglass", "RRV": "sideglass", "LFV": "sideglass", "RFV": "sideglass",
    "RR": "bakrute",
  };
  // First try to find type code after semicolon (Pilkington format)
  const afterSemi = d.match(/;\s*([A-Z]{1,4})\s/);
  if (afterSemi) {
    const code = afterSemi[1].trim();
    if (TYPE_TO_CATEGORY[code]) return TYPE_TO_CATEGORY[code];
  }
  // Fallback: type code at start
  const atStart = d.match(/^([A-Z]{1,4})\s/);
  if (atStart) {
    const code = atStart[1].trim();
    if (TYPE_TO_CATEGORY[code]) return TYPE_TO_CATEGORY[code];
  }
  return null;
}

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const flags = detectFlags(tc.desc);
  const cat = detectCategory(tc.desc);
  let errors = [];
  
  for (const [key, expected] of Object.entries(tc.expected)) {
    if (flags[key] !== expected) {
      errors.push(`  ${key}: got=${flags[key]}, expected=${expected}`);
    }
  }
  
  if (errors.length === 0) {
    console.log(`✅ ${tc.desc.slice(0, 50)}... [cat=${cat}]`);
    passed++;
  } else {
    console.log(`❌ ${tc.desc.slice(0, 50)}...`);
    errors.forEach(e => console.log(e));
    failed++;
  }
}

console.log(`\n📊 Results: ${passed}/${testCases.length} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
