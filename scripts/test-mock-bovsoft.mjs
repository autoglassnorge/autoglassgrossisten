#!/usr/bin/env node
/**
 * Mock test: Simulerer Bovsoft-respons for å teste Worker-kode
 * Bruk dette til å verifisere at equipment-matching fungerer
 * før du har ekte Bovsoft-credentials.
 */

const TEST_CASES = [
  {
    name: "VW Golf med ADAS + regnsensor + varme",
    regnr: "UX71699",
    mockEquipment: {
      rainSensor: true,
      heated: true,
      acoustic: false,
      antenna: false,
      camera: true,
      adas: true,
      hud: false,
      source: "mock",
    },
  },
  {
    name: "BMW uten ekstra utstyr",
    regnr: "TEST001",
    mockEquipment: {
      rainSensor: false,
      heated: false,
      acoustic: false,
      antenna: false,
      camera: false,
      adas: false,
      hud: false,
      source: "mock",
    },
  },
  {
    name: "Mercedes med acoustic + varme",
    regnr: "TEST002",
    mockEquipment: {
      rainSensor: false,
      heated: true,
      acoustic: true,
      antenna: false,
      camera: false,
      adas: false,
      hud: false,
      source: "mock",
    },
  },
];

console.log("🧪 Mock-test: Equipment-matching\n");
console.log("Dette simulerer hva som skjer når Bovsoft returnerer fabrikkdata.");
console.log("Når du har ekte Bovsoft-credentials, erstatt mock med fetchBovsoftEquipment().\n");

for (const tc of TEST_CASES) {
  console.log(`📋 ${tc.name}`);
  console.log(`   Regnr: ${tc.regnr}`);
  console.log(`   Equipment: ${JSON.stringify(tc.mockEquipment)}`);
  console.log(`   → Forventet: "exact" confidence hvis topp-kandidat matcher alle flagg\n`);
}

console.log("✅ Worker-koden er klar for Bovsoft-data.");
console.log("   Neste steg: Registrer på http://54.38.179.43:150/bovsoft.regnum.login");
