"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Cable,
  CircleDot,
  ExternalLink,
  FileImage,
  Link2,
  Maximize2,
  Network,
  Route,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import type {
  EquipmentNetworkEvidence,
  EquipmentSource,
} from "@/lib/equipment-catalog";
import styles from "../equipment.module.css";
import type {
  EquipmentTopologyGraphProps,
  EquipmentTopologySelection,
} from "./equipment-topology-graph.client";
import { EquipmentReferenceLightbox } from "./equipment-reference-lightbox.client";

const EquipmentTopologyGraph = dynamic<EquipmentTopologyGraphProps>(
  () => import("./equipment-topology-graph.client").then((module) => module.EquipmentTopologyGraph),
  {
    loading: () => (
      <div className={styles.topologyGraphFallback} role="status">
        Preparing the interactive topology…
      </div>
    ),
    ssr: false,
  },
);

function label(value: string) {
  return value.replaceAll("_", " ");
}

function externalPathwayStatusLabel(value: string) {
  switch (value) {
    case "no_external_path_documented":
      return "No external path documented";
    case "physical_interface_only":
      return "Interface documented; no external peer";
    case "documented_indirect_path":
      return "External transport documented after a separate handoff";
    case "optional_capability_only":
      return "Optional external capability; complete path not established";
    case "documented_reference_path":
      return "External path documented in a scoped reference";
    default:
      return label(value);
  }
}

function internetReachabilityLabel(value: string) {
  switch (value) {
    case "explicitly_excluded":
      return "Explicitly excluded by reviewed sources";
    case "not_documented":
      return "Not documented in this configuration";
    case "documented_in_reference_path":
      return "Shown in this scoped source";
    default:
      return label(value);
  }
}

function focusConnectionStatusLabel(value: string) {
  switch (value) {
    case "no_connection_documented":
      return "No external connection documented";
    case "indirect_result_handoff":
      return "Separate result handoff; dossier device is not the endpoint";
    case "optional_hardware_not_established":
      return "Optional hardware; complete path not established";
    case "direct_in_reference_path":
      return "Direct path in this scoped reference";
    default:
      return label(value);
  }
}

function pathwayRoleLabel(value: string) {
  switch (value) {
    case "origin":
      return "Path origin";
    case "transport":
      return "External transport";
    case "boundary":
      return "Boundary control";
    case "receiving":
      return "Receiving system";
    default:
      return label(value);
  }
}

function EvidenceSources({
  sourceIds,
  sourceRevisionIds = [],
  sources,
}: {
  sourceIds: readonly string[];
  sourceRevisionIds?: readonly string[];
  sources: readonly EquipmentSource[];
}) {
  const requested = new Set(sourceIds);
  return (
    <div className={styles.networkSourceLinks}>
      {sources.filter((source) => requested.has(source.id)).map((source) => {
        const revisionIds = sourceRevisionIds.filter((revisionId) =>
          source.revisions.some((revision) => revision.id === revisionId));
        return (
          <div className={styles.networkSourceCitation} key={source.id}>
            <a href={source.url} rel="noreferrer" target="_blank">
              <ExternalLink aria-hidden size={12} />
              {source.publisher}: {source.title}
            </a>
            {revisionIds.map((revisionId) => <code key={revisionId}>{revisionId}</code>)}
          </div>
        );
      })}
    </div>
  );
}

