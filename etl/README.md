# Civic Result Maps ETL

The Python ETL package stages official-source data before any production promotion.

## Native Michigan Import

Michigan reads the committed MVIC exports, the official registration PDF extraction, and county geometry:

- `data/mi-2024-general-election-results.txt`
- `data/mi-2024-precinct-results.zip`
- `data/mi-2024-voter-turnout.txt`
- `data/mi-2024-registered-voter-count.pdf`
- `data/mi-2024-registered-voter-count.json`
- `data/mi-counties.geojson`

The JSON denominator file is derived from the official PDF with:

```powershell
npm run etl:prepare:mi
```

The parser validates:

- 83 county result rows
- 5,664,186 total presidential votes
- 2,816,636 Trump votes
- 2,736,533 Harris votes
- 111,017 other votes
- 4,428 precinct-level review rows
- 4,416 joined President-versus-U.S. Senate comparison rows
- 83 county turnout rows using November active registered voters

Run native staging:

```powershell
npm run etl:import:mi
```

Promote a validated Michigan staging artifact:

```powershell
npm run native:promote -- .etl/staging/mi-2024-staging.json
```

## Native Pennsylvania Import

Pennsylvania reads the committed Department of State precinct returns, returns readme, turnout workbook, and county geometry:

- `data/pa-2024-general-election-returns-precinct.txt`
- `data/pa-2024-general-election-returns-readme.txt`
- `data/pa-2024-voter-registration-vote-history-summary.xlsx`
- `data/pa-counties.geojson`

Those paths are declared in `etl/state-configs/pa.json`. The parser validates:

- 67 county result rows
- 7,031,737 total presidential votes
- 3,543,041 Trump votes
- 3,420,865 Harris votes
- 67,831 other votes
- 9,154 precinct-level review rows
- 9,152 joined President-versus-U.S. Senate comparison rows
- 67 county turnout rows using the workbook's registered-voter column

Run native staging:

```powershell
npm run etl:import:pa
```

Promote a validated Pennsylvania staging artifact:

```powershell
npm run native:promote -- .etl/staging/pa-2024-staging.json
```

## Native Minnesota Import

Minnesota reads the committed Minnesota Secretary of State precinct workbook plus county geometry:

- `data/mn-2024-general-federal-state-results-by-precinct-official.xlsx`
- `data/mn-counties.geojson`

Those paths are declared in `etl/state-configs/mn.json`. The parser validates:

- 87 county result rows
- 3,253,920 total presidential votes
- 1,519,032 Trump votes
- 1,656,979 Harris votes
- 77,909 other votes
- 4,075 precinct-level review rows
- 4,075 joined President-versus-U.S. Senate comparison rows
- 4,103 precinct-level turnout rows using `REG7AM + EDR` as the denominator

Run native staging:

```powershell
npm run etl:import:mn
```

Promote a validated Minnesota staging artifact:

```powershell
npm run native:promote -- .etl/staging/mn-2024-staging.json
```

## Native North Carolina Import

North Carolina reads the official State Board of Elections precinct result ZIP:

- `data/nc-2024-results-precinct.zip`

Those paths are declared in `etl/state-configs/nc.json`. The parser validates:

- 100 county result rows
- 5,699,141 total presidential votes
- 2,898,423 Trump votes
- 2,715,375 Harris votes
- 85,343 other votes
- 2,861 precinct/reporting-unit review rows
- 2,861 joined President-versus-Governor comparison rows

The North Carolina import uses Governor as the same-party comparison contest because North Carolina did not have a 2024 U.S. Senate race. The official NCSBE file also includes non-real precinct reporting units such as early voting, absentee, provisional, and transfer rows; those are preserved as local review rows.

Run native staging:

```powershell
npm run etl:import:nc
```

Promote a validated North Carolina staging artifact:

```powershell
npm run native:promote -- .etl/staging/nc-2024-staging.json
```

## Native Washington Import

Washington reads the official Secretary of State export page and CSV exports plus Census county geometry:

- `data/wa-2024-export-page.html`
- `data/wa-2024-all-state.csv`
- `data/wa-2024-all-counties.csv`
- `data/wa-2024-all-state-precincts.csv`
- `data/wa-counties.geojson`

Those paths are declared in `etl/state-configs/wa.json`. The parser validates:

- 39 county result rows
- 3,924,243 total presidential votes
- 1,530,923 Trump votes
- 2,245,849 Harris votes
- 147,471 other votes
- 5,007 participating-precinct review rows
- 4,994 joined President-versus-U.S. Senate comparison rows

The Washington county map is based on certified county CSV totals that reconcile to the official all-state CSV. The review rows use the official participating county precinct CSV; those precinct presidential rows aggregate to 3,918,934 votes, 5,309 fewer than the certified county total, so review charts require the participation caveat.

Run native staging:

```powershell
npm run etl:import:wa
```

Promote a validated Washington staging artifact:

```powershell
npm run native:promote -- .etl/staging/wa-2024-staging.json
```

## Native Virginia Import

Virginia reads the official Virginia Elections Database contest CSV plus Census county-equivalent geometry:

- `data/va-2024-general-president-results.csv`
- `data/va-counties.geojson`

Those paths are declared in `etl/state-configs/va.json`. The parser validates:

- 133 county-equivalent result rows covering counties and independent cities
- 4,505,941 total presidential votes
- 2,075,085 Trump votes
- 2,335,395 Harris votes
- 95,461 other/write-in votes
- 2,670 precinct vote-share review rows
- 133 EAC fallback turnout rows

The Virginia map uses Census county-equivalent geometry for counties and independent cities. Precinct boundary geometry is not included, and review rows remain vote-share-only until a same-row down-ballot comparison contest is mapped.

Run native staging:

```powershell
npm run etl:import:va
```

Promote a validated Virginia staging artifact:

```powershell
npm run native:promote -- .etl/staging/va-2024-staging.json
```

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
