"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  useNodesState,
} from "@xyflow/react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  Box,
  Focus,
  Network,
  Orbit,
  RotateCcw,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  EquipmentNetworkConfiguration,
  EquipmentNetworkLink,
} from "@/lib/equipment-catalog";
import styles from "../equipment.module.css";

import "@xyflow/react/dist/style.css";

const NODE_WIDTH = 224;
const NODE_HEIGHT = 104;
const elk = new ELK();

type TopologyNodeData = {
  componentMapped: boolean;
  evidenceCount: number;
  focus: boolean;
  label: string;
  optional: boolean;
  role: string;
};

type TopologyFlowNode = Node<TopologyNodeData, "evidence">;
type TopologyFlowEdge = Edge<{ knowledgeStatus: string }, "smoothstep">;

type ForceNode = SimulationNodeDatum & {
  anchorX: number;
  anchorY: number;
  id: string;
};

type ForceLink = SimulationLinkDatum<ForceNode> & {
  id: string;
};

export type EquipmentTopologySelection = {
  id: string;
  kind: "link" | "node";
};

export type EquipmentTopologyGraphProps = {
  configuration: EquipmentNetworkConfiguration;
  onSelect: (selection: EquipmentTopologySelection) => void;
  selection: EquipmentTopologySelection;
};

function evidenceStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function edgeLabel(link: EquipmentNetworkLink) {
  const medium = link.medium.trim();
  if (medium.length <= 28) return medium;
  if (/not established/i.test(medium)) return "Medium not established";
  if (/virtual private network|vpn/i.test(medium)) return "VPN";
  if (/ethernet/i.test(medium)) return "Ethernet";
  if (/closed local area network/i.test(medium)) return "Closed LAN";
  if (/cellular|cdma|gsm|lte/i.test(medium)) return "Cellular";
  if (/usb/i.test(medium)) return "USB";
  if (/firewall|dmz/i.test(medium)) return "Network boundary";
  if (/physical election media/i.test(medium)) return "Physical media";
  return `${medium.slice(0, 25).trimEnd()}…`;
}

