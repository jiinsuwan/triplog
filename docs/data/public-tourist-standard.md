# Public Tourist Standard Data Seed

## Source

- Dataset: 전국관광지정보표준데이터
- Provider: 공공데이터포털(data.go.kr)
- Local source file: `data.local/tourist_attractions.csv`

The local CSV is intentionally not committed. It is an external source artifact used to regenerate
the committed Flyway seed.

When displaying or documenting this seed, keep the source attribution as `data.go.kr` public
tourist standard data. Check the data portal terms again before using it outside the project demo.

## Regeneration

```powershell
PowerShell -ExecutionPolicy Bypass -File scripts\generate-place-seed.ps1
```

The script reads the CP949 CSV, maps it into the shared `places` schema, and writes:

```text
backend/src/main/resources/db/migration/V7__seed_public_tourist_places.sql
```

The script is maintained for local regeneration on Windows/PowerShell because the source CSV is
downloaded locally and encoded as CP949.

## Update Policy

Do not edit an already-applied versioned Flyway seed in place. If the public dataset needs a
correction or refresh, add a new versioned migration such as `V8__refresh_public_tourist_places.sql`
or agree on a repeatable seed policy before switching to `R__*.sql`.

## Scope Decision

Issue #33 originally excluded full nationwide loading. The downloaded dataset has 854 valid rows,
so the project uses the full standard dataset as a deterministic demo seed while keeping the table
generic enough for future sources such as parks, museums, markets, and storytelling data.
