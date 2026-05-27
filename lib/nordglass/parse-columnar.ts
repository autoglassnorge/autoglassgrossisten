/**
 * Nord Glass — Columnar Format Parser
 * Pre-processes pdftotext -layout output into clean single-line records.
 *
 * Format (from PDF):
 *   MAKE / MODEL       BODY      YEAR       CAT.     REMARKS              NORDGLASS CODE   DIM.    NAGS
 *
 * Example line:
 *   MDX              5RGR   01/01-04/01   WS     WS GSBL - sp mb(O) rectangle vin frame   FW02182GBYN   1597x954 WS2182GBYUSA
 *
 * Challenges:
 *   - Manufacturer is on its own line above model lines
 *   - Lines can wrap across multiple raw lines
 *   - Some fields are missing (body, dims, code)
 *   - Short family codes: WS, RW, GU (not WSWS, RWRW, GUGU)
 */

export interface ColumnarRecord {
  raw: string;
  manufacturer: string;
  model: string;
  body: string | null;
  yearRaw: string;
  family: string;
  remarks: string;
  nordCode: string | null;
  dimensions: string | null;
  extraCode: string | null;
}

// Known family codes in this PDF catalog
const FAMILY_RE = /\b(WS|RW|GU|BOT|BOD|BOS|BOAS)\b/;

// Year pattern: MM/YY-MM/YY or MM/YY-
const YEAR_RE = /\b(\d{2}\/\d{2}(?:-\d{2}\/\d{2}|-))\b/;

// Dimensions pattern
const DIM_RE = /\b(\d{3,4}x\d{3,4})\b/;

// Manufacturer line: all uppercase, at least 2 chars, no digits, not a header word
const HEADER_WORDS = new Set([
  'EUROCODE', 'NAGS', 'MAKE', 'MODEL', 'BODY', 'YEAR', 'CAT', 'REMARKS',
  'DIM', 'NORDGLASS', 'CODE',
]);

function isManufacturerLine(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 30) return null;
  if (!/^[A-Z][A-Z\s/.-]+$/.test(trimmed)) return null;
  const upper = trimmed.toUpperCase();
  for (const hw of HEADER_WORDS) {
    if (upper.includes(hw)) return null;
  }
  return trimmed;
}

function isContinuationLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Has year + family? → new record, not continuation
  if (YEAR_RE.test(trimmed) && FAMILY_RE.test(trimmed)) return false;
  // Just text/features → continuation
  return true;
}

function isDataLine(line: string): boolean {
  const trimmed = line.trim();
  return YEAR_RE.test(trimmed) && FAMILY_RE.test(trimmed);
}

/**
 * Pre-process raw lines into complete single-line records.
 */
export function preprocessColumnarLines(rawLines: string[]): string[] {
  const results: string[] = [];
  let currentMfr: string | null = null;
  let pendingLine: string | null = null;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trimEnd(); // keep leading spaces for now

    // Skip empty lines
    if (!trimmed.trim()) {
      continue;
    }

    // Check for manufacturer line
    const mfr = isManufacturerLine(trimmed);
    if (mfr) {
      currentMfr = mfr;
      // Flush any pending line
      if (pendingLine) {
        results.push(pendingLine);
        pendingLine = null;
      }
      continue;
    }

    // Check for data line (has year + family)
    if (isDataLine(trimmed)) {
      // Flush previous pending line
      if (pendingLine) {
        results.push(pendingLine);
      }
      pendingLine = currentMfr ? `${currentMfr} ${trimmed.trim()}` : trimmed.trim();
      continue;
    }

    // Check for continuation line
    if (isContinuationLine(trimmed) && pendingLine) {
      pendingLine += ' ' + trimmed.trim();
      continue;
    }

    // Unknown line type — flush pending and ignore
    if (pendingLine) {
      results.push(pendingLine);
      pendingLine = null;
    }
  }

  // Flush final pending line
  if (pendingLine) {
    results.push(pendingLine);
  }

  return results;
}

