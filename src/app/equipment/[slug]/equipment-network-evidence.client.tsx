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
        <p>Expected, documented, and observed configurations remain separate. Physical port capability is not treated as an active connection.</p>
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
                  className={activeSelection.kind === "node" && node.id === activeSelection.id
                    ? styles.networkNodeActive
                    : undefined}
                  key={node.id}
                  onClick={() => setSelection({ id: node.id, kind: "node" })}
                  type="button"
                >
                  <Network aria-hidden size={16} />
                  <span><strong>{node.label}</strong><small>{node.role}</small></span>
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
                    className={active ? styles.networkLinkActive : undefined}
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
