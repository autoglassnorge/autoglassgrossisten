/**
 * Ground truth helpers, type-code inference, and category detection.
 */

import type { GlassRecord, GroundTruthRecord } from "../types";
import { queryByEurocodes } from "./db";

export const GT_FIELD_TO_TYPE: Record<
  string,
  { code: string; desc: string; position: "driver" | "passenger" | null }
> = {
  frontrute_eurocode: { code: "F", desc: "Frontrute", position: null },
  bakrute_eurocode: { code: "B", desc: "Bakrute", position: null },
  sideglass_fv_eurocode: { code: "SFB1", desc: "Sideglass foran venstre", position: "driver" },
  sideglass_fh_eurocode: { code: "SPB1", desc: "Sideglass foran høyre", position: "passenger" },
  sideglass_bv_eurocode: { code: "SFB2", desc: "Sideglass bak venstre", position: "driver" },
  sideglass_bh_eurocode: { code: "SPB2", desc: "Sideglass bak høyre", position: "passenger" },
  dor_fv_eurocode: { code: "DFF", desc: "Dørglass foran venstre", position: "driver" },
  dor_fh_eurocode: { code: "DPF", desc: "Dørglass foran høyre", position: "passenger" },
  dor_bv_eurocode: { code: "DFB", desc: "Dørglass bak venstre", position: "driver" },
  dor_bh_eurocode: { code: "DPB", desc: "Dørglass bak høyre", position: "passenger" },
};

export async function groundTruthToCandidates(
  db: D1Database,
  gt: GroundTruthRecord
): Promise<GlassRecord[]> {
  const entries: { eurocode: string; meta: { code: string; desc: string; position: "driver" | "passenger" | null } }[] = [];
  for (const [field, meta] of Object.entries(GT_FIELD_TO_TYPE)) {
    const eurocode = (gt as unknown as Record<string, unknown>)[field] as string | null;
    if (eurocode) entries.push({ eurocode, meta });
  }
  if (!entries.length) return [];

  const records = await queryByEurocodes(db, entries.map((e) => e.eurocode));
  const byEurocode = new Map(records.map((r) => [r.eurocode, r]));

  const candidates: GlassRecord[] = [];
  for (const { eurocode, meta } of entries) {
    const rec = byEurocode.get(eurocode);
    if (!rec) continue;
    candidates.push({
      ...rec,
      typeCode: meta.code,
      typeCodeDesc: meta.desc,
      position: meta.position,
      _groundTruth: true,
    });
  }
  return candidates;
}

export function inferTypeCodeFromRecord(record: GlassRecord): string | null {
  const cat = record.category?.toLowerCase() || detectCategoryFromDescription(record.description);
  const desc = (record.description || "").toUpperCase();

  if (cat === "frontrute") return "F";
  if (cat === "bakrute") return "B";

  // Door glass (dørglass) — position from description keywords
  if (cat === "dørglass") {
    if (/\b(BAK\s*H|BH|RRD|RIGHT\s*REAR)\b/.test(desc)) return "DPB";
    if (/\b(BAK\s*V|BV|LRD|LEFT\s*REAR)\b/.test(desc)) return "DFB";
    if (/\b(FORAN\s*H|FH|RFD|RIGHT\s*FRONT|R\.\s*F\.\s*D)\b/.test(desc)) return "DPF";
    if (/\b(FORAN\s*V|FV|LFD|LEFT\s*FRONT|L\.\s*F\.\s*D)\b/.test(desc)) return "DFF";
  }

  // Side glass (sideglass / quarter)
  if (cat === "sideglass" || cat === "quarter") {
    if (/\b(BAK\s*H|BH|RRQ|RIGHT\s*REAR)\b/.test(desc)) return "SPB2";
    if (/\b(BAK\s*V|BV|LRQ|LEFT\s*REAR)\b/.test(desc)) return "SFB2";
    if (/\b(FORAN\s*H|FH|RFQ|RIGHT\s*FRONT|R\.\s*F\.\s*Q)\b/.test(desc)) return "SPB1";
    if (/\b(FORAN\s*V|FV|LFQ|LEFT\s*FRONT|L\.\s*F\.\s*Q)\b/.test(desc)) return "SFB1";
  }

  // Fallback
  if (/\bWINDSHIELD\b|\bWINDSCREEN\b|\bFRONT\s+GLASS\b/.test(desc)) return "F";
  if (/\bREAR\s+WINDOW\b|\bBACK\s+WINDOW\b|\bREAR\s+GLASS\b/.test(desc)) return "B";

  return null;
}

export function groupByTypeCode(candidates: GlassRecord[]): Record<string, GlassRecord[]> {
  const groups: Record<string, GlassRecord[]> = {};
  for (const c of candidates) {
    const code = c.typeCode || inferTypeCodeFromRecord(c) || "UNKNOWN";
    if (!groups[code]) groups[code] = [];
    groups[code].push(c);
  }
  return groups;
}

export const TYPE_TO_CATEGORY: Record<string, string> = {
  "WS": "frontrute",
  "WINDSHIELD": "frontrute",
  "WSH": "frontrute",
  "FD": "dørglass",
  "RD": "dørglass",
  "LFD": "dørglass",
  "RFD": "dørglass",
  "LRD": "dørglass",
  "RRD": "dørglass",
  "DOOR": "dørglass",
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
  "RR": "bakrute",
  "REAR": "bakrute",
  "BACK": "bakrute",
  "RW": "bakrute",
  "SR": "annet",
  "SUNROOF": "annet",
};

export function detectCategoryFromDescription(description: string | null): string | null {
  if (!description) return null;
  const d = description.toUpperCase();
  const afterSemi = d.match(/;\s*([A-Z]{1,4})\s/);
  if (afterSemi) {
    const code = afterSemi[1].trim();
    if (TYPE_TO_CATEGORY[code]) {
      return TYPE_TO_CATEGORY[code];
    }
  }
  const atStart = d.match(/^([A-Z]{1,4})\s/);
  if (atStart) {
    const code = atStart[1].trim();
    if (TYPE_TO_CATEGORY[code]) {
      return TYPE_TO_CATEGORY[code];
    }
  }
  if (/\bWINDSHIELD\b|\bFRONT\s+WINDOW\b|\bFRONT\s+GLASS\b/.test(d)) return "frontrute";
  if (/\bREAR\s+WINDOW\b|\bREAR\s+GLASS\b|\bBACK\s+WINDOW\b/.test(d)) return "bakrute";
  if (/\bDOOR\s+GLASS\b|\bDOOR\s+WINDOW\b/.test(d)) return "dørglass";
  if (/\bQUARTER\b|\bVENT\s+GLASS\b|\bSIDE\s+GLASS\b/.test(d)) return "sideglass";
  return null;
}
