import * as THREE from 'three'
import { skills, branchOf, PALETTE } from '../../data/skills.js'
import { createSky } from './sky.js'
import { createStars } from './stars.js'
import { fitFov } from './framing.js'

// The skill sky that the telescope shows. Each skill is a star, each parent link a line,
// built from src/data/skills.js in its own THREE.Scene. A new skill needs no Blender edit.
// Stars, lines and labels are three draw calls. The stars light up in order along the
// parent links when the view opens.

const RADIUS = 100
const ARC = THREE.MathUtils.degToRad(58)
const BASE_ELEVATION = THREE.MathUtils.degToRad(12)
const STEP_ELEVATION = THREE.MathUtils.degToRad(9)
const VIEW_ELEVATION = THREE.MathUtils.degToRad(23)
const FOV = 50
const LABEL = { width: 512, height: 64 }
const REVEAL_SECONDS = 2.6
const LOOK_LIMIT = 0.35

const childrenOf = (id) => skills.filter((skill) => skill.parent === id)
const sizeOf = (skill) => 1 + childrenOf(skill.id).reduce((sum, child) => sum + sizeOf(child), 0)

// Places each tree in its own slice of the arc, children above their parent.
function layout() {
    const placed = []
    const roots = skills.filter((skill) => !skill.parent).sort((a, b) => sizeOf(b) - sizeOf(a))
    const total = roots.reduce((sum, root) => sum + sizeOf(root), 0)
    let start = -ARC / 2
    const place = (skill, from, width, depth, order) => {
        const azimuth = from + width / 2
        const elevation = BASE_ELEVATION + depth * STEP_ELEVATION
        const direction = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation))
        placed.push({ skill, position: direction.multiplyScalar(RADIUS), order })
        const kids = childrenOf(skill.id)
        const kidsTotal = kids.reduce((sum, kid) => sum + sizeOf(kid), 0)
        let offset = from
        kids.forEach((kid, i) => {
            const share = (width * sizeOf(kid)) / kidsTotal
            place(kid, offset, share, depth + 1, order + 1 + i * 0.25)
            offset += share
        })
    }
    roots.forEach((root) => {
        const width = (ARC * sizeOf(root)) / total
        place(root, start, width, 0, 0)
        start += width
    })
    return placed
}

const colorOf = (skill) => new THREE.Color(PALETTE[branchOf(skill)?.color] ?? PALETTE.ink).convertSRGBToLinear()

const starVertex = /* glsl */ `
attribute vec3 aColor;
attribute float aOrder;
uniform float uReveal;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vShow;
void main() {
    vShow = smoothstep( aOrder, aOrder + 0.8, uReveal );
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_PointSize = ( 10.0 + 8.0 * vShow ) * uPixelRatio;
}
`
const starFragment = /* glsl */ `
varying vec3 vColor;
varying float vShow;
void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot( p, p );
    float core = exp( -d * 9.0 );
    float halo = exp( -d * 2.5 ) * 0.35;
    gl_FragColor = vec4( vColor * 2.2 * ( core + halo ), ( core + halo ) * vShow );
}
`
const lineVertex = /* glsl */ `
attribute vec3 aColor;
attribute float aOrder;
uniform float uReveal;
varying vec3 vColor;
varying float vShow;
void main() {
    vShow = smoothstep( aOrder, aOrder + 0.8, uReveal );
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
const lineFragment = /* glsl */ `
varying vec3 vColor;
varying float vShow;
void main() {
    gl_FragColor = vec4( vColor * 0.8, 0.55 * vShow );
}
`
// Labels are camera-facing quads. Each corner moves out from its star in view space.
const labelVertex = /* glsl */ `
attribute vec3 aCentre;
attribute vec2 aCorner;
attribute float aOrder;
uniform float uReveal;
uniform vec2 uSize;
varying vec2 vUv;
varying float vShow;
void main() {
    vShow = smoothstep( aOrder + 0.4, aOrder + 1.2, uReveal );
    vUv = uv;
    vec4 view = modelViewMatrix * vec4( aCentre, 1.0 );
    view.xy += ( aCorner + vec2( 0.0, -0.9 ) ) * uSize;
    gl_Position = projectionMatrix * view;
}
`
const labelFragment = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying float vShow;
void main() {
    vec4 texel = texture2D( uMap, vUv );
    gl_FragColor = vec4( texel.rgb * 0.9, texel.a * vShow );
}
`

function labelAtlas(placed) {
    const canvas = document.createElement('canvas')
    canvas.width = LABEL.width
    canvas.height = LABEL.height * placed.length
    const ctx = canvas.getContext('2d')
    ctx.font = '600 30px "JetBrains Mono", ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    placed.forEach(({ skill }, i) => {
        ctx.fillStyle = PALETTE[branchOf(skill)?.color] ?? PALETTE.ink
        ctx.fillText(skill.name.toUpperCase(), LABEL.width / 2, LABEL.height * (i + 0.5))
    })
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

function starsGeometry(placed) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(placed.flatMap((p) => p.position.toArray()), 3))
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(placed.flatMap((p) => colorOf(p.skill).toArray()), 3))
    geometry.setAttribute('aOrder', new THREE.Float32BufferAttribute(placed.map((p) => p.order), 1))
    return geometry
}

