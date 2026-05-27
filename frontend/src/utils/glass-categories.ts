export interface GlassTypeGroup {
  key: string;
  label: string;
  shortLabel: string;
  codes: string[];
}

export const GLASS_TYPE_GROUPS: GlassTypeGroup[] = [
  {
    key: 'Frontrute',
    label: 'Frontrute',
    shortLabel: 'Front',
    codes: ['F'],
  },
  {
    key: 'Bakrute',
    label: 'Bakrute',
    shortLabel: 'Bak',
    codes: ['B'],
  },
  {
    key: 'Dørrute',
    label: 'Dørrute',
    shortLabel: 'Dør',
    codes: ['DFF', 'DFB', 'DPF', 'DPB', 'DFFV', 'DPFV', 'DFBV', 'DPBV'],
  },
  {
    key: 'Siderute',
    label: 'Siderute',
    shortLabel: 'Side',
    codes: ['SFB1', 'SPB1', 'SFB2', 'SPB2', 'SFB3', 'SPB3'],
  },
];

export const ALL_KNOWN_TYPE_CODES = GLASS_TYPE_GROUPS.flatMap((g) => g.codes);

/** Count products per group using a single-pass code count map */
export function countByGroup(products: { typeCode: string }[]): Map<string, number> {
  const codeCounts = new Map<string, number>();
  products.forEach((p) => {
    codeCounts.set(p.typeCode, (codeCounts.get(p.typeCode) ?? 0) + 1);
  });

  const groupCounts = new Map<string, number>();
  GLASS_TYPE_GROUPS.forEach((g) => {
    const sum = g.codes.reduce((acc, code) => acc + (codeCounts.get(code) ?? 0), 0);
    if (sum > 0) groupCounts.set(g.key, sum);
  });

  // Count "other" products not in any known group
  const otherCount = products.filter((p) => !ALL_KNOWN_TYPE_CODES.includes(p.typeCode)).length;
  if (otherCount > 0) {
    groupCounts.set('Annet', otherCount);
  }

  return groupCounts;
}

/** Count products per individual type code */
export function countByTypeCode(products: { typeCode: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  products.forEach((p) => {
    map.set(p.typeCode, (map.get(p.typeCode) ?? 0) + 1);
  });
  return map;
}

/** Filter products by group key */
export function filterByGroup(products: { typeCode: string }[], groupKey: string): { typeCode: string }[] {
  const group = GLASS_TYPE_GROUPS.find((g) => g.key === groupKey);
  if (!group) return [];
  return products.filter((p) => group.codes.includes(p.typeCode));
}
