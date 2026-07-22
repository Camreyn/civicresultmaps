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

function addScreen(group, { color = "#33c6b5", name, position, size }) {
  addPart(group, {
    name: `${name}_Housing`,
    geometry: new BoxGeometry(size[0], size[1], 0.18),
    color: "#252d30",
    position,
    roughness: 0.76,
  });
  addPart(group, {
    name: `${name}_Display`,
    geometry: new BoxGeometry(size[0] - 0.16, size[1] - 0.16, 0.025),
    color,
    position: [position[0], position[1], position[2] + 0.105],
    roughness: 0.26,
  });
}

async function buildClearCount() {
  const outputPath = "public/equipment/clear-ballot-clearvote-25-clearcount/orthographic-pilot.glb";
  const scene = new Scene();
  scene.name = "CivicResultMaps_ClearCount_Photo_Informed_Schematic";
  const assembly = new Group();
  assembly.name = "ClearCount_Illustrative_Assembly";
  scene.add(assembly);

  const scanner = addComponent(assembly, "ClearCount_Central_Scanner");
  addPart(scanner, {
    name: "ClearCount_Scanner_Base",
    geometry: new BoxGeometry(3.0, 1.45, 2.25),
    color: "#d4d9d8",
    position: [0, -0.35, 0],
    roughness: 0.72,
  });
  addPart(scanner, {
    name: "ClearCount_Scanner_Upper_Housing",
    geometry: new BoxGeometry(2.45, 0.7, 1.75),
    color: "#edf1ef",
    position: [0.12, 0.63, -0.12],
    rotation: [-0.08, 0, 0],
    roughness: 0.66,
  });
  addPart(scanner, {
    name: "ClearCount_Scanner_Input_Tray",
    geometry: new BoxGeometry(2.3, 0.08, 1.55),
    color: "#2b3336",
    position: [0.05, 1.05, -1.12],
    rotation: [-0.28, 0, 0],
    roughness: 0.7,
  });
  addPart(scanner, {
    name: "ClearCount_Scanner_Output_Tray",
    geometry: new BoxGeometry(2.25, 0.08, 1.45),
    color: "#c5cdcb",
    position: [0.05, -0.78, 1.25],
    rotation: [0.13, 0, 0],
    roughness: 0.72,
  });
  for (const [index, x] of [-0.82, 0.82].entries()) {
    addPart(scanner, {
      name: `ClearCount_Scanner_Roller_${index + 1}`,
      geometry: new CylinderGeometry(0.14, 0.14, 1.6, 20),
      color: "#111719",
      position: [x, 0.05, 0.95],
      rotation: [0, 0, Math.PI / 2],
      roughness: 0.62,
    });
  }

  const scanStation = addComponent(assembly, "ClearCount_ScanStation");
  addPart(scanStation, {
    name: "ClearCount_Laptop_Base",
    geometry: new BoxGeometry(2.25, 0.14, 1.35),
    color: "#343c40",
    position: [0.3, 1.58, 0.02],
    rotation: [-0.03, 0, 0],
    roughness: 0.62,
  });
  addPart(scanStation, {
    name: "ClearCount_Laptop_Screen",
    geometry: new BoxGeometry(2.2, 1.28, 0.12),
    color: "#252c2f",
    position: [0.3, 2.25, -0.58],
    rotation: [-0.18, 0, 0],
    roughness: 0.68,
  });

  const application = addComponent(assembly, "ClearCount_Application");
  addPart(application, {
    name: "ClearCount_Application_Surface",
    geometry: new BoxGeometry(2.02, 1.08, 0.025),
    color: "#78a6ff",
    position: [0.3, 2.25, -0.505],
    rotation: [-0.18, 0, 0],
    roughness: 0.24,
  });

  const server = addComponent(assembly, "ClearCount_CountServer");
  addPart(server, {
    name: "ClearCount_Server_Tower",
    geometry: new BoxGeometry(1.12, 2.35, 1.8),
    color: "#20282b",
    position: [-2.55, -0.1, -0.15],
    roughness: 0.78,
  });
  addPart(server, {
    name: "ClearCount_Server_Front",
    geometry: new BoxGeometry(0.92, 1.95, 0.05),
    color: "#344247",
    position: [-2.55, -0.1, 0.78],
    roughness: 0.56,
  });

  const countStation = addComponent(assembly, "ClearCount_CountStation");
  addScreen(countStation, {
    name: "ClearCount_CountStation_Monitor",
    position: [2.75, 0.66, -0.2],
    size: [1.85, 1.2],
  });
  addPart(countStation, {
    name: "ClearCount_CountStation_Stand",
    geometry: new BoxGeometry(0.24, 0.75, 0.28),
    color: "#5f6c70",
    position: [2.75, -0.3, -0.35],
    roughness: 0.6,
  });
  addPart(countStation, {
    name: "ClearCount_CountStation_Base",
    geometry: new BoxGeometry(1.25, 0.1, 0.85),
    color: "#68777a",
    position: [2.75, -0.67, -0.1],
    roughness: 0.62,
  });

  const network = addComponent(assembly, "ClearCount_Network_Switch");
  addPart(network, {
    name: "ClearCount_Closed_Network_Switch",
    geometry: new BoxGeometry(1.65, 0.28, 0.85),
    color: "#4a5c61",
    position: [-2.5, -1.5, 0.35],
    roughness: 0.65,
  });
  for (let index = 0; index < 8; index += 1) {
    addPart(network, {
      name: `ClearCount_Ethernet_Port_${index + 1}`,
      geometry: new BoxGeometry(0.12, 0.08, 0.05),
      color: "#33c6b5",
      position: [-3.05 + index * 0.16, -1.5, 0.8],
      roughness: 0.4,
    });
  }

  const ups = addComponent(assembly, "ClearCount_UPS");
  addPart(ups, {
    name: "ClearCount_APC_UPS",
    geometry: new BoxGeometry(1.05, 1.5, 1.25),
    color: "#252b2e",
    position: [2.65, -1.15, -0.25],
    roughness: 0.76,
  });
  addPart(ups, {
    name: "ClearCount_UPS_Display",
    geometry: new BoxGeometry(0.38, 0.24, 0.035),
    color: "#e87fb3",
    position: [2.65, -0.85, 0.39],
    roughness: 0.3,
  });

  await writeGlb(scene, outputPath, {
    generatedBy: "scripts/build-tabulator-models.mjs",
    referenceConfiguration: "ClearCount COTS scanner, ScanStation, CountServer, CountStation, closed-network switch, and UPS",
    referenceFidelity: "manufacturer_photo_informed_scanner_shape_certification_tables_inform_component_categories",
    evidenceBoundary: "Certified alternatives are not implied to be installed together; exact cabling and internal placement are illustrative.",
  });
}

