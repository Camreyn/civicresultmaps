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

const outputPath = "public/equipment/clear-ballot-clearvote-25-clearaccess/orthographic-pilot.glb";
const scene = new Scene();
scene.name = "CivicResultMaps_ClearAccess_Photo_Informed_Schematic";
const assembly = new Group();
assembly.name = "ClearAccess_Illustrative_Assembly";
scene.add(assembly);

const setupCase = addComponent(assembly, "Setup_Case");
addPart(setupCase, {
  name: "ClearAccess_All_In_One_Case_Base",
  geometry: new BoxGeometry(5.35, 0.3, 3.15),
  color: "#3d4d50",
  position: [0, -1.5, 0],
  roughness: 0.86,
});
addPart(setupCase, {
  name: "ClearAccess_Case_Lip",
  geometry: new BoxGeometry(5.05, 0.22, 0.18),
  color: "#596a6d",
  position: [0, -1.3, 1.5],
  roughness: 0.72,
});
for (const [index, x] of [-1.38, 1.38].entries()) {
  addPart(setupCase, {
    name: `ClearAccess_Case_Latch_${index + 1}`,
    geometry: new BoxGeometry(0.34, 0.16, 0.08),
    color: "#a4b2b4",
    position: [x, -1.27, 1.61],
    metalness: 0.46,
    roughness: 0.34,
  });
}

const touchscreen = addComponent(assembly, "Touchscreen_AIO");
addPart(touchscreen, {
  name: "ClearAccess_Portrait_Elo_Housing",
  geometry: new BoxGeometry(1.78, 2.82, 0.23),
  color: "#202629",
  position: [0, 0.28, -0.2],
  roughness: 0.78,
});
addPart(touchscreen, {
  name: "ClearAccess_Portrait_Elo_Bezel",
  geometry: new BoxGeometry(1.66, 2.68, 0.055),
  color: "#111719",
  position: [0, 0.28, -0.045],
  roughness: 0.68,
});
addPart(touchscreen, {
  name: "ClearAccess_Elo_Rear_Housing",
  geometry: new BoxGeometry(1.32, 1.28, 0.34),
  color: "#30393c",
  position: [0, -0.12, -0.42],
  roughness: 0.76,
});
addPart(touchscreen, {
  name: "ClearAccess_Elo_Stand",
  geometry: new BoxGeometry(0.32, 0.82, 0.42),
  color: "#5b696c",
  position: [0, -1.18, -0.36],
  rotation: [-0.18, 0, 0],
  metalness: 0.16,
  roughness: 0.58,
});
addPart(touchscreen, {
  name: "ClearAccess_Elo_Stand_Base",
  geometry: new BoxGeometry(1.55, 0.12, 1.02),
  color: "#68777a",
  position: [0, -1.47, 0.02],
  roughness: 0.64,
});

const software = addComponent(assembly, "ClearAccess_Software");
addPart(software, {
  name: "ClearAccess_Ballot_Interface",
  geometry: new BoxGeometry(1.43, 2.36, 0.025),
  color: "#78a6ff",
  position: [0, 0.28, -0.008],
  metalness: 0.01,
  roughness: 0.24,
});
addPart(software, {
  name: "ClearAccess_Interface_Header",
  geometry: new BoxGeometry(1.32, 0.24, 0.016),
  color: "#33c6b5",
  position: [0, 1.31, 0.01],
  roughness: 0.26,
});
for (let index = 0; index < 5; index += 1) {
  addPart(software, {
    name: `ClearAccess_Contest_Row_${index + 1}`,
    geometry: new BoxGeometry(1.12, 0.19, 0.014),
    color: index === 2 ? "#33c6b5" : "#d9e5e3",
    position: [0, 0.78 - index * 0.31, 0.012],
    roughness: 0.4,
  });
}

const printer = addComponent(assembly, "Ballot_Printer");
addPart(printer, {
  name: "ClearAccess_Printer_Body",
  geometry: new BoxGeometry(1.46, 0.96, 1.48),
  color: "#d6d9d6",
  position: [2.18, -0.82, -0.1],
  roughness: 0.64,
});
addPart(printer, {
  name: "ClearAccess_Printer_Output",
  geometry: new BoxGeometry(0.92, 0.08, 0.2),
  color: "#f0b95a",
  position: [2.18, -0.43, 0.65],
  roughness: 0.48,
});
addPart(printer, {
  name: "ClearAccess_Printed_Ballot",
  geometry: new BoxGeometry(0.83, 0.025, 0.72),
  color: "#f2f6f4",
  position: [2.18, -0.2, 0.05],
  rotation: [-0.17, 0, 0],
  roughness: 0.82,
});

