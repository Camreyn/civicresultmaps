import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

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

export function addComponent(parent, name) {
  const group = new Group();
  group.name = name;
  parent.add(group);
  return group;
}

export function addPart(group, {
  color,
  geometry,
  name,
  opacity = 1,
  position,
  rotation = [0, 0, 0],
  metalness = 0.1,
  roughness = 0.66,
}) {
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      color,
      metalness,
      opacity,
      roughness,
      transparent: opacity < 1,
    }),
  );
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

export async function writeGlb(scene, outputPath, userData) {
  scene.userData = {
    assetLicense: "Apache-2.0",
    fidelity: "illustrative_not_to_scale",
    ...userData,
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
}
