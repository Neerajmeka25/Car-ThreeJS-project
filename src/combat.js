// ─── combat.js ───────────────────────────────────────────────
//
// THREE.JS CONCEPTS COVERED IN THIS FILE:
//
//   1. Raycaster          — shooting mechanic, invisible laser
//   2. THREE.Line         — visible bullet trail
//   3. BufferGeometry     — custom geometry from raw points
//   4. Box3               — AABB collision for enemy cars
//   5. InstancedMesh      — particle explosions (1 draw call)
//   6. Object3D + matrix  — dummy object for instance transforms
//   7. emissive material  — self-glowing damage/fire effect
//   8. .dispose()         — GPU memory cleanup
//   9. THREE.AudioListener + THREE.Audio — spatial sound
//  10. GSAP on Three.js   — damage flash, game over sequence
//
// HOW TO USE:
//   import { initCombat } from './combat.js'
//
//   Inside initRace(), after car is loaded:
//   const combat = initCombat({ scene, camera, playerVehicle,
//                               playerCar, gameState, keys,
//                               LANE_POSITIONS, stopRace })
//
//   Inside animate() loop:
//   combat.update(delta)
//
// ─────────────────────────────────────────────────────────────

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import gsap from 'gsap'

export function initCombat({
  scene,
  camera,
  playerVehicle,
  playerCar,
  gameState,
  keys,
  LANE_POSITIONS,
  gunRef,        // the rotating gun group — ray fires from here
  stopRace
}) {
    console.log("gunpivot", gunRef)
  // ════════════════════════════════════════════════════════════
  // CONCEPT 1 — RAYCASTER (Shooting)
  //
  //   A Raycaster fires an invisible ray from a point in a
  //   direction. It returns every object the ray intersects,
  //   sorted by distance. hits[0] = closest object.
  //
  //   In your mountain project you used:
  //     raycaster.setFromCamera(mouse, camera)
  //   That shoots a ray from camera through the mouse position.
  //
  //   Here we shoot from the gun's world position in the
  //   gun's world direction — forward along its barrel.
  //
  //   getWorldPosition() and getWorldDirection() convert from
  //   local (relative to parent) to world (absolute) space.
  //   This is necessary because the gun is a child of the car
  //   which is a child of playerVehicle — all nested.
  // ════════════════════════════════════════════════════════════

  const raycaster = new THREE.Raycaster()

  // Gun config — affects bullet behavior per weapon type
  const GUN_STATS = [
    { damage: 20,  fireRate: 0.12, color: 0xffff00, trailColor: 0xffee00 }, // Machine Gun
    { damage: 80,  fireRate: 0.8,  color: 0xff4400, trailColor: 0xff2200 }, // Rocket
    { damage: 40,  fireRate: 0.1, color: 0xff8800, trailColor: 0xff6600 }, // Shotgun
  ]
  const gunStats = GUN_STATS[gameState.gunIndex ?? 0]

  let lastFireTime  = 0    // tracks when we last fired
  // Remove shootKeyHeld, use keys['Space'] for shooting


  // ════════════════════════════════════════════════════════════
  // CONCEPT 2 — BULLET TRAIL (THREE.Line + BufferGeometry)
  //
  //   THREE.Line draws a line between points in 3D space.
  //   It needs a BufferGeometry that defines those points.
  //
  //   BufferGeometry.setFromPoints([vec3, vec3]) is the
  //   simplest way — pass an array of Vector3 positions.
  //
  //   The trail is a visual effect only — not physics.
  //   We create it, show it for 80ms, then remove it.
  //   dispose() frees the GPU memory after removal.
  // ════════════════════════════════════════════════════════════

  function spawnBulletTrail(from, to) {
    // Create a dotted line for the bullet trail
    const points = []
    const segments = 20
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      // Dotted: skip every other segment
      if (i % 2 === 0) {
        points.push(new THREE.Vector3().lerpVectors(from, to, t))
      }
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineDashedMaterial({
      color: gunStats.trailColor,
      transparent: true,
      opacity: 0.9,
      dashSize: 0.5,
      gapSize: 0.5
    })
    const trail = new THREE.Line(geometry, material)
    trail.computeLineDistances()
    scene.add(trail)
    gsap.to(material, {
      opacity: 0,
      duration: 0.1,
      onComplete: () => {
        scene.remove(trail)
        geometry.dispose()
        material.dispose()
      }
    })
  }

  // Replace all spawnBulletTrail calls:
  function spawnMovingBulletTrail(from, to) {
    const bulletCount = 8;
    for (let b = 0; b < bulletCount; b++) {
      const t = b / bulletCount;
      const start = from.clone().lerp(to, t);
      const end = from.clone().lerp(to, t + 1 / bulletCount);
      const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      const material = new THREE.LineBasicMaterial({
        color: gunStats.trailColor,
        transparent: true,
        opacity: 0.9
      });
      const trail = new THREE.Line(geometry, material);
      scene.add(trail);
      gsap.to(trail.position, {
        x: (end.x - start.x) * 0.8,
        y: (end.y - start.y) * 0.8,
        z: (end.z - start.z) * 0.8,
        duration: 0.12,
        onComplete: () => {
          scene.remove(trail);
          geometry.dispose();
          material.dispose();
        }
      });
    }
  }

  // --- DOTTED TRAIL FOR AIMING ---
  function spawnDottedTrail(from, to) {
    // Expose globally for race.js to use on just-pressed
    window.spawnDottedTrail = spawnDottedTrail;
    const points = [];
    const segments = 20;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      if (i % 2 === 0) {
        points.push(new THREE.Vector3().lerpVectors(from, to, t));
      }
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: gunStats.trailColor,
      transparent: true,
      opacity: 0.9,
      dashSize: 0.5,
      gapSize: 0.5
    });
    const trail = new THREE.Line(geometry, material);
    trail.computeLineDistances();
    scene.add(trail);
    gsap.to(material, {
      opacity: 0,
      duration: 0.1,
      onComplete: () => {
        scene.remove(trail);
        geometry.dispose();
        material.dispose();
      }
    });
  }


  // ════════════════════════════════════════════════════════════
  // ENEMY CAR SYSTEM
  //
  //   Each enemy = { group, health, maxHealth, box3, lane }
  //   group  = THREE.Group with the loaded GLB or placeholder
  //   health = current HP (starts at 100)
  //   box3   = THREE.Box3 for collision detection
  //   lane   = which of the 3 lanes it's in
  //
  //   Enemies spawn far ahead (z = -60) and move toward
  //   the camera at the current game speed — same direction
  //   as the road tiles. When they pass z = 15 (behind player)
  //   they are removed from the scene and the array.
  // ════════════════════════════════════════════════════════════

  const ENEMY_CONFIGS = [
    './assets/toyota_ae86.glb',
    './assets/toyota_ae86.glb',
    './assets/toyota_ae86.glb',
  ]

  const enemies     = []     // active enemy objects
  let   spawnTimer  = 0      // counts up to spawnInterval
  let   spawnInterval = 2.5  // seconds between spawns (decreases over time)

  const loader = new GLTFLoader()

  function spawnEnemy() {
    // Pick a random lane
    const lane    = Math.floor(Math.random() * 4)
    const xPos    = LANE_POSITIONS[lane]

    // Try loading a random enemy GLB
    const path    = ENEMY_CONFIGS[Math.floor(Math.random() * ENEMY_CONFIGS.length)]

    const enemyData = {
      group:     null,
      hitbox:    null, // invisible mesh for raycast
      health:    0.1,
      maxHealth: 10,
      lane,
      box3:      new THREE.Box3(),    // will be updated every frame
      alive:     true,
      // Damage flash state — for emissive pulse effect
      flashTimer: 0
    }

    loader.load(
      path,
      (gltf) => {
        const model = gltf.scene
        model.scale.setScalar(1.5)
        model.position.set(xPos, 0, -60)   // spawn far ahead

        model.traverse(child => {
          if (child.isMesh) {
            child.castShadow    = true
            child.receiveShadow = true
            // Store original emissive so we can restore after flash
            if (child.material) {
              child.material = child.material.clone()
              child.material.userData.origEmissive = child.material.emissive?.clone()
                                                  ?? new THREE.Color(0x000000)
            }
          }
        })

        model.rotation.y = -Math.PI/2;
        // Add invisible hitbox
        const hitbox = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.9,2 ),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hitbox.position.set(0, 0.6, 0); // center on car
        model.add(hitbox);
        enemyData.hitbox = hitbox;

        scene.add(model)
        enemyData.group = model
        enemies.push(enemyData)
      },
      undefined,
      () => {
        // Fallback — simple box car in a random color
        const group   = buildPlaceholderEnemy(xPos)
        // Add invisible hitbox
        const hitbox = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 1.2, 4.2),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hitbox.position.set(0, 0.6, 0);
        group.add(hitbox);
        enemyData.hitbox = hitbox;
        scene.add(group)
        enemyData.group = group
        enemies.push(enemyData)
      }
    )
  }

  function buildPlaceholderEnemy(xPos) {
    const group = new THREE.Group()

    // Random enemy colors — makes them feel varied
    const colors = [0xcc2222, 0x222288, 0x228833, 0x886622]
    const color  = colors[Math.floor(Math.random() * colors.length)]

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.7, 3.5),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: 0.3,
        // emissive will flash red on damage hit
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0
      })
    )
    body.castShadow = true
    body.userData.origEmissive = new THREE.Color(0x000000)
    group.add(body)
    group.position.set(xPos, 0.45, -60)
    return group
  }


  // ════════════════════════════════════════════════════════════
  // CONCEPT 3 — Box3 COLLISION DETECTION
  //
  //   THREE.Box3 = axis-aligned bounding box (AABB)
  //   It wraps any object with a box defined by min/max corners.
  //
  //   box3.setFromObject(mesh) recalculates to fit the object.
  //   Call this every frame because enemies move each frame.
  //
  //   box3.intersectsBox(otherBox3) = true if they overlap.
  //
  //   This is different from your manual collision in the
  //   block game — Three.js computes the box automatically
  //   from the actual geometry, no manual top/bottom needed.
  //
  //   For GLB models with complex shapes this is much easier
  //   than computing exact mesh collision.
  // ════════════════════════════════════════════════════════════

  // Player's bounding box — updated every frame
  const playerBox3 = new THREE.Box3()


  // ════════════════════════════════════════════════════════════
  // CONCEPT 4 — INSTANCED MESH (Explosion Particles)
  //
  //   The problem: 60 separate sphere meshes = 60 draw calls.
  //   Each draw call has CPU→GPU overhead.
  //   At 60fps with multiple explosions = hundreds of draw calls.
  //
  //   InstancedMesh = ONE mesh drawn N times in ONE draw call.
  //   The GPU handles the instancing — zero extra CPU overhead.
  //
  //   Each instance needs a transform matrix (position + rotation
  //   + scale packed into a 4×4 matrix).
  //
  //   We use a dummy Object3D as a helper — set its position,
  //   call updateMatrix(), copy its matrix into the instance.
  //   The dummy is never added to the scene, it's just a
  //   convenient way to build matrices without doing the math.
  //
  //   Think of Object3D as a calculator for 4×4 matrices.
  // ════════════════════════════════════════════════════════════

  // function spawnExplosion(position) {
  //   const COUNT    = 500
  //   const LIFETIME = 70   // frames

  //   // Low-poly sphere — particles don't need smooth geometry
  //   // (4, 4) = very low poly, saves GPU memory significantly
  //   const geometry = new THREE.SphereGeometry(0.12, 4, 4)
  //   const material = new THREE.MeshStandardMaterial({
  //     color:             0xffd966,
  //     emissive:          new THREE.Color(0xff2200),
  //     emissiveIntensity: 1.6,       // particles glow with their own light
  //     roughness:         0.8,
  //     metalness:         0.0
  //   })

  //   // InstancedMesh(geometry, material, count)
  //   // count = max number of instances — fixed at creation time
  //   const particles = new THREE.InstancedMesh(geometry, material, COUNT)

  //   // DynamicDrawUsage = we plan to update matrices every frame
  //   // tells GPU to keep the buffer accessible for writes
  //   // (default is StaticDrawUsage which is optimized for read-only)
  //   particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  //   scene.add(particles)

  //   // Give each particle a random outward velocity
  //   const velocities = Array.from({ length: COUNT }, () => new THREE.Vector3(
  //     (Math.random() - 0.5) * 0.3,
  //     Math.random() * 0.35 + 0.2,    // always goes up a bit
  //     (Math.random() - 0.5) * 0.3
  //   ))

  //   // dummy = an Object3D used ONLY to compute matrices
  //   // It is NEVER added to the scene
  //   // We set its position/scale, call updateMatrix(),
  //   // and copy the result into each instance slot
  //   const dummy = new THREE.Object3D()
  //   let   frame = 0

  //   // Spawn a flash point light at explosion center
  //   // for dramatic lighting effect
  //   const flashLight = new THREE.PointLight(0xff4400, 8, 12)
  //   flashLight.position.copy(position)
  //   scene.add(flashLight)
  //   // Fade the flash light quickly
  //   gsap.to(flashLight, {
  //     intensity: 0,
  //     duration:  0.3,
  //     onComplete: () => scene.remove(flashLight)
  //   })

  //   function tick() {
  //     if (frame >= LIFETIME) {
  //       // Cleanup — CRITICAL for performance
  //       // Without dispose(), GPU memory leaks on every explosion
  //       scene.remove(particles)
  //       geometry.dispose()
  //       material.dispose()
  //       return
  //     }

  //     const progress = frame / LIFETIME  // 0 → 1 over lifetime

  //     for (let i = 0; i < COUNT; i++) {
  //       velocities[i].y -= 0.012   // gravity pulls sparks down

  //       // Position = spawn point + (velocity × time elapsed)
  //       dummy.position.set(
  //         position.x + velocities[i].x * frame,
  //         position.y + velocities[i].y * frame,
  //         position.z + velocities[i].z * frame
  //       )

  //       // Shrink particles as they age (0→1 progress = 1→0 scale)
  //       const scale = (1 - progress) * (0.5 + Math.random() * 0.5)
  //       dummy.scale.setScalar(scale)

  //       // updateMatrix() bakes position+rotation+scale into dummy.matrix
  //       // This is the matrix we copy into the InstancedMesh
  //       dummy.updateMatrix()

  //       // setMatrixAt(instanceIndex, matrix) — places this instance
  //       particles.setMatrixAt(i, dummy.matrix)
  //     }

  //     // MUST set needsUpdate = true after changing instance matrices
  //     // Otherwise GPU won't re-upload the updated data
  //     particles.instanceMatrix.needsUpdate = true

  //     frame++
  //     requestAnimationFrame(tick)
  //   }

  //   tick()
  // }

  function spawnExplosion(position) {
  const COUNT    = 80       // reduce from 500 — tighter cluster looks better
  const LIFETIME = 55

  const geometry = new THREE.SphereGeometry(0.08, 4, 4)
  const material = new THREE.MeshStandardMaterial({
    color:             0xff6600,
    emissive:          new THREE.Color(0xff3300),
    emissiveIntensity: 2.0,
    roughness:         1.0,
    metalness:         0.0
  })

  const particles = new THREE.InstancedMesh(geometry, material, COUNT)
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  scene.add(particles)

  // Tight fire velocities — small spread, strong upward bias
  const velocities = Array.from({ length: COUNT }, () => new THREE.Vector3(
    (Math.random() - 0.5) * 0.08,   // very narrow X spread
    Math.random() * 0.25 + 0.08,    // strong upward push
    (Math.random() - 0.5) * 0.08    // very narrow Z spread
  ))

  // Spawn offset — particles start near but not exactly at same point
  // gives volume to the fire base
  const offsets = Array.from({ length: COUNT }, () => new THREE.Vector3(
    (Math.random() - 0.5) * 0.4,
    Math.random() * 0.3,
    (Math.random() - 0.5) * 0.4
  ))

  const dummy = new THREE.Object3D()
  let   frame = 0

  const flashLight = new THREE.PointLight(0xff4400, 10, 8)
  flashLight.position.copy(position)
  scene.add(flashLight)
  gsap.to(flashLight, {
    intensity: 0,
    duration:  0.4,
    onComplete: () => scene.remove(flashLight)
  })

  function tick() {
    if (frame >= LIFETIME) {
      scene.remove(particles)
      geometry.dispose()
      material.dispose()
      return
    }

    const progress = frame / LIFETIME

    for (let i = 0; i < COUNT; i++) {
      // Gravity is lighter for fire — heat rises
      velocities[i].y -= 0.004

      dummy.position.set(
        position.x + offsets[i].x + velocities[i].x * frame,
        position.y + offsets[i].y + velocities[i].y * frame,
        position.z + offsets[i].z + velocities[i].z * frame
      )

      // Particles shrink AND also flicker randomly — fire shimmer
      const flicker = 0.85 + Math.random() * 0.15
      const scale   = (1 - progress) * flicker * 0.8
      dummy.scale.setScalar(Math.max(scale, 0.01))

      dummy.updateMatrix()
      particles.setMatrixAt(i, dummy.matrix)
    }

    // Color shift from yellow-orange at start to dark red at end
    // emissiveIntensity fades as fire dies
    material.emissiveIntensity = 2.0 * (1 - progress)

    particles.instanceMatrix.needsUpdate = true
    frame++
    requestAnimationFrame(tick)
  }

  tick()
}

  // ════════════════════════════════════════════════════════════
  // CONCEPT 5 — DAMAGE FLASH (emissive material animation)
  //
  //   emissive = color the material adds regardless of lighting
  //   emissiveIntensity = how strongly it glows
  //
  //   When an enemy takes a hit, we briefly set emissive to
  //   bright red, then lerp it back to black over ~0.3 seconds.
  //   This gives a clear visual "ouch" feedback.
  //
  //   We use GSAP to tween the emissiveIntensity on each mesh
  //   inside the enemy group — same pattern as color tweening.
  // ════════════════════════════════════════════════════════════

  function flashDamage(enemyGroup) {
    enemyGroup.traverse(child => {
      if (!child.isMesh || !child.material) return

      // Set to bright red hit flash
      child.material.emissive.set(0xff0000)
      child.material.emissiveIntensity = 1.5

      // GSAP tweens the intensity back to 0
      gsap.to(child.material, {
        emissiveIntensity: 0,
        duration:          0.35,
        ease:              'power2.out',
        onComplete: () => {
          // Restore original emissive color
          child.material.emissive.copy(child.material.userData.origEmissive)
        }
      })
    })
  }

  // Damage tint — car gets progressively darker red as health drops
  function updateDamageTint(enemyData) {
    const { group, health, maxHealth } = enemyData
    const damageFraction = 1 - (health / maxHealth)  // 0 = full health, 1 = dead

    group.traverse(child => {
      if (!child.isMesh || !child.material) return
      // Persistent emissive red increases with damage
      // Looks like the car is heating up / on fire
      child.material.emissive.set(0xff1100)
      child.material.emissiveIntensity = damageFraction * 0.6
    })
  }


  // ════════════════════════════════════════════════════════════
  // CONCEPT 6 — THREE.Audio (Spatial Sound)
  //
  //   AudioListener attaches to the camera — it IS the ears.
  //   THREE.Audio plays non-positional sound (everywhere).
  //   THREE.PositionalAudio plays sound at a position in 3D.
  //
  //   We use AudioLoader to load a sound file, then play it.
  //   For explosions we create a new Audio object each time
  //   so sounds can overlap (multiple explosions at once).
  //
  //   This is a core Three.js feature worth covering in session.
  // ════════════════════════════════════════════════════════════

  const audioListener = new THREE.AudioListener()
  camera.add(audioListener)   // listener travels with camera

  const audioLoader   = new THREE.AudioLoader()
  let   explosionBuffer = null   // loaded audio buffer, reused

