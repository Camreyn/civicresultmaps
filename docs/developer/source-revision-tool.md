# Local source-revision recorder

`crm_record_source_revision` is a private local MCP action for retaining an
auditable snapshot of an already-configured source artifact. It is not a
fetcher, crawler, scheduler, normalizer, or production publication path.
It never accepts a user-supplied path or URL. The state config selects the
single `sources[].localFile` that can be read.

```json
{
  "tool": "crm_record_source_revision",
  "arguments": {
    "state": "WI",
    "sourceId": "wi-2024-ward-by-ward-federal-state-xlsx",
    "confirmation": "RECORD_SOURCE_REVISION"
  }
}
```

The recorder writes only under `.etl/source-revisions/<state>/<sourceId>/`.
Each revision is content-addressed by SHA-256 and has immutable `source.bin`
and `manifest.json` files. Calling it again with identical bytes is idempotent;
new bytes create a new revision and retain the old one. The mutable `latest.json`
is a convenience pointer only, never lineage evidence.

The manifest records the observed source authority, HTTPS URL, year and grain
when declared, safe retrieval metadata, configured parser identity, state-config
and staging digests, source bytes/digest status, and explicitly declared page,
sheet (including `sheetName`), cell, and row values. Missing lineage remains `missing`—the
tool does not infer it. A valid configured SHA-256 is checked against observed
bytes; absent, malformed, and mismatched declarations are reported distinctly.
It separately records an observed, bounded fingerprint of trusted parser
implementation files (`civic_etl` Python, supported `scripts` code, and fixed
native-import dependencies). This conservative fingerprint can make a revision
stale after a code change even when the configured parser name did not change;
it is not proof that the recorded code generated the artifact.
Retrieval metadata is a small allowlist (retrieval time, method, and sanitized
HTTPS URL); arbitrary retrieval fields, credentials, fragments, and signed query
tokens are not copied into manifests.

When both staging summaries are available, a later revision records changed
numeric aggregate fields, canonical keyed-row additions/removals/changes, plus
added/removed staged source IDs. This detects substitutions whose aggregate
totals happen to be equal. Unsupported or
unavailable staging evidence is marked `unknown`, not calculated by inference.
The recorder caps source bytes at 50 MiB, staging bytes at 20 MiB, and staging
rows at 100,000. Manifest reads/writes share a 20 MiB bound. Parser code scans
are bounded to the fixed file set and 25 MiB; observed metadata is not a signed
attestation against an owner who can edit the local filesystem.

For safety, all reads and writes are repository-contained after realpath checks;
external symlinks and Windows junctions fail closed. Source files are stat/read/
stat checked and re-read before persistence, so a change during recording
rejects rather than being mislabeled. Existing immutable bytes or manifests
with different content are rejected; reads rehash `source.bin` against the
manifest and reject symlinks. State config, parser identity, and staging bytes
are also reread immediately before persistence. Concurrent calls may race only on the
advisory `latest.json`; immutable revision directories remain append-only.

Verification evidence is the returned revision SHA-256, manifest path, source
digest status, and staging/config digests. It establishes retained-byte lineage,
not source correctness, certification, public API display, or election claims.
Run `npm.cmd run test:mcp` after registration changes; the focused recorder
coverage is `tests/api/crm-source-revisions.test.mjs`.
