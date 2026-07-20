import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
  TorusGeometry,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const outputPath = "public/equipment/clear-ballot-clearvote-25-clearaccess/orthographic-pilot.glb";

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
    metalness: options.metalness ?? 0.1,
    opacity: options.opacity ?? 1,
    roughness: options.roughness ?? 0.66,
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
scene.name = "CivicResultMaps_ClearAccess_Illustrative_Schematic";
const assembly = new Group();
assembly.name = "ClearAccess_Illustrative_Assembly";
scene.add(assembly);

addPart(assembly, {
  name: "Setup_Case",
  geometry: new BoxGeometry(5.2, 0.22, 3.1),
  color: "#53676d",
  position: [0, -1.24, 0],
  opacity: 0.72,
  roughness: 0.82,
});

addPart(assembly, {
  name: "Touchscreen_AIO",
  geometry: new BoxGeometry(2.45, 1.65, 0.28),
  color: "#78a6ff",
  position: [0, 0.8, -0.35],
  rotation: [-0.08, 0, 0],
  roughness: 0.38,
});

addPart(assembly, {
  name: "ClearAccess_Software",
  geometry: new BoxGeometry(2.12, 1.31, 0.035),
  color: "#33c6b5",
  position: [0, 0.8, -0.19],
  rotation: [-0.08, 0, 0],
  metalness: 0.03,
  roughness: 0.28,
});

addPart(assembly, {
  name: "Ballot_Printer",
  geometry: new BoxGeometry(1.45, 0.9, 1.45),
  color: "#f0b95a",
  position: [2.05, -0.55, -0.2],
  roughness: 0.55,
});

addPart(assembly, {
  name: "External_UPS",
  geometry: new BoxGeometry(1.25, 1.35, 1.35),
  color: "#e87fb3",
  position: [-2.05, -0.42, -0.28],
  roughness: 0.52,
});

addPart(assembly, {
  name: "Accessible_Keypad",
  geometry: new BoxGeometry(1.2, 0.16, 0.72),
  color: "#d1e8e5",
  position: [0.85, -0.82, 1.05],
  rotation: [-0.24, 0, 0],
  roughness: 0.46,
});

addPart(assembly, {
  name: "Barcode_Scanner",
  geometry: new BoxGeometry(0.55, 0.78, 0.48),
  color: "#ff8c69",
  position: [-0.9, -0.65, 1.02],
  rotation: [-0.12, 0.18, 0],
  roughness: 0.48,
});

addPart(assembly, {
  name: "Assistive_Accessories",
  geometry: new TorusGeometry(0.48, 0.085, 14, 28, Math.PI * 1.45),
  color: "#a68cf2",
  position: [-1.58, 1.18, 0.45],
  rotation: [Math.PI / 2, 0, -0.42],
  roughness: 0.4,
});

addPart(assembly, {
  name: "ESD_EMI_Controls",
  geometry: new CylinderGeometry(0.21, 0.21, 0.55, 20),
  color: "#ef6f6c",
  position: [1.38, 1.32, -0.22],
  rotation: [Math.PI / 2, 0, 0],
  metalness: 0.18,
  roughness: 0.38,
});

scene.userData = {
  assetLicense: "Apache-2.0",
  fidelity: "illustrative_not_to_scale",
  generatedBy: "scripts/build-clearaccess-model.mjs",
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