async function buildImageCastCentral() {
  const outputPath = "public/equipment/dominion-democracy-suite-517-imagecast-central/orthographic-pilot.glb";
  const scene = new Scene();
  scene.name = "CivicResultMaps_ImageCast_Central_Manual_Informed_Schematic";
  const assembly = new Group();
  assembly.name = "ImageCast_Central_Illustrative_Assembly";
  scene.add(assembly);

  const scanner = addComponent(assembly, "ICC_Central_Scanner");
  addPart(scanner, {
    name: "ICC_Canon_DR_G2140_Base",
    geometry: new BoxGeometry(2.75, 1.45, 2.15),
    color: "#30383b",
    position: [0.7, -0.3, 0],
    roughness: 0.72,
  });
  addPart(scanner, {
    name: "ICC_Canon_DR_G2140_Upper",
    geometry: new BoxGeometry(2.35, 0.72, 1.65),
    color: "#3f494d",
    position: [0.7, 0.65, -0.18],
    rotation: [-0.08, 0, 0],
    roughness: 0.66,
  });
  addPart(scanner, {
    name: "ICC_Canon_Input_Tray",
    geometry: new BoxGeometry(2.1, 0.08, 1.35),
    color: "#1d2427",
    position: [0.7, 1.08, -1.0],
    rotation: [-0.28, 0, 0],
    roughness: 0.7,
  });
  addPart(scanner, {
    name: "ICC_Canon_Output_Tray",
    geometry: new BoxGeometry(2.18, 0.08, 1.3),
    color: "#232b2e",
    position: [0.7, -0.78, 1.12],
    rotation: [0.12, 0, 0],
    roughness: 0.72,
  });

  const workstation = addComponent(assembly, "ICC_Workstation");
  addPart(workstation, {
    name: "ICC_Dell_Workstation_Tower",
    geometry: new BoxGeometry(0.9, 2.05, 1.6),
    color: "#222a2d",
    position: [-2.65, -0.4, -0.3],
    roughness: 0.76,
  });
  addScreen(workstation, {
    name: "ICC_Workstation_Monitor",
    position: [-1.55, 1.0, -0.15],
    size: [2.15, 1.35],
  });
  addPart(workstation, {
    name: "ICC_Monitor_Stand",
    geometry: new BoxGeometry(0.22, 0.82, 0.28),
    color: "#657478",
    position: [-1.55, 0.12, -0.28],
    roughness: 0.58,
  });
  addPart(workstation, {
    name: "ICC_Monitor_Base",
    geometry: new BoxGeometry(1.35, 0.1, 0.78),
    color: "#6d7b7f",
    position: [-1.55, -0.27, -0.08],
    roughness: 0.6,
  });

  const application = addComponent(assembly, "ICC_Application");
  addPart(application, {
    name: "ICC_Application_Surface",
    geometry: new BoxGeometry(1.96, 1.16, 0.025),
    color: "#78a6ff",
    position: [-1.55, 1.0, -0.045],
    roughness: 0.24,
  });

  const securityReader = addComponent(assembly, "ICC_iButton_Reader");
  addPart(securityReader, {
    name: "ICC_iButton_USB_Reader",
    geometry: new BoxGeometry(0.55, 0.22, 0.48),
    color: "#f0b95a",
    position: [-1.85, -0.6, 0.75],
    roughness: 0.48,
  });
  addPart(securityReader, {
    name: "ICC_iButton_Token",
    geometry: new CylinderGeometry(0.13, 0.13, 0.05, 22),
    color: "#d8e3e0",
    position: [-1.85, -0.46, 0.75],
    roughness: 0.38,
  });

  const mediaReader = addComponent(assembly, "ICC_Media_Reader");
  addPart(mediaReader, {
    name: "ICC_Compact_Flash_Reader",
    geometry: new BoxGeometry(0.75, 0.18, 0.58),
    color: "#e87fb3",
    position: [-0.95, -0.62, 0.72],
    roughness: 0.52,
  });
  addPart(mediaReader, {
    name: "ICC_Compact_Flash_Card",
    geometry: new BoxGeometry(0.32, 0.04, 0.38),
    color: "#2d3437",
    position: [-0.95, -0.49, 0.65],
    roughness: 0.44,
  });

  const network = addComponent(assembly, "ICC_Optional_Isolated_LAN");
  addPart(network, {
    name: "ICC_Isolated_Network_Interface",
    geometry: new BoxGeometry(0.72, 0.2, 0.52),
    color: "#33c6b5",
    position: [-2.7, -1.55, 0.55],
    roughness: 0.54,
  });
  addPart(network, {
    name: "ICC_Ethernet_Cable",
    geometry: new TorusGeometry(0.75, 0.035, 10, 30, Math.PI * 1.3),
    color: "#78a6ff",
    position: [-1.85, -1.35, 0.28],
    rotation: [Math.PI / 2, 0, -0.2],
    roughness: 0.45,
  });

  const ups = addComponent(assembly, "ICC_UPS");
  addPart(ups, {
    name: "ICC_APC_SMC1500",
    geometry: new BoxGeometry(1.08, 1.52, 1.28),
    color: "#242a2d",
    position: [2.95, -0.95, -0.2],
    roughness: 0.76,
  });
  addPart(ups, {
    name: "ICC_UPS_Display",
    geometry: new BoxGeometry(0.4, 0.24, 0.035),
    color: "#e87fb3",
    position: [2.95, -0.66, 0.46],
    roughness: 0.3,
  });

  await writeGlb(scene, outputPath, {
    generatedBy: "scripts/build-tabulator-models.mjs",
    referenceConfiguration: "ImageCast Central Canon DR-G2140 alternative with COTS workstation and official 5.17-CO accessories",
    referenceFidelity: "official_manual_photo_informed_scanner_shape_certification_tables_inform_workstation",
    evidenceBoundary: "The DR-G2140 is one certified scanner alternative; exact workstation option, cabling, and component placement are illustrative.",
  });
}

