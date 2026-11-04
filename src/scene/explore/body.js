import * as THREE from 'three'

// The placeholder Kinako (spec, The walker): a capsule body, a head with a snout, two ear
// cones, four legs and a tail, at the size of the final kit. E4 swaps in walker.glb. The parts
// merge into one mesh on the aerie toon material, so the walker costs one draw call, and its
// contact disc one more.
//
// Model space: +Z is forward and +Y is up. The origin sits on the ground under the body.

// The coat colours from the Walker design.
const OAT = 0xd9c59c
const RUST = 0xa8461c
const CREAM = 0xf1e8d4
// SURFACE.plain in toon-material.js.
const PLAIN = 0
// The body turns toward its travel at up to 540 degrees a second (spec, Movement).
const TURN = THREE.MathUtils.degToRad(540)
// The bob of the body at a walk, in metres, and the stride rate per metre a second.
const BOB = 0.014
const STRIDE = 8.5
// The disc of the contact shadow: its radius in metres and the darkness at its centre.
const SHADOW = { radius: 0.3, dark: 0.42, lift: 0.012 }

// Each part is a sphere or a cylinder, which the scene ships already, so the shared three
// chunk does not grow. A cone is a cylinder with a top radius of 0.
const part = (geometry, colour, { at = [0, 0, 0], turn = [0, 0, 0], size = [1, 1, 1] } = {}) => {
    geometry.scale(...size).rotateX(turn[0]).rotateY(turn[1]).rotateZ(turn[2]).translate(...at)
    const count = geometry.attributes.position.count
    const c = new THREE.Color(colour)
    const colours = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) colours.set([c.r, c.g, c.b], i * 3)
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    geometry.setAttribute('aoBake', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1))
    geometry.setAttribute('aSurface', new THREE.Uint8BufferAttribute(new Uint8Array(count).fill(PLAIN), 1))
    geometry.deleteAttribute('uv')
    return geometry
}

// Joins indexed parts that share one attribute layout into one geometry. A local merge keeps
// mergeGeometries, and the three.js core it pulls in, out of the shared three chunk.
function merge(parts) {
    const names = Object.keys(parts[0].attributes)
    const merged = new THREE.BufferGeometry()
    for (const name of names) {
        const first = parts[0].attributes[name]
        const array = new first.array.constructor(parts.reduce((n, g) => n + g.attributes[name].array.length, 0))
        let at = 0
        for (const g of parts) {
            array.set(g.attributes[name].array, at)
            at += g.attributes[name].array.length
        }
        merged.setAttribute(name, new THREE.BufferAttribute(array, first.itemSize, first.normalized))
    }
    const index = []
    let base = 0
    for (const g of parts) {
        for (const i of g.index.array) index.push(i + base)
        base += g.attributes.position.count
    }
    merged.setIndex(index)
    return merged
}

function kitGeometry() {
    const deg = THREE.MathUtils.degToRad
    const parts = [
        part(new THREE.SphereGeometry(1, 10, 8), OAT, { at: [0, 0.21, -0.02], size: [0.085, 0.09, 0.2] }),
        part(new THREE.SphereGeometry(0.09, 10, 7), OAT, { at: [0, 0.32, 0.17] }),
        part(new THREE.CylinderGeometry(0, 0.045, 0.09, 6), CREAM, { at: [0, 0.3, 0.27], turn: [deg(90), 0, 0] }),
        part(new THREE.CylinderGeometry(0, 0.04, 0.12, 4), RUST, { at: [0.05, 0.43, 0.15], turn: [0, 0, deg(-14)] }),
        part(new THREE.CylinderGeometry(0, 0.04, 0.12, 4), RUST, { at: [-0.05, 0.43, 0.15], turn: [0, 0, deg(14)] }),
        part(new THREE.CylinderGeometry(0, 0.055, 0.34, 7), RUST, { at: [0, 0.32, -0.27], turn: [deg(-125), 0, 0] }),
    ]
    for (const [x, z] of [[0.05, 0.1], [-0.05, 0.1], [0.05, -0.12], [-0.05, -0.12]]) {
        parts.push(part(new THREE.CylinderGeometry(0.024, 0.02, 0.16, 6), RUST, { at: [x, 0.08, z] }))
    }
    const merged = merge(parts)
    parts.forEach((geometry) => geometry.dispose())
    return merged
}

// A flat disc whose darkness falls off smoothly from the centre, in a warm dark brown, as the
// prop shadows in contact-shadows.js do.
function shadowDisc() {
    const material = new THREE.ShaderMaterial({
        name: 'walker.shadow',
        transparent: true,
        depthWrite: false,
        uniforms: { uDark: { value: SHADOW.dark }, uColour: { value: new THREE.Color(0x24160d) } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
        fragmentShader:
            'uniform float uDark; uniform vec3 uColour; varying vec2 vUv; void main() { float r = length( vUv - 0.5 ) * 2.0; gl_FragColor = vec4( uColour, uDark * ( 1.0 - smoothstep( 0.15, 1.0, r ) ) ); }',
    })
    const disc = new THREE.Mesh(new THREE.CircleGeometry(SHADOW.radius, 20).rotateX(-Math.PI / 2), material)
    disc.renderOrder = 1
    return disc
}

export function createWalkerBody(toonMaterial) {
    const group = new THREE.Group()
    group.name = 'walker'
    const mesh = new THREE.Mesh(kitGeometry(), toonMaterial)
    mesh.castShadow = false
    mesh.receiveShadow = true
    group.add(mesh)
    const shadow = shadowDisc()
    let heading = 0
    let phase = 0

    // feet: the ground point under the capsule. travel: the horizontal velocity.
    const update = (dt, feet, travel, onFloor, reduced) => {
        const speed = Math.hypot(travel.x, travel.z)
        if (speed > 0.05) {
            const goal = Math.atan2(travel.x, travel.z)
            const turn = THREE.MathUtils.euclideanModulo(goal - heading + Math.PI, Math.PI * 2) - Math.PI
            heading += THREE.MathUtils.clamp(turn, -TURN * dt, TURN * dt)
        }
        phase += dt * speed * STRIDE
        const bob = reduced || !onFloor ? 0 : Math.abs(Math.sin(phase)) * BOB * Math.min(1, speed / 2)
        group.position.set(feet.x, feet.y + bob, feet.z)
        group.rotation.y = heading
        shadow.position.set(feet.x, feet.y + SHADOW.lift, feet.z)
    }

    const setHeading = (angle) => {
        heading = angle
        group.rotation.y = angle
    }

    const dispose = () => {
        mesh.geometry.dispose()
        shadow.geometry.dispose()
        shadow.material.dispose()
    }

    return { group, shadow, update, setHeading, dispose }
}
