# CivicResultMaps Mattermost reader

A local, read-only state-data bot for a single invite-only Mattermost channel.
It uses the installed MCP SDK and CivicResultMaps inventory/advisory data
through a separate **in-memory MCP facade**. The facade registers only state
inventory, calculated advisory counts, and a new bounded staging CSV reader.
It does not attach to the Codex-owned STDIO process, launch another STDIO
daemon, register ETL/action tools, or expose an MCP/HTTP listener.

The Mattermost client can be on Windows, web, or mobile. The bot itself runs
in a foreground Node process on a trusted machine with this checkout and its
existing `.etl/staging` artifacts. It polls only the configured private channel
using outbound HTTPS. No tunnel, inbound firewall rule, AI key, database
credential, or Mattermost slash-command endpoint is needed.

## Set up once

1. Use Node 22.16+ and the repository's installed dependencies. From the repo
   root, use `npm.cmd install` if dependencies have not already been installed.
   The bot uses the existing `@modelcontextprotocol/client` and `server`
   development dependencies; an `--omit=dev` installation is not sufficient.
2. Ask a Mattermost System Admin to create a dedicated bot account, for example
   `civic-results`. Use the **Member** role, not System Admin. Do not grant
   posting to all channels. Do not reuse a personal login/session token.
3. Invite that bot account to the target team and approved private channel.
   Bot channel membership is required for file uploads. A desktop login is not
   a bot credential.
4. Open the channel menu and find its Channel Info/details. Copy the 26-character
   **channel ID**, not the team ID, display name, or channel URL.
5. Copy `.env.example` to `.env.local` in this directory, then enter the server
   URL, bot token, channel ID, and exact URL-safe channel name. `.env.local` is
   already ignored by the repo. Never commit or copy that private file.
6. Optionally restrict command access further with comma-separated
   `MATTERMOST_ALLOWED_USER_IDS`. If empty, current members of the configured
   private channel can request data. Only invite people authorized to receive
   local staging data; private channels are still visible to server operators
   according to their policies.

Keep the token out of chat, source control, screenshots, and command-line
arguments. Store the private environment file where only the bot operator can
read it. Revoke/rotate the token if it is exposed. The bot never reads the
application's root `.env.local`; it does not need database credentials.

## Check and run (PowerShell, from the repository root)

```powershell
node --experimental-strip-types tools/mattermost-bot/run.ts --check
node --experimental-strip-types tools/mattermost-bot/run.ts
```

`--check` runs the MCP health gate and read-only Mattermost identity/channel
checks. It refuses personal/admin accounts, a missing invitation, public or
renamed destinations, and unhealthy MCP/workflow drift. It sends no messages
or files. A passing check does **not** prove that server file-upload and post
permissions are enabled; verify those with a real command afterward.

Keep the process and computer running. Ctrl+C stops it. Startup does not post
a greeting or replay old commands. No background service or scheduled task is
installed. A host-owned service can be added separately if continuous uptime
is wanted. This bot has its own three-tool schema; restarting it loads changes.
The development MCP and its allowlist are unchanged by this bot.

## Commands

Send these as ordinary messages in the configured private channel:

```text
!crm help
!crm state WI
!crm sources WI
!crm indicators WI 2024
!crm csv WI results 2024
!crm csv WI turnout 2024
!crm csv WI historical 2020
!crm csv WI historical
!crm csv WI sources
```

Use any state/DC code present in both the project metadata and ETL configs.
`state` summarizes inventory counts, gaps and caveats; it does not collect data.
`sources` is an alias for the complete source-inventory CSV.
Advisory counts support 2016, 2020, and 2024; default 2024. They reuse the
single-artifact helper extracted from the existing staging indicator report,
with identical normalization and calculations, not a second indicator formula.
They are calculated staging counts, not checked production database counts.

| CSV family | Grain and year behavior |
| --- | --- |
| `results` | 2024, one row per candidate per native reporting unit. `totalVotes`, margin and source context repeat per candidate. **Do not sum repeated totalVotes.** No statewide/county/precinct reaggregation. |
| `turnout` | 2024 native turnout units, denominator type/timing, warnings and recorded context. Missing fields stay empty, not zero. |
| `historical` | Native 2012/2016/2020/2024 historical rows if present. Omit the year for all available historical years. Preserve recorded names/tags; no inferred county FIPS or boundary crosswalk. |
| `sources` | All sources declared in the staging package, including candidate/context-only sources. No year filter: metadata does not reliably assign a single election year to every source. Status/confidence is retained; a source record is not certification. |

Replies appear in the requesting message's thread. CSV requests attach the
CSV plus a JSON manifest with native/exported row counts, columns, size,
artifact modification time, SHA-256 of the exact artifact bytes read, CSV
SHA-256, and interpretation notes. No local source files are uploaded.