function initialNodes(configuration: EquipmentNetworkConfiguration): TopologyFlowNode[] {
  return configuration.nodes.map((node, index) => ({
    id: node.id,
    type: "evidence",
    position: {
      x: (index % 3) * (NODE_WIDTH + 70),
      y: Math.floor(index / 3) * (NODE_HEIGHT + 70),
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    ariaLabel: `${node.label}. ${node.role}.${node.optional ? " Optional." : ""}`,
    data: {
      componentMapped: node.componentId !== null,
      evidenceCount: node.sourceRevisionIds.length,
      focus: node.id === configuration.focusNodeId,
      label: node.label,
      optional: node.optional,
      role: node.role,
    },
  }));
}

function evidenceNodeClass(data: TopologyNodeData, selected: boolean) {
  return [
    styles.topologyNode,
    data.focus ? styles.topologyNodeFocus : "",
    data.optional ? styles.topologyNodeOptional : "",
    !data.componentMapped ? styles.topologyNodeExternal : "",
    selected ? styles.topologyNodeSelected : "",
  ].filter(Boolean).join(" ");
}

const EvidenceTopologyNode = memo(function EvidenceTopologyNode({
  data,
  selected,
}: NodeProps<TopologyFlowNode>) {
  return (
    <div className={evidenceNodeClass(data, selected)}>
      <Handle
        className={styles.topologyHandle}
        isConnectable={false}
        position={Position.Left}
        type="target"
      />
      <div className={styles.topologyNodeTopline}>
        {data.focus ? <Focus aria-hidden size={15} /> : data.componentMapped
          ? <Box aria-hidden size={15} />
          : <Network aria-hidden size={15} />}
        <span>{data.focus ? "This dossier" : data.componentMapped ? "Dossier component" : "External role"}</span>
        {data.optional && <em>Optional</em>}
      </div>
      <strong>{data.label}</strong>
      <small>{data.role}</small>
      <span className={styles.topologyNodeEvidence}>{data.evidenceCount} pinned source {data.evidenceCount === 1 ? "revision" : "revisions"}</span>
      <Handle
        className={styles.topologyHandle}
        isConnectable={false}
        position={Position.Right}
        type="source"
      />
    </div>
  );
});

const nodeTypes = {
  evidence: EvidenceTopologyNode,
} as const;

function edgeStyle(link: EquipmentNetworkLink, active: boolean) {
  const status = link.knowledgeStatus;
  const color = status === "confirmed"
    ? "#67d9cc"
    : status === "documented_partial"
      ? "#e2bd73"
      : "#8e9aa8";
  return {
    opacity: active ? 1 : 0.72,
    stroke: color,
    strokeDasharray: status === "confirmed" ? undefined : status === "documented_partial" ? "8 5" : "2 7",
    strokeLinecap: "round" as const,
    strokeWidth: active ? 3 : 1.8,
  };
}

function graphEdges(
  configuration: EquipmentNetworkConfiguration,
  selection: EquipmentTopologySelection,
): TopologyFlowEdge[] {
  return configuration.links.map((link) => {
    const active = selection.kind === "link"
      ? selection.id === link.id
      : link.from === selection.id || link.to === selection.id;
    const marker = { color: edgeStyle(link, active).stroke, type: MarkerType.ArrowClosed };
    return {
      id: link.id,
      source: link.from,
      target: link.to,
      type: "smoothstep",
      label: edgeLabel(link),
      ariaLabel: `${link.purpose}. ${link.medium}. ${evidenceStatusLabel(link.knowledgeStatus)}.`,
      data: { knowledgeStatus: link.knowledgeStatus },
      markerEnd: link.direction === "one_way" || link.direction === "bidirectional" ? marker : undefined,
      markerStart: link.direction === "bidirectional" ? marker : undefined,
      pathOptions: { borderRadius: 3, offset: 24 },
      selected: selection.kind === "link" && selection.id === link.id,
      style: edgeStyle(link, active),
      labelBgBorderRadius: 5,
      labelBgPadding: [5, 3],
      labelBgStyle: { fill: "#07191c", fillOpacity: 0.94 },
      labelStyle: {
        fill: active ? "#e9fffb" : "#94aaa7",
        fontSize: 10,
        fontWeight: 720,
      },
    };
  });
}

function positionsById(nodes: readonly TopologyFlowNode[]) {
  return new Map(nodes.map((node) => [node.id, { ...node.position }]));
}

export function EquipmentTopologyGraph({
  configuration,
  onSelect,
  selection,
}: EquipmentTopologyGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<TopologyFlowNode>(initialNodes(configuration));
  const [forceEnabled, setForceEnabled] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const flowRef = useRef<ReactFlowInstance<TopologyFlowNode, TopologyFlowEdge> | null>(null);
  const documentedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const forceNodesRef = useRef<Map<string, ForceNode>>(new Map());
  const simulationRef = useRef<Simulation<ForceNode, ForceLink> | null>(null);
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSimulation = useCallback(() => {
    simulationRef.current?.stop();
    simulationRef.current = null;
    forceNodesRef.current.clear();
  }, []);

  const fitTopology = useCallback((duration = 260) => {
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    fitTimerRef.current = setTimeout(() => {
      void flowRef.current?.fitView({ duration, maxZoom: 1.2, padding: 0.16 });
    }, 60);
  }, []);

  useEffect(() => {
    let cancelled = false;
    stopSimulation();
    setForceEnabled(false);
    setLayoutReady(false);
    setNodes(initialNodes(configuration));

    const graph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.spacing.nodeNodeBetweenLayers": "92",
        "elk.padding": "[top=44,left=44,bottom=44,right=44]",
        "elk.spacing.edgeNode": "36",
        "elk.spacing.nodeNode": "54",
      },
      children: configuration.nodes.map((node) => ({
        id: node.id,
        height: NODE_HEIGHT,
        width: NODE_WIDTH,
      })),
      edges: configuration.links.map((link) => ({
        id: link.id,
        sources: [link.from],
        targets: [link.to],
      })),
    };

    void elk.layout(graph).then((layout) => {
      if (cancelled) return;
      const layoutNodeById = new Map((layout.children ?? []).map((node) => [node.id, node]));
      const nextNodes = initialNodes(configuration).map((node) => {
        const layoutNode = layoutNodeById.get(node.id);
        return {
          ...node,
          position: {
            x: layoutNode?.x ?? node.position.x,
            y: layoutNode?.y ?? node.position.y,
          },
        };
      });
      documentedPositionsRef.current = positionsById(nextNodes);
      setNodes(nextNodes);
      setLayoutReady(true);
    }).catch(() => {
      if (cancelled) return;
      const fallback = initialNodes(configuration);
      documentedPositionsRef.current = positionsById(fallback);
      setNodes(fallback);
      setLayoutReady(true);
    });

    return () => {
      cancelled = true;
      stopSimulation();
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    };
  }, [configuration, fitTopology, setNodes, stopSimulation]);

  useEffect(() => {
    if (!layoutReady) return;
    fitTopology(0);
  }, [fitTopology, layoutReady]);

  const displayNodes = useMemo(
    () => nodes.map((node) => ({
      ...node,
      selected: selection.kind === "node" && selection.id === node.id,
    })),
    [nodes, selection],
  );
  const edges = useMemo(
    () => graphEdges(configuration, selection),
    [configuration, selection],
  );

  const resetDocumentedLayout = useCallback(() => {
    stopSimulation();
    setForceEnabled(false);
    setNodes((current) => current.map((node) => ({
      ...node,
      position: documentedPositionsRef.current.get(node.id) ?? node.position,
    })));
    fitTopology();
  }, [fitTopology, setNodes, stopSimulation]);

  const startForce = useCallback(() => {
    stopSimulation();
    const forceNodes: ForceNode[] = nodes.map((node) => ({
      anchorX: node.position.x + NODE_WIDTH / 2,
      anchorY: node.position.y + NODE_HEIGHT / 2,
      id: node.id,
      x: node.position.x + NODE_WIDTH / 2,
      y: node.position.y + NODE_HEIGHT / 2,
      ...(node.id === configuration.focusNodeId
        ? {
            fx: node.position.x + NODE_WIDTH / 2,
            fy: node.position.y + NODE_HEIGHT / 2,
          }
        : {}),
    }));
    const forceNodeById = new Map(forceNodes.map((node) => [node.id, node]));
    const forceLinks: ForceLink[] = configuration.links.map((link) => ({
      id: link.id,
      source: link.from,
      target: link.to,
    }));
    forceNodesRef.current = forceNodeById;

    const simulation = forceSimulation<ForceNode>(forceNodes)
      .force("charge", forceManyBody<ForceNode>().strength(-760))
      .force("collision", forceCollide<ForceNode>().radius(132).strength(0.92))
      .force(
        "link",
        forceLink<ForceNode, ForceLink>(forceLinks)
          .id((node) => node.id)
          .distance(190)
          .strength(0.16),
      )
      .force("rank-x", forceX<ForceNode>((node) => node.anchorX).strength(0.42))
      .force("rank-y", forceY<ForceNode>((node) => node.anchorY).strength(0.12))
      .alpha(0.85)
      .alphaDecay(0.045)
      .velocityDecay(0.38);

    const applyForcePositions = () => {
      setNodes((current) => current.map((node) => {
        const forceNode = forceNodeById.get(node.id);
        if (!forceNode || forceNode.x === undefined || forceNode.y === undefined) return node;
        return {
          ...node,
          position: {
            x: forceNode.x - NODE_WIDTH / 2,
            y: forceNode.y - NODE_HEIGHT / 2,
          },
        };
      }));
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      simulation.stop();
      for (let index = 0; index < 90; index += 1) simulation.tick();
      applyForcePositions();
    } else {
      simulation.on("tick", applyForcePositions);
      simulation.on("end", () => fitTopology(180));
      simulationRef.current = simulation;
    }
    setForceEnabled(true);
  }, [configuration, fitTopology, nodes, setNodes, stopSimulation]);

  const toggleForce = useCallback(() => {
    if (forceEnabled) resetDocumentedLayout();
    else startForce();
  }, [forceEnabled, resetDocumentedLayout, startForce]);

  const updateForceNode = useCallback((node: TopologyFlowNode) => {
    if (!forceEnabled) return;
    const forceNode = forceNodesRef.current.get(node.id);
    if (!forceNode) return;
    forceNode.fx = node.position.x + NODE_WIDTH / 2;
    forceNode.fy = node.position.y + NODE_HEIGHT / 2;
    simulationRef.current?.alphaTarget(0.12).restart();
  }, [forceEnabled]);

  const settleForceNode = useCallback((node: TopologyFlowNode) => {
    updateForceNode(node);
    simulationRef.current?.alphaTarget(0);
  }, [updateForceNode]);

  return (
    <section className={styles.topologyGraphShell} aria-label="Interactive documented topology">
      <header className={styles.topologyGraphToolbar}>
        <div>
          <span>Interactive topology</span>
          <strong>Documented shape, exploratory placement</strong>
          <small>Dragging changes this view only. Reset restores the deterministic source layout.</small>
        </div>
        <div className={styles.topologyGraphActions}>
          <button
            aria-pressed={forceEnabled}
            disabled={!layoutReady}
            onClick={toggleForce}
            type="button"
          >
            <Orbit aria-hidden size={15} />
            {forceEnabled ? "Exit force view" : "Explore with force"}
          </button>
          <button disabled={!layoutReady} onClick={resetDocumentedLayout} type="button">
            <RotateCcw aria-hidden size={14} />
            Reset layout
          </button>
        </div>
      </header>

      <div className={styles.topologyGraphCanvas} data-force-enabled={forceEnabled}>
        <ReactFlow<TopologyFlowNode, TopologyFlowEdge>
          colorMode="dark"
          edges={edges}
          edgesFocusable
          fitView
          maxZoom={1.8}
          minZoom={0.28}
          nodeTypes={nodeTypes}
          nodes={displayNodes}
          nodesConnectable={false}
          nodesFocusable
          onEdgeClick={(_, edge) => onSelect({ id: edge.id, kind: "link" })}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          onNodeClick={(_, node) => onSelect({ id: node.id, kind: "node" })}
          onNodeDrag={(_, node) => updateForceNode(node)}
          onNodeDragStart={(_, node) => updateForceNode(node)}
          onNodeDragStop={(_, node) => settleForceNode(node)}
          onNodesChange={onNodesChange}
          panOnDrag
          proOptions={{ hideAttribution: false }}
          selectionOnDrag={false}
          zoomOnDoubleClick={false}
        >
          <Background color="rgba(103, 217, 204, 0.13)" gap={24} size={1} />
          <Controls
            fitViewOptions={{ maxZoom: 1.2, padding: 0.16 }}
            position="bottom-left"
            showInteractive={false}
          />
        </ReactFlow>
        {!layoutReady && <div className={styles.topologyGraphLoading}>Arranging documented topology…</div>}
      </div>

      <div className={styles.topologyLegend} aria-label="Topology legend">
        <span><i data-status="confirmed" /> Confirmed path</span>
        <span><i data-status="partial" /> Documented partial</span>
        <span><i data-status="unknown" /> Medium or path not established</span>
        <span><b /> This dossier</span>
      </div>
    </section>
  );
}
