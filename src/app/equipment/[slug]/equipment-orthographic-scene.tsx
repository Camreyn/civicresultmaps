"use client";

import { Canvas, type ThreeEvent, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
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
    camera.lookAt(0, 0.45, 0);
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

function highlightComponent(root: Object3D, selected: boolean) {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = (
      Array.isArray(object.material) ? object.material : [object.material]
    ) as MeshStandardMaterial[];
    for (const material of materials) {
      material.emissive.set(selected ? "#d8fff8" : "#000000");
      material.emissiveIntensity = selected ? 0.48 : 0;
    }
  });
}

function SchematicModel({
  explosion,
  onSelect,
  reducedMotion,
  scene,
  selectedComponentId,
}: {
  explosion: number;
  onSelect: (componentId: string) => void;
  reducedMotion: boolean;
  scene: EquipmentScene;
  selectedComponentId: string;
}) {
  const gltf = useLoader(GLTFLoader, scene.assetUrl);
  const { invalidate } = useThree();
  const targetExplosion = useRef(explosion);
  const renderedExplosion = useRef(explosion);
  const model = useMemo(() => {
    const next = gltf.scene.clone(true);
    cloneMaterials(next);
    return next;
  }, [gltf.scene]);
  const sceneNodeByName = useMemo(
    () => new Map(scene.nodes.map((entry) => [entry.nodeName, entry])),
    [scene.nodes],
  );
  const basePositions = useMemo(
    () => new Map(
      scene.nodes.map((entry) => [entry.nodeName, model.getObjectByName(entry.nodeName)?.position.clone()]),
    ),
    [model, scene.nodes],
  );

  const applyExplosion = useCallback((amount: number) => {
    for (const entry of scene.nodes) {
      const object = model.getObjectByName(entry.nodeName);
      const base = basePositions.get(entry.nodeName);
      if (!object || !base) continue;
      object.position.set(
        base.x + entry.explodedOffset[0] * amount,
        base.y + entry.explodedOffset[1] * amount,
        base.z + entry.explodedOffset[2] * amount,
      );
    }
  }, [basePositions, model, scene.nodes]);

  useEffect(() => () => disposeMaterials(model), [model]);
  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);

  useEffect(() => {
    for (const entry of scene.nodes) {
      const object = model.getObjectByName(entry.nodeName);
      if (object) highlightComponent(object, entry.componentId === selectedComponentId);
    }
    invalidate();
  }, [invalidate, model, scene.nodes, selectedComponentId]);

  useEffect(() => {
    const bounded = Math.max(0, Math.min(1, explosion));
    targetExplosion.current = bounded;
    if (reducedMotion) {
      renderedExplosion.current = bounded;
      applyExplosion(bounded);
    }
    invalidate();
  }, [applyExplosion, explosion, invalidate, reducedMotion]);

  useFrame((_, delta) => {
    const target = targetExplosion.current;
    const current = renderedExplosion.current;
    if (Math.abs(target - current) < 0.001 || reducedMotion) {
      if (current !== target) {
        renderedExplosion.current = target;
        applyExplosion(target);
      }
      return;
    }
    const next = current + (target - current) * (1 - Math.exp(-9 * delta));
    renderedExplosion.current = next;
    applyExplosion(next);
    invalidate();
  });

  function mappedEntryFor(object: Object3D) {
    let current: Object3D | null = object;
    while (current && current !== model) {
      const entry = sceneNodeByName.get(current.name);
      if (entry) return entry;
      current = current.parent;
    }
    return null;
  }

  function select(event: ThreeEvent<MouseEvent>) {
    const entry = mappedEntryFor(event.object);
    if (!entry) return;
    event.stopPropagation();
    onSelect(entry.componentId);
  }

  return (
    <primitive
      object={model}
      onClick={select}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        if (mappedEntryFor(event.object)) document.body.style.cursor = "pointer";
      }}
    />
  );
}

export function EquipmentOrthographicScene({
  explosion,
  onError,
  onSelect,
  reducedMotion,
  scene,
  selectedComponentId,
  view,
}: {
  explosion: number;
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
        <ambientLight intensity={1.45} />
        <directionalLight intensity={2.15} position={[4, 7, 6]} />
        <directionalLight color="#5ee2d1" intensity={0.72} position={[-5, 2, -3]} />
        <gridHelper args={[12, 24, "#244b4d", "#143033"]} position={[0, -1.72, 0]} />
        <CameraRig scene={scene} view={view} />
        <Suspense fallback={null}>
          <SchematicModel
            explosion={explosion}
            onSelect={onSelect}
            reducedMotion={reducedMotion}
            scene={scene}
            selectedComponentId={selectedComponentId}
          />
        </Suspense>
      </Canvas>
      <p className={styles.canvasCaption}>
        Photo/manual-informed outline • {Math.round(explosion * 100)}% exploded • not to scale
      </p>
    </div>
  );
}
