// ─── race.js ─────────────────────────────────────────────────
//
// THREE.JS CONCEPTS COVERED IN THIS FILE:
//   1. Scene transition — fresh scene from garage selections
//   2. Tile recycling   — infinite road with just 2 meshes
//   3. THREE.Clock      — delta time for framerate independence
//   4. lerp()           — smooth follow camera
//   5. Keyboard state   — smooth continuous input
//   6. GLTFLoader       — loading player car + road from garage
//   7. Time of day      — DirectionalLight presets from selection
//   8. scene.fog        — depth cueing on the road
//
// ─────────────────────────────────────────────────────────────

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import gsap from 'gsap'
import { initCombat } from './combat'
import { LANE_POSITIONS } from './garage'
  // ─── POST-PROCESSING: EffectComposer for turbo effect ───
  import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
  import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
  import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';


export function initRace(selections) {

  // ════════════════════════════════════════════════════════════
  // CONCEPT 1 — SCENE TRANSITION
  //
  //   We create a complaaaaetely fresh Scene, Camera and Renderer
  //   here. The garage renderer was disposed in main.js before
  //   calling initRace(). This is important — two renderers
  //   running simultaneously would double GPU usage.
  //
  //   Everything we need from the garage comes through the
  //   'selections' object:
  //   { carIndex, color, gunIndex, wheelIndex, timeOfDay }
  // ════════════════════════════════════════════════════════════

  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    500
  )
 

  // Start camera behind and above where the car will be
  camera.position.set(0, 4, 10)

const renderer = new THREE.WebGLRenderer({ 
  antialias: false,        // ← disable on low end, barely noticeable
  powerPreference: 'high-performance'
})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))  // ← cap at 1.5 not 2
renderer.shadowMap.enabled = false   // ← kill shadows entirely for now
renderer.toneMapping = THREE.NoToneMapping  // ← tonemapping costs per pixel
  renderer.toneMappingExposure = 1.1
  document.body.appendChild(renderer.domElement)


    // Add OrbitControls for camera inspection (minimal performance impact)
    // Only allow limited orbit, no damping, no pan/zoom
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.enablePan = false
    controls.enableZoom = false
    controls.minPolarAngle = Math.PI / 4   // 45°
    controls.maxPolarAngle = Math.PI / 1.7 // ~106°
    controls.minAzimuthAngle = -Math.PI / 3 // -60°
    controls.maxAzimuthAngle = Math.PI / 3  // +60°
    controls.target.set(0, 1, 0)
    controls.update()


  // ════════════════════════════════════════════════════════════
  // CONCEPT 2 — TIME OF DAY LIGHTING
  //
  //   The selection made in the garage directly controls the
  //   lighting here. This is the payoff of carrying state
  //   between scenes — the player's choice has consequence.
  //
  //   Morning: warm orange light, bright sky
  //   Evening: deep red light, dark moody sky
  // ════════════════════════════════════════════════════════════

  const TIME_PRESETS = {
    morning: {
      skyColor:       new THREE.Color(0x87CEEB),  // sky blue
      fogColor:       new THREE.Color(0x87CEEB),
      sunColor:       0xffd4a0,                   // warm sunrise orange
      sunIntensity:   2.0,
      ambientColor:   0xffeedd,
      ambientIntensity: 0.8,
      sunPosition:    new THREE.Vector3(5, 15, 10)
    },
    evening: {
      skyColor:       new THREE.Color(0x1a0a0f),  // deep dark purple
      fogColor:       new THREE.Color(0x2a0f0f),  // dark red fog
      sunColor:       0xff4410,                   // deep sunset red
      sunIntensity:   0.8,
      ambientColor:   0x331122,
      ambientIntensity: 0.5,
      sunPosition:    new THREE.Vector3(-5, 3, 10)
    }
  }

  const preset = TIME_PRESETS[selections.timeOfDay] || TIME_PRESETS.morning

  scene.background = preset.skyColor.clone()

  // ════════════════════════════════════════════════════════════
  // CONCEPT 3 — SCENE FOG
  //
  //   scene.fog makes objects fade into the background color
  //   as they get further from the camera.
  //
  //   THREE.Fog(color, near, far)
  //   near = distance where fog starts
  //   far  = distance where object is completely invisible
  //
  //   This serves two purposes:
  //   1. Looks natural — road disappears into horizon
  //   2. Performance — distant objects fade before being culled
  //      by the camera's far plane (1000 units)
  // ════════════════════════════════════════════════════════════

  scene.fog = new THREE.Fog(preset.fogColor, 40, 150)

  // Directional light = the sun
  const sunLight = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity)
  sunLight.position.copy(preset.sunPosition)
