"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Box,
  Expand,
  ExternalLink,
  Eye,
  EyeOff,
  Focus,
  Images,
  Layers3,
  Network,
  Rotate3d,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import type { EquipmentComponent, EquipmentSource, EquipmentSystem } from "@/lib/equipment-catalog";
import styles from "../equipment.module.css";
import type { EquipmentCameraCommand } from "./equipment-orthographic-scene";
import { EquipmentReferenceGallery } from "./equipment-reference-gallery.client";

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

const NETWORK_CATEGORIES = new Set(["bluetooth", "cellular", "ethernet", "network", "wifi", "wireless"]);
type TechnicalSpecification = EquipmentComponent["technicalSpecifications"][number];
type DisplayableSpecification = TechnicalSpecification & { value: string };

function isNegativeNetworkStatement(value: string) {
  return /^(?:no|none|not)\b/i.test(value.trim());
}

function specificationIsDisplayable(
  specification: TechnicalSpecification,
): specification is DisplayableSpecification {
  if (specification.value === null || specification.knowledgeStatus === "not_publicly_established") return false;
  return !NETWORK_CATEGORIES.has(specification.category) || !isNegativeNetworkStatement(specification.value);
}

function networkCapabilitySummary(component: EquipmentComponent) {
  const capabilities = component.technicalSpecifications
    .filter((specification): specification is DisplayableSpecification => (
      NETWORK_CATEGORIES.has(specification.category) && specificationIsDisplayable(specification)
    ))
    .map((specification) => `${specification.label}: ${specification.value} (${specification.modelContext})`)
    .join(" • ");
  return capabilities
    ? `${capabilities}. Capability only; not proof of an enabled or field-used connection.`
    : "";
}

type TooltipPosition = { left: number; top: number };

function networkTooltipPosition(anchor: HTMLElement): TooltipPosition {
  const anchorRect = anchor.getBoundingClientRect();
  const railRect = anchor.closest(`.${styles.componentRail}`)?.getBoundingClientRect() ?? anchorRect;
  const viewportPadding = 12;
  const gap = 10;
  const tooltipWidth = Math.max(1, Math.min(280, window.innerWidth - viewportPadding * 2));
  const roomToRight = window.innerWidth - railRect.right - gap - viewportPadding;
  const roomToLeft = railRect.left - gap - viewportPadding;

  if (roomToRight >= tooltipWidth) {
    return { left: railRect.right + gap, top: anchorRect.top - 4 };
  }

  if (roomToLeft >= tooltipWidth) {
    return { left: railRect.left - tooltipWidth - gap, top: anchorRect.top - 4 };
  }

  return {
    left: Math.min(
      Math.max(viewportPadding, anchorRect.left),
      window.innerWidth - tooltipWidth - viewportPadding,
    ),
    top: anchorRect.bottom + 8,
  };
}