export function EquipmentTopologyEvidencePanel({
  evidence,
  sources,
}: {
  evidence: EquipmentNetworkEvidence;
  sources: readonly EquipmentSource[];
}) {
  const firstConfiguration = evidence.configurations[0];
  const [configurationId, setConfigurationId] = useState(firstConfiguration.id);
  const [selection, setSelection] = useState<EquipmentTopologySelection>({
    id: firstConfiguration.focusNodeId,
    kind: "node",
  });
  const [expandedImageId, setExpandedImageId] = useState<string | null>(null);
  const configuration = evidence.configurations.find((record) => record.id === configurationId)
    ?? firstConfiguration;
  const selectedLink = selection.kind === "link"
    ? configuration.links.find((link) => link.id === selection.id) ?? null
    : null;
  const selectedNode = selection.kind === "node"
    ? configuration.nodes.find((node) => node.id === selection.id)
      ?? configuration.nodes.find((node) => node.id === configuration.focusNodeId)
      ?? configuration.nodes[0]
    : null;
  const activeSelection: EquipmentTopologySelection = selectedLink
    ? { id: selectedLink.id, kind: "link" }
    : {
        id: selectedNode?.id
          ?? configuration.nodes.find((node) => node.id === configuration.focusNodeId)?.id
          ?? configuration.nodes[0].id,
        kind: "node",
      };
  const expandedImage = evidence.sourceImages.find((image) => image.id === expandedImageId) ?? null;
  const observedCount = evidence.configurations.filter((record) => record.evidenceLayer === "observed").length;
  const nodeById = new Map(configuration.nodes.map((node) => [node.id, node]));
  const pathway = configuration.externalPathway;
  const pathwayNodeGroups: Array<{
    ids: readonly string[];
    label: string;
    role: "boundary" | "origin" | "receiving" | "transport";
  }> = [
    { ids: pathway.originNodeIds, label: "Path origin", role: "origin" },
    {
      ids: pathway.externalTransportNodeIds,
      label: "External transport / Internet-linked systems",
      role: "transport",
    },
    { ids: pathway.boundaryNodeIds, label: "Boundary controls", role: "boundary" },
    { ids: pathway.receivingNodeIds, label: "Receiving systems", role: "receiving" },
  ];
  const pathwayNodeRoleById = new Map<string, string>();
  for (const group of pathwayNodeGroups) {
    for (const nodeId of group.ids) pathwayNodeRoleById.set(nodeId, group.role);
  }
  const pathwayLinkIds = new Set(pathway.linkIds);
  const pathwayNodeCount = pathwayNodeRoleById.size;
  const explicitInternetConfigurationCount = evidence.configurations.filter(
    (record) => record.externalPathway.internetReachability === "documented_in_reference_path",
  ).length;

  function selectConfiguration(nextId: string) {
    const next = evidence.configurations.find((record) => record.id === nextId);
    if (!next) return;
    setConfigurationId(next.id);
    setSelection({ id: next.focusNodeId, kind: "node" });
  }

  return (
    <section
      aria-labelledby="topology-evidence-heading"
      className={styles.dossierSection}
      data-network-evidence
      data-topology-evidence
    >
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.eyebrow}><Network aria-hidden size={14} /> Source-bounded topology</p>
          <h2 id="topology-evidence-heading">Documented topology, controls, and unknowns</h2>
        </div>
        <p>Expected, documented, and observed configurations remain separate. Physical port capability is not treated as an active connection, and public-Internet reachability is shown only when a reviewed source says so.</p>
      </div>

      <article className={styles.networkBoundary}>
        <ShieldCheck aria-hidden size={23} />
        <div>
          <div className={styles.networkBoundaryTopline}>
            <strong>Safe public evidence boundary</strong>
            <span>Reviewed {evidence.reviewedOn}</span>
          </div>
          <p>{evidence.summary}</p>
          <small>{evidence.publicationBoundary}</small>
        </div>
      </article>

      <div className={styles.networkOverviewBadges} aria-label="Topology evidence coverage">
        <span>{evidence.configurations.length} sourced configuration {evidence.configurations.length === 1 ? "view" : "views"}</span>
        <span>{evidence.sourceImages.length} source {evidence.sourceImages.length === 1 ? "image" : "images"}</span>
        <span>{observedCount === 0 ? "No field-observed topology collected" : `${observedCount} field-observed topology records`}</span>
        <span>{explicitInternetConfigurationCount === 0
          ? "No source explicitly shows an Internet path"
          : `${explicitInternetConfigurationCount} scoped source ${explicitInternetConfigurationCount === 1 ? "shows" : "show"} an Internet path`}</span>
      </div>

      {evidence.configurations.length > 1 && (
        <div className={styles.networkConfigurationTabs} aria-label="Topology configuration views">
          {evidence.configurations.map((record) => (
            <button
              aria-pressed={record.id === configuration.id}
              key={record.id}
              onClick={() => selectConfiguration(record.id)}
              type="button"
            >
              <span>{label(record.evidenceLayer)}</span>
              <strong>{record.title}</strong>
            </button>
          ))}
        </div>
      )}

      <article className={styles.networkConfigurationPanel}>
        <header className={styles.networkConfigurationHead}>
          <div>
            <div className={styles.networkConfigurationBadges}>
              <span>{label(configuration.evidenceLayer)} layer</span>
              <span>{label(configuration.assertionScope)}</span>
              <span>{label(configuration.knowledgeStatus)}</span>
            </div>
            <h3>{configuration.title}</h3>
            <p>{configuration.description}</p>
          </div>
          <div className={styles.networkTopologyKind}>
            <Cable aria-hidden size={17} />
            <span>Topology</span>
            <strong>{label(configuration.topologyKind)}</strong>
          </div>
        </header>

        <article
          className={styles.externalPathwayCard}
          data-external-pathway
          data-internet-reachability={pathway.internetReachability}
          data-pathway-status={pathway.status}
        >
          <header className={styles.externalPathwayHead}>
            <div>
              <Route aria-hidden size={19} />
              <span>
                <small>External pathway evidence</small>
                <strong>{externalPathwayStatusLabel(pathway.status)}</strong>
              </span>
            </div>
            <span>{pathwayLinkIds.size === 0
              ? "No highlighted route"
              : `${pathwayLinkIds.size} highlighted ${pathwayLinkIds.size === 1 ? "connection" : "connections"}`}</span>
          </header>

          <p className={styles.externalPathwaySummary}>{pathway.summary}</p>
          <div className={styles.externalPathwayFacts}>
            <div>
              <span>Public Internet</span>
              <strong>{internetReachabilityLabel(pathway.internetReachability)}</strong>
            </div>
            <div>
              <span>Dossier connection</span>
              <strong>{focusConnectionStatusLabel(pathway.focusConnectionStatus)}</strong>
            </div>
          </div>

          {pathwayNodeCount > 0 && (
            <div className={styles.externalPathwayNodeGroups}>
              {pathwayNodeGroups.filter((group) => group.ids.length > 0).map((group) => (
                <div key={group.role}>
                  <span>{group.label}</span>
                  <div>
                    {group.ids.map((nodeId) => {
                      const node = nodeById.get(nodeId);
                      return (
                        <button
                          aria-pressed={activeSelection.kind === "node" && activeSelection.id === nodeId}
                          data-pathway-role={group.role}
                          key={nodeId}
                          onClick={() => setSelection({ id: nodeId, kind: "node" })}
                          type="button"
                        >
                          {node?.label ?? nodeId}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {pathwayLinkIds.size > 0 && (
            <div className={styles.externalPathwayLinks}>
              <span>Highlighted connections</span>
              <div>
                {pathway.linkIds.map((linkId) => {
                  const link = configuration.links.find((record) => record.id === linkId);
                  if (!link) return null;
                  return (
                    <button
                      aria-pressed={activeSelection.kind === "link" && activeSelection.id === linkId}
                      key={linkId}
                      onClick={() => setSelection({ id: linkId, kind: "link" })}
                      type="button"
                    >
                      <Link2 aria-hidden size={13} />
                      <span>
                        <strong>{nodeById.get(link.from)?.label ?? link.from} → {nodeById.get(link.to)?.label ?? link.to}</strong>
                        <small>{link.medium}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.externalPathwayBoundary}>
            <AlertTriangle aria-hidden size={15} />
            <p>Evidence classification only. It does not establish a live connection, current deployment, attack path, or security finding.</p>
          </div>
          <p className={styles.externalPathwayCaveat}>{pathway.caveat}</p>
          <EvidenceSources
            sourceIds={pathway.sourceIds}
            sourceRevisionIds={pathway.sourceRevisionIds}
            sources={sources}
          />
        </article>

        <div className={styles.networkInteractiveGrid}>
          <EquipmentTopologyGraph
            configuration={configuration}
            key={configuration.id}
            onSelect={setSelection}
            selection={activeSelection}
          />

          <aside className={styles.networkNodeDetail} aria-live="polite">
            {selectedLink ? (
              <>
                <span>Selected connection</span>
                <h3>{nodeById.get(selectedLink.from)?.label ?? selectedLink.from} → {nodeById.get(selectedLink.to)?.label ?? selectedLink.to}</h3>
                <p>{selectedLink.purpose}</p>
                <dl>
                  <div><dt>Medium</dt><dd>{selectedLink.medium}</dd></div>
                  <div><dt>Direction</dt><dd>{label(selectedLink.direction)}</dd></div>
                  <div><dt>Evidence status</dt><dd>{label(selectedLink.knowledgeStatus)}</dd></div>
                  <div><dt>External-path segment</dt><dd>{pathwayLinkIds.has(selectedLink.id) ? "Yes — source-highlighted" : "No"}</dd></div>
                </dl>
                <small>These citations support this connection within this configuration; they do not establish a live field network.</small>
                <EvidenceSources
                  sourceIds={selectedLink.sourceIds}
                  sourceRevisionIds={selectedLink.sourceRevisionIds}
                  sources={sources}
                />
              </>
            ) : selectedNode ? (
              <>
                <span>{selectedNode.id === configuration.focusNodeId ? "Primary dossier node" : "Selected node"}</span>
                <h3>{selectedNode.label}</h3>
                <p>{selectedNode.details}</p>
                <dl>
                  <div><dt>Role</dt><dd>{selectedNode.role}</dd></div>
                  {selectedNode.componentId && <div><dt>Dossier component</dt><dd>{selectedNode.componentId}</dd></div>}
                  <div><dt>Optional</dt><dd>{selectedNode.optional ? "Yes" : "No"}</dd></div>
                  {pathwayNodeRoleById.has(selectedNode.id) && (
                    <div>
                      <dt>External-path role</dt>
                      <dd>{pathwayRoleLabel(pathwayNodeRoleById.get(selectedNode.id) ?? "")}</dd>
                    </div>
                  )}
                </dl>
                <small>Select a node or connection in the topology to inspect the exact source revisions supporting it.</small>
                <EvidenceSources
                  sourceIds={selectedNode.sourceIds}
                  sourceRevisionIds={selectedNode.sourceRevisionIds}
                  sources={sources}
                />
              </>
            ) : null}
          </aside>
        </div>

        <details className={styles.networkAccessibleIndex} open>
          <summary>
            <CircleDot aria-hidden size={14} />
            <span><strong>Accessible topology index</strong><small>Select a node or connection without using the canvas.</small></span>
          </summary>
          <div className={styles.networkTopologyPanel}>
            <div className={styles.networkPanelTitle}>
              <span><CircleDot aria-hidden size={14} /> Select a node or connection</span>
              <small>Mirrors the interactive topology</small>
            </div>
            <div className={styles.networkNodes}>
              {configuration.nodes.map((node) => (
                <button
                  aria-pressed={activeSelection.kind === "node" && node.id === activeSelection.id}
                  className={[
                    activeSelection.kind === "node" && node.id === activeSelection.id
                      ? styles.networkNodeActive
                      : "",
                    pathwayNodeRoleById.has(node.id) ? styles.networkNodePathway : "",
                  ].filter(Boolean).join(" ") || undefined}
                  data-pathway-role={pathwayNodeRoleById.get(node.id)}
                  key={node.id}
                  onClick={() => setSelection({ id: node.id, kind: "node" })}
                  type="button"
                >
                  <Network aria-hidden size={16} />
                  <span>
                    <strong>{node.label}</strong>
                    <small>{node.role}{pathwayNodeRoleById.has(node.id)
                      ? ` · ${pathwayRoleLabel(pathwayNodeRoleById.get(node.id) ?? "")}`
                      : ""}</small>
                  </span>
                  {node.optional && <em>Optional</em>}
                </button>
              ))}
            </div>

            <div className={styles.networkLinks} aria-label="Documented connection paths">
              {configuration.links.map((link) => {
                const from = nodeById.get(link.from);
                const to = nodeById.get(link.to);
                const active = activeSelection.kind === "link" && activeSelection.id === link.id;
                return (
                  <button
                    aria-pressed={active}
                    className={[
                      active ? styles.networkLinkActive : "",
                      pathwayLinkIds.has(link.id) ? styles.networkLinkPathway : "",
                    ].filter(Boolean).join(" ") || undefined}
                    data-external-path-segment={pathwayLinkIds.has(link.id) || undefined}
                    key={link.id}
                    onClick={() => setSelection({ id: link.id, kind: "link" })}
                    type="button"
                  >
                    <div>
                      <Link2 aria-hidden size={14} />
                      <strong>{from?.label ?? link.from}</strong>
                      {link.direction === "bidirectional"
                        ? <ArrowLeftRight aria-label="Bidirectional" size={15} />
                        : <ArrowRight aria-label={link.direction === "one_way" ? "One way" : "Direction not specified"} size={15} />}
                      <strong>{to?.label ?? link.to}</strong>
                    </div>
                    <p>{link.medium}</p>
                    <small>{link.purpose} — {label(link.knowledgeStatus)}</small>
                    {pathwayLinkIds.has(link.id) && <em>External-path evidence</em>}
                  </button>
                );
              })}
            </div>
          </div>
        </details>

        <div className={styles.networkControls}>
          {configuration.controls.map((control) => (
            <article key={control.id}>
              {control.status === "documented"
                ? <ShieldCheck aria-hidden size={17} />
                : <AlertTriangle aria-hidden size={17} />}
              <div><span>{label(control.status)}</span><strong>{control.label}</strong><p>{control.description}</p></div>
            </article>
          ))}
        </div>

        <div className={styles.networkSensitiveBoundary}>
          <strong>Operational details withheld</strong>
          <p>{configuration.sensitiveDetailsWithheld}</p>
        </div>
        <div className={styles.caveatBox}>{configuration.caveat}</div>
        <EvidenceSources
          sourceIds={configuration.sourceIds}
          sourceRevisionIds={configuration.sourceRevisionIds}
          sources={sources}
        />
      </article>

      <div className={styles.networkSubsectionHead}>
        <div><FileImage aria-hidden size={18} /><span><strong>Source diagrams and pages</strong><small>Expand any image; scope and caveats stay attached.</small></span></div>
      </div>
      <div className={styles.networkImageGrid}>
        {evidence.sourceImages.map((image) => (
          <article key={image.id}>
            <button
              aria-label={`Expand: ${image.caption}`}
              onClick={() => setExpandedImageId(image.id)}
              type="button"
            >
              <Image alt={image.alt} fill sizes="(max-width: 780px) 92vw, 44vw" src={image.assetUrl} unoptimized />
              <span><Maximize2 aria-hidden size={13} /> Expand source</span>
            </button>
            <div>
              <span>{label(image.kind)}</span>
              <strong>{image.caption}</strong>
              <p>{image.caveat}</p>
              <small>{image.pageOrSection}</small>
              <EvidenceSources
                sourceIds={image.sourceIds}
                sourceRevisionIds={image.sourceRevisionIds}
                sources={sources}
              />
            </div>
          </article>
        ))}
      </div>

      <div className={styles.networkSubsectionHead}>
        <div><AlertTriangle aria-hidden size={18} /><span><strong>Evidence gaps</strong><small>Unknowns stay explicit and source-bounded.</small></span></div>
      </div>
      <div className={styles.networkGapGrid}>
        {evidence.gaps.map((gap) => (
          <article key={gap.id}>
            <span>Not established</span>
            <h3>{gap.label}</h3>
            <p>{gap.description}</p>
            <small>{gap.caveat}</small>
            <EvidenceSources
              sourceIds={gap.sourceIds}
              sourceRevisionIds={gap.sourceRevisionIds}
              sources={sources}
            />
          </article>
        ))}
      </div>

      {expandedImage && (
        <EquipmentReferenceLightbox
          image={expandedImage}
          onClose={() => setExpandedImageId(null)}
          sources={sources.filter((source) => expandedImage.sourceIds.includes(source.id))}
        />
      )}
    </section>
  );
}
