# Position Parser Scripts

## Files

### `parse-positions.mjs`
Extracts `position` (driver/passenger/both) from eurocodes and descriptions.
- **Rules:** VS = driver, HS = passenger, VS/HS = both
- **Never overwrites existing positions**
- Skips frontrute, bakrute, takglass (no side)
- Run: `node scripts/positions/parse-positions.mjs`

### `apply-autoglass-positions.mjs`
Applies position data from auto-glass.no typeCode mappings.
- Maps typeCodes (DFF, DPF, SFB1, SPB1, etc.) to position
- Run: `node scripts/positions/apply-autoglass-positions.mjs`

### `update-d1-positions.mjs`
Syncs parsed positions from catalog-prod.json to D1 database.
- Generates SQL UPDATE statements
- Run: `node scripts/positions/update-d1-positions.mjs`

## Workflow

```
1. parse-positions.mjs        → Parse positions from eurocodes + descriptions
2. apply-autoglass-positions.mjs → Enrich with auto-glass.no typeCode data
3. update-d1-positions.mjs    → Sync to D1
```

## Position Values

| Value | Meaning |
|-------|---------|
| `driver` | Left side (VS / venstre / fører) |
| `passenger` | Right side (HS / høyre / passasjer) |
| `both` | Both sides (set / 2 STK) |
| `null` | Not side-specific (frontrute, bakrute) |
