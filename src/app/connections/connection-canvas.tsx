"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, applyNodeChanges, type Node, type NodeProps, type OnNodesChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { connectionPositions } from "@/lib/election-connections";
import type { PublicResearchDocument } from "@/lib/connection-research";
import styles from "./connections.module.css";
import { relationshipDescriptions } from "./connection-descriptors";

type EntityNode = Node<{ id: string; label: string; category: string; select: () => void }, "entity">;
function Entity({ data, selected }: NodeProps<EntityNode>) {
  return <><Handle type="target" position={Position.Left} /><button type="button" className={`${styles.flowNode} ${selected ? styles.selectedNode : ""}`} aria-label={`Inspect ${data.label}`} aria-pressed={selected} data-connection-node={data.id} onClick={data.select}><small>{data.category}</small><strong>{data.label}</strong></button><Handle type="source" position={Position.Right} /></>;
}
const nodeTypes = { entity: Entity };
const colors: Record<string, string> = { results: "#74b8ff", survey: "#54d3b3", ownership: "#c1a1fa", role: "#f0c36a", technology: "#54d3b3", contract: "#f0c36a", inventory: "#54d3b3" };
export type CanvasPositions = Record<string, { x: number; y: number }>;
export function ConnectionCanvas({ entities, claims, selectedNode, selectedEdge, view, pinned, positions, onPosition, onSelect }: {
  entities: PublicResearchDocument["entities"]; claims: PublicResearchDocument["claims"]; selectedNode: string; selectedEdge: string | null;
  view: "reporting" | "ownership" | "technology"; pinned: string[]; positions: CanvasPositions;
  onPosition: (id: string, position: { x: number; y: number }) => void; onSelect: (node: string, edge?: string) => void;
}) {
  const initial = useMemo(() => entities.map((entity, index): EntityNode => {
    const known = connectionPositions[view][entity.id];
    return { id: entity.id, type: "entity", position: Object.hasOwn(positions, entity.id) ? positions[entity.id] : (known ? { x: known[0] - 96, y: known[1] - 38 } : { x: (index % 4) * 285, y: Math.floor(index / 4) * 125 }),
      selected: entity.id === selectedNode, draggable: !pinned.includes(entity.id),
      data: { id: entity.id, label: entity.label, category: entity.category, select: () => onSelect(entity.id) },
    };
  }), [entities, view, positions, selectedNode, pinned, onSelect]);
  const [nodes, setNodes] = useState(initial);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  useEffect(() => setNodes(initial), [initial]);
  const onNodesChange: OnNodesChange<EntityNode> = useCallback((changes) => {
    setNodes((current) => applyNodeChanges(changes, current));
    for (const change of changes) {
      if (change.type === "position" && change.position && !change.dragging) onPosition(change.id, change.position);
      if (change.type === "select" && change.selected && change.id !== selectedNode) onSelect(change.id);
    }
  }, [onPosition, onSelect, selectedNode]);
  const edges = useMemo(() => claims.map((claim) => ({ id: claim.id, source: claim.from, target: claim.to, label: claim.id === selectedEdge || claim.id === hoveredEdge ? claim.label : undefined, selected: claim.id === selectedEdge,
    ariaLabel: `${claim.label}: ${entities.find((entity) => entity.id === claim.from)?.label} to ${entities.find((entity) => entity.id === claim.to)?.label}`,
    markerEnd: { type: MarkerType.ArrowClosed, color: colors[claim.kind] }, style: { stroke: colors[claim.kind], strokeWidth: claim.id === selectedEdge ? 3 : 1.6 },
    labelStyle: { fill: "#eff6f1", fontSize: 10 }, labelBgStyle: { fill: "#1b231e" }, labelBgPadding: [5, 4] as [number, number],
  })), [claims, entities, selectedEdge, hoveredEdge]);
  return <div className={styles.flowCanvas} data-connection-map="true" role="group" aria-label="Connection map" aria-describedby="connection-map-guide">
    <div className={`${styles.legend} ${styles.flowLegend}`} role="group" aria-label="Relationship types">{[...new Set(claims.map((claim) => claim.kind))].sort().map((kind) => <span key={kind}><i style={{ background: colors[kind] }} aria-hidden="true" />{relationshipDescriptions[kind].label}</span>)}</div>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
      onNodeDragStop={(_event, node) => onPosition(node.id, node.position)}
      onEdgeClick={(_event, edge) => onSelect(edge.source, edge.id)}
      onEdgeMouseEnter={(_event, edge) => setHoveredEdge(edge.id)} onEdgeMouseLeave={() => setHoveredEdge(null)}
      onEdgesChange={(changes) => { for (const change of changes) if (change.type === "select" && change.selected) { const edge = edges.find((item) => item.id === change.id); if (edge) onSelect(edge.source, edge.id); } }}
      nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} fitView minZoom={0.25} maxZoom={2}
      colorMode="dark" ariaLabelConfig={{ "node.a11yDescription.default": "Press Enter to inspect; arrow keys move unpinned nodes.", "edge.a11yDescription.default": "Press Enter to inspect relationship evidence.", "controls.fitView.ariaLabel": "Fit", "controls.zoomIn.ariaLabel": "Zoom in", "controls.zoomOut.ariaLabel": "Zoom out" }}>
      <Background color="#344037" gap={22} /><Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
