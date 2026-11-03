import * as THREE from 'three'
import { createToonMaterial, createToonUniforms, SURFACE } from '../scene/aerie/toon-material.js'
import { createPipeline, TIERS } from '../scene/aerie/quality.js'
import { createLookControl, SITE_LOOK } from '../scene/aerie/look-options.js'

// Dev-only lab that renders the gate lantern with the island look: the toon material, the ink,
// the lens and the glow of the site pipeline. The gate in index.html shows the frames as
// images, so the lantern matches the island without three.js in the shell.
//
// Query options:
//   layer=branch|lantern|sprites|empty   what to draw
//   state=0|1                            0: dark lamp, summer leaves. 1: lit lamp, autumn.
//   bg=0|1                               a dark or a light flat background, for the alpha
//                                        matte that scripts/gate-matte.py takes from the pair.
// The page sets window.gateReady once the frame is on the canvas.

const params = new URLSearchParams(location.search)
const layer = params.get('layer') ?? 'branch'
const lit = params.get('state') === '1'
const light = params.get('bg') === '1'

// A small seeded random, so every render places the leaves the same way.
let seed = 20261103
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

const color = (hex) => new THREE.Color(hex)
const LANTERN = new THREE.Vector3(0, -0.13, 0)
const HOOK = new THREE.Vector3(0, 0.205, 0)

// The radius of the paper body at height y, from -0.16 to 0.16 about its centre.
const bodyRadius = (y) => 0.056 + 0.094 * Math.pow(Math.cos((y / 0.16) * (Math.PI / 2)), 0.7)

function paint(geometry, at) {
    const position = geometry.attributes.position
    const colors = new Float32Array(position.count * 3)
    const c = new THREE.Color()
    const p = new THREE.Vector3()
    for (let i = 0; i < position.count; i++) {
        p.fromBufferAttribute(position, i)
        at(p, c, i)
        c.toArray(colors, i * 3)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geometry
}

function surface(geometry, family) {
    geometry.setAttribute('aSurface', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(family), 1))
    return geometry
}

// A tube that thins from r0 to r1 along a curve.
function taperedTube(curve, r0, r1, segments = 48, radial = 10) {
    const geometry = new THREE.TubeGeometry(curve, segments, 1, radial, false)
    const position = geometry.attributes.position
    const p = new THREE.Vector3()
    for (let s = 0; s <= segments; s++) {
        const t = s / segments
        const centre = curve.getPointAt(t)
        const r = THREE.MathUtils.lerp(r0, r1, t)
        for (let k = 0; k <= radial; k++) {
            const i = s * (radial + 1) + k
            p.fromBufferAttribute(position, i).sub(centre).multiplyScalar(r).add(centre)
            position.setXYZ(i, p.x, p.y, p.z)
        }
    }
    geometry.computeVertexNormals()
    return geometry
}

// The maple outline from the 2D gate art, tip up, about 0.1 m tall.
const MAPLE = [[0, 0], [6, -4], [20, -2], [17, -8], [30, -16], [24, -18], [27, -27], [17, -24], [16, -30], [9, -24], [10, -38], [4, -34], [0, -45], [-4, -34], [-10, -38], [-9, -24], [-16, -30], [-17, -24], [-27, -27], [-24, -18], [-30, -16], [-17, -8], [-20, -2], [-6, -4]]

function leafGeometry(tone, curl) {
    const shape = new THREE.Shape(MAPLE.map(([x, y]) => new THREE.Vector2(x * 0.0022, -y * 0.0022)))
    const geometry = new THREE.ShapeGeometry(shape, 6)
    const position = geometry.attributes.position
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i)
        const y = position.getY(i)
        // The leaf cups across its width and droops toward the tip.
        position.setZ(i, curl * (x * x * 9 - y * 0.25 + y * y * 1.6))
    }
    geometry.computeVertexNormals()
    paint(geometry, (p, c) => {
        const t = THREE.MathUtils.clamp(p.y / 0.1, 0, 1)
        c.copy(tone.base).lerp(tone.tip, t)
    })
    return surface(geometry, SURFACE.foliage)
}

