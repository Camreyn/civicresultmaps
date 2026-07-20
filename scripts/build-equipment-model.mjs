import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Scene,
  TorusGeometry,
} from "three";

import {
  addComponent,
  addPart,
  writeGlb,
} from "./equipment-model-helpers.mjs";

const outputPath = "public/equipment/ess-evs-6400-ds200/orthographic-pilot.glb";
const scene = new Scene();
scene.name = "CivicResultMaps_DS200_Photo_Informed_Schematic";
const assembly = new Group();
assembly.name = "DS200_Illustrative_Assembly";
scene.add(assembly);

const container = addComponent(assembly, "Ballot_Container");
addPart(container, {
  name: "DS200_Cabinet_Body",
  geometry: new BoxGeometry(2.72, 3.15, 2.12),
  color: "#252d2f",
  position: [0, -0.08, 0],
  roughness: 0.9,
});
addPart(container, {
  name: "DS200_Main_Compartment_Door",
  geometry: new BoxGeometry(1.8, 1.78, 0.08),
  color: "#161c1e",
  position: [0.22, -0.22, 1.095],
  roughness: 0.82,
});
addPart(container, {
  name: "DS200_Auxiliary_Door",
  geometry: new BoxGeometry(1.85, 0.52, 0.08),
  color: "#303a3d",
  position: [0.18, 0.96, 1.1],
  roughness: 0.8,
});
for (const [index, x] of [-0.98, 0.98].entries()) {
  addPart(container, {
    name: `DS200_Front_Wheel_${index + 1}`,
    geometry: new CylinderGeometry(0.18, 0.18, 0.13, 18),
    color: "#0c1112",
    position: [x, -1.73, 0.74],
    rotation: [Math.PI / 2, 0, 0],
    roughness: 0.95,
  });
}
addPart(container, {
  name: "DS200_Door_Handle",
  geometry: new BoxGeometry(0.5, 0.08, 0.08),
  color: "#87989b",
  position: [0.25, 0.52, 1.17],
  metalness: 0.55,
  roughness: 0.34,
});

const gasket = addComponent(assembly, "Tote_Bin_Gasket");
addPart(gasket, {
  name: "DS200_Gasket_Front",
  geometry: new BoxGeometry(2.66, 0.1, 0.1),
  color: "#d1e8e5",
  position: [0, 1.45, 1.05],
  roughness: 0.55,
});
for (const [index, x] of [-1.29, 1.29].entries()) {
  addPart(gasket, {
    name: `DS200_Gasket_Side_${index + 1}`,
    geometry: new BoxGeometry(0.08, 0.1, 1.9),
    color: "#d1e8e5",
    position: [x, 1.45, 0],
    roughness: 0.55,
  });
}

const shell = addComponent(assembly, "DS200_Shell");
addPart(shell, {
  name: "DS200_Scanner_Deck",
  geometry: new BoxGeometry(3.05, 0.58, 2.34),
  color: "#aeb9b8",
  position: [0, 1.66, 0],
  roughness: 0.72,
});
addPart(shell, {
  name: "DS200_Deck_Front_Fascia",
  geometry: new BoxGeometry(2.74, 0.48, 0.18),
  color: "#8e9b9c",
  position: [0, 1.64, 1.17],
  roughness: 0.68,
});
addPart(shell, {
  name: "DS200_Protective_Lid",
  geometry: new BoxGeometry(2.84, 2.02, 0.16),
  color: "#1d2426",
  position: [0, 2.92, -0.93],
  rotation: [-0.09, 0, 0],
  roughness: 0.88,
});
addPart(shell, {
  name: "DS200_Lid_Inner_Panel",
  geometry: new BoxGeometry(2.47, 1.62, 0.035),
  color: "#111719",
  position: [0, 2.91, -0.82],
  rotation: [-0.09, 0, 0],
  roughness: 0.9,
});
for (const [index, x] of [-1.14, 1.14].entries()) {
  addPart(shell, {
    name: `DS200_Lid_Strut_${index + 1}`,
    geometry: new BoxGeometry(0.055, 1.55, 0.055),
    color: "#7e8d8f",
    position: [x, 2.34, -0.48],
    rotation: [-0.42, 0, 0],
    metalness: 0.48,
    roughness: 0.38,
  });
}
for (const [index, x] of [-1.12, 1.12].entries()) {
  addPart(shell, {
    name: `DS200_Deck_Latch_${index + 1}`,
    geometry: new BoxGeometry(0.3, 0.14, 0.08),
    color: "#d3dddd",
    position: [x, 1.77, 1.3],
    metalness: 0.48,
    roughness: 0.34,
  });
}

