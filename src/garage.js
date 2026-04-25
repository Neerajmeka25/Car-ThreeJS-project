// Export lane positions for use in race/combat
export const LANE_POSITIONS = [-5, -2,2,5]; // Example: adjust as needed for your road width
// ─── garage.js ───────────────────────────────────────────────
//
// THREE.JS CONCEPTS COVERED IN THIS FILE:
//   1. Scene, PerspectiveCamera, WebGLRenderer  (core trinity)
//   2. GLTFLoader                               (loading 3D models)
//   3. OrbitControls                            (interactive camera)
//   4. DirectionalLight + AmbientLight          (lighting system)
//   5. MeshStandardMaterial                     (PBR material, color change)
//   6. THREE.Group                              (grouping objects)
//   7. traverse()                               (walking model children)
//   8. renderer.toneMapping                     (cinematic color grading)
//   9. scene.background + scene.fog             (environment)
//  10. GSAP animations on Three.js objects      (GSAP + Three.js bridge)
//
// ─────────────────────────────────────────────────────────────

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js'
import gsap              from 'gsap'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
export function initGarage(onRaceStart) {
  document.querySelectorAll('canvas').forEach(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (gl) {
      const ext = gl.getExtension('WEBGL_lose_context')
      if (ext) ext.loseContext()
    }
    canvas.remove()
  })