/**
 * Parse a single pre-processed line into structured fields.
 */
export function parseColumnarLine(line: string): ColumnarRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Find family position
  const familyMatch = trimmed.match(FAMILY_RE);
  if (!familyMatch || familyMatch.index === undefined) return null;
  const family = familyMatch[1];
  const familyIndex = familyMatch.index;

  // Find year position (should be before family)
  const yearMatch = trimmed.match(YEAR_RE);
  if (!yearMatch || yearMatch.index === undefined) return null;
  const yearRaw = yearMatch[1];
  const yearIndex = yearMatch.index;

  // Before year: manufacturer + model + body
  const beforeYear = trimmed.slice(0, yearIndex).trim();
  const beforeYearParts = beforeYear.split(/\s{2,}/).filter(Boolean);

  let manufacturer = '';
  let model = '';
  let body: string | null = null;

  if (beforeYearParts.length >= 1) {
    manufacturer = beforeYearParts[0];
  }
  if (beforeYearParts.length >= 2) {
    // Last part before year is likely body, rest is model
    const lastPart = beforeYearParts[beforeYearParts.length - 1];
    // Body types are short: 3T, 5T, 4LIM, 2CPE, KOM, etc.
    if (/^[0-9A-Z,]{2,8}$/.test(lastPart) && lastPart !== manufacturer) {
      body = lastPart;
      model = beforeYearParts.slice(1, -1).join(' ').trim();
    } else {
      model = beforeYearParts.slice(1).join(' ').trim();
    }
  }

  // Between year and family: usually empty in this format
  // After family: remarks + code + dims + extra
  const afterFamily = trimmed.slice(familyIndex + family.length).trim();

  // Find dimensions in the remainder
  const dimMatch = afterFamily.match(DIM_RE);
  const dimIndex = dimMatch ? dimMatch.index! : -1;

  let remarks = '';
  let nordCode: string | null = null;
  let dimensions: string | null = null;
  let extraCode: string | null = null;

  if (dimIndex !== -1) {
    dimensions = dimMatch![1];
    const beforeDim = afterFamily.slice(0, dimIndex).trim();
    const afterDim = afterFamily.slice(dimIndex + dimensions.length).trim();

    // Find Nord Glass code (before dimensions, after remarks)
    // Pattern: typically ends with letters+digits like FW02182GBYN
    const codeMatch = beforeDim.match(/([A-Z]\d+[A-Z]+|\d+[A-Z]\d*[A-Z]+)$/);
    if (codeMatch) {
      nordCode = codeMatch[1];
      remarks = beforeDim.slice(0, beforeDim.length - nordCode.length).trim();
    } else {
      remarks = beforeDim;
    }

    extraCode = afterDim || null;
  } else {
    // No dimensions — look for code pattern in remainder
    const codeMatch = afterFamily.match(/([A-Z]\d+[A-Z]+|\d+[A-Z]\d*[A-Z]+)$/);
    if (codeMatch) {
      nordCode = codeMatch[1];
      remarks = afterFamily.slice(0, afterFamily.length - nordCode.length).trim();
    } else {
      remarks = afterFamily;
    }
  }

  return {
    raw: line,
    manufacturer,
    model,
    body,
    yearRaw,
    family,
    remarks,
    nordCode,
    dimensions,
    extraCode,
  };
}

/**
 * Convert a ColumnarRecord to a tokenize-compatible line string.
 */
export function toTokenizeLine(record: ColumnarRecord): string {
  const parts: string[] = [
    record.manufacturer,
    record.model,
    record.body || '',
    record.yearRaw.replace(/\//g, ''),
    record.family,
    record.remarks,
    record.nordCode || '',
    record.dimensions || '',
    record.extraCode || '',
  ];
  return parts.filter(Boolean).join(' ');
}
