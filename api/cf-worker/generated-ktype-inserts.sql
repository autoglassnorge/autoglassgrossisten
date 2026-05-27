-- Generated kType inserts from Finn.no + Bovsoft
-- Generated at: 2026-05-27T23:41:19.298Z
-- Source: 118 verified records, 75 unique kTypes

CREATE TABLE IF NOT EXISTS ktype_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ktype INTEGER NOT NULL,
  brand TEXT,
  model TEXT,
  year_from INTEGER,
  year_to INTEGER,
  body TEXT,
  source TEXT DEFAULT 'finn_bovsoft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_ktype ON ktype_registry(ktype);
CREATE INDEX IF NOT EXISTS idx_ktype_registry_brand ON ktype_registry(brand);

INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (30989, 'AUDI', 'A5 (8T3)', 200808, 201203, 'Coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (15685, 'AUDI', 'A5 / S5 Sportback (8TA)', 201112, 201701, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (100037, 'AUDI', 'A5 / S5 Sportback (8TA)', 201309, 201701, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (31574, 'AUDI', 'A5 / S5 Sportback (8TA)', 200909, 201203, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (120605, 'AUDI', 'A3 Sportback (8VA, 8VF)', 201607, 202010, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (121416, 'AUDI', 'A5 (F53, F5P)', 201606, NULL, 'Coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (117090, 'AUDI', 'A4 Avant (8W5, 8WD, B9)', 201510, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (11991, 'AUDI', 'A5 / S5 Sportback (8TA)', 201110, 201701, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (33413, 'AUDI', 'A5 / S5 Sportback (8TA)', 200909, 201701, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (22551, 'AUDI', 'A5 (8T3)', 200706, 201203, 'Coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (9307, 'AUDI', 'A5 (8T3)', 201003, 201701, 'Coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (31572, 'AUDI', 'A5 / S5 Sportback (8TA)', 200909, 201203, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (24497, 'AUDI', 'A6 Avant (4F5, C6)', 200804, 201008, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (33409, 'AUDI', 'A5 / S5 Sportback (8TA)', 200911, 201109, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (123096, 'AUDI', 'A5 (F53, F5P)', 201610, NULL, 'Coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (31569, 'AUDI', 'A5 / S5 Sportback (8TA)', 200909, 201406, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (123112, 'AUDI', 'A5 Sportback (F5A, F5F)', 201609, NULL, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (117760, 'AUDI', 'Q7 (4MB, 4MG)', 201508, 201912, 'SUV', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (120608, 'AUDI', 'A3 Sportback (8VA, 8VF)', 201606, 202010, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (108590, 'AUDI', 'A6 Avant (4G5, 4GD, C7)', 201409, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (33411, 'AUDI', 'A5 / S5 Sportback (8TA)', 201001, 201701, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (22547, 'AUDI', 'A5 (8T3)', 200710, 201701, 'Coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (29973, 'AUDI', 'A5 (8T3)', 200811, 201203, 'Coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (11995, 'AUDI', 'A5 / S5 Sportback (8TA)', 201108, 201701, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (11724, 'AUDI', 'A6 Avant (4G5, 4GD, C7)', 201106, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (159456, 'AUDI', 'A6 e-tron Avant (GH5)', 202407, NULL, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (22550, 'AUDI', 'A5 (8T3)', 200706, 201203, 'Coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (26582, 'AUDI', 'A3 Sportback (8PA)', 200709, 201303, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (123991, 'AUDI', 'A5 Kabriolet (F57, F5E)', 201611, NULL, 'Kabriolet', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (138780, 'AUDI', 'E-TRON Sportback (GEA)', 201909, NULL, 'SUV', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (59642, 'AUDI', 'A5 / S5 Sportback (8TA)', 201305, 201701, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (33419, 'AUDI', 'A4 Allroad (8KH, B8)', 200904, 201605, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (107509, 'AUDI', 'A7 / S7 Sportback (4GA, 4GF)', 201407, 201805, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (30988, 'AUDI', 'A5 / S5 Kabriolet (8F7)', 200906, 201701, 'Kabriolet', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (29975, 'AUDI', 'A5 (8T3)', 200806, 201701, 'Coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (31570, 'AUDI', 'A5 / S5 Sportback (8TA)', 200909, 201701, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (30980, 'AUDI', 'A5 / S5 Kabriolet (8F7)', 200903, 201406, 'Kabriolet', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (33303, 'AUDI', 'A1 (8X1, 8XK)', 201005, 201504, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (11989, 'AUDI', 'A5 / S5 Sportback (8TA)', 201110, 201701, 'Combi-coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (11986, 'AUDI', 'A5 (8T3)', 201110, 201701, 'Coupé', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (8946, 'AUDI', 'A6 / S6 Avant (4B5, C5)', 199712, 200501, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (138275, 'AUDI', 'A6 Avant (4A5, C8)', 201909, NULL, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (18676, 'AUDI', 'A6 Avant (4F5, C6)', 200411, 200810, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (18420, 'AUDI', 'A6 Avant (4F5, C6)', 200503, 200605, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (19475, 'AUDI', 'A6 Allroad (4FH, C6)', 200603, 200810, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (108591, 'AUDI', 'A6 Avant (4G5, 4GD, C7)', 201409, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (10413, 'AUDI', 'A6 Avant (4G5, 4GD, C7)', 201105, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (18418, 'AUDI', 'A6 Avant (4F5, C6)', 200506, 200810, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (19233, 'AUDI', 'A6 Avant (4F5, C6)', 200506, 201108, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (17896, 'AUDI', 'A6 (4F2, C6)', 200407, 200810, 'sedan', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (128645, 'AUDI', 'A8 (4N2, 4N8)', 201706, NULL, 'sedan', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (30380, 'AUDI', 'A6 Avant (4F5, C6)', 200810, 201108, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (151533, 'AUDI', 'A6 C8 Avant (4A5)', 202301, 202310, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (30382, 'AUDI', 'A6 Allroad (4FH, C6)', 200810, 201108, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (10429, 'AUDI', 'A6 Avant (4G5, 4GD, C7)', 201105, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (10418, 'AUDI', 'A6 Avant (4G5, 4GD, C7)', 201105, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (141586, 'AUDI', 'A6 Avant (4A5, C8)', 202005, NULL, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (108604, 'AUDI', 'A6 Allroad (4GH, 4GJ, C7)', 201409, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (29292, 'AUDI', 'A6 Allroad (4GH, 4GJ, C7)', 201201, 201412, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (19235, 'AUDI', 'A6 Avant (4F5, C6)', 200506, 201108, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (11716, 'AUDI', 'A6 Avant (4G5, 4GD, C7)', 201111, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (13169, 'AUDI', 'A6 / S6 Avant (4B5, C5)', 199909, 200501, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (108581, 'AUDI', 'A6 Avant (4G5, 4GD, C7)', 201409, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (117766, 'AUDI', 'A6 Allroad (4GH, 4GJ, C7)', 201511, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (108434, 'AUDI', 'A6 (4G2, 4GC, C7)', 201409, 201809, 'sedan', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (108599, 'AUDI', 'A6 Avant (4G5, 4GD, C7)', 201409, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (19457, 'AUDI', 'A6 Avant (4F5, C6)', 200603, 201108, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (22929, 'AUDI', 'A6 Avant (4G5, 4GD, C7)', 201201, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (112282, 'AUDI', 'A6 Avant (4G5, 4GD, C7)', 201504, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (108601, 'AUDI', 'A6 Allroad (4GH, 4GJ, C7)', 201409, 201809, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (8318, 'AUDI', 'A6 (4B2, C5)', 199704, 200010, 'sedan', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (30373, 'AUDI', 'A6 Avant (4F5, C6)', 200810, 201108, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (9308, 'AUDI', 'A6 (4G2, 4GC, C7)', 201103, 201809, 'sedan', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (7943, 'AUDI', 'A6 (4G2, 4GC, C7)', 201011, 201809, 'sedan', 'finn_bovsoft') ON CONFLICT DO NOTHING;
INSERT INTO ktype_registry (ktype, brand, model, year_from, year_to, body, source) VALUES (14772, 'AUDI', 'ALLROAD (4BH, C5)', 200005, 200508, 'Stasjonsvogn', 'finn_bovsoft') ON CONFLICT DO NOTHING;

-- Total inserts: 75