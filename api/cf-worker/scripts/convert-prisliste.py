import xlrd, json, re, sys

wb = xlrd.open_workbook('PROSEKT-API-16-MAI26-prisliste.xls')
sh = wb.sheet_by_index(0)

def parse_alias(kommentar, navn):
    """'BRUK 1158K' / 'USE 7204ABZ' → alias-varenummer."""
    m = re.search(r'(?:BRUK|USE)\s+([A-Z0-9.]+)', (kommentar + ' ' + navn).upper())
    if m:
        return m.group(1)
    return None

def rad_type(navn, euro):
    u = navn.upper()
    if re.match(r'^(BRUK|USE)\s', u):
        return 'alias'
    if 'POST' in u or 'BRING' in u or 'FRAKT' in u:
        return 'frakt'
    if 'EMBALLASJE' in u:
        return 'emballasje'
    if euro and euro != 'nan' and euro != '':
        return 'glass'
    return 'tilbehor'

rows = []
seen = set()
dup = 0
for r in range(5, sh.nrows):
    varenr = str(sh.cell_value(r, 0)).strip()
    navn = str(sh.cell_value(r, 1)).strip()
    kommentar = str(sh.cell_value(r, 2)).strip()
    pris_raw = sh.cell_value(r, 3)
    euro = str(sh.cell_value(r, 5)).strip()
    if not varenr and not navn:
        continue
    pris = float(pris_raw) if isinstance(pris_raw, float) and pris_raw > 0 else None
    key = (varenr, navn)
    if key in seen:
        dup += 1
        continue
    seen.add(key)
    rows.append({
        'varenr': varenr,
        'varenavn': navn,
        'kommentar': kommentar,
        'pris': pris,
        'eurokode': euro if euro else None,
        'alias_av': parse_alias(kommentar, navn),
        'rad_type': rad_type(navn, euro),
    })

with open('prisliste.json', 'w', encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False)

from collections import Counter
kat = Counter(x['rad_type'] for x in rows)
print('Rader eksportert:', len(rows), '(dup skippet:', dup, ')')
print('Fordeling:', dict(kat))
print('Med alias_av:', sum(1 for x in rows if x['alias_av']))
print('Med pris:', sum(1 for x in rows if x['pris'] is not None))
print('Eksempel:', json.dumps(rows[10], ensure_ascii=False))
print('Alias-eksempel:', json.dumps(next(x for x in rows if x['alias_av']), ensure_ascii=False))