const ups = addComponent(assembly, "External_UPS");
addPart(ups, {
  name: "ClearAccess_UPS_Tower",
  geometry: new BoxGeometry(1.12, 1.46, 1.24),
  color: "#252b2e",
  position: [-2.16, -0.77, -0.12],
  roughness: 0.76,
});
addPart(ups, {
  name: "ClearAccess_UPS_Display",
  geometry: new BoxGeometry(0.4, 0.25, 0.035),
  color: "#e87fb3",
  position: [-2.16, -0.48, 0.51],
  roughness: 0.3,
});
addPart(ups, {
  name: "ClearAccess_UPS_Button",
  geometry: new CylinderGeometry(0.09, 0.09, 0.035, 18),
  color: "#79d4c9",
  position: [-2.16, -0.77, 0.53],
  rotation: [Math.PI / 2, 0, 0],
  roughness: 0.36,
});

const keypad = addComponent(assembly, "Accessible_Keypad");
addPart(keypad, {
  name: "ClearAccess_Storm_Keypad_Body",
  geometry: new BoxGeometry(0.76, 1.08, 0.16),
  color: "#c8cecc",
  position: [1.22, -0.56, 1.03],
  rotation: [-0.08, 0, 0],
  roughness: 0.58,
});
const keypadButtons = [
  [-0.22, 0.35, "#78a6ff"],
  [0, 0.36, "#6c8fd6"],
  [0.22, 0.35, "#ef6f6c"],
  [-0.2, 0.08, "#f1f1e9"],
  [0.2, 0.08, "#f1f1e9"],
  [0, -0.2, "#f0d04f"],
  [0, -0.42, "#f0d04f"],
  [0.23, -0.42, "#49c57b"],
];
for (const [index, [x, y, color]] of keypadButtons.entries()) {
  addPart(keypad, {
    name: `ClearAccess_Keypad_Button_${index + 1}`,
    geometry: new CylinderGeometry(0.075, 0.075, 0.035, 18),
    color,
    position: [1.22 + x, -0.56 + y, 1.13],
    rotation: [Math.PI / 2, 0, 0],
    roughness: 0.36,
  });
}

const barcode = addComponent(assembly, "Barcode_Scanner");
addPart(barcode, {
  name: "ClearAccess_Barcode_Grip",
  geometry: new BoxGeometry(0.32, 0.68, 0.34),
  color: "#ff8c69",
  position: [-1.04, -0.88, 1.02],
  rotation: [-0.12, 0.2, -0.08],
  roughness: 0.52,
});
addPart(barcode, {
  name: "ClearAccess_Barcode_Head",
  geometry: new BoxGeometry(0.56, 0.34, 0.46),
  color: "#9e4e38",
  position: [-0.98, -0.54, 1.04],
  rotation: [-0.12, 0.2, -0.08],
  roughness: 0.48,
});

const assistive = addComponent(assembly, "Assistive_Accessories");
addPart(assistive, {
  name: "ClearAccess_Headphone_Band",
  geometry: new TorusGeometry(0.67, 0.085, 14, 34, Math.PI * 1.48),
  color: "#292f31",
  position: [-0.32, 0.58, 0.38],
  rotation: [Math.PI / 2, 0, -0.33],
  roughness: 0.46,
});
for (const [index, x] of [-0.86, 0.2].entries()) {
  addPart(assistive, {
    name: `ClearAccess_Headphone_Cup_${index + 1}`,
    geometry: new CylinderGeometry(0.24, 0.24, 0.13, 22),
    color: "#171c1e",
    position: [x, 0.08, 0.46],
    rotation: [Math.PI / 2, 0, 0],
    roughness: 0.5,
  });
}
addPart(assistive, {
  name: "ClearAccess_Sip_And_Puff_Tube",
  geometry: new TorusGeometry(0.36, 0.035, 8, 24, Math.PI * 1.2),
  color: "#a68cf2",
  position: [-1.55, 0.66, 0.7],
  rotation: [Math.PI / 2, 0, -0.5],
  roughness: 0.4,
});

const controls = addComponent(assembly, "ESD_EMI_Controls");
addPart(controls, {
  name: "ClearAccess_ESD_Bonding_Point",
  geometry: new CylinderGeometry(0.16, 0.16, 0.12, 20),
  color: "#ef6f6c",
  position: [0.78, 1.34, -0.42],
  rotation: [Math.PI / 2, 0, 0],
  metalness: 0.34,
  roughness: 0.36,
});
addPart(controls, {
  name: "ClearAccess_EMI_Shield_Patch",
  geometry: new BoxGeometry(0.48, 0.38, 0.035),
  color: "#b65755",
  position: [0.48, 0.96, -0.45],
  roughness: 0.46,
});

await writeGlb(scene, outputPath, {
  generatedBy: "scripts/build-clearaccess-model.mjs",
  referenceConfiguration: "Official ClearAccess portrait Elo product image with keypad and headphones",
  referenceFidelity: "photo_informed_external_form_peripheral_placement_illustrative",
  internalEvidenceBoundary: "No single sourced Elo internal hardware profile is placed in the scene.",
});
