-- Bovsoft batch seed — generert 2026-05-22T12:41:11.971Z
-- Antall mappings: 58

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('ford:focus_iii_turnier:201007', 'EU', 'windshield', 'default', 8204, 0.92, 1, 1, 'bovsoft:AA74282:vin=WF0LXXGCBLCL22021', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('bmw:x6_(e71,_e72):201004', 'EU', 'windshield', 'default', 1108, 0.92, 1, 1, 'bovsoft:BS31153:vin=WBAFH61040LL78550', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('bmw:x1_(e84):200910', 'EU', 'windshield', 'default', 32114, 0.92, 1, 1, 'bovsoft:BS72434:vin=WBAVP11050VU16597', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('bmw:x5_(f15,_f85):201308', 'EU', 'windshield', 'default', 21691, 0.92, 1, 1, 'bovsoft:BT55039:vin=unknown', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('ford:fiesta_vi_(cb1,_ccn):200806', 'EU', 'windshield', 'default', 28235, 0.92, 1, 1, 'bovsoft:DN18369:vin=WF0JXXGAJJ9M78368', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('mercedes-benz:e-klasse_t-model_(s213):201810', 'EU', 'windshield', 'default', 140437, 0.92, 1, 1, 'bovsoft:DR94473:vin=WDD2132161A747881', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('audi:e-tron_sportback_(gea):201909', 'EU', 'windshield', 'default', 138780, 0.92, 1, 1, 'bovsoft:EB48722:vin=WAUZZZGEXLB029143', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('kia:soul_ii_(ps):201409', 'EU', 'windshield', 'default', 108081, 0.92, 1, 1, 'bovsoft:EK49935:vin=unknown', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('vw:golf_vii_(5g1,_bq1,_be1,_be2):201403', 'EU', 'windshield', 'default', 101041, 0.92, 1, 1, 'bovsoft:EK67241:vin=WVWZZZAUZEW900694', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('ford:s-max_(wa6):200711', 'EU', 'windshield', 'default', 24461, 0.92, 1, 1, 'bovsoft:KH64213:vin=WF0SXXGBWS9A34241', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('bmw:x1_(e84):201003', 'EU', 'windshield', 'default', 34988, 0.92, 1, 1, 'bovsoft:KH69006:vin=WBAVP31020VN12862', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('vw:golf_vi_(5k1):201005', 'EU', 'windshield', 'default', 9621, 0.92, 1, 1, 'bovsoft:KH82469:vin=WVWZZZ1KZCW264945', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('vw:sharan_(7n1,_7n2):201005', 'EU', 'windshield', 'default', 33435, 0.92, 1, 1, 'bovsoft:KH85631:vin=WVWZZZ7NZBV031666', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('ford:kuga_i:201003', 'EU', 'windshield', 'default', 33339, 0.92, 1, 1, 'bovsoft:LJ45842:vin=WF0RXXGCDRBP16623', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('vw:passat_b6_estate_(3c5):200508', 'EU', 'windshield', 'default', 19632, 0.92, 1, 1, 'bovsoft:LS73924:vin=WVWZZZ3CZAE162353', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('mercedes-benz:c-klasse_t-model_(s204):200708', 'EU', 'windshield', 'default', 23459, 0.92, 1, 1, 'bovsoft:RJ82740:vin=WDD2042221F129669', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('bmw:x1_(e84):200912', 'EU', 'windshield', 'default', 32113, 0.92, 1, 1, 'bovsoft:RK34794:vin=WBAVN11010VN21627', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('audi:q5_(8rb):200811', 'EU', 'windshield', 'default', 27564, 0.92, 1, 1, 'bovsoft:RK48656:vin=unknown', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('ford:focus_(daw,_dbw):199810', 'EU', 'windshield', 'default', 9640, 0.92, 1, 1, 'bovsoft:SD32271:vin=WF0AXXGCDA4G00056', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('vw:magotan_b7_variant_(365):201008', 'EU', 'windshield', 'default', 327, 0.92, 1, 1, 'bovsoft:SV14194:vin=WVWZZZ3CZBE400756', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('ford:escape_ii_(dm2):201303', 'EU', 'windshield', 'default', 58549, 0.92, 1, 1, 'bovsoft:TV87157:vin=WF0AXXWPMAEM18095', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('toyota:rav_4_/_vanguard_iii_(_a3_):200602', 'EU', 'windshield', 'default', 19296, 0.92, 1, 1, 'bovsoft:UF28995:vin=JTMBA31V205005933', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('hyundai:santa_fé_ii_(cm):200603', 'EU', 'windshield', 'default', 20105, 0.92, 1, 1, 'bovsoft:VF90886:vin=KMHSH81WP8U265276', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('audi:a6_avant_(4f5,_c6):200411', 'EU', 'windshield', 'default', 18676, 0.92, 1, 1, 'bovsoft:VH10743:vin=WAUZZZ4F87N080691', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('ford:mondeo_iv_turnier_(ba7):200703', 'EU', 'windshield', 'default', 22519, 0.92, 1, 1, 'bovsoft:VH32502:vin=WF0GXXGBBGBL17676', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('ford:focus_iii:201007', 'EU', 'windshield', 'default', 8039, 0.92, 1, 1, 'bovsoft:VH36839:vin=WF0KXXGCBKBS61437', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('toyota:prius_(_w3_):200806', 'EU', 'windshield', 'default', 54210, 0.92, 1, 1, 'bovsoft:VH39152:vin=JTDKN36U201013753', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('toyota:vitz_(_p13_):201203', 'EU', 'windshield', 'default', 55249, 0.92, 1, 1, 'bovsoft:VH60535:vin=VNKKD3D320A088215', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('toyota:auris_stasjonsvogn_(_e18_):201307', 'EU', 'windshield', 'default', 59608, 0.92, 1, 1, 'bovsoft:VH73911:vin=SB1ZS3JE50E194674', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('vw:polo_(9n_):200110', 'EU', 'windshield', 'default', 16332, 0.92, 1, 1, 'bovsoft:VH98460:vin=WVWZZZ9NZ7D001907', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('vw:golf_touran_(1t3):201005', 'EU', 'windshield', 'default', 55508, 0.92, 1, 1, 'bovsoft:VJ35767:vin=WVGZZZ1TZCW114256', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('toyota:corolla_(_e12_):200201', 'EU', 'windshield', 'default', 16374, 0.92, 1, 1, 'bovsoft:XV60662:vin=JTDKZ20E800102247', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('toyota:hiace_iv_kassevogn_(__h1_,___h2_):200609', 'EU', 'windshield', 'default', 27279, 0.92, 1, 1, 'bovsoft:CV60179:vin=JT121JK2800030012', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('vw:caddy_iii_kassevogn_(2ka,_2kh,_2ca,_2ch):201008', 'EU', 'windshield', 'default', 34958, 0.92, 1, 1, 'bovsoft:VH32326:vin=WV1ZZZ2KZBX314913', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('ford_usa:f-250_super_duty_crew_cab_pickup:199809', 'EU', 'windshield', 'default', 41632, 0.92, 1, 1, 'bovsoft:DK64286:vin=unknown', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('audi:a6_(4b2,_c5):199702', 'EU', 'windshield', 'default', 8315, 0.92, 1, 1, 'bovsoft:VF57392:vin=unknown', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('audi:a4_avant_(8d5,_b5):199602', 'EU', 'windshield', 'default', 5306, 0.92, 1, 1, 'bovsoft:VX21900:vin=WAUZZZ8DZVA290270', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('volvo:xc90_ii_(256):201506', 'EU', 'windshield', 'default', 111864, 0.92, 1, 1, 'bovsoft:DR17694:vin=YV1LFBABDH1144704', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('skoda:octavia_iii_combi_(5e5,_5e6):201211', 'EU', 'windshield', 'default', 59489, 0.92, 1, 1, 'bovsoft:LJ52321:vin=TMBLD9NE7E0040030', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('volvo:xc60_ii_(246):201802', 'EU', 'windshield', 'default', 130588, 0.92, 1, 1, 'bovsoft:NF97133:vin=LYVUZBMTDLB509978', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('volvo:v70_iii_(135):200710', 'EU', 'windshield', 'default', 24438, 0.92, 1, 1, 'bovsoft:PP96471:vin=YV1BW754181040841', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('volvo:xc90_i_(275):200210', 'EU', 'windshield', 'default', 16572, 0.92, 1, 1, 'bovsoft:RJ98030:vin=YV1CZ796751211930', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('volvo:v40_combi-coupé_(525,_526):201502', 'EU', 'windshield', 'default', 111884, 0.92, 1, 1, 'bovsoft:UA36542:vin=YV1MV28L0H2432665', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('nissan:x-trail_(t30):200106', 'EU', 'windshield', 'default', 17887, 0.92, 1, 1, 'bovsoft:VF91866:vin=JN1TENT30U0221953', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('mazda:cx-5_(ke,_gh):201204', 'EU', 'windshield', 'default', 50841, 0.92, 1, 1, 'bovsoft:VH84131:vin=JMZKEN91800523589', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('peugeot:307_sw_(3h):200311', 'EU', 'windshield', 'default', 17992, 0.92, 1, 1, 'bovsoft:VH84749:vin=unknown', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('skoda:kodiaq_(ns7,_nv7):201902', 'EU', 'windshield', 'default', 135316, 0.92, 1, 1, 'bovsoft:ZZ30804:vin=TMBLE9NS6L8057824', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('peugeot:307_sw_(3h):200203', 'EU', 'windshield', 'default', 16614, 0.92, 1, 1, 'bovsoft:VF60507:vin=unknown', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('mitsubishi:outlander_iii_(gg_w,_gf_w,_zj,_zl,_zk):201809', 'EU', 'windshield', 'default', 133172, 0.92, 1, 1, 'bovsoft:AE58203:vin=JMBXDGG3WLZ000607', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('land_rover:range_rover_evoque_(l538):201106', 'EU', 'windshield', 'default', 9817, 0.92, 1, 1, 'bovsoft:BS89768:vin=SALVA2BC3EH863897', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('nio:es8:202212', 'EU', 'windshield', 'default', 151711, 0.92, 1, 1, 'bovsoft:ED75630:vin=unknown', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('mitsubishi:outlander_ii_(cw_w):200702', 'EU', 'windshield', 'default', 22491, 0.92, 1, 1, 'bovsoft:HZ26655:vin=JMBXJCW8W7Z902378', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('opel:astra_h_gtc_(a04):200702', 'EU', 'windshield', 'default', 22687, 0.92, 1, 1, 'bovsoft:JD50165:vin=W0L0AHL4888102252', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('saab:9-5_stasjonsvogn_(ys3e):200601', 'EU', 'windshield', 'default', 19376, 0.92, 1, 1, 'bovsoft:KJ65007:vin=YS3EF59W773524353', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('mitsubishi:galant_fortis_viii_(cy_a,_cz_a):200802', 'EU', 'windshield', 'default', 24542, 0.92, 1, 1, 'bovsoft:RZ31262:vin=JMBSTCY3A8U003854', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('opel:mokka_/_mokka_x_(j13):201206', 'EU', 'windshield', 'default', 55120, 0.92, 1, 1, 'bovsoft:VH57619:vin=W0LJD7ELXEB556332', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('ssangyong:rodius:200505', 'EU', 'windshield', 'default', 14598, 0.92, 1, 1, 'bovsoft:VF93104:vin=unknown', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');

INSERT INTO glass_rules (normalized_key, market, opening, feature_signature, ktype, confidence, evidence_count, active, notes, created_at, updated_at)
VALUES ('opel:zafira_a_stor_limousin_(t98):200009', 'EU', 'windshield', 'default', 15331, 0.92, 1, 1, 'bovsoft:VF49142:vin=W0L0TGF7522266735', datetime('now'), datetime('now'))
ON CONFLICT(normalized_key, market, opening, feature_signature) DO UPDATE SET
  ktype = excluded.ktype,
  confidence = MAX(excluded.confidence, glass_rules.confidence),
  evidence_count = glass_rules.evidence_count + 1,
  notes = excluded.notes,
  updated_at = datetime('now');
