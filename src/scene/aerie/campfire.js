import * as THREE from 'three'
import kitUrl from '../../assets/models/campfire_kit.glb?url'

// The campfire at the end of the home walk, with the seats around it. scene-manager.js loads
// this module in its own chunk while the island loads. The pit, the logs, the coals, a bench
// with a blanket, two stumps and a woodpile come from campfire_kit.glb
// (scenes/urban-aerie-studies/campfire_kit.py), built round Anchor_Campfire and fitted to the
// lawn there. The kit parts take the island toon material, so they take the moon, the shadow,
// the ink and the fire spill like the island.
//
// This chunk imports nothing from src/scene/aerie. A shared import makes Rollup merge the scene
// chunk into a common chunk, so scene-manager.js hands in the toon material, the surface
// families and softenGeometry instead.
//
// The fire has no three.js light: its warmth reaches the toon island through one warm spill
// slot, so no lit material recompiles. The flame is a few camera-facing cards with a toon
// flame shader, the coals pulse in their own unlit material, and sparks rise as round points.

// Flame cards: width and height in metres, an offset from the hearth centre, and a seed for
// the shader noise. The cards turn about the vertical to face the camera, so no card ever
// shows its edge. A tall card in the middle, two shorter ones beside it and a low one at the
// back give a layered fire.
const TONGUES = [
    { width: 0.56, height: 1.0, offset: [0, 0], seed: 0.0 },
    { width: 0.4, height: 0.66, offset: [0.13, 0.05], seed: 3.1 },
    { width: 0.38, height: 0.6, offset: [-0.12, 0.07], seed: 6.7 },
    { width: 0.46, height: 0.48, offset: [0.02, -0.12], seed: 9.4 },
]
const SPARKS = 22
const SPARK_HEIGHT = 2.6
// The warm spill reach. Round 11 broke the spill on the lawn into soft patches, so the reach
// can grow to light the bench and the stumps about 1.5 m out without a round pool.
const BOUNCE_RADIUS = 2.4
// Lawn search: candidate spots around this centre (GLB frame), in metres. It runs only when
// the GLB has no Anchor_Campfire. The kit seats are fitted to the anchor, so they may float
// on another spot.
const SEARCH_CENTRE = new THREE.Vector2(4, -2)
const SEARCH_RADIUS = 9
const CLEAR_RADIUS = 1.1
// The toon surface family of each kit material, by its name in SURFACE (toon-material.js).
const FAMILY = {
    kit_stone: 'stone',
    kit_ash: 'soil',
    kit_bark: 'bark',
    kit_fabric: 'fabric',
}
// The coal glow over the baked vertex colour. Linear values above 1 stay bright after tone
// mapping, as the island ember material does.
const EMBER_GAIN = 1.7

const wobble = (t, seed) => Math.sin(t * 7.3 + seed) * 0.5 + Math.sin(t * 13.1 + seed * 2.1) * 0.3 + Math.sin(t * 23.7 + seed * 0.7) * 0.2

// island-look.js tags each mesh with the name of its web material.
const isGrass = (hit) => hit.object.userData.webMaterial === 'web_grass'

// Finds an open patch of lawn: a downward ray must hit grass first, on a gentle slope, at the
// centre and on a ring around it. Returns null when no spot passes.
export function findCampfireSpot(root) {
    const raycaster = new THREE.Raycaster()
    const down = new THREE.Vector3(0, -1, 0)
    const meshes = []
    root.traverse((node) => {
        if (node.isMesh) meshes.push(node)
    })
    const probe = (x, z) => {
        raycaster.set(new THREE.Vector3(x, 40, z), down)
        const hit = raycaster.intersectObjects(meshes, false)[0]
        if (!hit || !isGrass(hit)) return null
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        return Math.abs(normal.y) > 0.92 ? hit.point : null
    }
    for (let r = 0; r <= SEARCH_RADIUS; r += 1) {
        for (let a = 0; a < 12; a += 1) {
            const angle = (a / 12) * Math.PI * 2
            const x = SEARCH_CENTRE.x + Math.cos(angle) * r
            const z = SEARCH_CENTRE.y + Math.sin(angle) * r
            const centre = probe(x, z)
            if (!centre) continue
            const ring = [0, 1, 2, 3, 4, 5].every((k) => {
                const b = (k / 6) * Math.PI * 2
                const p = probe(x + Math.cos(b) * CLEAR_RADIUS, z + Math.sin(b) * CLEAR_RADIUS)
                return p && Math.abs(p.y - centre.y) < 0.35
            })
            if (ring) return centre
            if (r === 0) break
        }
    }
    return null
}

// gltf: the scene's GLTFLoader, which shares the Draco decoder with the island.
export function loadCampfireKit(gltf) {
    return gltf.loadAsync(kitUrl)
}

