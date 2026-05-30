import { readFileSync, writeFileSync } from 'fs';

// Load data
const ktypeMapping = JSON.parse(readFileSync('data/tecdoc-import/tecdoc-ktype-mapping.json', 'utf-8'));
const catalogUpdates = readFileSync('data/tecdoc-import/glass-catalog-updates-v5-post-cleanup.sql', 'utf-8')
  .split('\n')
  .filter(l => l.includes('UPDATE glass_catalog SET ktype'))
  .map(l => {
    const ktypeMatch = l.match(/ktype = (\d+)/);
    const eurocodeMatch = l.match(/eurocode = '([^']+)'/);
    return ktypeMatch && eurocodeMatch ? {
      ktype: parseInt(ktypeMatch[1], 10),
      eurocode: eurocodeMatch[1],
    } : null;
  }).filter(Boolean);

console.log(`📊 Loaded ${catalogUpdates.length} eurocode→ktype mappings`);

// Group by kType and compute collision metadata
const ktypeGroups = new Map();
for (const { ktype, eurocode } of catalogUpdates) {
  if (!ktypeGroups.has(ktype)) {
    ktypeGroups.set(ktype, []);
  }
  ktypeGroups.get(ktype).push(eurocode);
}

// Build registry entries with collision metadata
const registryEntries = [];
const excludedHighCollision = [];

for (const [ktype, eurocodes] of ktypeGroups) {
  const collisionGroupSize = eurocodes.length;
  
  // Determine confidence tag
  let confidenceTag;
  if (collisionGroupSize === 1) confidenceTag = 'unique';
  else if (collisionGroupSize <= 5) confidenceTag = 'low';
  else if (collisionGroupSize <= 20) confidenceTag = 'medium';
  else if (collisionGroupSize <= 50) confidenceTag = 'high';
  else confidenceTag = 'critical';
  
  // Get kType info from mapping
  const ktypeInfo = ktypeMapping.find(e => e.ktype === ktype);
  const tecdocBrand = ktypeInfo ? ktypeInfo.brand : '';
  const tecdocModel = ktypeInfo ? ktypeInfo.model : '';
  const tecdocYearFrom = ktypeInfo ? ktypeInfo.year_from : null;
  const tecdocYearTo = ktypeInfo ? ktypeInfo.year_to : null;
  
  // Build per-eurocode entries with collision rank
  eurocodes.forEach((eurocode, index) => {
    registryEntries.push({
      eurocode,
      ktype,
      tecdocBrand,
      tecdocModel,
      tecdocYearFrom,
      tecdocYearTo,
      collisionGroupSize,
      collisionRank: index + 1,
      confidenceTag,
    });
  });
  
  if (collisionGroupSize > 5) {
    excludedHighCollision.push({ ktype, size: collisionGroupSize, brand: tecdocBrand, model: tecdocModel });
  }
}

// Filter to safe set: unique + low collision (size <= 5)
const safeEntries = registryEntries.filter(e => e.collisionGroupSize <= 5);
const excludedEntries = registryEntries.filter(e => e.collisionGroupSize > 5);

console.log(`\n📈 Collision Analysis:`);
console.log(`   Total kTypes: ${ktypeGroups.size}`);
console.log(`   Total eurocode mappings: ${registryEntries.length}`);
console.log(`   Safe (collision ≤5): ${safeEntries.length} mappings across ${new Set(safeEntries.map(e => e.ktype)).size} kTypes`);
console.log(`   Excluded (collision >5): ${excludedEntries.length} mappings across ${new Set(excludedEntries.map(e => e.ktype)).size} kTypes`);

console.log(`\n🔴 Excluded high-collision kTypes (top 10):`);
excludedHighCollision
  .sort((a, b) => b.size - a.size)
  .slice(0, 10)
  .forEach(({ ktype, size, brand, model }) => {
    console.log(`   kType ${ktype}: ${size} eurocodes → ${brand} ${model}`);
  });