let garageRunning = true

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
  // ════════════════════════════════════════════════════════════
  // 1. THE CORE TRINITY — Scene, Camera, Renderer
  //
  //   Scene    = the universe. Every object lives here.
  //   Camera   = your eye into the scene.
  //   Renderer = takes the scene + camera and paints pixels.
  //
  //   Nothing appears on screen without all three.
  // ════════════════════════════════════════════════════════════
  const scene = new THREE.Scene()

  // PerspectiveCamera(fov, aspect, near, far)
  // fov    = field of view in degrees (how wide you see — like a lens)
  // aspect = width / height ratio (always match window)
  // near   = closest distance the camera renders (objects closer are invisible)
  // far    = farthest distance the camera renders (objects farther are invisible)
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  )
  camera.position.set(0, 2.5, 7)

  // WebGLRenderer draws to a <canvas> element
  // antialias: true = smooths jagged edges (costs a tiny bit of performance)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)) // cap at 2x — retina screens

  // Shadows — must be enabled on renderer AND individual lights/meshes
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap  // soft shadow edges

  // ACESFilmicToneMapping = cinematic colour grading
  // Makes bright lights bloom softly instead of clipping to white
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1

  // Appends a <canvas> element to <body>
  // This is the actual surface Three.js draws onto
  document.body.appendChild(renderer.domElement)


  // ════════════════════════════════════════════════════════════
  // 2. ORBIT CONTROLS
  //
  //   Lets the user rotate/pan/zoom the camera with mouse.
  //   It works by listening to mouse events on the renderer's canvas.
  //   enableDamping gives it a smooth inertia feel.
  // ════════════════════════════════════════════════════════════

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.8, 0) // orbit AROUND this point (center of car)
  controls.enableDamping  = true  // smooth drag feel
  controls.dampingFactor  = 0.06
  controls.minDistance    = 2     // can't zoom in closer than 2 units
  controls.maxDistance    = 8     // can't zoom out farther than 8 units
  controls.maxPolarAngle  = Math.PI / 2.1  // can't go below the ground
  controls.update()


  // ════════════════════════════════════════════════════════════
  // 3. LIGHTING
  //
  //   AmbientLight  = flat, directionless fill. No shadows.
  //                   Without it, anything not hit by the main
  //                   light would be pitch black.
  //
  //   DirectionalLight = parallel rays from a direction.
  //                      Like the sun. Casts shadows.
  //
  //   Rule: anything that casts/receives shadows must have
  //         castShadow / receiveShadow = true on BOTH
  //         the light AND the mesh.
  // ════════════════════════════════════════════════════════════

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
  scene.add(ambientLight)

  // Main overhead light (the "sun" of the garage)
  const mainLight = new THREE.DirectionalLight(0xfff0e0, 4)
  mainLight.position.set(4, 10, 4)
  mainLight.castShadow = true
  // Shadow camera defines how big an area casts shadows
  // Think of it as the shadow camera's viewport
  mainLight.shadow.camera.left   = -10
  mainLight.shadow.camera.right  =  10
  mainLight.shadow.camera.top    =  10
  mainLight.shadow.camera.bottom = -10
  mainLight.shadow.mapSize.width  = 2048 // shadow texture resolution
  mainLight.shadow.mapSize.height = 2048
  scene.add(mainLight)

  // Cool blue fill light from the opposite side — gives depth
  const fillLight = new THREE.DirectionalLight(0x80aaff, 0.6)
  fillLight.position.set(-5, 3, -3)
  scene.add(fillLight)

  // Store mainLight so applyTimeOfDay() can modify it
  // This is the same light we'll change for morning/evening


  // ════════════════════════════════════════════════════════════
  // 4. ENVIRONMENT
  //
  //   scene.background = solid color, texture, or cubemap
  //   scene.fog        = makes distant objects fade out
  //                      Fog(color, near, far)
  // ════════════════════════════════════════════════════════════

  scene.background = new THREE.Color(0x0d0f1a)
  scene.fog = new THREE.FogExp2(0x0d0f1a, 0.04)
  // FogExp2 = exponential fog (denser as distance increases)
  // Regular Fog is linear — FogExp2 looks more natural


  // ════════════════════════════════════════════════════════════
  // 5. GARAGE FLOOR
  //
  //   A simple PlaneGeometry rotated flat (-90° on X axis)
  //   Uses MeshStandardMaterial — the PBR (Physically Based
  //   Rendering) material. Responds to light realistically.
  //
  //   roughness: 0 = mirror, 1 = chalk
  //   metalness: 0 = plastic, 1 = metal
  // ════════════════════════════════════════════════════════════

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({
      color:     0x1a1a2a,
      roughness: 0.6,
      metalness: 0.3
    })
  )
  floor.rotation.x = -Math.PI / 2  // rotate from vertical to horizontal
  floor.receiveShadow = true
  scene.add(floor)

  // Subtle grid lines on the floor — gives garage feel
  const grid = new THREE.GridHelper(30, 30, 0x334455, 0x223344)
  grid.position.y = 0.002  // just above floor to avoid z-fighting
  scene.add(grid)
  // z-fighting = two surfaces at same depth fight for which pixel to show


  // ════════════════════════════════════════════════════════════
  // 6. LOAD GARAGE BACKGROUND MODEL
  //
  //   GLTFLoader is async — the scene continues loading while
  //   the model downloads. This is why we use a callback.
  //   The model only exists INSIDE the callback.
  // ════════════════════════════════════════════════════════════

  const loader = new GLTFLoader()
  loader.setDRACOLoader(dracoLoader)

  loader.load(
    './assets/circle_garage.glb',
    (gltf) => {
      // gltf.scene = a THREE.Group containing all meshes of the model
      const garageModel = gltf.scene
      garageModel.scale.setScalar(1)
      garageModel.position.set(0, 0, 0)

      // traverse() walks every object inside the Group — including nested children
      // isMesh check skips empty Group nodes (containers with no geometry)
      garageModel.traverse((child) => {
        if (child.isMesh) {
          child.receiveShadow = true
          child.castShadow   = true
        }
      })

      scene.add(garageModel)
       const box = new THREE.Box3().setFromObject(garageModel)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    
    
    // 3. Tell OrbitControls to orbit around the MODEL'S center
    // controls.target.copy(center)
    controls.target.set(center.x, 0, center.z) // slightly above center for better angle
    
    // 4. NOW position the camera relative to the model
    // Imagine standing back far enough to see the whole thing
    camera.position.set(
        center.x,                    // same X as model (centered)
        4,           // above the model by its own height
        5   // behind model by 4x its depth
    )
    controls.minPolarAngle = Math.PI / 3    // forces camera to stay angled down
controls.maxPolarAngle = Math.PI / 2.1  // can't go below ground
    controls.update()  
    },
    undefined,           // progress callback (not needed here)
    () => {              // error callback — GLB not found, that's fine
      console.log('garage.glb not found — using minimal scene')
    }
  )


  // ════════════════════════════════════════════════════════════
  // 7. CAR CONFIGURATION
  //
  //   These are the data definitions for each selectable car.
  //   Keeping data separate from the display logic is a clean
  //   pattern — changing car options means changing this array,
  //   not hunting through render code.
  // ════════════════════════════════════════════════════════════

  const CAR_CONFIGS = [
    { name: 'Merceulago', path: "./assets/car.glb", scale: 0.4 },
    { name: 'Punch', path: "./assets/tata_punch.glb", scale: 1.0 },
  ];

  const COLOR_PRESETS = [
    { label: 'Red',      hex: '#cc2222', threeColor: 0xcc2222 },
    { label: 'Blue',     hex: '#2244cc', threeColor: 0x2244cc },
    { label: 'Military', hex: '#2d5a1b', threeColor: 0x2d5a1b },
    { label: 'White',    hex: '#e8e8e8', threeColor: 0xe8e8e8 },
    { label: 'Gold',     hex: '#c8a020', threeColor: 0xc8a020 },
  ];

  // Per-car, per-gun config: { [carIndex]: { [gunIndex]: { offset, scale, rotation } } }
