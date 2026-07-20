import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const outputPath = "public/equipment/ess-evs-6400-ds200/orthographic-pilot.glb";

class NodeFileReader {
  result = null;
  error = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onloadend?.({ target: this });
      })
      .catch((error) => {
        this.error = error;
        this.onerror?.(error);
      });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer()
      .then((buffer) => {
        const mime = blob.type || "application/octet-stream";
        this.result = `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.({ target: this });
      })
      .catch((error) => {
        this.error = error;
        this.onerror?.(error);
      });
  }
}

globalThis.FileReader ??= NodeFileReader;

function material(color, options = {}) {
  return new MeshStandardMaterial({
    color,
    metalness: options.metalness ?? 0.12,
    opacity: options.opacity ?? 1,
    roughness: options.roughness ?? 0.68,
    transparent: (options.opacity ?? 1) < 1,
  });
}

function addPart(group, { color, geometry, name, position, rotation = [0, 0, 0], ...options }) {
  const mesh = new Mesh(geometry, material(color, options));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

const scene = new Scene();
scene.name = "CivicResultMaps_DS200_Illustrative_Schematic";
const assembly = new Group();
assembly.name = "DS200_Illustrative_Assembly";
scene.add(assembly);

addPart(assembly, {
  name: "Ballot_Container",
  geometry: new BoxGeometry(3.5, 2.35, 2.75),
  color: "#53676d",
  position: [0, -0.35, 0],
  opacity: 0.82,
  roughness: 0.82,
});

addPart(assembly, {
  name: "Tote_Bin_Gasket",
  geometry: new BoxGeometry(3.24, 0.08, 0.1),
  color: "#d1e8e5",
  position: [0, 0.45, 1.39],
  roughness: 0.55,
});

addPart(assembly, {
  name: "DS200_Shell",
  geometry: new BoxGeometry(3.8, 1.12, 3.02),
  color: "#8ca3a8",
  position: [0, 1.42, 0],
  opacity: 0.28,
  metalness: 0.2,
  roughness: 0.5,
});

addPart(assembly, {
  name: "Scanner_Path",
  geometry: new BoxGeometry(3.05, 0.14, 1.75),
  color: "#33c6b5",
  position: [0, 1.48, 0],
  opacity: 0.9,
  roughness: 0.44,
});

addPart(assembly, {
  name: "Display_Assembly",
  geometry: new BoxGeometry(2.05, 0.16, 1.35),
  color: "#78a6ff",
  position: [0, 2.17, 0.48],
  rotation: [-0.36, 0, 0],
  metalness: 0.05,
  roughness: 0.35,
});

addPart(assembly, {
  name: "Processor_Module",
  geometry: new BoxGeometry(1.05, 0.18, 0.76),
  color: "#f0b95a",
  position: [0.92, 1.2, -0.28],
  roughness: 0.5,
});

addPart(assembly, {
  name: "Scanner_Board",
  geometry: new BoxGeometry(1.28, 0.12, 0.88),
  color: "#e87fb3",
  position: [-0.86, 1.18, -0.25],
  roughness: 0.5,
});

addPart(assembly, {
  name: "Seal_Area",
  geometry: new CylinderGeometry(0.12, 0.12, 0.16, 20),
  color: "#ff8c69",
  position: [1.76, 1.65, 1.17],
  rotation: [Math.PI / 2, 0, 0],
  metalness: 0.1,
  roughness: 0.42,
});

scene.userData = {
  assetLicense: "Apache-2.0",
  fidelity: "illustrative_not_to_scale",
  generatedBy: "scripts/build-equipment-model.mjs",
};

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(scene, {
  binary: true,
  onlyVisible: true,
});

if (!(result instanceof ArrayBuffer)) {
  throw new Error("Expected GLTFExporter to return a binary ArrayBuffer.");
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(result));
console.log(`Wrote ${outputPath} (${result.byteLength.toLocaleString()} bytes).`);
