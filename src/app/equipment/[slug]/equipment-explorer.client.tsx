"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Box, Expand, ExternalLink, Layers3, Rotate3d } from "lucide-react";

import type { EquipmentSource, EquipmentSystem } from "@/lib/equipment-catalog";
import styles from "../equipment.module.css";

const Scene = dynamic(
  () => import("./equipment-orthographic-scene").then((module) => module.EquipmentOrthographicScene),
  { ssr: false, loading: () => <div className={styles.sceneStatus}>Loading the local schematic…</div> },
);

type ViewName = "front" | "isometric" | "top";

class ViewerErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function webGl2Available() {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export function EquipmentExplorer({ sources, system }: { sources: EquipmentSource[]; system: EquipmentSystem }) {
  const [selectedId, setSelectedId] = useState(
    () => system.components.find((component) => component.sceneNodeName !== null)?.id ?? system.components[0].id,
  );
  const [exploded, setExploded] = useState(false);
  const [view, setView] = useState<ViewName>("isometric");
  const [viewerState, setViewerState] = useState<"closed" | "open" | "unsupported" | "failed">("closed");
  const [reducedMotion, setReducedMotion] = useState(false);
  const selected = system.components.find((component) => component.id === selectedId) ?? system.components[0];

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const relatedVersions = system.versionObservations.filter((record) => record.componentId === selected.id);
  const relatedChanges = system.configurationChanges.filter((record) => record.componentIds.includes(selected.id));
  const relatedFindings = system.findings.filter((record) => record.componentIds.includes(selected.id));
  const relatedPower = system.power.filter((record) => record.componentId === selected.id);
  const selectedSourceIds = new Set([
    ...selected.sourceIds,
    ...relatedVersions.flatMap((record) => record.sourceIds),
    ...relatedChanges.flatMap((record) => record.sourceIds),
    ...relatedFindings.flatMap((record) => record.sourceIds),
    ...relatedPower.flatMap((record) => record.sourceIds),
  ]);
  const selectedSources = sources.filter((source) => selectedSourceIds.has(source.id));

  function openViewer() {
    setViewerState(webGl2Available() ? "open" : "unsupported");
  }

  const fallback = (
    <div className={styles.sceneFallback} role="status">
      <strong>3D view unavailable</strong>
      <p>The source-linked component list and dossier remain available. This browser or graphics environment did not provide the required WebGL 2 context.</p>
    </div>
  );

  return (
    <section className={styles.explorerSection} aria-labelledby="explorer-heading">
      <div className={styles.sectionHead}>
        <div><p className={styles.eyebrow}><Layers3 aria-hidden size={14} /> Selectable schematic</p><h2 id="explorer-heading">Orthographic component explorer</h2></div>
        <p>Use the accessible component list as the source of truth. The optional 3D view mirrors that selection.</p>
      </div>

      <div className={styles.explorerGrid}>
        <div className={styles.componentRail}>
          <div className={styles.componentRailHead}><strong>Components</strong><span>{system.components.length} records</span></div>
          <ul className={styles.componentButtons} aria-label="Equipment components">
            {system.components.map((component) => (
              <li key={component.id}>
                <button
                  aria-pressed={selected.id === component.id}
                  className={selected.id === component.id ? styles.componentButtonActive : styles.componentButton}
                  onClick={() => setSelectedId(component.id)}
                  type="button"
                >
                  <span>{component.name}</span>
                  <small>{label(component.evidenceStatus)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.viewerPanel}>
          <div className={styles.viewerToolbar}>
            <div><Box aria-hidden size={15} /><span>{system.scene.geometryFidelity.replaceAll("_", " ")}</span></div>
            <div>
              {viewerState !== "open" ? (
                <button onClick={openViewer} type="button"><Expand aria-hidden size={14} /> Open 3D view</button>
              ) : (
                <>
                  <button aria-pressed={exploded} onClick={() => setExploded((value) => !value)} type="button"><Layers3 aria-hidden size={14} /> {exploded ? "Assembled" : "Exploded"}</button>
                  <button onClick={() => setView(view === "isometric" ? "front" : view === "front" ? "top" : "isometric")} type="button"><Rotate3d aria-hidden size={14} /> {view}</button>
                  <button onClick={() => setViewerState("closed")} type="button">Close 3D</button>
                </>
              )}
            </div>
          </div>
          {viewerState === "closed" && (
            <div className={styles.scenePrompt}>
              <Box aria-hidden size={48} />
              <strong>2D evidence view is active</strong>
              <p>Open the lightweight local 3D schematic when useful. It is opt-in on every screen size.</p>
            </div>
          )}
          {viewerState === "unsupported" && fallback}
          {viewerState === "failed" && fallback}
          {viewerState === "open" && (
            <ViewerErrorBoundary fallback={fallback}>
              <Scene
                exploded={exploded}
                onError={() => setViewerState("failed")}
                onSelect={setSelectedId}
                reducedMotion={reducedMotion}
                scene={system.scene}
                selectedComponentId={selected.id}
                view={view}
              />
            </ViewerErrorBoundary>
          )}
        </div>

        <article className={styles.componentDetail} aria-live="polite">
          <div className={styles.cardTopline}><span className={styles.scopePill}>{label(selected.scopeKind)}</span><span>{label(selected.evidenceStatus)}</span></div>
          <h3>{selected.name}</h3>
          <p>{selected.description}</p>
          {selected.modelNumbers.length > 0 && <p><strong>Models:</strong> {selected.modelNumbers.join(", ")}</p>}
          {selected.hardwareRevisions.length > 0 && <p><strong>Hardware revisions in source:</strong> {selected.hardwareRevisions.join(", ")}</p>}
          {relatedVersions.map((record) => <p className={styles.versionLine} key={record.id}><strong>{record.label}:</strong> {record.value}</p>)}
          {relatedChanges.length > 0 && <p><strong>Linked configuration changes:</strong> {relatedChanges.map((record) => record.changeId).join(", ")}</p>}
          {relatedFindings.length > 0 && <p><strong>Linked findings:</strong> {relatedFindings.map((record) => record.title).join("; ")}</p>}
          <div className={styles.caveatBox}>{selected.caveat}</div>
          <h4>Sources for this selection</h4>
          <ul className={styles.componentSources}>
            {selectedSources.map((source) => (
              <li key={source.id}><a href={source.url} rel="noreferrer" target="_blank">{source.title} <ExternalLink aria-hidden size={12} /></a><span>{source.publisher}</span></li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