const scannerPath = addComponent(assembly, "Scanner_Path");
addPart(scannerPath, {
  name: "DS200_Ballot_Input_Tray",
  geometry: new BoxGeometry(1.66, 0.12, 1.36),
  color: "#33c6b5",
  position: [0.2, 1.96, 0.18],
  rotation: [-0.08, 0, 0],
  roughness: 0.48,
});
addPart(scannerPath, {
  name: "DS200_Ballot_Slot",
  geometry: new BoxGeometry(1.34, 0.1, 0.16),
  color: "#081214",
  position: [0.2, 2.02, 0.74],
  rotation: [-0.08, 0, 0],
  roughness: 0.92,
});
for (const [index, x] of [-0.43, 0.43].entries()) {
  addPart(scannerPath, {
    name: `DS200_Scan_Roller_${index + 1}`,
    geometry: new CylinderGeometry(0.09, 0.09, 1.05, 18),
    color: "#183c3c",
    position: [x + 0.2, 1.92, -0.18],
    rotation: [0, 0, Math.PI / 2],
    roughness: 0.58,
  });
}

const display = addComponent(assembly, "Display_Assembly");
addPart(display, {
  name: "DS200_Display_Bezel",
  geometry: new BoxGeometry(1.62, 1.04, 0.13),
  color: "#303c42",
  position: [-0.22, 2.43, 0.2],
  rotation: [-0.31, 0, 0],
  roughness: 0.62,
});
addPart(display, {
  name: "DS200_Display_Surface",
  geometry: new BoxGeometry(1.38, 0.79, 0.035),
  color: "#78a6ff",
  position: [-0.22, 2.45, 0.27],
  rotation: [-0.31, 0, 0],
  metalness: 0.02,
  roughness: 0.24,
});
for (const [index, x] of [-0.72, 0.28].entries()) {
  addPart(display, {
    name: `DS200_Display_Hinge_${index + 1}`,
    geometry: new CylinderGeometry(0.07, 0.07, 0.18, 16),
    color: "#718185",
    position: [x, 2.05, 0.04],
    rotation: [0, 0, Math.PI / 2],
    metalness: 0.42,
    roughness: 0.38,
  });
}

const processor = addComponent(assembly, "Processor_Module");
addPart(processor, {
  name: "DS200_Processor_PCB",
  geometry: new BoxGeometry(1.02, 0.09, 0.72),
  color: "#9c7a35",
  position: [0.78, 1.54, -0.36],
  roughness: 0.5,
});
addPart(processor, {
  name: "DS200_Processor_Package",
  geometry: new BoxGeometry(0.34, 0.11, 0.34),
  color: "#f0b95a",
  position: [0.78, 1.64, -0.36],
  metalness: 0.26,
  roughness: 0.36,
});

const scannerBoard = addComponent(assembly, "Scanner_Board");
addPart(scannerBoard, {
  name: "DS200_Scanner_PCB",
  geometry: new BoxGeometry(1.18, 0.08, 0.78),
  color: "#9b3668",
  position: [-0.76, 1.52, -0.34],
  roughness: 0.48,
});
for (const [index, x] of [-0.98, -0.72, -0.48].entries()) {
  addPart(scannerBoard, {
    name: `DS200_Scanner_Chip_${index + 1}`,
    geometry: new BoxGeometry(0.18, 0.08, 0.2),
    color: "#e87fb3",
    position: [x, 1.61, -0.32],
    roughness: 0.4,
  });
}

const seal = addComponent(assembly, "Seal_Area");
addPart(seal, {
  name: "DS200_Seal_Eyelet",
  geometry: new TorusGeometry(0.13, 0.035, 10, 20),
  color: "#ff8c69",
  position: [1.39, 1.73, 1.12],
  rotation: [Math.PI / 2, 0, 0],
  metalness: 0.42,
  roughness: 0.32,
});

await writeGlb(scene, outputPath, {
  generatedBy: "scripts/build-equipment-model.mjs",
  referenceConfiguration: "Official ES&S DS200 open poll-place product view",
  referenceFidelity: "photo_informed_external_form_internal_placement_illustrative",
  omittedSourceSupportedComponent: "Battery backup is documented, but no source-supported internal placement is available.",
});