const SUMMER = [
    { base: color(0x3e5a32), tip: color(0x6f8f4a) },
    { base: color(0x4a6638), tip: color(0x86a05a) },
    { base: color(0x354f2e), tip: color(0x5e7d44) },
]
const AUTUMN = [
    { base: color(0xb8460c), tip: color(0xf0a020) },
    { base: color(0x9e2410), tip: color(0xe8601a) },
    { base: color(0xc06010), tip: color(0xf6c040) },
    { base: color(0x8e1c2a), tip: color(0xd8443c) },
]

function buildBranch(material) {
    const group = new THREE.Group()
    const main = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.95, 0.27, -0.05),
        new THREE.Vector3(-0.45, 0.2, 0.02),
        new THREE.Vector3(-0.1, 0.232, 0.03),
        new THREE.Vector3(0.35, 0.25, 0),
        new THREE.Vector3(0.95, 0.32, -0.08),
    ])
    const bark = (p, c) => {
        const n = 0.5 + 0.5 * Math.sin(p.x * 23 + Math.sin(p.x * 61) * 0.6)
        c.copy(color(0x6e5038)).lerp(color(0x9a7650), n * 0.6)
    }
    const add = (geometry) => group.add(new THREE.Mesh(surface(paint(geometry, bark), SURFACE.bark), material))
    add(taperedTube(main, 0.042, 0.016, 96, 12))
    const twigs = []
    for (const [t, dx, dy, dz] of [[0.1, -0.06, 0.12, 0.04], [0.24, 0.05, -0.1, 0.06], [0.38, 0.09, 0.1, -0.03], [0.62, 0.08, -0.11, 0.05], [0.72, 0.1, 0.12, 0.03], [0.86, 0.1, 0.06, -0.02]]) {
        const a = main.getPointAt(t)
        const b = a.clone().add(new THREE.Vector3(dx * 0.6, dy * 0.6, dz))
        const end = a.clone().add(new THREE.Vector3(dx, dy, dz))
        const twig = new THREE.QuadraticBezierCurve3(a, b, end)
        add(taperedTube(twig, 0.012, 0.004, 16, 8))
        twigs.push(twig)
    }
    return { group, main, twigs }
}

function buildLeaves(material, branch, palette) {
    const group = new THREE.Group()
    const spots = []
    branch.twigs.forEach((twig) => [0.45, 0.75, 1].forEach((t) => spots.push(twig.getPointAt(t))))
    for (const t of [0.04, 0.18, 0.3, 0.44, 0.56, 0.66, 0.8, 0.93]) spots.push(branch.main.getPointAt(t))
    // No leaf in front of the lantern hook.
    const free = spots.filter((p) => Math.abs(p.x - HOOK.x) > 0.07)
    free.forEach((p, i) => {
        const tone = palette[i % palette.length]
        const leaf = new THREE.Mesh(leafGeometry(tone, 0.6 + rnd() * 0.8), material)
        const hang = rnd() < 0.55
        leaf.position.copy(p)
        leaf.rotation.set(
            (hang ? -0.4 : 0.5) + (rnd() - 0.5) * 0.9,
            (rnd() - 0.5) * 1.6,
            (hang ? Math.PI : 0) + (rnd() - 0.5) * 1.9,
        )
        leaf.scale.setScalar(0.85 + rnd() * 0.35)
        group.add(leaf)
    })
    return group
}

// Washi paper: short fine fibres on white. The map multiplies the paper colour, so the paper
// keeps a fine, sharp grain at any size. Without it the paper was one smooth gradient and read as
// out of focus. A soft mottle read as smudges, so the paper has none.
function washiTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1024
    const g = canvas.getContext('2d')
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 1024, 1024)
    g.lineCap = 'round'
    for (let i = 0; i < 1800; i++) {
        const x = rnd() * 1024
        const y = rnd() * 1024
        const a = rnd() * Math.PI
        const l = 8 + rnd() * 46
        g.strokeStyle = `rgba(110,70,40,${0.06 + rnd() * 0.1})`
        g.lineWidth = 0.6 + rnd() * 0.9
        g.beginPath()
        g.moveTo(x, y)
        g.quadraticCurveTo(x + Math.cos(a + 0.4) * l * 0.5, y + Math.sin(a + 0.4) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l)
        g.stroke()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(3, 1.2)
    texture.anisotropy = 8
    return texture
}