// The card turns about the vertical to face the camera. The tip sways a little, more at the top.
const flameVertex = /* glsl */ `
uniform vec2 uSize;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
void main() {
    vUv = uv;
    vec3 centre = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
    vec3 right = normalize( vec3( viewMatrix[ 0 ][ 0 ], 0.0, viewMatrix[ 2 ][ 0 ] ) );
    float sway = ( sin( uTime * 2.3 + uSeed ) + sin( uTime * 3.7 + uSeed * 1.3 ) ) * 0.03 * uv.y * uv.y;
    vec3 world = centre + right * ( position.x * uSize.x + sway ) + vec3( 0.0, position.y * uSize.y, 0.0 );
    gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
}
`

// A teardrop flame in the card UV. A value noise that scrolls up bends the flame and breaks
// up its edge, so the tip tears and licks. The colour steps through three toon bands, a red
// rim, an orange body and a pale core near the base, with short soft steps between them, so
// the flame reads as painted, like the island, and not as a smooth gradient.
const flameFragment = /* glsl */ `
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
float hash( vec2 p ) {
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float valueNoise( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + 1.0 ), f.x ), f.y );
}
void main() {
    float y = vUv.y;
    vec2 q = vec2( vUv.x * 2.6 + uSeed, y * 2.4 - uTime * 1.7 );
    float n = valueNoise( q ) * 0.65 + valueNoise( q * 2.3 + 5.0 ) * 0.35;
    float x = ( vUv.x - 0.5 ) * 2.0 + ( n - 0.5 ) * 0.7 * y;
    float width = pow( 1.0 - y, 0.85 ) * ( 0.45 + 0.55 * smoothstep( 0.0, 0.25, y ) ) * ( 0.8 + 0.4 * n );
    float d = abs( x ) / max( width, 1e-3 );
    if ( d >= 1.0 ) discard;
    float heat = ( 1.0 - d ) * ( 1.15 - y );
    vec3 color = vec3( 1.2, 0.26, 0.05 );
    color = mix( color, vec3( 1.9, 0.72, 0.16 ), smoothstep( 0.24, 0.3, heat ) );
    color = mix( color, vec3( 2.4, 1.95, 1.05 ), smoothstep( 0.58, 0.64, heat ) );
    gl_FragColor = vec4( color, smoothstep( 0.0, 0.14, 1.0 - d ) );
}
`

function createFlame() {
    const group = new THREE.Group()
    const time = { value: 0 }
    const geometry = new THREE.PlaneGeometry(1, 1)
    geometry.translate(0, 0.5, 0)
    const tongues = TONGUES.map(({ width, height, offset, seed }) => {
        const size = { value: new THREE.Vector2(width, height) }
        const material = new THREE.ShaderMaterial({
            name: 'campfire.flame',
            uniforms: { uTime: time, uSeed: { value: seed }, uSize: size },
            vertexShader: flameVertex,
            fragmentShader: flameFragment,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(offset[0], 0.05, offset[1])
        // The shader moves the card, so its bounds come from no box: it always draws.
        mesh.frustumCulled = false
        group.add(mesh)
        return { size, height, seed }
    })
    return { group, tongues, time }
}

// Moves the AO bake, the soft normals and the surface family onto a kit mesh, as
// island-look.js does for the island, so the mesh can take the island toon material.
function prepareSolid(mesh, family, soften) {
    const geometry = soften(mesh.geometry)
    const count = geometry.attributes.position.count
    const baked = geometry.attributes._ao
    if (baked) geometry.deleteAttribute('_ao')
    geometry.setAttribute('aoBake', baked ?? new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1))
    geometry.setAttribute('aSurface', new THREE.Uint8BufferAttribute(new Uint8Array(count).fill(family), 1))
    if (geometry !== mesh.geometry) mesh.geometry.dispose()
    mesh.geometry = geometry
}

// The coals glow in their baked colour. A slow noise over their world position brightens and
// dims patches of the bed, so the glow breathes across the coals, never as one blink.
function createEmberMaterial(time) {
    const material = new THREE.MeshBasicMaterial({ name: 'campfire.ember', vertexColors: true, color: new THREE.Color(EMBER_GAIN, EMBER_GAIN, EMBER_GAIN) })
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = time
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vEmberWorld;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvEmberWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vEmberWorld;')
            .replace(
                '#include <color_fragment>',
                '#include <color_fragment>\nvec3 emberP = vEmberWorld * 9.0;\ndiffuseColor.rgb *= 0.8 + 0.22 * sin( emberP.x + uTime * 2.1 ) * sin( emberP.z - uTime * 1.7 ) + 0.12 * sin( uTime * 5.3 + emberP.y * 3.0 );'
            )
    }
    material.customProgramCacheKey = () => 'campfire-ember'
    return material
}