//   sunLight.castShadow = true
//   sunLight.shadow.mapSize.setScalar(2048)
sunLight.castShadow = false   // match the renderer setting
  sunLight.shadow.camera.near = 0.5
  sunLight.shadow.camera.far  = 100
  sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -20
  sunLight.shadow.camera.right = sunLight.shadow.camera.top   =  20
  scene.add(sunLight)

  // Ambient fills shadows so they're not pitch black
  const ambientLight = new THREE.AmbientLight(preset.ambientColor, preset.ambientIntensity)
  scene.add(ambientLight)


  // ════════════════════════════════════════════════════════════
  // CONCEPT 4 — TILE RECYCLING (Infinite Road)
  //
  //   The core illusion of every racing game ever made.
  //   The car NEVER moves. The road moves toward the camera.
  //
  //   We create just TWO road tiles placed end to end:
  //
  //   Camera (z=10)
  //       |
  //   [Tile A z=0 ][Tile B z=-TILE_LENGTH]
  //
  //   Every frame: tile.position.z += speed  (moves toward camera)
  //
  //   When a tile passes the camera (z > camera.z + some buffer):
  //       tile.position.z -= TILE_LENGTH * 2  (teleport to back)
  //
  //   Result: infinite road from just 2 objects in memory.
  //   This is called OBJECT POOLING — reuse instead of create/destroy.
  // ════════════════════════════════════════════════════════════

  const TILE_LENGTH = 80       // how long each road segment is
  const ROAD_WIDTH  = 24       // how wide the road is (doubled)
  const LANE_COUNT  = 3        // used later for traffic spawning

  // Road material — MeshStandardMaterial responds to our sun light
  const roadMat = new THREE.MeshStandardMaterial({
    color:     0x333340,
    roughness: 0.9,
    metalness: 0.0
  })

  // Lane marking material — bright white strips
  const markingMat = new THREE.MeshStandardMaterial({
    color:     0xffffff,
    roughness: 0.5,
    emissive:  0xffffff,       // slight self-glow so markings show at night
    emissiveIntensity: 0.1
  })

  // Build one complete road tile (tarmac + lane markings)
  // If you want to use a straight road model, load it here
  function buildRoadTile(callback) {
    // If you want to use a GLB model for the road:
    const roadModelPath = './assets/g.glb' // update path as needed
    const loader = new GLTFLoader()
    loader.load(
      roadModelPath,
      (gltf) => {
        const roadGroup = gltf.scene
        roadGroup.traverse(child => {
          if (child.isMesh) {
            child.castShadow = false
            child.receiveShadow = false
          }
        })
        callback(roadGroup)
      },
      undefined,
      () => {
        // fallback: procedural road if model not found
        const tileGroup = new THREE.Group()
        const tarmac = new THREE.Mesh(
          new THREE.PlaneGeometry(ROAD_WIDTH, TILE_LENGTH),
          roadMat
        )
        tarmac.rotation.x = -Math.PI / 2
        tarmac.receiveShadow = true
        tileGroup.add(tarmac)
        callback(tileGroup)
      }
    )
  }

  // Create exactly 2 tiles and place them end to end
  const roadTiles = []
  let tilesLoaded = 0
  for (let i = 0; i < 2; i++) {
    buildRoadTile((tile) => {
      tile.position.z = -i * TILE_LENGTH
      scene.add(tile)
      roadTiles.push(tile)
      tilesLoaded++
    })
  }


  // ════════════════════════════════════════════════════════════
  // CONCEPT 5 — THREE.Clock AND DELTA TIME
  //
  //   Problem without delta time:
  //   - On a 60fps monitor:  speed += 0.1  → moves 6 units/sec
  //   - On a 144fps monitor: speed += 0.1  → moves 14.4 units/sec
  //   Same code, wildly different game speed.
  //
  //   Delta time = time in seconds since the last frame.
  //   At 60fps:  delta ≈ 0.0167 seconds
  //   At 144fps: delta ≈ 0.0069 seconds
  //
  //   Multiply movement by delta:
  //   - 60fps:  0.1 × 0.0167 × 60  = 0.1 units/sec
  //   - 144fps: 0.1 × 0.0069 × 144 = 0.1 units/sec  ✅ same!
  //
  //   THREE.Clock.getDelta() returns seconds since last call.
  //   Call it ONCE per frame at the top of animate().
  // ════════════════════════════════════════════════════════════

  const clock = new THREE.Clock()

  // Game state — everything that changes during the race
  const gameState = {
    speed:        8,          // road scroll speed (units per second)
    maxSpeed:     35,
    acceleration: 2,          // how fast speed increases per second
    running:      true,       // controls the animate loop
    score:        0,
    gunIndex:     selections.gunIndex,
    turbo: 0, // turbo bar (0-1)
    turboActive: false
  }

  // ─── HUD: Turbo bar ───
  const turboBar = document.createElement('div');
  turboBar.style.cssText = `
    position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%);
    width: 240px; height: 18px; background: #222a; border-radius: 9px;
    border: 2px solid #fff4; z-index: 20; overflow: hidden; pointer-events: none;`;
  const turboFill = document.createElement('div');
  turboFill.style.cssText = `
    height: 100%; width: 0%; background: linear-gradient(90deg, #00f6ff, #00ffb0 60%, #fff 100%);
    border-radius: 9px; transition: width 0.18s cubic-bezier(.7,1.7,.5,1); box-shadow: 0 0 12px #0ff8;`;
  turboBar.appendChild(turboFill);
  document.body.appendChild(turboBar);
  // Speed lines overlay — pure CSS radial streaks
