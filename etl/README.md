# Civic Result Maps ETL

The Python ETL package stages official-source data before any production promotion.

## Native Wisconsin Import

Wisconsin reads the committed WEC ward-by-ward federal and state contest workbook plus county geometry:

- `data/wi-2024-ward-by-ward-federal-state.xlsx`
- `data/wi-counties.geojson`

Those paths are declared in `etl/state-configs/wi.json`. The parser validates:

- 72 county result rows
- 3,422,918 total presidential votes
- 1,697,626 Trump votes
- 1,668,229 Harris votes
- 57,063 other votes
- 3,503 ward-level review rows
- 3,503 joined President-versus-U.S. Senate comparison rows

The Wisconsin import currently supports presidential vote-share screening and same-party President-versus-Senate drop-off screening. Turnout screening remains disabled until a registered-voter denominator source is mapped.

Run native staging:

```powershell
npm run etl:import
```

Promote a validated Wisconsin staging artifact:

```powershell
npm run native:promote -- .etl/staging/wi-2024-staging.json
```

## Native Ohio Import

Ohio is the first native official-source parser in this repo. It reads:

- `data/oh-2024-statewide-race-summary.xlsx`
- `data/oh-2024-statewide-races-precinct-level.xlsx`
- `data/oh-counties.geojson`

Those paths are declared in `etl/state-configs/oh.json`. The XLSX parser reads the official Ohio Secretary of State workbook shapes directly and validates:

- 88 county result rows
- 5,767,788 total presidential votes
- 3,180,116 Trump votes
- 2,533,699 Harris votes
- 53,973 other votes
- 8,878 precinct review rows
- 8,878 precinct turnout rows

Run metadata validation:

```powershell
npm run etl:validate:oh
```

Run native staging after placing the official artifacts at the configured paths:

```powershell
npm run etl:import:oh
```

The output is a staging artifact under `.etl/staging`. It is not a production database write.

Promote a validated staging artifact to the normalized Postgres tables:

```powershell
npm run native:promote -- .etl/staging/oh-2024-staging.json
```

Promotion inserts or updates source documents, the election/contest/candidates, county result rows, review rows, turnout rows, capability flags, validation reports, and an import run. It still requires a configured database URL in `.env.local`.