function buildLantern(toon, litPaper, paperToon) {
    const group = new THREE.Group()
    const seamBasic = new THREE.MeshBasicMaterial({ vertexColors: true })
    const dark = (hex) => (geometry) => paint(geometry, (p, c) => c.set(hex))
    const profile = []
    for (let i = 0; i <= 48; i++) {
        const y = -0.16 + (i / 48) * 0.32
        profile.push(new THREE.Vector2(bodyRadius(y), y * 1.12))
    }
    const body = new THREE.LatheGeometry(profile, 128)
    const view = new THREE.Vector3(0, 0.05, 1).normalize()
    const n = new THREE.Vector3()
    const normals = body.attributes.normal
    paint(body, (p, c, i) => {
        if (!litPaper) {
            c.set(0xb4502a)
            return
        }
        // Lit paper: the flame shows through, brightest where the paper faces the camera at
        // mid height, deep orange at the rim and the ends.
        n.fromBufferAttribute(normals, i)
        const facing = Math.max(0, n.dot(view))
        const mid = Math.max(0, 1 - Math.pow(Math.abs(p.y) / 0.18, 2))
        const heat = Math.pow(facing, 1.4) * (0.35 + 0.65 * mid)
        c.copy(color(0x9a3014)).lerp(color(0xf0781e), Math.min(1, heat * 1.5)).lerp(color(0xffdc96), Math.max(0, heat - 0.5) * 1.5)
    })
    body.translate(LANTERN.x, LANTERN.y, LANTERN.z)
    group.add(new THREE.Mesh(body, litPaper ?? paperToon))

    // The seams where the paper strips meet: thin lines a shade darker than the paper.
    const seamTone = dark(litPaper ? 0xc8662a : 0x8a3420)
    for (let k = 0; k < 16; k++) {
        const angle = (k / 16) * Math.PI * 2
        const points = profile.map((v) => new THREE.Vector3(Math.cos(angle) * (v.x + 0.0005), v.y, Math.sin(angle) * (v.x + 0.0005)))
        const seam = seamTone(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.0008, 4, false))
        seam.translate(LANTERN.x, LANTERN.y, LANTERN.z)
        group.add(new THREE.Mesh(seam, litPaper ? seamBasic : toon))
    }

    // The bamboo ribs.
    const ribTone = dark(litPaper ? 0x7a3218 : 0x5a2416)
    for (let i = 1; i < 10; i++) {
        const y = -0.16 + (i / 10) * 0.32
        const rib = ribTone(new THREE.TorusGeometry(bodyRadius(y) + 0.001, 0.0018, 6, 64))
        rib.rotateX(Math.PI / 2)
        rib.translate(LANTERN.x, LANTERN.y + y * 1.12, LANTERN.z)
        group.add(new THREE.Mesh(litPaper ? rib : surface(rib, SURFACE.wood), toon))
    }
    // Brass bands, which the toon material shades through its metal matcap.
    const cap = (y, r, h, hex = 0x9a7440) => {
        const geometry = dark(hex)(new THREE.CylinderGeometry(r, r * 1.04, h, 32))
        geometry.translate(LANTERN.x, LANTERN.y + y, LANTERN.z)
        group.add(new THREE.Mesh(surface(geometry, SURFACE.metal), toon))
    }
    cap(0.19, 0.064, 0.026)
    cap(-0.19, 0.064, 0.026)
    cap(0.211, 0.042, 0.016, 0x7a5a32)
    cap(0.224, 0.016, 0.012, 0xb08a4a)

    const cord = dark(0x24160e)(new THREE.CylinderGeometry(0.0028, 0.0028, HOOK.y - (LANTERN.y + 0.228), 6))
    cord.translate(0, (HOOK.y + LANTERN.y + 0.228) / 2, 0)
    group.add(new THREE.Mesh(cord, toon))
    const ring = dark(0x3a2618)(new THREE.TorusGeometry(0.012, 0.0028, 6, 20))
    ring.translate(HOOK.x, HOOK.y, HOOK.z)
    group.add(new THREE.Mesh(ring, toon))

    // The red tassel.
    const knot = dark(0xb02a22)(new THREE.SphereGeometry(0.013, 16, 12))
    knot.translate(LANTERN.x, LANTERN.y - 0.218, LANTERN.z)
    group.add(new THREE.Mesh(surface(knot, SURFACE.fabric), toon))
    for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2
        const length = 0.11 + rnd() * 0.03
        const strand = new THREE.CylinderGeometry(0.0022, 0.0016, length, 4)
        strand.translate(0, -length / 2, 0)
        strand.rotateZ(Math.cos(a) * 0.12)
        strand.rotateX(Math.sin(a) * 0.12)
        strand.translate(LANTERN.x + Math.cos(a) * 0.006, LANTERN.y - 0.223, LANTERN.z + Math.sin(a) * 0.006)
        paint(strand, (p, c) => c.copy(color(0xc8342a)).lerp(color(0x6e141a), THREE.MathUtils.clamp((LANTERN.y - 0.228 - p.y) / 0.13, 0, 1)))
        group.add(new THREE.Mesh(surface(strand, SURFACE.fabric), toon))
    }
    return group
}

