"use client";

import { Canvas, type ThreeEvent, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import {
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Vector3,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import type { EquipmentScene } from "@/lib/equipment-catalog";
import styles from "../equipment.module.css";

type ViewName = "front" | "isometric" | "top";

function CameraRig({ scene, view }: { scene: EquipmentScene; view: ViewName }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    const positions: Record<ViewName, [number, number, number]> = {
      front: [0, 1.2, 8],
      isometric: scene.camera.position as [number, number, number],
      top: [0, 9, 0.01],
    };
    camera.position.set(...positions[view]);
    camera.zoom = scene.camera.zoom;
    camera.near = scene.camera.near;
    camera.far = scene.camera.far;
    camera.lookAt(0, 0.55, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, scene.camera, view]);
  return null;
}

function cloneMaterials(root: Object3D) {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((item) => item.clone())
      : object.material.clone();
  });
}

function disposeMaterials(root: Object3D) {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of materials) item.dispose();
  });
}

function SchematicModel({
  exploded,
  onSelect,
  scene,
  selectedComponentId,
}: {
  exploded: boolean;
  onSelect: (componentId: string) => void;
  scene: EquipmentScene;
  selectedComponentId: string;
}) {
  const gltf = useLoader(GLTFLoader, scene.assetUrl);
  const { invalidate } = useThree();
  const model = useMemo(() => {
    const next = gltf.scene.clone(true);
    cloneMaterials(next);
    return next;
  }, [gltf.scene]);
  const basePositions = useMemo(() => new Map(
    scene.nodes.map((entry) => [entry.nodeName, model.getObjectByName(entry.nodeName)?.position.clone()]),
  ), [model, scene.nodes]);

  useEffect(() => () => disposeMaterials(model), [model]);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);

  useEffect(() => {
    for (const entry of scene.nodes) {
      const object = model.getObjectByName(entry.nodeName);
      const base = basePositions.get(entry.nodeName);
      if (!object || !base) continue;
      object.position.copy(base);
      if (exploded) object.position.add(new Vector3(...entry.explodedOffset));
      if (object instanceof Mesh) {
        const materials = (Array.isArray(object.material) ? object.material : [object.material]) as MeshStandardMaterial[];
        for (const material of materials) {
          const selected = entry.componentId === selectedComponentId;
          material.emissive.set(selected ? "#e8fff9" : "#000000");
          material.emissiveIntensity = selected ? 0.62 : 0;
        }
      }
    }
    invalidate();
  }, [basePositions, exploded, invalidate, model, scene.nodes, selectedComponentId]);

  function select(event: ThreeEvent<MouseEvent>) {
    const entry = scene.nodes.find((node) => node.nodeName === event.object.name);
    if (!entry) return;
    event.stopPropagation();
    onSelect(entry.componentId);
  }

  return (
    <primitive
      object={model}
      onClick={select}
      onPointerOut={() => { document.body.style.cursor = ""; }}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        if (scene.nodes.some((node) => node.nodeName === event.object.name)) document.body.style.cursor = "pointer";
      }}
    />
  );
}

export function EquipmentOrthographicScene({
  exploded,
  onError,
  onSelect,
  reducedMotion,
  scene,
  selectedComponentId,
  view,
}: {
  exploded: boolean;
  onError: () => void;
  onSelect: (componentId: string) => void;
  reducedMotion: boolean;
  scene: EquipmentScene;
  selectedComponentId: string;
  view: ViewName;
}) {
  return (
    <div className={styles.canvasWrap} data-reduced-motion={reducedMotion ? "true" : "false"}>
      <Canvas
        camera={{
          far: scene.camera.far,
          near: scene.camera.near,
          position: scene.camera.position as [number, number, number],
          zoom: scene.camera.zoom,
        }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ alpha: false, antialias: true, powerPreference: "low-power" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#071619");
          gl.domElement.addEventListener("webglcontextlost", onError, { once: true });
        }}
        orthographic
      >
        <ambientLight intensity={1.35} />
        <directionalLight intensity={2.1} position={[4, 7, 6]} />
        <directionalLight color="#5ee2d1" intensity={0.7} position={[-5, 2, -3]} />
        <gridHelper args={[12, 24, "#244b4d", "#143033"]} position={[0, -1.55, 0]} />
        <CameraRig scene={scene} view={view} />
        <Suspense fallback={null}>
          <SchematicModel exploded={exploded} onSelect={onSelect} scene={scene} selectedComponentId={selectedComponentId} />
        </Suspense>
      </Canvas>
      <p className={styles.canvasCaption}>Illustrative geometry • not to scale • selection aid only</p>
    </div>
  );
}