function linesGeometry(placed) {
    const byId = new Map(placed.map((p) => [p.skill.id, p]))
    const positions = []
    const colors = []
    const orders = []
    placed.forEach((child) => {
        const parent = byId.get(child.skill.parent)
        if (!parent) return
        positions.push(...parent.position.toArray(), ...child.position.toArray())
        colors.push(...colorOf(parent.skill).toArray(), ...colorOf(child.skill).toArray())
        orders.push(child.order - 0.5, child.order - 0.5)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('aOrder', new THREE.Float32BufferAttribute(orders, 1))
    return geometry
}

function labelsGeometry(placed) {
    const centres = []
    const corners = []
    const uvs = []
    const orders = []
    const index = []
    placed.forEach((p, i) => {
        const v0 = 1 - (i + 1) / placed.length
        const v1 = 1 - i / placed.length
        ;[[-1, -1, 0, v0], [1, -1, 1, v0], [1, 1, 1, v1], [-1, 1, 0, v1]].forEach(([x, y, u, v]) => {
            centres.push(...p.position.toArray())
            corners.push(x, y)
            uvs.push(u, v)
            orders.push(p.order)
        })
        const b = i * 4
        index.push(b, b + 1, b + 2, b, b + 2, b + 3)
    })
    const geometry = new THREE.BufferGeometry()
    // three needs a position attribute to draw. The shader places the quads from aCentre.
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(centres, 3))
    geometry.setAttribute('aCentre', new THREE.Float32BufferAttribute(centres, 3))
    geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute(corners, 2))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setAttribute('aOrder', new THREE.Float32BufferAttribute(orders, 1))
    geometry.setIndex(index)
    return geometry
}

export function createConstellation({ pixelRatio = 1, small = false } = {}) {
    const placed = layout()
    const scene = new THREE.Scene()
    scene.name = 'SkillSky'
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 12000)
    const reveal = { value: 0 }
    const ratio = { value: pixelRatio }
    const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }

    const stars = new THREE.Points(
        starsGeometry(placed),
        new THREE.ShaderMaterial({ name: 'sky.skills', uniforms: { uReveal: reveal, uPixelRatio: ratio }, vertexShader: starVertex, fragmentShader: starFragment, ...additive })
    )
    const lines = new THREE.LineSegments(
        linesGeometry(placed),
        new THREE.ShaderMaterial({ name: 'sky.links', uniforms: { uReveal: reveal }, vertexShader: lineVertex, fragmentShader: lineFragment, ...additive })
    )
    const atlas = labelAtlas(placed)
    const labels = new THREE.Mesh(
        labelsGeometry(placed),
        new THREE.ShaderMaterial({
            name: 'sky.labels',
            uniforms: { uReveal: reveal, uMap: { value: atlas }, uSize: { value: new THREE.Vector2(10, 1.25) } },
            vertexShader: labelVertex,
            fragmentShader: labelFragment,
            transparent: true,
            depthWrite: false,
        })
    )
    ;[stars, lines, labels].forEach((object) => {
        object.frustumCulled = false
    })
    const sky = createSky()
    const field = createStars({ small, pixelRatio })
    scene.add(sky.mesh, field.points, lines, stars, labels)

    const centre = new THREE.Vector3(0, Math.sin(VIEW_ELEVATION), -Math.cos(VIEW_ELEVATION))
    const look = { x: 0, y: 0, fov: FOV }
    let baseFov = FOV
    const aim = () => {
        const yaw = -look.x
        const pitch = VIEW_ELEVATION + look.y
        camera.lookAt(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)))
        camera.fov = look.fov
        camera.updateProjectionMatrix()
    }
    aim()

    let revealing = null
    const open = () => {
        reveal.value = 0
        revealing = { t: 0 }
        Object.assign(look, { x: 0, y: 0, fov: baseFov })
        aim()
    }
    const maxOrder = Math.max(...placed.map((p) => p.order)) + 1.5
    const update = (delta, seconds) => {
        field.update(seconds)
        if (!revealing) return false
        revealing.t = Math.min(1, revealing.t + delta / REVEAL_SECONDS)
        reveal.value = revealing.t * maxOrder
        if (revealing.t >= 1) revealing = null
        return true
    }
    const showAll = () => {
        revealing = null
        reveal.value = maxOrder
    }
    // dx and dy are screen pixels. A drag turns the view a little, inside fixed limits.
    const pan = (dx, dy) => {
        const perPixel = THREE.MathUtils.degToRad(look.fov) / window.innerHeight
        look.x = THREE.MathUtils.clamp(look.x - dx * perPixel, -LOOK_LIMIT * 1.4, LOOK_LIMIT * 1.4)
        look.y = THREE.MathUtils.clamp(look.y + dy * perPixel, -LOOK_LIMIT, LOOK_LIMIT)
        aim()
    }
    const zoom = (factor) => {
        look.fov = THREE.MathUtils.clamp(look.fov / factor, baseFov * 0.5, baseFov * 1.25)
        aim()
    }
    // A portrait phone keeps the width of a 16:9 view, so the whole sky still fits.
    const resize = (aspect) => {
        camera.aspect = aspect
        baseFov = fitFov(FOV, aspect, 85)
        look.fov = baseFov
        aim()
    }
    const setPixelRatio = (value) => {
        ratio.value = value
        field.setPixelRatio(value)
    }
    const dispose = () => {
        ;[stars, lines, labels].forEach((object) => {
            object.geometry.dispose()
            object.material.dispose()
        })
        atlas.dispose()
        sky.dispose()
        field.dispose()
    }
    return { scene, camera, open, update, showAll, pan, zoom, resize, setPixelRatio, dispose, centre }
}
