/**
 * Nord Glass — TSV Bounding Box Parser
 * Uses pdftotext -tsv output to reconstruct the columnar table.
 */

export interface ParsedRecord {
  page: number;
  manufacturer: string;
  model: string;
  body: string;
  year: string;
  family: string;
  remarks: string;
  nordCode: string;
  dimensions: string;
  extraCode: string;
  raw: string;
}

// Column boundaries (left position thresholds) — tuned for Nord Glass PDF
const COL_MODEL = 150;
const COL_BODY = 240;
const COL_YEAR = 300;
const COL_CAT = 330;
const COL_REMARKS = 560;
const COL_CODE = 640;
const COL_DIM = 680;

const Y_TOLERANCE = 5;

function classifyColumn(left: number): string {
  if (left < COL_MODEL) return 'model';
  if (left < COL_BODY) return 'body';
  if (left < COL_YEAR) return 'year';
  if (left < COL_CAT) return 'cat';
  if (left < COL_REMARKS) return 'remarks';
  if (left < COL_CODE) return 'code';
  if (left < COL_DIM) return 'dim';
  return 'extra';
}

/**
 * Parse TSV file content into structured records.
 */
export function parseTSV(tsvContent: string): ParsedRecord[] {
  const lines = tsvContent.split('\n');

  // Parse all valid words
  interface Word { page: number; left: number; top: number; text: string; }
  const words: Word[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length < 12) continue;
    if (cols[11].startsWith('###')) continue;

    words.push({
      page: parseInt(cols[1], 10),
      left: parseFloat(cols[6]),
      top: parseFloat(cols[7]),
      text: cols[11],
    });
  }

  // Sort by top, then left
  words.sort((a, b) => {
    if (Math.abs(a.top - b.top) > Y_TOLERANCE) return a.top - b.top;
    return a.left - b.left;
  });

  // Group into rows
  const rows: Word[][] = [];
  let currentRow: Word[] = [];
  let currentTop = -9999;

  for (const word of words) {
    if (currentRow.length === 0 || Math.abs(word.top - currentTop) <= Y_TOLERANCE) {
      currentRow.push(word);
      currentTop = word.top;
    } else {
      rows.push(currentRow);
      currentRow = [word];
      currentTop = word.top;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  // Parse each row
  let currentMfr = '';
  const records: ParsedRecord[] = [];

  for (const row of rows) {
    const colTexts: Record<string, string[]> = {
      model: [], body: [], year: [], cat: [],
      remarks: [], code: [], dim: [], extra: [],
    };

    for (const word of row) {
      const col = classifyColumn(word.left);
      colTexts[col].push(word.text);
    }

    const model = colTexts.model.join(' ').trim();
    const body = colTexts.body.join(' ').trim();
    const year = colTexts.year.join(' ').trim();
    const cat = colTexts.cat.join(' ').trim();
    const remarks = colTexts.remarks.join(' ').trim();
    const code = colTexts.code.join(' ').trim();
    const dim = colTexts.dim.join(' ').trim();
    const extra = colTexts.extra.join(' ').trim();

    // Manufacturer detection
    if (model && !body && !year && !cat) {
      const upper = model.toUpperCase();
      const isHeader = ['EUROCODE', 'NAGS', 'MAKE', 'MODEL', 'BODY', 'YEAR', 'CAT', 'REMARKS', 'DIM', 'NORDGLASS', 'CODE'].some(h => upper.includes(h));
      if (!isHeader && /^[A-Z][A-Z\s/.-]+$/.test(model)) {
        currentMfr = model;
        continue;
      }
    }

    // Must have year and category
    if (!year || !cat) continue;
    if (!/^\d{2}\/\d{2}(?:-\d{2}\/\d{2}|-)$/.test(year)) continue;

    records.push({
      page: row[0]?.page || 0,
      manufacturer: currentMfr,
      model,
      body,
      year,
      family: cat,
      remarks,
      nordCode: code,
      dimensions: dim,
      extraCode: extra,
      raw: `${currentMfr} ${model} ${body} ${year} ${cat} ${remarks} ${code} ${dim} ${extra}`.replace(/\s+/g, ' ').trim(),
    });
  }

  return records;
}
