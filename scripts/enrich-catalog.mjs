#!/usr/bin/env node
/**
 * Enrich catalog-prod.json with better category & equipment detection
 * ===================================================================
 * Pilkington codes in descriptions:
 *   WS = Windshield → frontrute
 *   RD/FD/LRD/RRD/LFD/RFD = Door glass → dørglass
 *   LRQ/RRQ/LFQ/RFQ/RQ = Quarter glass → sideglass
 *   LRV/RRV/LFV/RFV/FV = Vent glass → sideglass
 *   RR = Rear window → bakrute
 *   GN/BL/GY/CL = Tint colors
 *   SOLAR = Solar control
 *   ACO = Acoustic
 *   HTD = Heated
 *   RSN/RSNLSN = Rain sensor
 *   ANT = Antenna
 *   CAMERA/CAM = Camera/ADAS
 *   HUD = Head-up display
 *   VIN = VIN etched
 *   HWARE = Hardware included
 *   MOULDING = Moulding included
 *   ENCAP = Encapsulated
 *   RHD = Right Hand Drive
 *
 * This script reads catalog-prod.json and produces catalog-prod-enriched.json
 */

import * as fs from "fs";
import * as path from "path";

const INPUT = path.join(process.cwd(), "data", "catalog-prod.json");
const OUTPUT = path.join(process.cwd(), "data", "catalog-prod-enriched.json");

/** Map Pilkington glass type codes to our categories */
const TYPE_TO_CATEGORY = {
  "WS": "frontrute",
  "WINDSHIELD": "frontrute",
  "WSH": "frontrute",
  // Door glasses
  "FD": "dørglass",
  "RD": "dørglass",
  "LFD": "dørglass",
  "RFD": "dørglass",
  "LRD": "dørglass",
  "RRD": "dørglass",
  "DOOR": "dørglass",
  // Quarter / vent glasses
  "LRQ": "sideglass",
  "RRQ": "sideglass",
  "LFQ": "sideglass",
  "RFQ": "sideglass",
  "RQ": "sideglass",
  "LRV": "sideglass",
  "RRV": "sideglass",
  "LFV": "sideglass",
  "RFV": "sideglass",
  "FV": "sideglass",
  "RV": "sideglass",
  "QTR": "sideglass",
  "VENT": "sideglass",
  // Rear window
  "RR": "bakrute",
  "REAR": "bakrute",
  "BACK": "bakrute",
  "RW": "bakrute",
  // Sunroof / other
  "SR": "annet",
  "SUNROOF": "annet",
};

/** Detect category from description text */
function detectCategory(description) {
  if (!description) return null;
  const d = description.toUpperCase();
  
  // Look for type codes after semicolon or in the text
  // Pattern: "; WS GN..." or " WS GN..."
  const typeMatch = d.match(/(?:^|;)\s*([A-Z]{1,4})\s/);
  if (typeMatch) {
    const code = typeMatch[1].trim();
    if (TYPE_TO_CATEGORY[code]) {
      return TYPE_TO_CATEGORY[code];
    }
  }
  
  // Fallback: look for keywords
  if (/\bWINDSHIELD\b|\bFRONT\s+WINDOW\b|\bFRONT\s+GLASS\b/.test(d)) return "frontrute";
  if (/\bREAR\s+WINDOW\b|\bREAR\s+GLASS\b|\bBACK\s+WINDOW\b/.test(d)) return "bakrute";
  if (/\bDOOR\s+GLASS\b|\bDOOR\s+WINDOW\b/.test(d)) return "dørglass";
  if (/\bQUARTER\b|\bVENT\s+GLASS\b|\bSIDE\s+GLASS\b/.test(d)) return "sideglass";
  
  return null;
}

