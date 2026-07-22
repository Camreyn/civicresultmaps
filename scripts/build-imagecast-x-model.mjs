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

const outputPath = "public/equipment/dominion-democracy-suite-517-imagecast-x/orthographic-pilot.glb";
const scene = new Scene();
scene.name = "CivicResultMaps_ImageCastX_SID21_Drawing_Informed_Schematic";
const assembly = new Group();
assembly.name = "ImageCastX_Illustrative_Assembly";
scene.add(assembly);

const physical = addComponent(assembly, "ICX_Physical_Accessories");
addPart(physical, {
  name: "ICX_Tabletop_Reference_Plane",
  geometry: new BoxGeometry(5.45, 0.18, 3.25),
  color: "#3f5054",
  position: [0, -1.48, 0],
  opacity: 0.82,
  roughness: 0.88,
});
addPart(physical, {
  name: "ICX_Privacy_Screen_Back",
  geometry: new BoxGeometry(3.9, 1.8, 0.08),
  color: "#28363a",
  position: [0, 0.55, -1.55],
  opacity: 0.55,
  roughness: 0.86,
});

const touchscreen = addComponent(assembly, "ICX_Touchscreen");
addPart(touchscreen, {
  name: "ICX_SID21_Display_Housing",
  geometry: new BoxGeometry(3.42, 2.03, 0.23),
  color: "#20282b",
  position: [0, 0.78, 0.12],
  rotation: [-0.045, 0, 0],
  roughness: 0.8,
});
addPart(touchscreen, {
  name: "ICX_SID21_Front_Bezel",
  geometry: new BoxGeometry(3.28, 1.9, 0.06),
  color: "#4d5b60",
  position: [0, 0.78, 0.27],
  rotation: [-0.045, 0, 0],
  roughness: 0.64,
});
addPart(touchscreen, {
  name: "ICX_SID21_Rear_Power_Housing",
  geometry: new BoxGeometry(0.5, 1.26, 0.42),
  color: "#303b3f",
  position: [1.63, 0.71, -0.03],
  rotation: [-0.045, 0, 0],
  roughness: 0.78,
});
addPart(touchscreen, {
  name: "ICX_SID21_Stand_Arm",
  geometry: new BoxGeometry(0.34, 1.42, 0.42),
  color: "#667579",
  position: [0, -0.38, -0.46],
  rotation: [-0.3, 0, 0],
  metalness: 0.24,
  roughness: 0.5,
});
addPart(touchscreen, {
  name: "ICX_SID21_Stand_Hinge",
  geometry: new CylinderGeometry(0.24, 0.24, 0.48, 22),
  color: "#516064",
  position: [0, 0.02, -0.2],
  rotation: [0, 0, Math.PI / 2],
  metalness: 0.26,
  roughness: 0.48,
});
addPart(touchscreen, {
  name: "ICX_SID21_Table_Base",
  geometry: new BoxGeometry(2.85, 0.16, 1.72),
  color: "#5b696d",
  position: [0, -1.11, 0.05],
  roughness: 0.62,
});
addPart(touchscreen, {
  name: "ICX_SID21_Base_Handle",
  geometry: new TorusGeometry(0.34, 0.055, 10, 24, Math.PI),
  color: "#8b989b",
  position: [0, -1.0, 0.92],
  rotation: [Math.PI / 2, 0, Math.PI],
  metalness: 0.4,
  roughness: 0.38,
});

const application = addComponent(assembly, "ICX_Application");
addPart(application, {
  name: "ICX_Application_Display_Surface",
  geometry: new BoxGeometry(2.98, 1.62, 0.025),
  color: "#33c6b5",
  position: [0, 0.78, 0.318],
  rotation: [-0.045, 0, 0],
  metalness: 0.02,
  roughness: 0.23,
});

const computeBoard = addComponent(assembly, "ICX_Compute_Board");
addPart(computeBoard, {
  name: "ICX_SID21_Mainboard",
  geometry: new BoxGeometry(1.72, 0.98, 0.07),
  color: "#9c7a35",
  position: [-0.3, 0.73, -0.035],
  rotation: [-0.045, 0, 0],
  roughness: 0.48,
});
addPart(computeBoard, {
  name: "ICX_SID21_Atom_Package",
  geometry: new BoxGeometry(0.38, 0.34, 0.09),
  color: "#f0b95a",
  position: [-0.34, 0.79, 0.02],
  rotation: [-0.045, 0, 0],
  metalness: 0.22,
  roughness: 0.34,
});
for (const [index, x] of [-0.91, -0.66].entries()) {
  addPart(computeBoard, {
    name: `ICX_SID21_Memory_Package_${index + 1}`,
    geometry: new BoxGeometry(0.18, 0.44, 0.07),
    color: "#d5bd72",
    position: [x, 0.71, 0.02],
    rotation: [-0.045, 0, 0],
    roughness: 0.4,
  });
}
addPart(computeBoard, {
  name: "ICX_SID21_eMMC_Package",
  geometry: new BoxGeometry(0.3, 0.27, 0.07),
  color: "#e2c98a",
  position: [0.26, 0.47, 0.02],
  rotation: [-0.045, 0, 0],
  roughness: 0.4,
});