## Data and security boundaries

- Everything is **local staging**, which may differ from the live site.
  A file timestamp/hash identifies bytes, not source certification or a verified
  parser run. No fallback to seed/public/API data occurs when staging is absent.
- Source URLs, authority, confidence, status and parser names are attached
  where matching metadata exists. Row-specific historical URLs are preserved.
  Missing/ambiguous source matches are explicit. Local artifact paths, raw
  metadata, credentials, and raw MCP envelopes/errors are excluded. Text
  presentation suppresses local absolute paths and common credential patterns.
- Exports contain only the documented approved columns, not arbitrary JSON
  fields. They are not a lossless dump of every internal native field.
  Geometry, review-row microdata, CVRs, records-request correspondence, model
  predictions, arbitrary SQL, arbitrary file paths, and write tools are absent.
  When present, `reportingUnit` is a JSON cell containing only the declared
  source-unit ID/display name, reporting grain, parent GEOID and geographic
  boolean. No geographic relationship or identifier is inferred.
- CSVs use UTF-8 with BOM, CRLF, quoted cells, and quote escaping. Formula-like
  text cells are prefixed with an apostrophe. Genuine finite numbers are not
  changed. To preserve leading-zero identifier strings in Excel, import via
  **Data > From Text/CSV** and set identifier columns to Text.
- Complete exports only: 100,000 output rows, 8 MiB per CSV, and a 128 MiB
  artifact-read cap. Requests above a cap fail without a partial CSV. Missing
  rows do not become zeros. The sources inventory is not year-filtered.
- Requests are fixed command grammar, with no model/LLM interpretation.
  Destination name/ID/privacy and bot membership are rechecked before uploads
  and posts; the requester must still be a member. Files are attached through
  authenticated channel uploads; no public file-link API is called.
- HTTPS certificate verification stays on; redirects fail closed. Credentials
  go in authorization headers only. API responses are bounded; raw server
  error bodies and chat text are not logged.
- The worker is serial, polls every five seconds by default, and accepts at
  most ten commands per poll with a five-second per-user cooldown. Excess
  requests are skipped and a generic local log is emitted; users can retry.
  Only new messages are processed. Edits, startup history, system posts, self
  replies, and flagged bot/webhook posts are ignored.
- Pagination is bounded to the newest 1,000 posts and anchored by post ID. A
  larger backlog skips older queued commands, logs a warning, and includes that
  warning in the next successful reply. Users should resend unanswered requests.
  On startup, more than 1,000 posts sharing the exact newest timestamp leaves
  the bot fail-closed until a newer baseline exists, rather than replaying history.
  Invalid/nonprogressing pages fail without advancing the cursor. No
  exactly-once delivery is claimed. A failed/timed-out upload or post is never
  automatically retried, since it may already have succeeded. If a later
  upload/post fails, earlier files may remain unattached on the server under
  its retention policy; the bot does not delete server data automatically.
- Advisory indicators identify data gaps/reconciliation/review signals only,
  never proof of fraud or misconduct.

## Local verification

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/api/mattermost-bot.test.mjs
npm.cmd run typecheck
```

The no-isolation flag lets the focused Node test suite run without child-test
process creation in constrained Windows environments. Tests include a real
in-memory MCP client/server round trip, strict tool schemas/action exclusion,
CSV/provenance fixtures, private-channel authorization, mocked HTTPS uploads,
pagination/deduplication, and safe errors. Tests make no real Mattermost posts.

Live acceptance requires credentials and invitation: run `--check`, start the
bot, send `!crm state WI` and `!crm csv WI results 2024`, then inspect the thread
and download the CSV. Check its SHA-256 against the attached manifest. Confirm
no reply in another channel. That final server/client path is not verified by
the local mocks.

Isolated verification, 2026-09-22: 24 focused bot tests plus 20
advisory/historical/native-import regressions passed; project TypeScript checks
passed. The combined MCP suite passed 118 tests with three Windows
symlink-creation skips and no failures. An earlier review pass compared the
extracted advisory helper with the directory report over all 51 available
artifacts for 2016/2020/2024 without differences. Real Wisconsin
MCP export smoke checks returned 216 candidate result rows (72 native units),
1,851 turnout rows, 72 historical 2020 rows, and 13 source rows. No staging
files were changed. No live Mattermost connection/post/upload test has run:
the dedicated bot token and channel ID are still required. The local
`--check` command correctly refuses to start with those values missing.

Mattermost references: [bot accounts](https://developers.mattermost.com/integrate/reference/bot-accounts/),
[file uploads](https://docs.mattermost.com/api/reference/upload-file),
[posts](https://docs.mattermost.com/api/reference/create-post), and
[post pagination contract](https://github.com/mattermost/mattermost/blob/master/api/v4/source/posts.yaml).