//   audioLoader.load(
//     './assets/explosion.mp3',
//     (buffer) => { explosionBuffer = buffer },
//     undefined,
//     () => console.log('explosion.mp3 not found — audio disabled')
//   )

  function playExplosionSound(position) {
    if (!explosionBuffer) return

    // PositionalAudio = sound comes from a 3D position
    // Volume drops off with distance from listener (camera)
    const sound = new THREE.PositionalAudio(audioListener)
    sound.setBuffer(explosionBuffer)
    sound.setRefDistance(5)     // full volume within 5 units
    sound.setVolume(1.0)

    // Create a temporary object to hold the sound at position
    const holder = new THREE.Object3D()
    holder.position.copy(position)
    holder.add(sound)
    scene.add(holder)

    sound.play()

    // Remove after sound finishes
    setTimeout(() => {
      scene.remove(holder)
      sound.disconnect()
    }, 2000)
  }


  // ════════════════════════════════════════════════════════════
  // SHOOTING FUNCTION — ties raycaster + trail + damage together
  // ════════════════════════════════════════════════════════════


  // function shoot(now) {
  //   // Fire rate limiting — only shoot every fireRate seconds
  //   if (now - lastFireTime < gunStats.fireRate) return
  //   lastFireTime = now

  //   // ── Step 1: Get gun's world position and direction ──────
  //   const origin    = new THREE.Vector3()
  //   const direction = new THREE.Vector3()

  //   // Try to find the gun mesh attached to playerCar
  //   let shootFrom = gunPivot
  //   if (!shootFrom && playerCar) {
  //     // Look for a mesh or group named like a gun
  //     playerCar.traverse(child => {
  //       if (!shootFrom && child.name && child.name.toLowerCase().includes('gun')) {
  //         shootFrom = child
  //       }
  //     })
  //   }
  //   // Fallback to playerVehicle if no gun found
  //   if (!shootFrom) shootFrom = playerVehicle
  //   shootFrom.getWorldPosition(origin)
  //   shootFrom.getWorldDirection(direction)
  //   // getWorldDirection returns the -Z direction of the object
  //   // For a gun pointing forward, we negate it to get +Z direction
  //   direction.negate()

  //   // ── Step 2: Cast the ray ────────────────────────────────
  //   raycaster.set(origin, direction)

  //   // Collect all enemy groups for intersection testing
  //   const targetObjects = enemies
  //     .filter(e => e.alive && e.group)
  //     .map(e => e.group)

  //   // true = recursive, check all children of each group
  //   const hits = raycaster.intersectObjects(targetObjects, true)

  //   // ── Step 3: Calculate end point for bullet trail ────────
  //   // If hit something — trail goes to hit point
  //   // If missed — trail goes 60 units forward
  //   const endPoint = hits.length > 0
  //     ? hits[0].point
  //     : origin.clone().add(direction.clone().multiplyScalar(60))

  //   spawnBulletTrail(origin, endPoint)

  //   // ── Step 4: Apply damage if hit ─────────────────────────
  //   if (hits.length > 0) {
  //     const hitObject = hits[0].object

  //     // Walk up parent chain to find the enemy data
  //     // (hit might be a child mesh, we need the root group)
  //     let hitGroup = hitObject
  //     while (hitGroup.parent && hitGroup.parent !== scene) {
  //       hitGroup = hitGroup.parent
  //     }

  //     // Find which enemy this group belongs to
  //     const hitEnemy = enemies.find(e => e.group === hitGroup)
  //     if (hitEnemy && hitEnemy.alive) {
  //       hitEnemy.health -= gunStats.damage;
  //       console.log("Hit enemy! Remaining health:", hitEnemy.health)

  //       // Visual feedback — flash red
  //       flashDamage(hitEnemy.group)
  //       updateDamageTint(hitEnemy)

  //       if (hitEnemy.health <= 0) {
  //         destroyEnemy(hitEnemy, hits[0].point)
  //       }
  //     }
  //   }
  // }

  function shoot(now) {
    // Only shoot if enough time has passed since last shot
    if (now - lastFireTime < gunStats.fireRate) return
    lastFireTime = now

  const origin    = new THREE.Vector3()
  const direction = new THREE.Vector3()

  console.log("gun pivot in shoot", gunRef.current)
  // Use gunPivot if available — it's the reliable reference
  const shootFrom = gunRef.current ?? playerVehicle
  shootFrom.getWorldPosition(origin)

  // Instead of getWorldDirection (which depends on model orientation),
  // build the direction manually from the pivot's world rotation
  // This gives us the exact forward vector regardless of model facing
  const quaternion = new THREE.Quaternion()
  shootFrom.getWorldQuaternion(quaternion)

  // Start with +Z (to match aiming ray) and apply the world rotation
    direction.set(0, 0, 1).applyQuaternion(quaternion)

  raycaster.set(origin, direction)

  // Visualize direction for debugging — remove after confirmed working
  // console.log('Shooting from:', origin, 'in direction:', direction)

  // Restore: Use enemy group for raycast, destroy car on hit
  const targetObjects = enemies
    .filter(e => e.alive && e.group)
    .map(e => e.group)

  // true = recursive, check all children of each group
  const hits = raycaster.intersectObjects(targetObjects, true)

  // If hit something — trail goes to hit point
  // If missed — trail goes 60 units forward
  const endPoint = hits.length > 0
    ? hits[0].point
    : origin.clone().add(direction.clone().multiplyScalar(60))

  spawnMovingBulletTrail(origin, endPoint)

  // Destroy car on hit (no health, no hitbox logic)
  if (hits.length > 0) {
    // Walk up parent chain to find the enemy group
    let hitGroup = hits[0].object
    while (hitGroup.parent && hitGroup.parent !== scene) {
      hitGroup = hitGroup.parent
    }
    // Find which enemy this group belongs to
    const hitEnemy = enemies.find(e => e.group === hitGroup)
    if (hitEnemy && hitEnemy.alive) {
      destroyEnemy(hitEnemy, hits[0].point)
    }
  }
}


  // ════════════════════════════════════════════════════════════
  // DESTROY ENEMY — explosion + cleanup + score
  // ════════════════════════════════════════════════════════════

  function destroyEnemy(enemyData, hitPoint) {
    // Reset gun pivot and ray to initial straight position after destroying a car
    // This only runs after an enemy is destroyed, not every frame
    if (gunRef.current && typeof window.initialGunRotation !== 'undefined') {
      gunRef.current.rotation.y = window.initialGunRotation;
      if (typeof window.setGunTargetRotation === 'function') window.setGunTargetRotation(window.initialGunRotation);
    }
    enemyData.alive = false

    const pos = new THREE.Vector3()
    enemyData.group.getWorldPosition(pos)

    // Spawn particle explosion at the car's position
    spawnExplosion(pos)

    // Play positional audio from the explosion point
    playExplosionSound(pos)

    // GSAP: make the car sink and fade before removing
    gsap.to(enemyData.group.position, {
      y:        -2,
      duration: 0.5,
      ease:     'power2.in'
    })
    // Remove after fade
    gsap.delayedCall(0.5, () => {
      scene.remove(enemyData.group)
      enemyData.group.traverse(child => {
        if (child.isMesh) {
          child.geometry.dispose()
          child.material.dispose()
        }
      })
    })
    // Remove from active enemies array
    const idx = enemies.indexOf(enemyData)
    if (idx > -1) enemies.splice(idx, 1)

    // Score bonus for kill
    gameState.score += 50

    // Turbo increment on enemy kill
    if (typeof gameState.turbo === 'number') {
      gameState.turbo = Math.min((gameState.turbo || 0) + 0.25, 1.0); // increment turbo bar, max 1.0
    }
  }


  // ════════════════════════════════════════════════════════════
  // PLAYER COLLISION — car hits enemy = game over
  // ════════════════════════════════════════════════════════════