const ioPanel = addComponent(assembly, "ICX_IO_Panel");
addPart(ioPanel, {
  name: "ICX_SID21_Connector_Plate",
  geometry: new BoxGeometry(0.18, 1.1, 0.44),
  color: "#b85e41",
  position: [1.76, 0.67, -0.02],
  rotation: [-0.045, 0, 0],
  metalness: 0.18,
  roughness: 0.48,
});
for (let index = 0; index < 4; index += 1) {
  addPart(ioPanel, {
    name: `ICX_SID21_USB_Port_${index + 1}`,
    geometry: new BoxGeometry(0.05, 0.13, 0.16),
    color: "#142124",
    position: [1.86, 1.02 - index * 0.21, 0.03],
    rotation: [-0.045, 0, 0],
    roughness: 0.7,
  });
}
addPart(ioPanel, {
  name: "ICX_SID21_RJ45_Port",
  geometry: new BoxGeometry(0.05, 0.2, 0.22),
  color: "#ff8c69",
  position: [1.86, 0.14, -0.02],
  rotation: [-0.045, 0, 0],
  roughness: 0.56,
});

const internalBattery = addComponent(assembly, "ICX_Internal_Battery");
addPart(internalBattery, {
  name: "ICX_SID21_Battery_Cover",
  geometry: new BoxGeometry(1.65, 0.08, 0.82),
  color: "#7e8c90",
  position: [-0.18, -1.0, 0.08],
  roughness: 0.65,
});
addPart(internalBattery, {
  name: "ICX_SID21_ACC_BAT_3S1P_01R",
  geometry: new BoxGeometry(1.23, 0.16, 0.56),
  color: "#e87fb3",
  position: [-0.18, -1.09, 0.08],
  roughness: 0.54,
});

const printer = addComponent(assembly, "ICX_Ballot_Printer");
addPart(printer, {
  name: "ICX_Printer_Body",
  geometry: new BoxGeometry(1.42, 0.88, 1.48),
  color: "#d6d9d6",
  position: [2.2, -0.73, -0.05],
  roughness: 0.64,
});
addPart(printer, {
  name: "ICX_Printer_Output_Slot",
  geometry: new BoxGeometry(0.88, 0.08, 0.18),
  color: "#f0b95a",
  position: [2.2, -0.38, 0.7],
  roughness: 0.48,
});
addPart(printer, {
  name: "ICX_Printer_Paper",
  geometry: new BoxGeometry(0.78, 0.02, 0.62),
  color: "#eef5f2",
  position: [2.2, -0.19, 0.16],
  rotation: [-0.16, 0, 0],
  roughness: 0.82,
});

const ups = addComponent(assembly, "ICX_External_UPS");
addPart(ups, {
  name: "ICX_UPS_Tower",
  geometry: new BoxGeometry(1.1, 1.42, 1.23),
  color: "#252b2e",
  position: [-2.18, -0.7, -0.1],
  roughness: 0.76,
});
addPart(ups, {
  name: "ICX_UPS_Display",
  geometry: new BoxGeometry(0.38, 0.24, 0.035),
  color: "#e87fb3",
  position: [-2.18, -0.43, 0.53],
  roughness: 0.3,
});

const ati = addComponent(assembly, "ICX_ATI");
addPart(ati, {
  name: "ICX_ATI_Handset",
  geometry: new BoxGeometry(0.88, 0.16, 0.64),
  color: "#d1e8e5",
  position: [0.98, -1.1, 1.02],
  rotation: [-0.18, 0, 0],
  roughness: 0.5,
});
for (let index = 0; index < 4; index += 1) {
  addPart(ati, {
    name: `ICX_ATI_Button_${index + 1}`,
    geometry: new CylinderGeometry(0.075, 0.075, 0.04, 18),
    color: index % 2 ? "#78a6ff" : "#33c6b5",
    position: [0.72 + index * 0.17, -1.0, 1.07],
    rotation: [Math.PI / 2, 0, 0],
    roughness: 0.38,
  });
}

const assistive = addComponent(assembly, "ICX_Assistive_Accessories");
addPart(assistive, {
  name: "ICX_Headphone_Band",
  geometry: new TorusGeometry(0.5, 0.075, 12, 28, Math.PI * 1.45),
  color: "#a68cf2",
  position: [-1.3, 1.5, 0.65],
  rotation: [Math.PI / 2, 0, -0.4],
  roughness: 0.42,
});
for (const [index, x] of [-1.7, -0.93].entries()) {
  addPart(assistive, {
    name: `ICX_Headphone_Cup_${index + 1}`,
    geometry: new CylinderGeometry(0.2, 0.2, 0.12, 20),
    color: "#8170bf",
    position: [x, 1.14, 0.7],
    rotation: [Math.PI / 2, 0, 0],
    roughness: 0.46,
  });
}

const media = addComponent(assembly, "ICX_Election_Media");
addPart(media, {
  name: "ICX_USB_Media",
  geometry: new BoxGeometry(0.16, 0.45, 0.12),
  color: "#ff8c69",
  position: [1.45, 1.36, 0.37],
  rotation: [0, 0, 0.18],
  metalness: 0.16,
  roughness: 0.4,
});
addPart(media, {
  name: "ICX_Smart_Card",
  geometry: new BoxGeometry(0.48, 0.02, 0.32),
  color: "#f2d996",
  position: [1.18, 1.14, 0.4],
  rotation: [Math.PI / 2, 0, -0.12],
  roughness: 0.5,
});

await writeGlb(scene, outputPath, {
  generatedBy: "scripts/build-imagecast-x-model.mjs",
  referenceConfiguration: "Avalue SID-21V-Z37-A1R ImageCast X Classic tabletop profile",
  referenceFidelity: "mechanical_drawing_informed_external_form_internal_shapes_illustrative",
  omittedSourceSupportedComponent: "ICX Prime SSD geometry and placement are not publicly established.",
});