// Swaps the kit materials: the lit parts take the island toon material, so they use the island
// program as it is. The coals take the ember glow.
function createHearth(kit, toon, time) {
    const ember = createEmberMaterial(time)
    const root = kit.scene
    root.traverse((node) => {
        if (!node.isMesh) return
        const source = node.material
        const family = toon.surface[FAMILY[source.name]]
        if (family === undefined) {
            node.material = ember
        } else {
            prepareSolid(node, family, toon.soften)
            node.material = toon.material
            node.castShadow = true
            node.receiveShadow = true
        }
        source.dispose()
    })
    return root
}

const sparkVertex = /* glsl */ `
attribute float aLife;
uniform float uScale;
varying float vLife;
void main() {
    vLife = aLife;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_PointSize = 0.06 * ( 1.0 - 0.6 * aLife ) * uScale / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
}
`

// A round spark that cools from yellow to red and fades as it rises.
const sparkFragment = /* glsl */ `
varying float vLife;
void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot( p, p );
    if ( r2 > 1.0 ) discard;
    vec3 color = mix( vec3( 2.2, 1.3, 0.4 ), vec3( 1.4, 0.3, 0.06 ), vLife );
    gl_FragColor = vec4( color, ( 1.0 - r2 ) * ( 1.0 - vLife ) );
}
`

function createSparks() {
    const position = new Float32Array(SPARKS * 3)
    const life = new Float32Array(SPARKS)
    const speed = new Float32Array(SPARKS)
    const reach = new Float32Array(SPARKS)
    const reset = (i, height = 0.25) => {
        position[i * 3] = (Math.random() - 0.5) * 0.3
        position[i * 3 + 1] = height
        position[i * 3 + 2] = (Math.random() - 0.5) * 0.3
        speed[i] = 0.6 + Math.random() * 0.8
        reach[i] = SPARK_HEIGHT * (0.45 + Math.random() * 0.55)
    }
    for (let i = 0; i < SPARKS; i += 1) reset(i, 0.25 + Math.random() * SPARK_HEIGHT * 0.6)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('aLife', new THREE.BufferAttribute(life, 1))
    const material = new THREE.ShaderMaterial({
        name: 'campfire.sparks',
        uniforms: { uScale: { value: 500 } },
        vertexShader: sparkVertex,
        fragmentShader: sparkFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    // The point size in pixels follows the drawing buffer height, as PointsMaterial does.
    const buffer = new THREE.Vector2()
    points.onBeforeRender = (renderer) => {
        material.uniforms.uScale.value = renderer.getDrawingBufferSize(buffer).y / 2
    }
    const update = (delta, time) => {
        for (let i = 0; i < SPARKS; i += 1) {
            position[i * 3] += Math.sin(time * 2.2 + i * 1.7) * 0.25 * delta
            position[i * 3 + 1] += speed[i] * delta
            position[i * 3 + 2] += Math.cos(time * 1.9 + i * 2.3) * 0.25 * delta
            life[i] = Math.min(1, position[i * 3 + 1] / reach[i])
            if (life[i] >= 1) reset(i)
        }
        geometry.attributes.position.needsUpdate = true
        geometry.attributes.aLife.needsUpdate = true
    }
    return { points, update }
}

// kit: the loaded campfire_kit.glb. toon: { material, surface, soften }, the island opaque toon
// material, SURFACE and softenGeometry. bounce: a Vector4 from the toon uniforms, where the
// fire writes its position and reach.
export function createCampfire({ position, kit, toon, bounce }) {
    const group = new THREE.Group()
    group.name = 'Campfire'
    group.position.copy(position)
    const flame = createFlame()
    const sparks = createSparks()
    group.add(createHearth(kit, toon, flame.time), flame.group, sparks.points)
    const glowSpot = { position: position.clone().add(new THREE.Vector3(0, 0.45, 0)), color: new THREE.Color(0xfca942).multiplyScalar(0.22), size: 1.0 }
    const centre = new THREE.Vector3(position.x, position.y + 0.6, position.z)
    bounce?.set(centre.x, centre.y, centre.z, BOUNCE_RADIUS)

    const update = (delta, time) => {
        flame.time.value = time
        flame.tongues.forEach(({ size, height, seed }) => {
            size.value.y = height * (1 + wobble(time, seed) * 0.14)
        })
        if (bounce) {
            // The light sways with the flame and its reach flickers, so the lit ground and the
            // seats breathe with the fire.
            bounce.x = centre.x + wobble(time * 0.6, 4) * 0.05
            bounce.z = centre.z + wobble(time * 0.6, 7) * 0.05
            bounce.w = BOUNCE_RADIUS * (1 + wobble(time, 9) * 0.1)
        }
        sparks.update(delta, time)
    }
    // The island look owns the toon material and disposes it.
    const dispose = () => {
        group.traverse((node) => {
            node.geometry?.dispose()
            if (node.material !== toon.material) node.material?.dispose()
        })
    }
    return { group, glowSpot, update, dispose }
}