/** Enhanced equipment detection from Pilkington description codes */
function detectEquipmentFromDescription(description) {
  if (!description) {
    return {
      adas: false, rainSensor: false, heated: false,
      acoustic: false, antenna: false, camera: false,
      hud: false, shade: false, moulding: false,
      encapsulated: false, vinEtched: false, hardware: false,
    };
  }
  
  const d = description.toUpperCase();
  const tokens = d.split(/[\s;,.\[\]()]+/).filter(t => t.length >= 2);
  const tokenSet = new Set(tokens);
  
  return {
    // Equipment flags
    adas: tokenSet.has("ADAS") || tokenSet.has("FILSKIFTE") || /\bLANE\s+ASSIST\b|\bLANE\s+DEPARTURE\b|\bCOLLISION\b|\bAUTO\s+BRAKE\b|\bEMERGENCY\s+BRAKE\b|\bDRIVE\s+ASSIST\b|\bPRO\s+PILOT\b|\bAUTOPILOT\b|\bTRAFFIC\s+ASSIST\b/.test(d),
    rainSensor: tokenSet.has("RSN") || tokenSet.has("RSNL") || tokenSet.has("RSNLSN") || tokenSet.has("RAIN") || /\bREGNSENSOR\b|\bAUTOMATIC\s+WIPER\b/.test(d),
    heated: tokenSet.has("HTD") || tokenSet.has("HT") || tokenSet.has("UHTD") || /\bHEATED\b|\bOPPVARM\b|\bVARME\b|\bDEFROST\b|\bDEFOG\b|\bEL[\s-]?VARME\b|\bHEATING\b|\bWARM\b|\bVARMET\b/.test(d),
    acoustic: tokenSet.has("ACO") || /\bACOUSTIC\b|\bAKUSTIK\b|\bQUIET\b|\bST[ØO]YDEMP\b|\bST[ØO]Y\b|\bNOISE\b|\bSILENT\b|\bSOUND\b/.test(d),
    antenna: tokenSet.has("ANT") || /\bANTENNA\b|\bANTENNE\b|\bGPS\b|\bRADIO\b|\bFM\b|\bDAB\b|\bAERIAL\b|\bANTEN\b/.test(d),
    camera: tokenSet.has("CAMERA") || tokenSet.has("CAM") || /\bKAMERA\b|\bSENSOR\b|\bBACKUP\b|\bREVERSING\b|\b360\b|\bFRONT\s+CAM\b|\bREAR\s+CAM\b/.test(d),
    hud: tokenSet.has("HUD") || /\bHEAD\s*UP\b|\bHEADUP\b|\bPROJEKSJON\b|\bPROJECTION\b|\bWINDSHIELD\s+DISPLAY\b/.test(d),
    
    // Shade / tint (special tint properties only — not standard colors like GN/BL/GY/CL)
    shade: tokenSet.has("SOLAR") || tokenSet.has("SOL") || tokenSet.has("SOLA") || 
           tokenSet.has("PRIVACY") || tokenSet.has("PRIV") || tokenSet.has("PRIVA") || tokenSet.has("PRIVAC") ||
           tokenSet.has("DARK") || tokenSet.has("TOP") || tokenSet.has("TINT") ||
           tokenSet.has("COATED") || tokenSet.has("HMSL"),
    
    // Fitting flags
    moulding: tokenSet.has("MOULDING") || tokenSet.has("MLD") || tokenSet.has("MOULDI"),
    encapsulated: tokenSet.has("ENCAP") || tokenSet.has("ENC") || tokenSet.has("ENCA") || tokenSet.has("EN"),
    vinEtched: tokenSet.has("VIN") || tokenSet.has("VI"),
    hardware: tokenSet.has("HWARE") || tokenSet.has("HWAR") || tokenSet.has("HWA") || tokenSet.has("HW") ||
              tokenSet.has("HARDWARE") || tokenSet.has("KIT"),
  };
}

function main() {
  console.log("🔧 Enriching catalog...\n");
  
  const data = JSON.parse(fs.readFileSync(INPUT, "utf-8"));
  const records = data.records || [];
  
  let categoryFixed = 0;
  let categoryUnknownFixed = 0;
  let equipmentEnriched = 0;
  let shadeEnriched = 0;
  let totalShade = 0;
  
  const categoryBefore = {};
  const categoryAfter = {};
  
  for (const r of records) {
    // Track before
    const beforeCat = r.category || "unknown";
    categoryBefore[beforeCat] = (categoryBefore[beforeCat] || 0) + 1;
    
    // Fix category
    const detectedCat = detectCategory(r.description);
    if (detectedCat && (!r.category || r.category === "annet" || r.category === "unknown" || r.category === "")) {
      const oldCat = r.category;
      r.category = detectedCat;
      categoryFixed++;
      if (oldCat === "unknown" || oldCat === "" || oldCat === null || oldCat === undefined) {
        categoryUnknownFixed++;
      }
    }
    
    // Enrich equipment from description
    const equip = detectEquipmentFromDescription(r.description);
    
    // Only set if not already set (don't override explicit DB values)
    const hadAnyEquipment = r.adas || r.rainSensor || r.heated || r.acoustic || 
                           r.antenna || r.camera || r.hud || r.shade;
    
    if (!hadAnyEquipment && r.description) {
      if (equip.adas) { r.adas = true; equipmentEnriched++; }
      if (equip.rainSensor) { r.rainSensor = true; equipmentEnriched++; }
      if (equip.heated) { r.heated = true; equipmentEnriched++; }
      if (equip.acoustic) { r.acoustic = true; equipmentEnriched++; }
      if (equip.antenna) { r.antenna = true; equipmentEnriched++; }
      if (equip.camera) { r.camera = true; equipmentEnriched++; }
      if (equip.hud) { r.hud = true; equipmentEnriched++; }
      if (equip.shade) { r.shade = true; shadeEnriched++; }
    }
    
    // Always update shade if detected (it's a tint indicator, high confidence)
    if (equip.shade && !r.shade) {
      r.shade = true;
      shadeEnriched++;
    }
    
    if (r.shade) totalShade++;
    
    // Track after
    const afterCat = r.category || "unknown";
    categoryAfter[afterCat] = (categoryAfter[afterCat] || 0) + 1;
  }
  
  // Write enriched catalog
  fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2));
  
  console.log(`📊 Results:`);
  console.log(`  Total records: ${records.length.toLocaleString("nb-NO")}`);
  console.log(`  Category fixed: ${categoryFixed} (${categoryUnknownFixed} from unknown/empty)`);
  console.log(`  Equipment enriched: ${equipmentEnriched} flags set`);
  console.log(`  Shade enriched: ${shadeEnriched}`);
  console.log(`  Total shade now: ${totalShade} (${(totalShade/records.length*100).toFixed(1)}%)`);
  console.log();
  
  console.log(`📂 Categories BEFORE:`);
  for (const [cat, count] of Object.entries(categoryBefore).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count.toLocaleString("nb-NO")}`);
  }
  console.log();
  console.log(`📂 Categories AFTER:`);
  for (const [cat, count] of Object.entries(categoryAfter).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count.toLocaleString("nb-NO")}`);
  }
  console.log();
  console.log(`✅ Enriched catalog written to ${OUTPUT}`);
}

main();
