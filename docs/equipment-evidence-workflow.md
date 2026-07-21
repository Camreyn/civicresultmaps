# Election Equipment Evidence Workflow

The equipment explorer is a feature-gated, source-first catalog of reviewed election-system configurations. It is designed to distinguish what a federal certificate, VSTL test artifact, state approval, jurisdiction inventory, manufacturer advisory, or field observation actually establishes.

It does not infer fraud, misconduct, altered votes, election outcomes, unit condition, or field installation from a certification record.

## Current status

The checked-in catalog is a staging pilot. Claims may be `approved` for feature-gated review while public production publication remains a separate editorial and deployment decision.

Local and staging access requires both flags:

```text
EQUIPMENT_EXPLORER_ENABLED=1
NEXT_PUBLIC_EQUIPMENT_EXPLORER=1
```

The server-side flag makes page and API responses fail closed when disabled. The public-prefixed flag exposes workspace navigation in an enabled build. The 3D scene remains dynamically loaded only after the viewer is opened. Production should leave both flags disabled until all publication gates below pass.

## Evidence boundaries

Keep these scopes separate:

| Scope | What it establishes | What it does not establish |
| --- | --- | --- |
| Certified | A named version and configuration were evaluated under the identified certificate | Installation, election readiness, or the state of a field unit |
| Documented | An official, VSTL, state, or manufacturer-primary record describes the item or change | Certification or field adoption unless the record says so |
| State approved | A state approved a named configuration | County selection, installation, or live firmware |
| Fielded | A dated official inventory, acceptance record, inspection, or equivalent direct jurisdiction source establishes use | Internal components or firmware not named by that record |
| Advisory | A primary notice describes a bounded version, condition, or procedure | Incidence, exploitation, election effect, or resolution beyond the notice |

An EAC engineering change order or Pro V&V analysis is configuration-change evidence. It is not a unit service history and does not prove that a jurisdiction installed the change.

## Immutable source revisions

`data/equipment-source-packages.json` uses schema version 2. A stable source ID identifies the conceptual document; each archived retrieval has an immutable revision ID, artifact path, SHA-256 digest, byte length, publication metadata, and retrieval precision.

Two revision pointers intentionally differ:

- `latestRetrievedRevisionId` is the newest artifact collected.
- `currentReviewedRevisionId` is the artifact approved for compatibility fields and editorial use.

A changed download is archived as `pending_review`. Its hash change is only a review trigger, not evidence that the equipment configuration changed. Existing claims stay pinned to their previously reviewed source revisions.

Check sources without writing:

```powershell
npm run equipment:sources:refresh
npm.cmd run equipment:sources:refresh -- --source=eac-dsuite-517-record
```

On Windows, use `npm.cmd` whenever forwarding option-looking arguments after `--`. PowerShell's `npm.ps1` shim can consume them as npm configuration instead of passing them to the script; verify the printed command includes the selector before trusting a targeted refresh.

Archive changed artifacts without approving them:

```powershell
npm run equipment:sources:refresh -- --write
```

Review a newly archived revision first as a dry run, then repeat with `--write` after human comparison:

```powershell
npm run equipment:sources:review -- --source=<source-id> --revision=<revision-id> --decision=approve --reviewer=<role> --note="<review note>"
npm run equipment:sources:review -- --source=<source-id> --revision=<revision-id> --decision=approve --reviewer=<role> --note="<review note>" --write
```

Rejecting a revision preserves it in the audit history but does not make it the reviewed compatibility artifact.

## Claim editorial lifecycle

Claims use the following guarded lifecycle:

```text
draft -> in_review -> approved -> published -> superseded
                    \-> draft
draft/in_review/approved/published -> withdrawn
```

- `draft` and `in_review` claims are excluded from the generated staging catalog.
- `approved` claims may appear only in the feature-gated staging pilot.
- `published` is required before public production activation.
- A pending substantive source comparison prevents an affected claim from advancing.
- Publication requires an immutable release identifier and never happens as a side effect of source refresh.

Preview a transition before writing it:

```powershell
npm run equipment:claims:state -- --slug=<slug> --state=in_review --reviewer=<role> --note="<review note>"
```

Add `--write` only after review. Moving from `approved` to `published` also requires `--publication=<immutable-release-id>`.

## Version terminology

The explorer must not present a value as simply "latest firmware." Use one of these explicit meanings:

- **Certified**: version named in the final certificate or scope.
- **Documented**: submitted test version, change record, advisory version, or another official observation that is not itself a final certification or field reading.
- **Fielded**: version established by a dated official jurisdiction record at the stated grain.

Every version record carries `assertionScope`, `fieldStatus`, an observation date, exact source revision IDs, and a caveat. Certified and documented values must retain `fieldStatus: not_established` unless separate field evidence exists.

## Hardware and interface specifications