function checkPlayerCollision() {
  if (!playerVehicle) return;

  const playerCenter = new THREE.Vector3();
  playerVehicle.getWorldPosition(playerCenter);
  playerCenter.y += 0.5;
  playerBox3.setFromCenterAndSize(playerCenter, new THREE.Vector3(1.6, 1.0, 3.2));

  for (const enemy of enemies) {
    if (!enemy.alive || !enemy.hitbox || !enemy.group) continue;

    // Force world matrix update on the entire enemy hierarchy
    // Without this, setFromObject uses stale transform data
    enemy.group.updateWorldMatrix(true, true);

    const enemyBox = new THREE.Box3();
    enemyBox.setFromObject(enemy.hitbox);

    // Safety check — if enemy is clearly far away, skip entirely
    const enemyWorldPos = new THREE.Vector3();
    enemy.group.getWorldPosition(enemyWorldPos);
    if (Math.abs(enemyWorldPos.z - playerCenter.z) > 10) continue; // too far in Z
    if (Math.abs(enemyWorldPos.x - playerCenter.x) > 6) continue;  // too far in X

    if (playerBox3.intersectsBox(enemyBox)) {
      triggerGameOver();
      return;
    }
  }
}

  // ════════════════════════════════════════════════════════════
  // GAME OVER — GSAP sequence
  // ════════════════════════════════════════════════════════════

  let gameOverTriggered = false

  function triggerGameOver() {
    if (gameOverTriggered) return
    console.log('TRIGGERING GAME OVER at', performance.now());
    gameOverTriggered = true
    gameState.running = false

    // Screen shake using GSAP
    // repeat + yoyo = back and forth, relative += moves
    gsap.to(camera.position, {
      x:        '+=0.5',
      duration: 0.05,
      repeat:   10,
      yoyo:     true,
      ease:     'none'
    })

    // Spawn explosion at player position
    const playerPos = new THREE.Vector3()
    playerVehicle.getWorldPosition(playerPos)
    spawnExplosion(playerPos)

    // Game over UI — fade in after 0.6s delay
    gsap.delayedCall(0.6, () => {
      const overlay = document.createElement('div')
      overlay.style.cssText = `
        position: fixed; inset: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        background: rgba(0,0,0,0.7);
        color: white; font-family: monospace;
        pointer-events: all;
      `
      overlay.innerHTML = `
        <h1 style="font-size:64px;letter-spacing:8px;margin-bottom:16px">GAME OVER</h1>
        <p style="font-size:24px;opacity:0.7;margin-bottom:32px">
          SCORE: ${gameState.score}
        </p>
        <button id="restart-btn" style="
          background:#3b82f6;color:white;border:none;
          padding:14px 40px;font-size:16px;font-weight:800;
          border-radius:10px;cursor:pointer;letter-spacing:2px;
        ">RESTART</button>
      `
      document.body.appendChild(overlay)

      // Animate overlay in
      gsap.from(overlay, { opacity: 0, duration: 0.4 })

      document.getElementById('restart-btn').addEventListener('click', () => {
        document.body.removeChild(overlay)
        stopRace()
        // Reload page to restart from garage
        window.location.reload()
      })
    })
  }


  // ════════════════════════════════════════════════════════════
  // UPDATE — called every frame from race.js animate loop
  // ════════════════════════════════════════════════════════════

  function update(delta) {
    const now = performance.now() / 1000   // current time in seconds

    // ── Ray Visualization when pivoting ───────────────────
    if (keys && (keys.ArrowLeft || keys.ArrowRight)) {
      const origin    = new THREE.Vector3()
      const direction = new THREE.Vector3()
      const shootFrom = gunRef.current ?? playerVehicle
      shootFrom.getWorldPosition(origin)
      const quaternion = new THREE.Quaternion()
      shootFrom.getWorldQuaternion(quaternion)
      direction.set(0, 0, 1).applyQuaternion(quaternion)
      const endPoint = origin.clone().add(direction.clone().multiplyScalar(60))
      spawnDottedTrail(origin, endPoint)
    } else {
      // gunTargetRotation = THREE.MathUtils.lerp(gunTargetRotation, 0, 0.1)
    }
    // ── Shooting ───────────────────────────────────────────
    // (No longer handled here, handled by keydown event)

    // ── Enemy spawning ─────────────────────────────────────
    spawnTimer += delta
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0
      spawnEnemy()

      // Gradually decrease spawn interval — increases difficulty
      spawnInterval = Math.max(0.8, spawnInterval - 0.05)
    }

    // ── Move enemies + cleanup passed enemies ───────────────
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i]
      if (!enemy.group) continue

      // Move toward player at game speed
      // Same direction as road tiles
      enemy.group.position.z += gameState.speed * delta

      // Passed the player — remove without explosion (they got away)
      if (enemy.group.position.z > 15) {
        scene.remove(enemy.group)
        enemy.group.traverse(child => {
          if (child.isMesh) {
            child.geometry.dispose()
            child.material.dispose()
          }
        })
        enemies.splice(i, 1)
      }
    }

    // ── Player collision check ──────────────────────────────
    checkPlayerCollision()
  }

  // Expose update for the animate loop
  return { update , shoot}
}