// Generate SQL
const sqlLines = [
  `-- TecDoc kType Registry with Collision Gating (Option C)`,
  `-- Generated: ${new Date().toISOString()}`,
  `-- Safe set: collision_group_size <= 5`,
  `-- Total safe mappings: ${safeEntries.length}`,
  `-- Total safe kTypes: ${new Set(safeEntries.map(e => e.ktype)).size}`,
  ``,
  `CREATE TABLE IF NOT EXISTS tecdoc_ktype_registry (`,
  `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
  `  eurocode TEXT NOT NULL,`,
  `  ktype INTEGER NOT NULL,`,
  `  tecdoc_brand TEXT,`,
  `  tecdoc_model TEXT,`,
  `  tecdoc_year_from INTEGER,`,
  `  tecdoc_year_to INTEGER,`,
  `  collision_group_size INTEGER NOT NULL,`,
  `  collision_rank INTEGER NOT NULL,`,
  `  confidence_tag TEXT,`,
  `  source TEXT DEFAULT 'tecdoc_1q2019_v5_post_cleanup',`,
  `  created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
  `);`,
  ``,
  `CREATE INDEX IF NOT EXISTS idx_tecdoc_ktype ON tecdoc_ktype_registry(ktype);`,
  `CREATE INDEX IF NOT EXISTS idx_tecdoc_eurocode ON tecdoc_ktype_registry(eurocode);`,
  `CREATE INDEX IF NOT EXISTS idx_tecdoc_confidence ON tecdoc_ktype_registry(confidence_tag);`,
  `CREATE INDEX IF NOT EXISTS idx_tecdoc_brand_model ON tecdoc_ktype_registry(tecdoc_brand, tecdoc_model);`,
  ``,
  `-- Clear any existing safe-set data (idempotent)`,
  `DELETE FROM tecdoc_ktype_registry WHERE source = 'tecdoc_1q2019_v5_post_cleanup';`,
  ``,
  `-- Insert safe-set mappings`,
];

const CHUNK_SIZE = 500;
for (let i = 0; i < safeEntries.length; i += CHUNK_SIZE) {
  const chunk = safeEntries.slice(i, i + CHUNK_SIZE);
  const values = chunk.map(e =>
    `('${e.eurocode.replace(/'/g, "''")}', ${e.ktype}, '${(e.tecdocBrand || '').replace(/'/g, "''")}', '${(e.tecdocModel || '').replace(/'/g, "''")}', ${e.tecdocYearFrom || 'NULL'}, ${e.tecdocYearTo || 'NULL'}, ${e.collisionGroupSize}, ${e.collisionRank}, '${e.confidenceTag}', 'tecdoc_1q2019_v5_post_cleanup')`
  ).join(',\n  ');
  
  sqlLines.push(`INSERT INTO tecdoc_ktype_registry`);
  sqlLines.push(`  (eurocode, ktype, tecdoc_brand, tecdoc_model, tecdoc_year_from, tecdoc_year_to, collision_group_size, collision_rank, confidence_tag, source)`);
  sqlLines.push(`VALUES`);
  sqlLines.push(`  ${values};`);
  sqlLines.push('');
}

sqlLines.push(`-- Safe-set insertion complete: ${safeEntries.length} rows`);

writeFileSync('data/tecdoc-import/tecdoc-ktype-registry-safe.sql', sqlLines.join('\n'));
console.log(`\n💾 SQL written to data/tecdoc-import/tecdoc-ktype-registry-safe.sql`);

// Also write a JSON metadata file for reference
const metadata = {
  generatedAt: new Date().toISOString(),
  totalMappings: registryEntries.length,
  safeMappings: safeEntries.length,
  excludedMappings: excludedEntries.length,
  safeKtypes: new Set(safeEntries.map(e => e.ktype)).size,
  excludedKtypes: new Set(excludedEntries.map(e => e.ktype)).size,
  confidenceDistribution: {
    unique: safeEntries.filter(e => e.confidenceTag === 'unique').length,
    low: safeEntries.filter(e => e.confidenceTag === 'low').length,
    medium: excludedEntries.filter(e => e.confidenceTag === 'medium').length,
    high: excludedEntries.filter(e => e.confidenceTag === 'high').length,
    critical: excludedEntries.filter(e => e.confidenceTag === 'critical').length,
  },
  excludedHighCollision: excludedHighCollision.sort((a, b) => b.size - a.size),
};

writeFileSync('data/tecdoc-import/tecdoc-ktype-registry-metadata.json', JSON.stringify(metadata, null, 2));
console.log(`📄 Metadata written to data/tecdoc-import/tecdoc-ktype-registry-metadata.json`);