Component-level CPU, RAM, storage, battery, USB, Ethernet, cellular, display, and other interface facts live in `technicalSpecifications`. Each specification must include:

- a stable ID, category, label, and exact `modelContext`;
- `knowledgeStatus` of `confirmed`, `documented_partial`, or `not_publicly_established`;
- an assertion scope that distinguishes a certified configuration, approved change, documented model family, manufacturer product statement, or evidence gap;
- source IDs and immutable source-revision IDs; and
- a caveat that prevents transfer to another model alternative, a fielded unit, or a live configuration.

An unresolved value is stored as `null`, never a guess or a value silently borrowed from a nearby model. Manufacturer-family maximums and configurable options are labeled partial; they are not presented as installed capacity. Physical connector presence is kept separate from certified communications use, port occupation, enabled services, and field cabling. A Wi-Fi option is not described as a cellular modem.

Hardware that is not present by default is modeled as its own component with `optionality: "optional"`. Its component card and scene node must not be merged into the base machine, and its sources must directly establish both the option and its equipment-family scope.

## Adding a dossier

1. Prefer an EAC certification page, certificate/scope, VSTL test plan, and final test report.
2. Add official state, local, ECO, or primary advisory documents only for the scope they directly establish.
3. Archive each source under `data/equipment-sources/` and register its hash, byte length, dates, URL, authority, section, and caveat.
4. Add a claim under `data/equipment-claims/` with exact `sourceIds` and `sourceRevisionIds` on every record.
5. Preserve unknown model, firmware, runtime, deployment, or internal-placement fields rather than borrowing details from another configuration.
6. Build an original schematic only for source-supported component categories. Record the exact external photo, manual, or drawing reference in the scene metadata.
7. Add at least one local reference image with its own immutable source revision, asset hash, pixel dimensions, page or section, derivation note, and scope caveat.
8. Rebuild and validate the catalog.

```powershell
npm run equipment:catalog:build
npm run equipment:catalog:coverage
npm run test:equipment-catalog
npm run typecheck
```

## 3D fidelity and accessibility

The GLB files are original CivicResultMaps navigation schematics. Their rough external outlines may be informed by an official product photo, manual, or mechanical drawing named in `referenceConfiguration` and pinned through `referenceSourceIds` and `referenceSourceRevisionIds`. They are not vendor CAD, exact replicas, teardowns, wiring diagrams, bills of materials, or representations of exact dimensions and placement.

- The accessible DOM component list is always the source of truth.
- 3D is opt-in and dynamically loaded.
- Pointer drag rotates the scene, wheel or pinch changes orthographic zoom, and keyboard-operable zoom, preset, and reset buttons provide equivalent camera controls.
- A no-WebGL fallback retains every source-linked component and finding.
- A component with known existence but unknown placement may be listed without a scene node.
- An optional component is labeled in both the component rail and detail card. Its scene shape may be symbolic when the source establishes existence but not exact model, dimensions, or placement.
- A central-tabulation dossier may represent a multi-box system (scanner, workstation, server, closed network, and power equipment) rather than implying that every tabulator is one enclosure.
- A selectable scene node may be a composite group with multiple original child meshes, but it still maps to exactly one evidence record.
- Explosion offsets and simplified internal shapes are illustrative unless a cited source specifically establishes placement.
- Hide and isolate controls change only the local scene presentation. They do not remove a component, claim, or source from the dossier.
- Component hardware cards omit null/unknown specifications and explicit statements that a network capability is absent. Those records remain preserved in the catalog for review and validation.
- A component-list network badge requires a positively documented Ethernet, Wi-Fi, cellular, Bluetooth, or other network capability. The badge describes capability only, not an enabled connection, field use, or attached network.
- Reference-gallery assets are local, hash-validated copies or explicitly described derivatives of archived sources. Expanded images retain their source link, page or section, derivation note, and scope caveat.
- A product-family or older-version photograph is labeled as context and must not be presented as the exact certified alternative, installed field configuration, or teardown.
- A reference configuration must not imply that all certified alternatives appear together or that a jurisdiction fielded the depicted alternative.
- Every scene mapping must resolve to exactly one GLB node.

## Publication gates

Before enabling the feature publicly:

1. All public claims are in `published` state and pin verified source revisions.
2. No affected source comparison remains pending.
3. The evidence and neutral-language editorial review is complete.
4. `npm run test:equipment-catalog`, `npm run typecheck`, `npm run test:layout`, and a feature-enabled production build pass.
5. Browser checks cover catalog discovery, APIs, keyboard/component selection, serious/critical accessibility findings, WebGL selection, and the no-WebGL fallback.
6. Performance review confirms that Three.js remains outside the initial 2D route payload until the viewer is opened.
7. A preview deployment is reviewed before production flags change.

Public activation is a deployment decision, not part of catalog generation, source refresh, or editorial approval.