function NetworkCapabilityBadge({ componentId, summary }: { componentId: string; summary: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const tooltipId = `network-capability-${componentId}`;

  function showTooltip() {
    const anchor = anchorRef.current;
    if (!anchor) return;
    setPosition(networkTooltipPosition(anchor));
  }

  function hideTooltip() {
    setPosition(null);
  }

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!position || !tooltip) return;

    const viewportPadding = 12;
    const rect = tooltip.getBoundingClientRect();
    const nextLeft = Math.min(
      Math.max(viewportPadding, position.left),
      window.innerWidth - rect.width - viewportPadding,
    );
    const nextTop = Math.min(
      Math.max(viewportPadding, position.top),
      window.innerHeight - rect.height - viewportPadding,
    );

    if (Math.abs(nextLeft - position.left) > 0.5 || Math.abs(nextTop - position.top) > 0.5) {
      setPosition({ left: nextLeft, top: nextTop });
    }
  }, [position]);

  const tooltipOpen = position !== null;

  useEffect(() => {
    if (!tooltipOpen) return;

    const repositionTooltip = () => {
      const anchor = anchorRef.current;
      if (anchor) setPosition(networkTooltipPosition(anchor));
    };
    window.addEventListener("resize", repositionTooltip);
    window.addEventListener("scroll", repositionTooltip, true);
    return () => {
      window.removeEventListener("resize", repositionTooltip);
      window.removeEventListener("scroll", repositionTooltip, true);
    };
  }, [tooltipOpen]);

  return (
    <>
      <span
        aria-describedby={position ? tooltipId : undefined}
        aria-label="Network connectivity capability"
        className={styles.networkCapability}
        onBlur={hideTooltip}
        onFocus={showTooltip}
        onPointerEnter={showTooltip}
        onPointerLeave={hideTooltip}
        ref={anchorRef}
        role="img"
        tabIndex={0}
      >
        <Network aria-hidden size={14} />
      </span>
      {position && createPortal(
        <div
          className={styles.networkTooltipPortal}
          data-overlay-root="document-body"
          id={tooltipId}
          ref={tooltipRef}
          role="tooltip"
          style={{ left: position.left, top: position.top }}
        >
          <strong>Network capability</strong>
          {summary}
        </div>,
        document.body,
      )}
    </>
  );
}