const speedLinesEl = document.createElement('div');
speedLinesEl.style.cssText = `
  position: fixed; inset: 0; pointer-events: none;
  opacity: 0; transition: opacity 0.15s ease;
  z-index: 10;
  background: repeating-conic-gradient(
    rgba(255,255,255,0.03) 0deg,
    transparent 1deg,
    transparent 5deg,
    rgba(255,255,255,0.03) 6deg
  );
  animation: spinLines 0.4s linear infinite;
`;
document.head.insertAdjacentHTML('beforeend', `
  <style>
    @keyframes spinLines {
      from { transform: rotate(0deg) scale(2); }
      to   { transform: rotate(360deg) scale(2); }
    }
  </style>
`);
document.body.appendChild(speedLinesEl);


  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  // UnrealBloomPass params: resolution, strength, radius, threshold
  // Change your bloomPass initialization
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0,      // strength starts at 0 — GSAP animates it up
  0.4,    // radius — lower = tighter glow, less bleed
  0.6     // threshold — only bright pixels bloom (0.6 = only headlights/sky)
);
bloomPass.enabled = false;
composer.addPass(bloomPass);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  // ─── INPUT: Turbo activation (Shift) ───
// Replace your turbo keydown handler
window.addEventListener('keydown', (e) => {
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight')
      && !gameState.turboActive
      && gameState.turbo > 0.05) {
    e.preventDefault();
    gameState.turboActive = true;
    gameState.speed *= 1.7;

    // 1. Bloom punch
    bloomPass.enabled = true;
    gsap.to(bloomPass, { strength: 2.5, duration: 0.15 });

    // 2. FOV kick — camera zooms out slightly, sells speed
    gsap.to(camera, { fov: 85, duration: 0.2, onUpdate: () => camera.updateProjectionMatrix() });

    // 3. Fog pulls in — world blurs at edges
    gsap.to(scene.fog, { near: 20, far: 80, duration: 0.2 });

    // 4. Speed lines overlay
    speedLinesEl.style.opacity = '1';
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    if (gameState.turboActive) {
      gameState.turboActive = false;
      gameState.speed /= 1.7;
      gsap.to(bloomPass, { strength: 0, duration: 0.4, onComplete: () => { bloomPass.enabled = false; bloomPass.strength = 2.5; } });
      gsap.to(camera, { fov: 70, duration: 0.4, onUpdate: () => camera.updateProjectionMatrix() });
      gsap.to(scene.fog, { near: 40, far: 150, duration: 0.4 });
      speedLinesEl.style.opacity = '0';
    }
  }
});

  // ════════════════════════════════════════════════════════════
  // CONCEPT 6 — PLAYER CAR
  //
  //   The car does NOT move in Z (forward/back).
  //   It only moves in X (left/right) to dodge traffic.
  //   The illusion of forward movement comes from the road tiles.
  //
  //   We use the same car config from the garage selections.
  //   Same GLTFLoader pattern you already know.
  // ════════════════════════════════════════════════════════════

 
  const CAR_CONFIGS = [
    { name: 'Merceulago', path: "./assets/car.glb", scale: 0.4 ,scaleRace: 0.3},
    { name: 'Punch', path: "./assets/tata_punch.glb", scale: 1.0 , scaleRace: 1.0},
  ];
  const GUN_CONFIGS = [
    { path: './assets/rpg.glb',     scale: 0.4, offset: { x: 3.7,   y: 1.2, z:7 } },
    { path: './assets/car_combat_machine_gun.glb',    scale: 6, offset: { x: 4.5, y: 0, z: 5 } },
  ]

  // playerVehicle = the Group that moves
  // car and gun are children of this group
  // We only ever move playerVehicle — everything inside follows
  const playerVehicle = new THREE.Group()
  playerVehicle.position.set(0, 0, 0);
  playerVehicle.rotation.set(0, Math.PI/1, 0);
  scene.add(playerVehicle)

  const loader = new GLTFLoader()

  let carLoaded  = false
  let playerCar  = null
  let animationId


  // Helper — apply color to car body (same logic as garage)
  // Mesh color config: { [carIndex]: [meshName, ...] }
      // Rotate car to face forward (down -Z)

    const COLORABLE_MESHES_CONFIG = {
    2: ['Object_4'],
    1: ['Object_10', 'Object_49', 'Object_343', 'Object_390', 'Object_373'],
    0: ['Mesh_005_prim85'],
  }

  function applyColor(group, colorValue) {
    const carIndex = selections.carIndex
    const colorableNames = COLORABLE_MESHES_CONFIG[carIndex] || []
    group.traverse((child) => {
      if (!child.isMesh) return
      if (!colorableNames.includes(child.name)) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach(mat => {
        mat.color.set(colorValue)
      // Initialize combat logic after car and gun are loaded
    
      })
    })
  }
    

  let combat = null
  // Remove gunPivot. We'll attach the gun directly to the car for consistency with garage.js
