# Verification plans and release evidence

`crm_plan_verification` is read-only. It examines fixed Git status and tracked/
untracked relevant worktree contents, then recommends additive focused profiles
while always listing required global gates. Shared, unknown, data-rule, CI, and
core paths require the full test suite. It does not execute arbitrary commands.

```json
{"tool":"crm_plan_verification","arguments":{"states":["WI","MN"]}}
```

An identity contains the full Git commit SHA, deterministic hashes of relevant
checked-out code/test/config content (so dirty worktree changes matter), and
exact selected staging SHA-256 values. Missing or unreadable values are
inconclusive, never substituted with a guessed revision.

`crm_capture_release_evidence` is a confirmed local action. It reads only real
`.etl/mcp-runs/<run-id>/manifest.json` records and their hashed logs; callers
cannot submit a claimed pass result.

```json
{"tool":"crm_capture_release_evidence","arguments":{"states":["WI"],"testRunIds":[],"confirmation":"CAPTURE_RELEASE_EVIDENCE"}}
```

The empty-run example deliberately records incomplete evidence. First run
`crm_run_test_profile` with `states: ["WI"]`, then use the returned `run.id` in
`testRunIds` and its `result.auditManifestSha256` in
`expectedAuditHashes: {"<returned-run-id>": "<returned-sha256>"}`. Do not invent
either value. Both before/after code identity and selected staging hashes must
match the current candidate. The exact reviewed steps and complete log
inventory must pass, not just a caller-supplied status.

The immutable result and retained copies of the audit/logs are written under
`.etl/release-evidence/<sha256>/`. It
rejects malformed IDs, failed runs, absent identity, source mutation during a
run, unsafe paths, missing logs, and log-hash tampering. Older test audits that
lack before/after identity and log hashes remain unverified. Valid local test
evidence is not a publication decision: this tool ALWAYS returns
`releaseReady: false`. Complete release gates, deployment identity, and database
revision remain unverified here. Hashes detect mutation relative to the retained
expected digest; these local files are not signed remote attestations against
a malicious filesystem owner.

Identity includes code, migrations, runtime/source JSON/GeoJSON, checked-in root
configuration, and selected staging bytes, including dirty/untracked files.
It excludes secret environment files and is bounded to 4 GiB per scan,
256 MiB per file, and 60 seconds; hitting a bound is inconclusive. This is not a
snapshot: changes detected during the scan or test prevent verified evidence.

The CI helper records all enumerated validation gates and checks GitHub's
run/commit context against the checkout. Local caller-provided outcomes are
unverified. Outcome-record hashes are explicitly not CI log hashes; GitHub
retains the actual logs. CI evidence also always leaves `releaseReady: false`,
with deployment and database identity unverified. Existing CI gates are retained.
