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

const outputPath = "public/equipment/dominion-democracy-suite-517-imagecast-x/orthographic-pilot.glb";

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
scene.name = "CivicResultMaps_ImageCastX_Illustrative_Schematic";
const assembly = new Group();
assembly.name = "ImageCastX_Illustrative_Assembly";
scene.add(assembly);

addPart(assembly, {
  name: "ICX_Physical_Accessories",
  geometry: new BoxGeometry(5.3, 0.22, 3.15),
  color: "#53676d",
  position: [0, -1.24, 0],
  opacity: 0.72,
  roughness: 0.82,
});

addPart(assembly, {
  name: "ICX_Touchscreen",
  geometry: new BoxGeometry(2.55, 1.7, 0.3),
  color: "#78a6ff",
  position: [0, 0.82, -0.36],
  rotation: [-0.08, 0, 0],
  roughness: 0.38,
});

addPart(assembly, {
  name: "ICX_Application",
  geometry: new BoxGeometry(2.2, 1.36, 0.035),
  color: "#33c6b5",
  position: [0, 0.82, -0.19],
  rotation: [-0.08, 0, 0],
  metalness: 0.03,
  roughness: 0.28,
});

addPart(assembly, {
  name: "ICX_Ballot_Printer",
  geometry: new BoxGeometry(1.48, 0.92, 1.5),
  color: "#f0b95a",
  position: [2.08, -0.54, -0.18],
  roughness: 0.55,
});

addPart(assembly, {
  name: "ICX_External_UPS",
  geometry: new BoxGeometry(1.28, 1.38, 1.38),
  color: "#e87fb3",
  position: [-2.08, -0.41, -0.28],
  roughness: 0.52,
});

addPart(assembly, {
  name: "ICX_ATI",
  geometry: new BoxGeometry(1.18, 0.18, 0.76),
  color: "#d1e8e5",
  position: [0.9, -0.82, 1.06],
  rotation: [-0.24, 0, 0],
  roughness: 0.46,
});

addPart(assembly, {
  name: "ICX_Assistive_Accessories",
  geometry: new TorusGeometry(0.5, 0.085, 14, 28, Math.PI * 1.45),
  color: "#a68cf2",
  position: [-1.62, 1.2, 0.45],
  rotation: [Math.PI / 2, 0, -0.42],
  roughness: 0.4,
});

addPart(assembly, {
  name: "ICX_Election_Media",
  geometry: new CylinderGeometry(0.2, 0.2, 0.58, 20),
  color: "#ff8c69",
  position: [1.42, 1.33, -0.2],
  rotation: [Math.PI / 2, 0, 0],
  metalness: 0.18,
  roughness: 0.38,
});

scene.userData = {
  assetLicense: "Apache-2.0",
  fidelity: "illustrative_not_to_scale",
  generatedBy: "scripts/build-imagecast-x-model.mjs",
  omittedSourceSupportedComponent: "ICX Prime SSD geometry and placement are not publicly established.",
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
