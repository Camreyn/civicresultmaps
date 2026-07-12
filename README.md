# Civic Result Maps

Database-backed election result explorer, public API, and ETL platform for
`civicresultmaps.org`.

This repository is the long-term home for the Civic Result Maps platform. The
older `Camreyn/wisconsin-2024-election-mapper` project remains the legacy static
GitHub Pages app and a source of migration knowledge for state configs, parser
patterns, generated state registries, and validation expectations.

## Stack

- Next.js App Router and React for the frontend and public read API.
- Neon Postgres, modeled through Drizzle, for normalized election data.
- Python ETL tooling for config-driven source imports, validation, staging, and
  reviewed promotion.
- GitHub Actions and Vercel preview deployments for CI/CD.

## Public API V1

- `GET /api/states`
- `GET /api/jurisdictions?state=<STATE>&fips=<GEOID>`
- `GET /api/elections?year=2024&office=president`
- `GET /api/results?state=WI&year=2024&level=county`
- `GET /api/sources?state=WI&year=2024`
- `GET /api/coverage?state=WI&year=2024`

Public reads are enabled. Admin writes, source updates, and production data
promotion are intentionally private and CI-gated.

## Local Development

```powershell
npm install
npm run dev
```

The app uses built-in seed data when `DATABASE_URL` is not set. After Neon is
provisioned, set `DATABASE_URL` and run:

```powershell
npm run db:push
npm run db:seed
npm run build
npm test
```

`npm run db:seed` loads starter WI/MN/WA records into Postgres so the public API
switches from seed fallback mode to database-backed reads immediately.
The database scripts read `.env.local` and accept either `DATABASE_URL` or the
Vercel Neon-provided `POSTGRES_URL`.

## GitHub And Vercel Setup

This repo is intended to be pushed to:

```text
https://github.com/Camreyn/civicresultmaps
```

After the GitHub repo exists and the first commit is pushed:

1. Create a Vercel project from `Camreyn/civicresultmaps`.
2. Provision Neon through Vercel Marketplace.
3. Pull or set `DATABASE_URL`.
4. Run `npm run db:push` and `npm run db:seed`.
5. Add `civicresultmaps.org` and `www.civicresultmaps.org` to the Vercel project.
6. Point DNS to Vercel and wait for certificate issuance.

## ETL

Validate the Wisconsin starter config:

```powershell
npm run etl:validate
```

Create a reviewed staging artifact:

```powershell
npm run etl:import
```

The v1 ETL package keeps agents advisory only. Agents can propose parser
mappings, summarize source pages, and flag validation gaps, but production data
writes remain human-reviewed.

Historical 2016/2020 advisory evaluation requires official same-grain presidential and comparison-contest rows. See [`docs/historical-advisory-indicators.md`](docs/historical-advisory-indicators.md) for the candidate-neutral row contract, evaluated/not-evaluated semantics, broad-signal warning, and promotion safeguards.