export function EquipmentExplorer({ sources, system }: { sources: EquipmentSource[]; system: EquipmentSystem }) {
  const [selectedId, setSelectedId] = useState(
    () => system.components.find((component) => component.sceneNodeName !== null)?.id ?? system.components[0].id,
  );
  const [explosion, setExplosion] = useState(0);
  const [view, setView] = useState<ViewName>("isometric");
  const [cameraCommand, setCameraCommand] = useState<EquipmentCameraCommand>({
    revision: 0,
    type: "reset",
  });
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [viewerState, setViewerState] = useState<"closed" | "open" | "unsupported" | "failed">("closed");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hiddenComponentIds, setHiddenComponentIds] = useState<Set<string>>(() => new Set());
  const [isolatedComponentId, setIsolatedComponentId] = useState<string | null>(null);
  const selected = system.components.find((component) => component.id === selectedId) ?? system.components[0];
  const modeledComponents = system.components.filter((component) => component.sceneNodeName !== null);
  const componentIsVisible = (componentId: string) => (
    isolatedComponentId !== null
      ? isolatedComponentId === componentId
      : !hiddenComponentIds.has(componentId)
  );
  const visibleModeledComponentCount = modeledComponents.filter((component) => componentIsVisible(component.id)).length;
  const visibilityCustomized = isolatedComponentId !== null || hiddenComponentIds.size > 0;
  const isolatedComponent = system.components.find((component) => component.id === isolatedComponentId) ?? null;

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
  const technicalSpecifications = selected.technicalSpecifications.filter(specificationIsDisplayable);
  const selectedSourceIds = new Set([
    ...selected.sourceIds,
    ...technicalSpecifications.flatMap((record) => record.sourceIds),
    ...relatedVersions.flatMap((record) => record.sourceIds),
    ...relatedChanges.flatMap((record) => record.sourceIds),
    ...relatedFindings.flatMap((record) => record.sourceIds),
    ...relatedPower.flatMap((record) => record.sourceIds),
  ]);
  const selectedSources = sources.filter((source) => selectedSourceIds.has(source.id));

  function openViewer() {
    setViewerState(webGl2Available() ? "open" : "unsupported");
  }

  function issueCameraCommand(type: EquipmentCameraCommand["type"]) {
    setCameraCommand((current) => ({ revision: current.revision + 1, type }));
  }

  function resetCamera() {
    setView("isometric");
    issueCameraCommand("reset");
  }

  function setComponentVisibility(componentId: string, visible: boolean) {
    setIsolatedComponentId(null);
    setHiddenComponentIds((current) => {
      const next = new Set(current);
      if (visible) next.delete(componentId);
      else next.add(componentId);
      return next;
    });
  }

  function selectComponent(componentId: string) {
    setSelectedId(componentId);
    if (isolatedComponentId === null) return;
    const component = system.components.find((candidate) => candidate.id === componentId);
    if (!component?.sceneNodeName) {
      setIsolatedComponentId(null);
      return;
    }
    setHiddenComponentIds((current) => {
      if (!current.has(componentId)) return current;
      const next = new Set(current);
      next.delete(componentId);
      return next;
    });
    setIsolatedComponentId(componentId);
  }

  function toggleIsolation(componentId: string) {
    setSelectedId(componentId);
    setHiddenComponentIds((current) => {
      if (!current.has(componentId)) return current;
      const next = new Set(current);
      next.delete(componentId);
      return next;
    });
    setIsolatedComponentId((current) => current === componentId ? null : componentId);
  }

  function showAllComponents() {
    setHiddenComponentIds(new Set());
    setIsolatedComponentId(null);
  }

  const exploded = explosion > 0.01;

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
            {system.components.map((component) => {
              const modeled = component.sceneNodeName !== null;
              const visible = !modeled || componentIsVisible(component.id);
              const networkSummary = networkCapabilitySummary(component);
              const componentButtonClass = [
                selected.id === component.id ? styles.componentButtonActive : styles.componentButton,
                modeled && !visible ? styles.componentButtonHidden : "",
              ].filter(Boolean).join(" ");

              return (
                <li className={styles.componentItem} data-hidden={modeled && !visible ? "true" : undefined} key={component.id}>
                  <div className={styles.componentRow}>
                    <button
                      aria-pressed={selected.id === component.id}
                      className={componentButtonClass}
                      data-component-select="true"
                      onClick={() => selectComponent(component.id)}
                      type="button"
                    >
                      <span>{component.name}</span>
                      <small>{label(component.evidenceStatus)}</small>
                    </button>
                    <div className={styles.componentUtilities}>
                      {networkSummary && (
                        <NetworkCapabilityBadge componentId={component.id} summary={networkSummary} />
                      )}
                      {modeled && (
                        <>
                          <button
                            aria-label={`${visible ? "Hide" : "Show"} ${component.name}`}
                            aria-pressed={!visible}
                            className={styles.componentUtilityButton}
                            onClick={() => setComponentVisibility(component.id, !visible)}
                            title={`${visible ? "Hide" : "Show"} ${component.name}`}
                            type="button"
                          >
                            {visible ? <EyeOff aria-hidden size={14} /> : <Eye aria-hidden size={14} />}
                          </button>
                          <button
                            aria-label={`${isolatedComponentId === component.id ? "Stop isolating" : "Isolate"} ${component.name}`}
                            aria-pressed={isolatedComponentId === component.id}
                            className={styles.componentUtilityButton}
                            onClick={() => toggleIsolation(component.id)}
                            title={`${isolatedComponentId === component.id ? "Stop isolating" : "Isolate"} ${component.name}`}
                            type="button"
                          >
                            <Focus aria-hidden size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.viewerPanel}>
          <div className={styles.viewerToolbar}>
            <div><Box aria-hidden size={15} /><span>{system.scene.geometryFidelity.replaceAll("_", " ")}</span></div>
            <div>
              <button
                aria-controls="equipment-reference-gallery"
                aria-expanded={galleryOpen}
                aria-pressed={galleryOpen}
                onClick={() => setGalleryOpen((open) => !open)}
                type="button"
              >
                <Images aria-hidden size={14} /> Photos {system.scene.referenceImages.length}
              </button>
              {viewerState !== "open" ? (
                <button onClick={openViewer} type="button"><Expand aria-hidden size={14} /> Open 3D view</button>
              ) : (
                <>
                  <button aria-pressed={exploded} onClick={() => setExplosion((value) => value > 0.01 ? 0 : 1)} type="button"><Layers3 aria-hidden size={14} /> {exploded ? "Assembled" : "Exploded"}</button>
                  <button onClick={() => setView(view === "isometric" ? "front" : view === "front" ? "top" : "isometric")} title="Cycle camera preset" type="button"><Rotate3d aria-hidden size={14} /> {view}</button>
                  <button aria-label="Zoom out" onClick={() => issueCameraCommand("zoom_out")} title="Zoom out" type="button"><ZoomOut aria-hidden size={14} /></button>
                  <button aria-label="Zoom in" onClick={() => issueCameraCommand("zoom_in")} title="Zoom in" type="button"><ZoomIn aria-hidden size={14} /></button>
                  <button onClick={resetCamera} type="button"><RotateCcw aria-hidden size={14} /> Reset</button>
                  <button onClick={() => setViewerState("closed")} type="button">Close 3D</button>
                </>
              )}
              {visibilityCustomized && <button onClick={showAllComponents} type="button"><Eye aria-hidden size={14} /> Show all</button>}
            </div>
          </div>
          <div className={styles.viewerEvidenceBar}>
            <div className={styles.viewerReference}>
              <span><strong>Reference:</strong> {system.scene.referenceConfiguration}</span>
              {viewerState === "open" && (
                <span aria-live="polite" className={styles.visibilitySummary}>
                  {visibleModeledComponentCount} of {modeledComponents.length} modeled components visible
                  {isolatedComponent ? ` • isolating ${isolatedComponent.name}` : ""}
                </span>
              )}
            </div>
            {viewerState === "open" && (
              <label className={styles.explosionControl}>
                <span>Explosion distance {Math.round(explosion * 100)}%</span>
                <input
                  aria-label="Explosion distance"
                  max="100"
                  min="0"
                  onChange={(event) => setExplosion(Number(event.target.value) / 100)}
                  step="1"
                  type="range"
                  value={Math.round(explosion * 100)}
                />
              </label>
            )}
          </div>
          <div className={styles.viewerStage}>
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
                  cameraCommand={cameraCommand}
                  explosion={explosion}
                  hiddenComponentIds={hiddenComponentIds}
                  isolatedComponentId={isolatedComponentId}
                  onError={() => setViewerState("failed")}
                  onSelect={selectComponent}
                  reducedMotion={reducedMotion}
                  scene={system.scene}
                  selectedComponentId={selected.id}
                  view={view}
                />
              </ViewerErrorBoundary>
            )}
            {galleryOpen && (
              <EquipmentReferenceGallery
                images={system.scene.referenceImages}
                onClose={() => setGalleryOpen(false)}
                sources={sources}
              />
            )}
          </div>
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
          {relatedPower.map((record) => (
            <div className={styles.powerEvidence} key={record.id}>
              <strong>Power evidence</strong>
              <span>{record.supplyType ?? "Supply type not publicly established"}</span>
              <small>
                {[record.manufacturer, record.model, record.capacity, record.runtime].filter(Boolean).join(" • ")
                  || "Manufacturer, model, capacity, and runtime remain unresolved."}
              </small>
            </div>
          ))}
          {technicalSpecifications.length > 0 && (
            <>
              <h4>Hardware and interfaces</h4>
              <div className={styles.specList}>
                {technicalSpecifications.map((specification) => {
                  const specificationSources = sources.filter((source) => specification.sourceIds.includes(source.id));
                  return (
                    <section className={styles.specRecord} key={specification.id}>
                      <div className={styles.specHeader}>
                        <span>{label(specification.category)}</span>
                        <small>{label(specification.knowledgeStatus)}</small>
                      </div>
                      <strong>{specification.label}</strong>
                      <p className={styles.specValue}>{specification.value}</p>
                      <span className={styles.specContext}>{specification.modelContext}</span>
                      <p className={styles.specCaveat}>{specification.caveat}</p>
                      <div className={styles.specSources} aria-label={`Sources for ${specification.label}`}>
                        {specificationSources.map((source) => (
                          <a href={source.url} key={source.id} rel="noreferrer" target="_blank">
                            {source.publisher} <ExternalLink aria-hidden size={11} />
                          </a>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}
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
