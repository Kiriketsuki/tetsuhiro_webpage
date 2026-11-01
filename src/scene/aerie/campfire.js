import * as THREE from 'three'

// The campfire from the earlier island, kept as a prop on the urban aerie lawn. It has no
// three.js light: its warmth reaches the toon island through one warm spill slot, so no
// lit material recompiles. A small glow sprite stands in for bloom.

const EMBER_COUNT = 28
const EMBER_HEIGHT = 2.4
// Flame tongues: crossed upright cards, each with a painted teardrop flame that flickers in
// the shader. width and height in metres, turn in radians about the vertical, and an
// offset from the hearth centre. Two tall tongues cross at the centre, and three short
// ones lean out around them, so the fire reads as layered flames, not as a cone.
const TONGUES = [
    { width: 0.62, height: 1.0, turn: 0, offset: [0, 0] },
    { width: 0.62, height: 0.95, turn: Math.PI / 2, offset: [0, 0] },
    { width: 0.42, height: 0.62, turn: 0.8, offset: [0.12, 0.06] },
    { width: 0.4, height: 0.55, turn: 2.3, offset: [-0.1, 0.08] },
    { width: 0.38, height: 0.5, turn: 4.0, offset: [0.02, -0.13] },
]
const STONES = 7
// The warm spill reach, three quarters of the earlier 2.6 m, so it shows no round pool.
const BOUNCE_RADIUS = 1.95
// Lawn search: candidate spots around this centre (GLB frame), in metres.
const SEARCH_CENTRE = new THREE.Vector2(4, -2)
const SEARCH_RADIUS = 9
const CLEAR_RADIUS = 1.1

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

const flameVertex = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

// A teardrop flame in the card UV, wide at the base and pointed at the tip. Two waves
// bend it sideways and move up the flame. The colour runs from a deep red rim through
// orange to a pale yellow core near the base. Linear colours above 1 keep the core bright
// after tone mapping.
const flameFragment = /* glsl */ `
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
void main() {
    float y = vUv.y;
    float bend = sin( y * 8.0 - uTime * 7.0 + uSeed ) * 0.6 + sin( y * 15.0 - uTime * 11.0 + uSeed * 2.3 ) * 0.4;
    float x = ( vUv.x - 0.5 ) * 2.0 + bend * 0.16 * y;
    float width = pow( 1.0 - y, 0.9 ) * ( 0.45 + 0.55 * smoothstep( 0.0, 0.28, y ) );
    float d = abs( x ) / max( width, 1e-3 );
    if ( d >= 1.0 ) discard;
    float core = 1.0 - d;
    vec3 color = mix( vec3( 1.1, 0.22, 0.05 ), vec3( 1.7, 0.62, 0.14 ), smoothstep( 0.0, 0.45, core ) );
    color = mix( color, vec3( 2.1, 1.7, 0.9 ), smoothstep( 0.5, 0.95, core ) * ( 1.0 - y ) );
    gl_FragColor = vec4( color, smoothstep( 0.0, 0.3, core ) * 0.95 );
}
`

function createFlame() {
    const group = new THREE.Group()
    const time = { value: 0 }
    const geometry = new THREE.PlaneGeometry(1, 1)
    geometry.translate(0, 0.5, 0)
    const materials = TONGUES.map(
        (_, i) =>
            new THREE.ShaderMaterial({
                name: 'campfire.flame',
                uniforms: { uTime: time, uSeed: { value: i * 1.9 } },
                vertexShader: flameVertex,
                fragmentShader: flameFragment,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
            })
    )
    const tongues = TONGUES.map(({ width, height, turn, offset }, i) => {
        const mesh = new THREE.Mesh(geometry, materials[i])
        mesh.scale.set(width, height, 1)
        mesh.position.set(offset[0], 0.06, offset[1])
        mesh.rotation.y = turn
        // Tall tongues draw last, so the short ones stay behind them.
        mesh.renderOrder = 2 - Math.min(i, 2)
        group.add(mesh)
        return { mesh, height }
    })
    return { group, tongues, time }
}

// A ring of stones and two crossed logs. They use flat basic colours, so they share the
// glow program and need no light. Their low-poly shapes give each face one tone.
function createHearth() {
    const group = new THREE.Group()
    const stone = new THREE.MeshBasicMaterial({ color: 0x4a443f })
    const wood = new THREE.MeshBasicMaterial({ color: 0x3a2418 })
    const rock = new THREE.DodecahedronGeometry(0.16, 0)
    for (let i = 0; i < STONES; i += 1) {
        const mesh = new THREE.Mesh(rock, stone)
        const angle = (i / STONES) * Math.PI * 2
        mesh.position.set(Math.cos(angle) * 0.45, 0.06, Math.sin(angle) * 0.45)
        mesh.rotation.set(i * 1.3, i * 0.7, i * 2.1)
        mesh.scale.set(1, 0.7, 1)
        group.add(mesh)
    }
    const log = new THREE.CylinderGeometry(0.06, 0.07, 0.8, 5)
    log.rotateZ(Math.PI / 2)
    ;[0.5, -0.6].forEach((turn) => {
        const mesh = new THREE.Mesh(log, wood)
        mesh.position.y = 0.08
        mesh.rotation.y = turn
        group.add(mesh)
    })
    return group
}

function createEmbers() {
    const position = new Float32Array(EMBER_COUNT * 3)
    const speed = new Float32Array(EMBER_COUNT)
    const reset = (i, height = 0.2) => {
        position[i * 3] = (Math.random() - 0.5) * 0.4
        position[i * 3 + 1] = height
        position[i * 3 + 2] = (Math.random() - 0.5) * 0.4
        speed[i] = 0.5 + Math.random() * 0.7
    }
    for (let i = 0; i < EMBER_COUNT; i += 1) reset(i, Math.random() * EMBER_HEIGHT)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    const material = new THREE.PointsMaterial({
        color: new THREE.Color(0xfca942).multiplyScalar(1.8),
        size: 0.05,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geometry, material)
    const update = (delta, time) => {
        for (let i = 0; i < EMBER_COUNT; i += 1) {
            position[i * 3] += Math.sin(time * 2 + i) * 0.2 * delta
            position[i * 3 + 1] += speed[i] * delta
            if (position[i * 3 + 1] > EMBER_HEIGHT) reset(i)
        }
        geometry.attributes.position.needsUpdate = true
    }
    return { points, update }
}

// bounce: a Vector4 from the toon uniforms. The fire writes its position and reach into it.
export function createCampfire({ position, bounce }) {
    const group = new THREE.Group()
    group.name = 'Campfire'
    group.position.copy(position)
    const flame = createFlame()
    const embers = createEmbers()
    group.add(createHearth(), flame.group, embers.points)
    const glowSpot = { position: position.clone().add(new THREE.Vector3(0, 0.45, 0)), color: new THREE.Color(0xfca942).multiplyScalar(0.22), size: 1.0 }
    bounce?.set(position.x, position.y + 0.6, position.z, BOUNCE_RADIUS)

    const update = (delta, time) => {
        flame.time.value = time
        flame.tongues.forEach(({ mesh, height }, i) => {
            mesh.scale.y = height * (1 + wobble(time, i * 1.7) * 0.14)
        })
        if (bounce) bounce.w = BOUNCE_RADIUS * (1 + wobble(time, 9) * 0.08)
        embers.update(delta, time)
    }
    const dispose = () => {
        group.traverse((node) => {
            node.geometry?.dispose()
            node.material?.dispose()
        })
    }
    return { group, glowSpot, update, dispose }
}