// Single autumn leaves in a row, for the leaves that fall when the island is ready.
function buildSprites(material) {
    const group = new THREE.Group()
    AUTUMN.forEach((tone, i) => {
        const leaf = new THREE.Mesh(leafGeometry(tone, 0.9), material)
        leaf.position.set(-0.36 + i * 0.24, -0.05, 0)
        leaf.rotation.set(0.35, (i - 1.5) * 0.35, (i % 2 ? 0.4 : -0.3))
        leaf.scale.setScalar(1.6)
        group.add(leaf)
    })
    return group
}

const canvas = document.getElementById('lab')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true })
renderer.toneMapping = THREE.NoToneMapping
renderer.outputColorSpace = THREE.LinearSRGBColorSpace
renderer.setSize(innerWidth, innerHeight)

const scene = new THREE.Scene()
scene.background = light ? new THREE.Color(0.18, 0.18, 0.18) : new THREE.Color(0, 0, 0)
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 40)
camera.position.set(0, -0.2, 1.6)
camera.lookAt(0, -0.07, 0)

const uniforms = createToonUniforms({
    moonDirection: new THREE.Vector3(0.55, 0.75, 0.45),
    bounces: lit ? [{ x: LANTERN.x, y: LANTERN.y, z: LANTERN.z + 0.05, radius: 0.55 }] : [],
    warmStrength: 2.2,
})
const toon = createToonMaterial(uniforms)
// The msaa4 tier: the ink and the lens, but no glow pass. The glow pass put a soft halo on the
// bright paper edge, and the gate draws its own glow in CSS.
const pipeline = createPipeline({ renderer, scene, camera, tier: TIERS[1] })
createLookControl(uniforms).apply(SITE_LOOK, pipeline.grade.uniforms)
// The gate sky has no vignette, and a vignette would break the matte.
pipeline.grade.uniforms.uVignette.value = 0
pipeline.grade.uniforms.uFocus.value = camera.position.distanceTo(LANTERN)
// A deeper sharp slab than the island stops use, so the whole lantern, front to back, stays in
// focus. The branch ends still soften.
pipeline.grade.uniforms.uLensBand.value = 0.22

if (layer === 'branch' || layer === 'all') {
    const branch = buildBranch(toon)
    scene.add(branch.group, buildLeaves(toon, branch, lit ? AUTUMN : SUMMER))
}
if (layer === 'lantern' || layer === 'all') {
    const washi = washiTexture()
    const paper = lit ? new THREE.MeshBasicMaterial({ vertexColors: true, map: washi, side: THREE.DoubleSide }) : null
    // The map changes the shader, so the unlit paper needs its own program key.
    const paperToon = createToonMaterial(uniforms, { map: washi }, { key: 'aerie-toon-v3-map' })
    scene.add(buildLantern(toon, paper, paperToon))
}
if (layer === 'sprites') scene.add(buildSprites(toon))

renderer.compileAsync(scene, camera).then(() => {
    pipeline.render()
    window.gateReady = true
})