let gunPivot = null
const gunRef = { current: null }

  let initialGunRotation = 0;
  function setInitialGunRotation() {
    if (gunPivot) {
      initialGunRotation = gunPivot.rotation.y;
      window.initialGunRotation = initialGunRotation;
    }
  }
  function setGunTargetRotation(val) {
    gunTargetRotation = val;
  }
  window.setGunTargetRotation = setGunTargetRotation;
    setInitialGunRotation();
  // Load player car
  loader.load(
    CAR_CONFIGS[selections.carIndex].path,
    (gltf) => {
      playerCar = gltf.scene
      console.log('✅ Car loaded')    
      playerCar.scale.setScalar(CAR_CONFIGS[selections.carIndex].scaleRace)
      playerCar.position.y = 0.1
      // Rotate car to face the player (camera)
      playerCar.rotation.y = Math.PI

      applyColor(playerCar, selections.color)
      playerCar.traverse(child => {
        if (child.isMesh) {
          child.castShadow    = true
          child.receiveShadow = true
        }
        if (child.isMesh && (
      child.name.toLowerCase().includes('gun') ||
      child.name.toLowerCase().includes('rpg')
    )) {
      gunMesh = child
    }
      })
      playerCar.rotation.y = 0


      // Add car as child of vehicle group
      playerVehicle.add(playerCar)
      carLoaded = true

      // Attach gun as child of playerVehicle
      // Gun is a sibling of the car, both inside playerVehicle
      attachGun()
//       combat = initCombat({
//   scene,
//   camera,
//   playerVehicle,
//   playerCar,
//   gameState,
//   keys,
//   LANE_POSITIONS,
//   gunPivot,       // your gun group or null if attached differently
//   stopRace
// })
console.log("initializing combat with:", { scene, camera, playerVehicle, playerCar, gameState, keys, LANE_POSITIONS, gunRef })

combat = initCombat({
        scene,
        camera,
        playerVehicle,
        playerCar,
        gameState,
        keys,
        LANE_POSITIONS,
        gunRef,
        stopRace
      })

      console.log("combat initialized with:", { combat })
    },

(progress) => {
    console.log('Car loading...', progress.loaded, '/', progress.total)
},
    () => {
      // Fallback placeholder car
      playerCar = buildPlaceholderCar()
      playerCar.rotation.y = Math.PI
      playerVehicle.add(playerCar)
      carLoaded = true
      attachGun()
    }
  )

  function buildPlaceholderCar() {
    const group = new THREE.Group()
    const body  = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.6, 3.8),
      new THREE.MeshStandardMaterial({ color: selections.color, metalness: 0.6, roughness: 0.3 })
    )
    body.castShadow = true
    group.add(body)
    group.position.y = 0.5
    return group
  }

  

  function attachGun() {
    // Use gun config from selections (garage.js)
    const gunCfg = selections.gunConfig || {
      path: GUN_CONFIGS[selections.gunIndex].path,
      scale: selections.gunScale,
      offset: selections.gunOffset,
      rotation: selections.gunRotation
    }
    gunPivot = new THREE.Group()
  gunPivot.position.set(
    gunCfg.offset.x,
    gunCfg.offset.y,
    gunCfg.offset.z
  )
  if (gunCfg.rotation) {
    gunPivot.rotation.set(
      gunCfg.rotation.x,
      gunCfg.rotation.y,
      gunCfg.rotation.z
    )
  }
   gunRef.current = gunPivot 

   

    loader.load(
      gunCfg.path,
      (gltf) => {
        const gunModel = gltf.scene
        // Use scale, offset, rotation from selections
        gunModel.scale.set(
          gunCfg.scale,
          gunCfg.scale,
          gunCfg.scale
        )
        // gunModel.position.set(
        //   gunCfg.offset.x,
        //   gunCfg.offset.y,
        //   gunCfg.offset.z
        // )
        gunModel.position.set(0, 0, 0) // gunModel is at origin of gunPivot, which is positioned by offset
        if (gunCfg.rotation) {
          gunModel.rotation.set(
            gunCfg.rotation.x,
            gunCfg.rotation.y,
            gunCfg.rotation.z
          )
        }
        gunPivot.add(gunModel)
        console.log("gun model loaded with config:", gunCfg)
        // gunModel.traverse(c => { if (c.isMesh) c.castShadow = true })
        // Attach gun as child of the car for consistent transform
        if (playerCar) {
          playerCar.add(gunPivot)
          
        }
      },
      undefined,
      () => {
        // Placeholder barrel
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8),
          new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9 })
        )
        barrel.rotation.x = Math.PI / 2
        barrel.position.set(0, 0.9, -1.0)
        if (playerCar) {
          playerCar.add(barrel)
        }
         if (playerCar) playerCar.add(gunPivot)
      }
    )
  }


  // ════════════════════════════════════════════════════════════
  // CONCEPT 7 — KEYBOARD STATE PATTERN
  //
  //   Already familiar from your block game.
  //   Store pressed state, read in animate loop.
  //   Gives smooth continuous movement vs single keydown fires.
  //
  //   NEW: Gun rotation is separate from car movement.
  //   A/D = car moves left/right
  //   J/L = gun rotates left/right (independent)
  //
  //   This works because gunPivot and playerCar are SIBLINGS
  //   inside playerVehicle — rotating one doesn't affect the other.
  // ════════════════════════════════════════════════════════════

  const keys = { a: false, d: false, w: false, s: false, ArrowLeft: false, ArrowRight: false }


  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyA') keys.a = true
    if (e.code === 'KeyD') keys.d = true
    if (e.code === 'KeyW') keys.w = true
    if (e.code === 'KeyS') keys.s = true
    if (e.code === 'ArrowLeft') {
      if (!keys.ArrowLeft) keys.ArrowLeft_justPressed = true;
      keys.ArrowLeft = true;
    }
    if (e.code === 'ArrowRight') {
      if (!keys.ArrowRight) keys.ArrowRight_justPressed = true;
      keys.ArrowRight = true;
    }
    if (e.code === 'Space' && typeof combat === 'object' && combat && typeof combat.shoot === 'function') {
    combat.shoot(performance.now() / 1000);
  }
  })

  window.addEventListener('keydown', (e) => {
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') 
      && !gameState.turboActive 
      && gameState.turbo > 0.05) {
    e.preventDefault(); // prevent any browser default Shift behavior
    gameState.turboActive = true;
    gameState.speed *= 1.7;
    // Fade bloom IN gradually instead of snapping on
    gsap.to(bloomPass, { strength: 1.2, duration: 0.3 });
    bloomPass.enabled = true;
  }
});


