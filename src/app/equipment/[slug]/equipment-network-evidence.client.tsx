"use client";

import Image from "next/image";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Cable,
  CircleDot,
  ExternalLink,
  FileImage,
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
import { EquipmentReferenceLightbox } from "./equipment-reference-lightbox.client";

function label(value: string) {
  return value.replaceAll("_", " ");
}

function EvidenceSources({ sourceIds, sources }: {
  sourceIds: readonly string[];
  sources: readonly EquipmentSource[];
}) {
  const requested = new Set(sourceIds);
  return (
    <div className={styles.networkSourceLinks}>
      {sources.filter((source) => requested.has(source.id)).map((source) => (
        <a href={source.url} key={source.id} rel="noreferrer" target="_blank">
          <ExternalLink aria-hidden size={12} />
          {source.publisher}: {source.title}
        </a>
      ))}
    </div>
  );
}

export function EquipmentNetworkEvidencePanel({ evidence, sources }: {
  evidence: EquipmentNetworkEvidence;
  sources: readonly EquipmentSource[];
}) {
  const [configurationId, setConfigurationId] = useState(evidence.configurations[0].id);
  const [selectedNodeId, setSelectedNodeId] = useState(evidence.configurations[0].nodes[0].id);
  const [expandedImageId, setExpandedImageId] = useState<string | null>(null);
  const configuration = evidence.configurations.find((record) => record.id === configurationId)
    ?? evidence.configurations[0];
  const selectedNode = configuration.nodes.find((node) => node.id === selectedNodeId)
    ?? configuration.nodes[0];
  const expandedImage = evidence.sourceImages.find((image) => image.id === expandedImageId) ?? null;
  const observedCount = evidence.configurations.filter((record) => record.evidenceLayer === "observed").length;
  const nodeById = new Map(configuration.nodes.map((node) => [node.id, node]));

  function selectConfiguration(nextId: string) {
    const next = evidence.configurations.find((record) => record.id === nextId);
    if (!next) return;
    setConfigurationId(next.id);
    setSelectedNodeId(next.nodes[0].id);
  }

  return (
    <section className={styles.dossierSection} data-network-evidence aria-labelledby="network-evidence-heading">
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.eyebrow}><Network aria-hidden size={14} /> Network configuration evidence</p>
          <h2 id="network-evidence-heading">Documented paths, controls, and unknowns</h2>
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

      <div className={styles.networkOverviewBadges} aria-label="Network evidence coverage">
        <span>{evidence.configurations.length} sourced configuration {evidence.configurations.length === 1 ? "view" : "views"}</span>
        <span>{evidence.sourceImages.length} source {evidence.sourceImages.length === 1 ? "image" : "images"}</span>
        <span>{observedCount === 0 ? "No field-observed topology collected" : `${observedCount} field-observed topology records`}</span>
      </div>

      {evidence.configurations.length > 1 && (
        <div className={styles.networkConfigurationTabs} aria-label="Network configuration views">
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
          <div className={styles.networkTopologyPanel}>
            <div className={styles.networkPanelTitle}>
              <span><CircleDot aria-hidden size={14} /> Select a node</span>
              <small>Highlights its documented paths</small>
            </div>
            <div className={styles.networkNodes}>
              {configuration.nodes.map((node) => (
                <button
                  aria-pressed={node.id === selectedNode.id}
                  className={node.id === selectedNode.id ? styles.networkNodeActive : undefined}
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
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
                const active = link.from === selectedNode.id || link.to === selectedNode.id;
                return (
                  <article className={active ? styles.networkLinkActive : undefined} key={link.id}>
                    <div>
                      <strong>{from?.label ?? link.from}</strong>
                      {link.direction === "bidirectional"
                        ? <ArrowLeftRight aria-label="Bidirectional" size={15} />
                        : <ArrowRight aria-label={link.direction === "one_way" ? "One way" : "Direction not specified"} size={15} />}
                      <strong>{to?.label ?? link.to}</strong>
                    </div>
                    <p>{link.medium}</p>
                    <small>{link.purpose} - {label(link.knowledgeStatus)}</small>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className={styles.networkNodeDetail} aria-live="polite">
            <span>Selected node</span>
            <h3>{selectedNode.label}</h3>
            <p>{selectedNode.details}</p>
            <dl>
              <div><dt>Role</dt><dd>{selectedNode.role}</dd></div>
              {selectedNode.componentId && <div><dt>Dossier component</dt><dd>{selectedNode.componentId}</dd></div>}
              <div><dt>Optional</dt><dd>{selectedNode.optional ? "Yes" : "No"}</dd></div>
            </dl>
            <small>Select another node to inspect its role and highlight every sourced path that touches it.</small>
          </aside>
        </div>

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
        <EvidenceSources sourceIds={configuration.sourceIds} sources={sources} />
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
              <EvidenceSources sourceIds={image.sourceIds} sources={sources} />
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
            <EvidenceSources sourceIds={gap.sourceIds} sources={sources} />
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