async function buildDs950() {
  const outputPath = "public/equipment/ess-evs-6400-ds950/orthographic-pilot.glb";
  const scene = new Scene();
  scene.name = "CivicResultMaps_DS950_Photo_Informed_Schematic";
  const assembly = new Group();
  assembly.name = "DS950_Illustrative_Assembly";
  scene.add(assembly);

  const shell = addComponent(assembly, "DS950_Shell");
  addPart(shell, {
    name: "DS950_Main_Frame",
    geometry: new BoxGeometry(3.75, 2.65, 2.2),
    color: "#767f82",
    position: [0, 0.05, 0],
    roughness: 0.72,
  });
  addPart(shell, {
    name: "DS950_Upper_Housing",
    geometry: new BoxGeometry(2.45, 0.72, 1.8),
    color: "#a6adae",
    position: [-0.55, 1.25, -0.05],
    roughness: 0.64,
  });
  addPart(shell, {
    name: "DS950_Right_Service_Housing",
    geometry: new BoxGeometry(0.65, 2.25, 1.95),
    color: "#929a9c",
    position: [1.55, 0.15, -0.02],
    roughness: 0.7,
  });

  const feed = addComponent(assembly, "DS950_Input_Feeder");
  addPart(feed, {
    name: "DS950_Input_Tray",
    geometry: new BoxGeometry(1.75, 0.08, 1.65),
    color: "#282f32",
    position: [-1.55, 0.45, -1.6],
    rotation: [-0.18, 0, 0],
    roughness: 0.7,
  });
  addPart(feed, {
    name: "DS950_Input_Guide",
    geometry: new BoxGeometry(0.12, 0.78, 1.4),
    color: "#424c4f",
    position: [-1.55, 0.76, -1.4],
    roughness: 0.64,
  });

  const scanner = addComponent(assembly, "DS950_Scanner_Path");
  addPart(scanner, {
    name: "DS950_Scanner_Throat",
    geometry: new BoxGeometry(1.85, 0.38, 1.25),
    color: "#20272a",
    position: [-0.25, 0.45, 0.55],
    roughness: 0.62,
  });
  for (const [index, x] of [-0.64, -0.08, 0.48].entries()) {
    addPart(scanner, {
      name: `DS950_Scan_Roller_${index + 1}`,
      geometry: new CylinderGeometry(0.12, 0.12, 0.78, 20),
      color: "#111719",
      position: [x, 0.45, 1.22],
      rotation: [0, 0, Math.PI / 2],
      roughness: 0.58,
    });
  }

  const sorter = addComponent(assembly, "DS950_Sorting_Trays");
  for (let index = 0; index < 3; index += 1) {
    addPart(sorter, {
      name: `DS950_Output_Tray_${index + 1}`,
      geometry: new BoxGeometry(1.9, 0.08, 1.25),
      color: index === 0 ? "#30383b" : "#4e595c",
      position: [0.05, -0.4 - index * 0.48, 1.55],
      rotation: [0.08, 0, 0],
      roughness: 0.68,
    });
  }

  const display = addComponent(assembly, "DS950_Display");
  addScreen(display, {
    name: "DS950_Control_Monitor",
    position: [1.0, 2.65, -0.05],
    size: [1.85, 1.25],
  });
  addPart(display, {
    name: "DS950_Display_Arm",
    geometry: new BoxGeometry(0.24, 1.0, 0.28),
    color: "#5f6c70",
    position: [1.0, 1.65, -0.18],
    roughness: 0.58,
  });

  const motherboard = addComponent(assembly, "DS950_Motherboard");
  addPart(motherboard, {
    name: "DS950_Kontron_Motherboard",
    geometry: new BoxGeometry(1.45, 1.05, 0.08),
    color: "#8e7138",
    position: [0.55, 0.1, -1.02],
    roughness: 0.46,
  });
  addPart(motherboard, {
    name: "DS950_TPM_Module",
    geometry: new BoxGeometry(0.28, 0.25, 0.1),
    color: "#f0b95a",
    position: [0.85, 0.24, -0.96],
    roughness: 0.36,
  });
  for (const [index, x] of [0.12, 0.43].entries()) {
    addPart(motherboard, {
      name: `DS950_DRAM_Module_${index + 1}`,
      geometry: new BoxGeometry(0.15, 0.72, 0.09),
      color: "#d1bb76",
      position: [x, 0.05, -0.95],
      roughness: 0.4,
    });
  }

  const storage = addComponent(assembly, "DS950_M2_Storage");
  addPart(storage, {
    name: "DS950_M2_Hard_Drive",
    geometry: new BoxGeometry(0.28, 0.78, 0.05),
    color: "#e87fb3",
    position: [1.2, -0.4, -0.94],
    roughness: 0.44,
  });

  const security = addComponent(assembly, "DS950_Smart_Card_Reader");
  addPart(security, {
    name: "DS950_Smart_Card_Slot",
    geometry: new BoxGeometry(0.68, 0.16, 0.08),
    color: "#f0b95a",
    position: [1.9, 0.28, 1.12],
    roughness: 0.45,
  });

  const cart = addComponent(assembly, "DS950_Central_Count_Cart");
  addPart(cart, {
    name: "DS950_Cart_Deck",
    geometry: new BoxGeometry(4.45, 0.22, 2.75),
    color: "#353e41",
    position: [0, -1.55, 0],
    roughness: 0.78,
  });
  for (const [index, x] of [-1.7, 1.7].entries()) {
    addPart(cart, {
      name: `DS950_Cart_Leg_${index + 1}`,
      geometry: new BoxGeometry(0.18, 1.25, 0.18),
      color: "#4f5b5f",
      position: [x, -2.25, 0],
      roughness: 0.68,
    });
  }

  const ups = addComponent(assembly, "DS950_UPS");
  addPart(ups, {
    name: "DS950_Certified_UPS_Alternative",
    geometry: new BoxGeometry(1.05, 1.5, 1.25),
    color: "#252b2e",
    position: [-2.65, -1.05, -0.15],
    roughness: 0.76,
  });
  addPart(ups, {
    name: "DS950_UPS_Display",
    geometry: new BoxGeometry(0.38, 0.24, 0.035),
    color: "#e87fb3",
    position: [-2.65, -0.75, 0.49],
    roughness: 0.3,
  });

  await writeGlb(scene, outputPath, {
    generatedBy: "scripts/build-tabulator-models.mjs",
    referenceConfiguration: "DS950 on the certified central-count cart with external monitor",
    referenceFidelity: "manufacturer_photo_informed_external_form_certification_scope_informs_internal_categories",
    evidenceBoundary: "Internal board shapes and placement are illustrative; the public sources do not provide a teardown or dimensional drawing.",
  });
}

await buildClearCount();
await buildImageCastCentral();
await buildDs950();