const GUN_ATTACHMENT_CONFIG = {
    0: { // Sports Car
     0: { offset: { x: 3.7, y: 1.2, z: 7 }, scale: 0.4, rotation: { x: 0, y: Math.PI / 2, z: 0  } },
      1: { offset: { x: 4.5, y: 0, z: 5 }, scale: 6, rotation: { x: 0, y: -Math.PI / 2, z: 0 } },
    },
    1: { // tata Punch
      0: { offset: { x: 0, y: 0.9, z: -0.5 }, scale: 4, rotation: { x: 0, y:Math.PI / 1, z: Math.PI / 2 } },
      1: { offset: { x: 3.7, y: 1.2, z: 7 }, scale: 0.4, rotation: { x: 0, y: Math.PI / 2, z: 0  } },
      2: { offset: { x: 4.5, y: 0, z: 5 }, scale: 6, rotation: { x: 2, y: -Math.PI / 2, z: 0 } },
    },
  }

  const GUN_CONFIGS = [
    { name: 'Machine Gun', stats: 'Fast · Low dmg',  path: './assets/rpg.glb' },
    { name: 'Shotgun',     stats: 'Mid  · Med dmg',  path: './assets/car_combat_machine_gun.glb' },
  ];

  const WHEEL_CONFIGS = [
    { name: 'Stock',     path: null                     }, // null = keep original
    { name: 'Dirt',      path: './assets/off-road_wheel_and_tire.glb' },
    { name: 'Sport',     path: './assets/off-road_wheel_and_tire.glb'},
  ];

  // ─── Player's current selections ─────────────────────────
  const selections = {
    carIndex:   0, // Merceulago is now first
    color:      COLOR_PRESETS[0].threeColor,
    gunIndex:   0,
    wheelIndex: 0,
    timeOfDay:  'morning',
    gunOffset:  GUN_ATTACHMENT_CONFIG[0][0].offset,
    gunScale:   GUN_ATTACHMENT_CONFIG[0][0].scale,
    gunRotation: GUN_ATTACHMENT_CONFIG[0][0].rotation,
  };


  // ════════════════════════════════════════════════════════════
  // 8. CAR DISPLAY — placeholder + GLB loading
  //
  //   We always try loading the real GLB first.
  //   If it fails (file not ready), we fall back to a box-car
  //   built from BoxGeometry. The rest of the code doesn't
  //   care which one it gets — it just works with the Group.
  //
  //   This is an important pattern: decouple display from data.
  // ════════════════════════════════════════════════════════════

  let currentCar = null   // reference to the currently shown car Group

  // Build a car from basic Three.js geometry as a stand-in
  function buildPlaceholderCar(colorValue) {
    // THREE.Group = an empty container
    // Children positions are relative to the Group's origin
    const group = new THREE.Group()

    // MeshStandardMaterial — the modern, physically accurate material
    // Use this for anything in a game scene (not for skyboxes/UI)
    const bodyMat = new THREE.MeshStandardMaterial({
      color:     colorValue,
      metalness: 0.6,
      roughness: 0.3
    })
    const wheelMat = new THREE.MeshStandardMaterial({
      color:     0x111111,
      metalness: 0.5,
      roughness: 0.7
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color:       0x334455,
      transparent: true,
      opacity:     0.5,
      roughness:   0,
      metalness:   0.1
    })

    // Car body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 3.8), bodyMat)
    body.name = 'Body'
    body.castShadow = true

    // Roof (cabin)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.9), bodyMat.clone())
    roof.name = 'Roof'
    roof.position.set(0, 0.52, 0.1)
    roof.castShadow = true

    // Windshield — glass material
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.45, 0.05), glassMat)
    windshield.name = 'Glass'
    windshield.position.set(0, 0.52, 1.02)

    // Wheels — CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
    const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.28, 20)
    const wheelOffsets = [
      [-0.98, -0.18,  1.2],   // front-left
      [ 0.98, -0.18,  1.2],   // front-right
      [-0.98, -0.18, -1.2],   // rear-left
      [ 0.98, -0.18, -1.2],   // rear-right
    ]
    wheelOffsets.forEach(([x, y, z]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.rotation.z = Math.PI / 2  // rotate cylinder to face sideways
      wheel.position.set(x, y, z)
      wheel.castShadow = true
      group.add(wheel)
    })

    group.add(body, roof, windshield)
    group.position.y = 0.53  // lift so wheels sit on floor
    return group
  }

  // Apply a color to a Group — traverses all children
  // Array of mesh names to color for each car (by car index)
  // Example: 2: ['Object_4', 'Object_5']
  const COLORABLE_MESHES_CONFIG = {
    0: ['Object_4'],
    1: ['Mesh_005_prim85' ], 
    // 0: [...],
    // 1: [...],
  }

  function applyColorToGroup(group, colorValue) {
    const carIndex = selections.carIndex
    const colorableNames = COLORABLE_MESHES_CONFIG[carIndex] || [];

group.traverse((child) => {
    if (!child.isMesh) return
    if (!colorableNames.includes(child.name)) return

    // Clone, assign, AND color — all in one shot
    const cloned = Array.isArray(child.material)
        ? child.material.map(m => m.clone())
        : child.material.clone()

    child.material = cloned  // assign first

    // NOW color the assigned material
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    mats.forEach(mat => {
        mat.color.set(colorValue)
        mat.needsUpdate = true
    })
})
  }

  
  // ════════════════════════════════════════════════════════════
  // WHEEL SWAPPING
  //
  //   Strategy:
  //   1. Find every Object3D whose name contains 'wheel'
  //   2. Remove the Mesh child from inside it (the visible part)
  //   3. Load the new wheel GLB
  //   4. Add the new wheel mesh as a child of that same Object3D
  //
  //   The Object3D pivot stays untouched — it still controls
  //   where the wheel sits and how it rotates. We only swap
  //   what's INSIDE it.
  // ════════════════════════════════════════════════════════════

  // Wheel name config per car (by index)
  // Add more cars as you find their wheel names
  const WHEEL_NAME_CONFIG = {
    0: [ // Muscle Car (index 2)
      'F_L-wheel_12', // front
      'F_R-wheel_13', 
      'R_L-wheel_14', // rear
      'R_R-wheel_15',  // rear
    ],
    // 0: [...], // Sports Car
    // 1: [...], // Military Thar
  }

  // Wheel position config per car (by index)
  // Each entry is an array of {x, y, z} offsets for each wheel
  const WHEEL_POSITION_CONFIG = {
    0: [ // Muscle Car
      { x: 0, y: 0, z: 0.5 }, // F_L
      { x: 0, y: 0, z: 0.5 },  // F_R
      { x: 0, y: 0, z: 0.5 }, // R_L
      { x: 0, y: 0, z: 0.5 },  // R_R
    ],
    // 0: [...],
    // 1: [...],
  }

  // Stores original wheel meshes so we can restore 'Stock' option
  const originalWheelMeshes = new Map()
  // key   = the pivot Object3D
  // value = array of original Mesh children (for 2 pivots, both L/R)

  function collectOriginalWheels(carGroup) {
    originalWheelMeshes.clear()
    const carIndex = selections.carIndex
    const wheelNames = WHEEL_NAME_CONFIG[carIndex]
    if (wheelNames) {
      wheelNames.forEach(name => {
        const node = carGroup.getObjectByName(name)
        if (node && node.type === 'Object3D') {
          // Save all mesh children (for 2-pivot case)
          const meshChildren = node.children.filter(c => c.isMesh)
          if (meshChildren.length > 0) {
            originalWheelMeshes.set(node, meshChildren.map(m => m.clone()))
          }
        }
      })
    }
  }

  function swapWheels(wheelGlbPath) {
    if (!currentCar) return

    const carIndex = selections.carIndex
    const wheelNames = WHEEL_NAME_CONFIG[carIndex]
    const wheelPositions = WHEEL_POSITION_CONFIG[carIndex]
    if (!wheelNames) return

    // If null path = restore original stock wheels
    if (!wheelGlbPath) {
      originalWheelMeshes.forEach((meshArr, pivotNode) => {
        // Remove all mesh children
        pivotNode.children.filter(c => c.isMesh).forEach(c => pivotNode.remove(c))
        // Restore all original mesh children
        meshArr.forEach(origMesh => pivotNode.add(origMesh.clone()))
      })
      return
    }

    loader.load(
      wheelGlbPath,
      (gltf) => {
        let newWheelMesh = null
        gltf.scene.traverse((child) => {
          if (child.isMesh && !newWheelMesh) {
            newWheelMesh = child
          }
        })
        if (!newWheelMesh) return

        // For 4 pivots, just replace each mesh
        wheelNames.forEach((name, i) => {
          const pivot = currentCar.getObjectByName(name)
          if (!pivot) return
          pivot.children.filter(c => c.isMesh).forEach(c => pivot.remove(c))
          const cloned = newWheelMesh.clone()
          cloned.castShadow = true
          // Use position from config if available
          if (wheelPositions && wheelPositions[i]) {
            cloned.position.set(
              wheelPositions[i].x,
              wheelPositions[i].y,
              wheelPositions[i].z
            )
          } else {
            cloned.position.set(0,0,0)
          }
          pivot.add(cloned)
        })
      },
      undefined,
      () => console.log('Wheel GLB not found, keeping original')
    )
  }

  // ════════════════════════════════════════════════════════════
  // GUN ATTACHMENT
  //
  //   Concept: The gun is added as a child of the car Group.
  //   Its position is relative to the car's local origin.
  //   When the car moves/rotates, gun moves with it — for free.
  //
  //   In the RACE scene the gun gets its own independent
  //   rotation on Y axis (turret style) — separate from car.
  //   Here in garage we just show it attached on top.
  // ════════════════════════════════════════════════════════════

  // Name we give our gun child so we can find + remove it later
  const GUN_TAG = '__attached_gun__'

  function detachGun() {
    if (!currentCar) return
    // Find any previously attached gun by its tag name and remove it
    const existing = currentCar.getObjectByName(GUN_TAG)
    if (existing) currentCar.remove(existing)
  }

  function attachGun(gunConfig) {
    if (!currentCar) return
    detachGun()

    const carIndex = selections.carIndex
    const gunIndex = selections.gunIndex
    const attachCfg = (GUN_ATTACHMENT_CONFIG[carIndex] && GUN_ATTACHMENT_CONFIG[carIndex][gunIndex])
      ? GUN_ATTACHMENT_CONFIG[carIndex][gunIndex]
      : { offset: { x: 0, y: 0.9, z: -0.5 }, scale: 4, rotation: { x: 0, y: 0, z: 0 } }

    loader.load(
      gunConfig.path,
      (gltf) => {
        const gunModel = gltf.scene;
        gunModel.name  = GUN_TAG;
        // Always set scale as a vector for all axes
        if (typeof attachCfg.scale === 'number') {
          gunModel.scale.set(attachCfg.scale, attachCfg.scale, attachCfg.scale);
        } else if (typeof attachCfg.scale === 'object') {
          gunModel.scale.copy(attachCfg.scale);
        }
        gunModel.position.set(
          attachCfg.offset.x,
          attachCfg.offset.y,
          attachCfg.offset.z
        );
        gunModel.rotation.set(
          attachCfg.rotation.x,
          attachCfg.rotation.y,
          attachCfg.rotation.z
        );
        gunModel.traverse(child => {
          if (child.isMesh) child.castShadow = true;
        });
        currentCar.add(gunModel);
        selections.gunOffset = attachCfg.offset;
        selections.gunScale  = attachCfg.scale;
        selections.gunRotation = attachCfg.rotation;
      },
      undefined,
      (err) => {
        const placeholder = new THREE.Group();
        placeholder.name  = GUN_TAG;
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 1.0, 10),
          new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.2 })
        );
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.2, 0.4),
          new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 })
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = -0.5;
        placeholder.add(barrel, base);
        placeholder.position.set(
          attachCfg.offset.x,
          attachCfg.offset.y,
          attachCfg.offset.z
        );
        if (typeof attachCfg.scale === 'number') {
          placeholder.scale.set(attachCfg.scale, attachCfg.scale, attachCfg.scale);
        } else if (typeof attachCfg.scale === 'object') {
          placeholder.scale.copy(attachCfg.scale);
        }
        placeholder.rotation.set(
          attachCfg.rotation.x,
          attachCfg.rotation.y,
          attachCfg.rotation.z
        );
        currentCar.add(placeholder);
      }
    );
  }

  // Load a car by index — tries GLB, falls back to placeholder
  function loadCar(index) {
    // Remove previous car from scene
    if (currentCar) {
      scene.remove(currentCar)
    }

    const config = CAR_CONFIGS[index]

    loader.load(
      config.path,
      (gltf) => {
        // SUCCESS — GLB loaded
        currentCar = gltf.scene
        currentCar.scale.setScalar(config.scale)
        currentCar.position.y = 0.2;

        // Apply current color and shadows
        applyColorToGroup(currentCar, selections.color)
        currentCar.traverse(child => {
          if (child.isMesh) {
            child.castShadow    = true
            child.receiveShadow = true
          }
        })

        scene.add(currentCar)
// Paste this temporarily after scene.add(currentCar)
currentCar.traverse((child) => {
    if (!child.isMesh) return
})
currentCar.traverse((child) => {
    if (child.name === 'Object_5') {
        child.visible = false  // hide it completely
    }
})
        // Collect wheel pivots BEFORE any swapping
        collectOriginalWheels(currentCar)

        // Re-attach gun if one was already selected
        if (selections.gunIndex !== null) {
          attachGun(GUN_CONFIGS[selections.gunIndex])
        }

        animateCarIn(currentCar)
      },
      undefined,
      () => {
        // ERROR — GLB not found, use placeholder
        currentCar = buildPlaceholderCar(selections.color)
        scene.add(currentCar)
        collectOriginalWheels(currentCar)
        attachGun(GUN_CONFIGS[selections.gunIndex])
        animateCarIn(currentCar)
      }
    )
  }

  // GSAP entrance animation — car drops in and spins
  function animateCarIn(car) {
    // gsap.from() = animate FROM these values TO the object's current values
    gsap.from(car.position, {
      y:        4,
      duration: 0.8,
      ease:     'back.out(1.4)'   // overshoots then settles (bouncy)
    })
    gsap.from(car.rotation, {
      y:        Math.PI * 2,      // full spin
      duration: 1.0,
      ease:     'power3.out'
    })
  }

  // Load first car immediately
  loadCar(0)


  // ════════════════════════════════════════════════════════════
  // 9. TIME OF DAY — DirectionalLight colour presets
  //
  //   The entire mood of the scene changes by modifying
  //   just the DirectionalLight's color and intensity.
  //   This is the power of physically based lighting.
  // ════════════════════════════════════════════════════════════

  const TIME_PRESETS = {
    morning: {
      lightColor: 0xffd4a0,   // warm orange-white sunrise
      intensity:  5,
      bgColor:    new THREE.Color(0x0d0f1a),
      fogColor:   new THREE.Color(0x0d0f1a)
    },
    evening: {
      lightColor: 0xff5520,   // deep orange-red sunset
      intensity:  0.9,
      bgColor:    new THREE.Color(0x0a060f),
      fogColor:   new THREE.Color(0x0a060f)
    }
  }

  function applyTimeOfDay(time) {
    const preset = TIME_PRESETS[time]
    selections.timeOfDay = time

    // Animate the light color change with GSAP
    // gsap can tween any numeric property — including Three.js Color
    gsap.to(mainLight.color, {
      r: new THREE.Color(preset.lightColor).r,
      g: new THREE.Color(preset.lightColor).g,
      b: new THREE.Color(preset.lightColor).b,
      duration: 1.2,
      ease: 'power2.out'
    })
    gsap.to(mainLight, {
      intensity: preset.intensity,
      duration:  1.2
    })
    gsap.to(scene.background, {
      r: preset.bgColor.r,
      g: preset.bgColor.g,
      b: preset.bgColor.b,
      duration: 1.2
    })
  }


  // ════════════════════════════════════════════════════════════
  // 10. BUILD THE HTML UI
  //
  //   We inject all buttons/swatches into #garage-controls
  //   from JavaScript. This keeps index.html clean and lets
  //   the UI be driven by the data arrays above.
  // ════════════════════════════════════════════════════════════

  const controlsEl = document.getElementById('garage-controls')

  // ── Car Selector ──────────────────────────────────────────
  const carSection = makeSection('Choose Car')
  const carRow     = makeRow()
  CAR_CONFIGS.forEach((cfg, i) => {
    const btn = makeBtn(cfg.name, i === 0)
    btn.addEventListener('click', () => {
      selections.carIndex = i
      setActiveBtn(carRow, btn)
      loadCar(i)
    })
    carRow.appendChild(btn)
  })
  carSection.appendChild(carRow)
  controlsEl.appendChild(carSection)

  // ── Color Swatches ────────────────────────────────────────
  const colorSection = makeSection('Color')
  const colorRow     = makeRow()
  COLOR_PRESETS.forEach((preset, i) => {
    const swatch       = document.createElement('div')
    swatch.className   = 'color-swatch' + (i === 0 ? ' active' : '')
    swatch.style.background = preset.hex
    swatch.title       = preset.label

    swatch.addEventListener('click', () => {
      selections.color = preset.threeColor

      // Update all swatch active states
      colorRow.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'))
      swatch.classList.add('active')

      // Apply color to current car in real time
      if (currentCar) applyColorToGroup(currentCar, preset.threeColor)
    })
    colorRow.appendChild(swatch)
  })
  colorSection.appendChild(colorRow)
  controlsEl.appendChild(colorSection)

  // ── Wheel Selector ────────────────────────────────────────
  const wheelSection = makeSection('Wheels')
  const wheelRow     = makeRow()
  WHEEL_CONFIGS.forEach((wheel, i) => {
    const btn = makeBtn(wheel.name, i === 0)
    btn.addEventListener('click', () => {
      selections.wheelIndex = i
      setActiveBtn(wheelRow, btn)
      swapWheels(wheel.path)  // null for stock = restore originals
    })
    wheelRow.appendChild(btn)
  })
  wheelSection.appendChild(wheelRow)
  controlsEl.appendChild(wheelSection)

  // ── Gun Selector ──────────────────────────────────────────
  const gunSection = makeSection('Weapon')
  const gunRow     = makeRow()
  GUN_CONFIGS.forEach((gun, i) => {
    const btn = makeBtn(`${gun.name}\n${gun.stats}`, i === 0)
    btn.addEventListener('click', () => {
      selections.gunIndex = i
      setActiveBtn(gunRow, btn)
      attachGun(gun)  // attach to car immediately — see it in viewport
    })
    gunRow.appendChild(btn)
  })
  gunSection.appendChild(gunRow)
  controlsEl.appendChild(gunSection)

  // ── Time of Day ───────────────────────────────────────────
  const timeSection = makeSection('Time of Day')
  const timeRow     = makeRow()
  ;['morning', 'evening'].forEach((time, i) => {
    const label = time === 'morning' ? '🌅 Morning' : '🌆 Evening'
    const btn   = makeBtn(label, i === 0)
    btn.addEventListener('click', () => {
      setActiveBtn(timeRow, btn)
      applyTimeOfDay(time)
    })
    timeRow.appendChild(btn)
  })
  timeSection.appendChild(timeRow)
  controlsEl.appendChild(timeSection)

  // ── Race Button ───────────────────────────────────────────
  const raceBtn    = document.createElement('button')
  raceBtn.id       = 'race-btn'
  raceBtn.textContent = '🏁  START RACE'
  raceBtn.addEventListener('click', () => {
    // Animate the UI out, then fly the camera forward
    gsap.to('#garage-controls', { opacity: 0, y: 20, duration: 0.4 })
    gsap.to('#garage-title',    { opacity: 0, y: -20, duration: 0.4 })

    gsap.to(camera.position, {
      z:        20,
      y:        8,
      duration: 1.3,
      ease:     'power2.in',
      onComplete: () => {
        // Cleanup Three.js — remove canvas from DOM
        garageRunning = false
        controls.dispose()     
        renderer.dispose()
        renderer.forceContextLoss() 
        document.body.removeChild(renderer.domElement)
        document.getElementById('garage-ui').style.display = 'none'

        // Hand off selections to main.js callback → race scene
        onRaceStart(selections)
      }
    })
  })
  controlsEl.appendChild(raceBtn)


  // ════════════════════════════════════════════════════════════
  // 11. THE ANIMATION LOOP
  //
  //   requestAnimationFrame tells the browser: "call this function
  //   before the next repaint." The browser targets 60fps.
  //   Each call to animate() schedules the next call — infinite loop.
  //
  //   controls.update() MUST be called every frame for damping to work.
  //   Without it, the camera would snap instead of glide.
  // ════════════════════════════════════════════════════════════

  function animate() {
    if (!garageRunning) return
    requestAnimationFrame(animate)
    controls.update()                    // smooth inertia on OrbitControls
    renderer.render(scene, camera)       // draw the scene from camera's perspective
  }
  animate()


  // ════════════════════════════════════════════════════════════
  // 12. RESPONSIVE RESIZE
  //
  //   When the window resizes, two things MUST be updated:
  //   - camera.aspect (so 3D objects don't squish/stretch)
  //   - renderer.setSize (so canvas fills new window size)
  //
  //   updateProjectionMatrix() applies the new aspect ratio.
  //   Without it, the camera change has no effect.
  // ════════════════════════════════════════════════════════════

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()      // MUST call this after changing camera props
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

}


// ════════════════════════════════════════════════════════════
// UI HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════

function makeSection(title) {
  const section    = document.createElement('div')
  section.className = 'ui-section'
  const label      = document.createElement('div')
  label.className  = 'section-label'
  label.textContent = title
  section.appendChild(label)
  return section
}

function makeRow() {
  const row    = document.createElement('div')
  row.className = 'btn-row'
  return row
}

function makeBtn(text, isActive = false) {
  const btn    = document.createElement('button')
  btn.className = 'ui-btn' + (isActive ? ' active' : '')
  btn.textContent = text
  return btn
}

function setActiveBtn(container, activeBtn) {
  container.querySelectorAll('.ui-btn').forEach(b => b.classList.remove('active'))
  activeBtn.classList.add('active')
}