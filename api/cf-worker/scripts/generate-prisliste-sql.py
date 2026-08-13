import json, os, sqlite3

rows = json.load(open('prisliste.json', encoding='utf-8'))

# SQLite escaping for use in SQL file
def esc(s):
    if s is None:
        return 'NULL'
    return "'" + str(s).replace("'", "''") + "'"

def esc_num(v):
    if v is None:
        return 'NULL'
    return str(v)

CHUNK = 500  # rader per INSERT-statement
FILE_ROWS = 5000  # rader per SQL-fil

outdir = 'generated-prisliste-sql'
os.makedirs(outdir, exist_ok=True)

files_written = []
file_rows = []
file_idx = 0
total = len(rows)

def flush_file():
    global file_idx, file_rows
    if not file_rows:
        return
    path = f'{outdir}/prisliste_insert_{file_idx:02d}.sql'
    with open(path, 'w', encoding='utf-8') as f:
        f.write("-- Autoglass prisliste import (PROSEKT API 16.05.2026)\n")
        f.write("-- File part %d: %d rows\n" % (file_idx, len(file_rows)))
        for stmt in file_rows:
            f.write(stmt + ";\n")
    files_written.append(path)
    file_idx += 1
    file_rows = []

cols = ['varenr', 'varenavn', 'kommentar', 'pris', 'eurokode', 'alias_av', 'rad_type']

for i in range(0, total, CHUNK):
    batch = rows[i:i+CHUNK]
    values = []
    for r in batch:
        vals = []
        for c in cols:
            if c == 'pris':
                vals.append(esc_num(r['pris']))
            else:
                vals.append(esc(r[c]))
        values.append('(' + ', '.join(vals) + ')')
    stmt = f"INSERT OR IGNORE INTO autoglass_prisliste ({', '.join(cols)}) VALUES " + ', '.join(values)
    file_rows.append(stmt)
    if len(file_rows) * CHUNK >= FILE_ROWS:
        flush_file()
flush_file()

print(f'{total} rader → {len(files_written)} SQL-filer:')
for p in files_written:
    print(' ', p, os.path.getsize(p), 'bytes')