window.addEventListener('keyup', (e) => {
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    if (gameState.turboActive) {
      gameState.turboActive = false;
      gameState.speed /= 1.7;
      // Fade bloom OUT gradually
      gsap.to(bloomPass, { 
        strength: 0, 
        duration: 0.4,
        onComplete: () => { bloomPass.enabled = false; bloomPass.strength = 1.5; }
      });
    }
  }
});

  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA') keys.a = false
    if (e.code === 'KeyD') keys.d = false
    if (e.code === 'KeyW') keys.w = false
    if (e.code === 'KeyS') keys.s = false
    if (e.code === 'ArrowLeft') {
      keys.ArrowLeft = false;
      keys.ArrowLeft_justPressed = false;
    }
    if (e.code === 'ArrowRight') {
      keys.ArrowRight = false;
      keys.ArrowRight_justPressed = false;
    }
  })

  // Lane positions — imported from garage.js
  let currentLane = 1  // start in center lane

  // Car X movement — smooth interpolation toward target lane
  let targetX = LANE_POSITIONS[currentLane]

  // Gun rotation limits
  const GUN_MAX_ROTATION = Math.PI / 3; // ~60 degrees either side
  let gunTargetRotation  = 0
  // Debug: log gunTargetRotation
  console.log('gunTargetRotation:', gunTargetRotation)


  // ─── KEY DEBOUNCE (for lane switching) ───
  let keyDebounce = { a: false, d: false }

  // ─── HUD: Score and Controls Hint ───
 let  hud = document.createElement('div')
  hud.style.cssText = `
    position: fixed; top: 20px; left: 50%;
    transform: translateX(-50%);
    color: white; font-family: monospace;
    font-size: 18px; font-weight: bold;
    background: rgba(0,0,0,0.4);
    padding: 8px 20px; border-radius: 20px;
    pointer-events: none; letter-spacing: 2px;
  `
 

  const hint = document.createElement('div')
  hint.style.cssText = `
    position: fixed; bottom: 20px; left: 50%;
    transform: translateX(-50%);
    color: rgba(255,255,255,0.5); font-family: monospace;
    font-size: 12px; pointer-events: none; letter-spacing: 1px;
  `
  hint.textContent = 'A/D — Lane | W/S — Speed | ←/→ — Rotate Gun'
  document.body.appendChild(hint)

  // ─── ANIMATION LOOP ───
  function animate() {
    if (!gameState.running) return;
    animationId = requestAnimationFrame(animate);

    // DELTA TIME
    const delta = Math.min(clock.getDelta(), 0.05);

    // INCREASE SPEED OVER TIME
    if (gameState.speed < gameState.maxSpeed) {
      gameState.speed += gameState.acceleration * delta;
    }

    // TILE RECYCLING
    roadTiles.forEach(tile => {
      tile.position.z += gameState.speed * delta;
      if (tile.position.z > TILE_LENGTH) {
        tile.position.z -= TILE_LENGTH * 2;
        gameState.score += 10;
        hud.textContent = `SCORE: ${gameState.score}`;
      }
    });

    // CAR MOVEMENT: LANE + SPEED + DIAGONAL
    if (keys.a && !keyDebounce.a) {
      currentLane = Math.max(0, currentLane - 1);
      targetX     = LANE_POSITIONS[currentLane];
      keyDebounce.a = true;
    }
    if (keys.d && !keyDebounce.d) {
      currentLane = Math.min(LANE_POSITIONS.length - 1, currentLane + 1);
      targetX     = LANE_POSITIONS[currentLane];
      keyDebounce.d = true;
    }
    if (!keys.a) keyDebounce.a = false;
    if (!keys.d) keyDebounce.d = false;

    // Forward/backward (W/S)
    let moveZ = 0;
    if (keys.w) moveZ -= 1;
    if (keys.s) moveZ += 1;
    let moveX = targetX - playerVehicle.position.x;
    let mag = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (mag > 1) { moveX /= mag; moveZ /= mag; }
    playerVehicle.position.x = THREE.MathUtils.lerp(
      playerVehicle.position.x,
      targetX,
      0.15
    );
    if (moveZ !== 0) {
      playerVehicle.position.z += moveZ * gameState.speed * delta * 0.5;
    }

    // Car steering and tilt
    if (playerCar) {
      const steerAngle = (playerVehicle.position.x - targetX) * 0.04;
      playerCar.rotation.y = THREE.MathUtils.lerp(playerCar.rotation.y, steerAngle, 0.06);
      const tiltTarget = (targetX - playerVehicle.position.x) * -0.08;
      playerCar.rotation.z = THREE.MathUtils.lerp(playerCar.rotation.z, tiltTarget, 0.06);
    }

    // Gun rotation
    if (playerCar && gunPivot) {
      if (keys.ArrowLeft_justPressed || keys.ArrowRight_justPressed) {
        const origin = new THREE.Vector3();
        const direction = new THREE.Vector3();
        gunPivot.getWorldPosition(origin);
        const quaternion = new THREE.Quaternion();
        gunPivot.getWorldQuaternion(quaternion);
        direction.set(0, 0, 1).applyQuaternion(quaternion);
        const endPoint = origin.clone().add(direction.clone().multiplyScalar(60));
        if (window.spawnDottedTrail) window.spawnDottedTrail(origin, endPoint);
        keys.ArrowLeft_justPressed = false;
        keys.ArrowRight_justPressed = false;
      }
      if (keys.ArrowLeft) {
        gunTargetRotation = Math.min(gunTargetRotation + 1.5 * delta, GUN_MAX_ROTATION);
      } else if (keys.ArrowRight) {
        gunTargetRotation = Math.max(gunTargetRotation - 1.5 * delta, -GUN_MAX_ROTATION);
      }
      gunPivot.rotation.y = THREE.MathUtils.lerp(gunPivot.rotation.y, gunTargetRotation, 0.12);
    }

    // Combat update
    if (combat) {
      combat.update(delta);
    }

    // Road tiles always straight
    roadTiles.forEach(tile => {
      tile.rotation.y = 0;
      tile.position.x = 0;
    });

    // Update turbo bar HUD
    turboFill.style.width = `${Math.round(gameState.turbo * 100)}%`;
    // Drain turbo if active
    if (gameState.turboActive) {
  gameState.turbo = Math.max(0, gameState.turbo - 0.0035);
  if (gameState.turbo <= 0.01) {
  gameState.turboActive = false;
  gameState.speed /= 1.7;
  gsap.to(bloomPass, { strength: 0, duration: 0.4, onComplete: () => { bloomPass.enabled = false; bloomPass.strength = 2.5; } });
  gsap.to(camera, { fov: 70, duration: 0.4, onUpdate: () => camera.updateProjectionMatrix() });
  gsap.to(scene.fog, { near: 40, far: 150, duration: 0.4 });
  speedLinesEl.style.opacity = '0';
}
}
    // Render with post-processing if turbo is active
    if (gameState.turboActive) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }
  animate();


  // ════════════════════════════════════════════════════════════
  // CONCEPT 8 — FOLLOW CAMERA WITH lerp()
  //
  //   lerp = Linear Interpolation
  //   lerp(a, b, t) = a + (b - a) * t
  //
  //   If t = 0:   returns a (stays at current)
  //   If t = 1:   returns b (snaps to target)
  //   If t = 0.1: returns 10% of the way from a to b
  //
  //   Called every frame, this moves the camera 10% closer
  //   to the target each frame — creating smooth lag.
  //
  //   THREE.Vector3.lerp(targetVector, t) modifies in place.
  //
  //   The camera target is always behind and above the car.
  //   As the car moves left/right, camera follows with a delay.
  // ════════════════════════════════════════════════════════════

  const CAMERA_OFFSET = new THREE.Vector3(0, 5, 11)
  // 0 = same X as car (updated each frame)
  // 5 = 5 units above car
  // 11 = 11 units behind car (car is at z=0, camera at z=11)

  const cameraTarget = new THREE.Vector3()  // reused each frame (no GC pressure)


  // ════════════════════════════════════════════════════════════
  // CONCEPT 9 — SCORE UI
  //
  //   HTML/CSS overlays work perfectly alongside Three.js.
  //   Three.js renders to a <canvas> — HTML sits above it.
  //   This is simpler than trying to render text in WebGL.
  // ════════════════════════════════════════════════════════════

   hud = document.createElement('div')
  hud.style.cssText = `
    position: fixed; top: 20px; left: 50%;
    transform: translateX(-50%);
    color: white; font-family: monospace;
    font-size: 18px; font-weight: bold;
    background: rgba(0,0,0,0.4);
    padding: 8px 20px; border-radius: 20px;
    pointer-events: none; letter-spacing: 2px;
  `
  hud.textContent = 'SCORE: 0'
  document.body.appendChild(hud)

  // Controls hint
  hint = document.createElement('div')
  hint.style.cssText = `
    position: fixed; bottom: 20px; left: 50%;
    transform: translateX(-50%);
    color: rgba(255,255,255,0.5); font-family: monospace;
    font-size: 12px; pointer-events: none; letter-spacing: 1px;
  `
  hint.textContent = 'A/D — Lane | W/S — Speed | ←/→ — Rotate Gun'
  document.body.appendChild(hint)





  // ════════════════════════════════════════════════════════════
  // RESIZE HANDLER
  // ════════════════════════════════════════════════════════════

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })


  // ════════════════════════════════════════════════════════════
  // CLEANUP — called when race ends (Milestone 3+)
  // ════════════════════════════════════════════════════════════

  function stopRace() {
    console.log('stop race called', )
    gameState.running = false
   if (animationId !== undefined) cancelAnimationFrame(animationId);
    renderer.dispose()
    controls.dispose()
    renderer.forceContextLoss() // helps free GPU memory immediately
    document.body.removeChild(renderer.domElement)
    document.body.removeChild(hud)
    document.body.removeChild(hint)
  }

  // Expose stopRace for Milestone 3 game-over logic
  return { stopRace, gameState, scene, camera, renderer, playerVehicle }
}