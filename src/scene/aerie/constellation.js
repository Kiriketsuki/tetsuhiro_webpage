import * as THREE from 'three'
import { skills, branches, branchOf, PALETTE } from '../../data/skills.js'
import { createNebula } from './skill-nebula.js'
import { figures, smooth } from './constellation-figures.js'
import { createSkyOverlay } from './sky-overlay.js'

// The skill sky that the telescope shows. Each skill branch is a named constellation from
// constellation-figures.js, each skill a star in it, over a quiet nebula from skill-nebula.js.
// The figure lines and the parent links from src/data/skills.js draw in from the root star
// outward, and a soft drawing of the figure fades in behind them. The skills marked showOff
// are the big stars with spikes. A tap on a figure flies the view to it and dims the rest,
// and a tap on a star opens a card on what I did with that skill. Stars, lines and figure
// art are three draw calls in their own THREE.Scene. The names, titles and cards are HTML
// from sky-overlay.js. A portrait screen gets a taller arrangement of the same figures.

const RADIUS = 100
const FOV = 50
const VIEW_ELEVATION = { wide: 23, tall: 28 }
const REVEAL_SECONDS = 4.5
const FOCUS_SECONDS = 0.9
const LOOK_LIMIT = { x: 0.75, y: 0.5 }
// The pan turns the nebula and its stars by only this part of the camera turn, so
// they read as far behind the constellations.
const BACKDROP = 0.3
// The lines stop this far short of each star, so the star glow stays round.
const GAP = 1.2
const STAR_SIZE = { bright: 46, skill: 30, figure: 14 }
// The pieces a curved line between two stars is drawn in.
const CURVE_STEPS = 8
// Lantern fills in each branch colour with the gold of an old star chart for the grid
// and the names, over a dark plum and teal sky that stays behind the figures.
const LOOK = {
    deep: 0x060515,
    clouds: [0x4a2758, 0x1c5060, 0x8a4630],
    cloudAmount: 0.17,
    gold: 0xe2bd78,
    grid: 0.045,
    whiten: 0.2,
}

const rad = THREE.MathUtils.degToRad

// The fitFov rule from framing.js: a screen narrower than 16:9 keeps the width of a
// 16:9 view, up to 85 degrees tall. It is a copy, because an import of a scene module
// would merge the scene chunk with this lazy chunk and break the size budget's count.
const fitFov = (aspect) => {
    const wide = Math.atan(Math.tan(rad(FOV / 2)) * (16 / 9))
    return aspect >= 16 / 9 ? FOV : Math.min(85, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(wide) / aspect)))
}
const branchColor = (branch) => new THREE.Color(PALETTE[branch.color] ?? PALETTE.ink)

// A point of a figure on the sky. x and y run along the tangent plane at the figure
// centre, so the stars and the flat art quads line up exactly from the camera.
const toSky = ([az, el, scale], x, y) => {
    const a = rad(az)
    const e = rad(el)
    const ahead = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e))
    const right = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
    const up = new THREE.Vector3(-Math.sin(a) * Math.sin(e), Math.cos(e), Math.cos(a) * Math.sin(e))
    return ahead.addScaledVector(right, rad(x * scale)).addScaledVector(up, rad(y * scale)).multiplyScalar(RADIUS)
}

// The figure points of one constellation. A skill that the figure does not place yet
// sits in a row under the figure, so a new skill shows before its figure has a spot.
function pointsOf(figure, members) {
    const points = { ...figure.stars }
    members
        .filter((skill) => !points[skill.id])
        .forEach((skill, i) => {
            points[skill.id] = [(i - 1) * 5, -12]
        })
    return points
}

// The square around a figure's stars and art, in figure units.
function boxOf(figure, points) {
    const lines = [...figure.art, ...(figure.bands ?? []).map((band) => band.slice(1)), Object.values(points).flat()]
    const xs = lines.flatMap((line) => line.filter((_, i) => i % 2 === 0))
    const ys = lines.flatMap((line) => line.filter((_, i) => i % 2 === 1))
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    return { cx, cy, low: Math.min(...ys), half: Math.max(Math.max(...xs) - cx, Math.max(...ys) - cy) + 1.5 }
}

// The constellations in reveal order: the biggest branch first.
const constellations = branches
    .filter((branch) => figures[branch.id])
    .map((branch) => {
        const figure = figures[branch.id]
        const members = skills.filter((skill) => skill.branch === branch.id)
        const points = pointsOf(figure, members)
        return { branch, figure, members, points, box: boxOf(figure, points) }
    })
    .sort((a, b) => b.members.length - a.members.length)

// Reveal orders for one figure: steps out from its root stars along every line.
function ordersOf(points, links, roots, start) {
    const depth = new Map(roots.map((key) => [key, 0]))
    const queue = [...roots]
    while (queue.length) {
        const key = queue.shift()
        links.forEach(([a, b]) => {
            const next = a === key ? b : b === key ? a : null
            if (next && !depth.has(next)) {
                depth.set(next, depth.get(key) + 1)
                queue.push(next)
            }
        })
    }
    const last = Math.max(0, ...depth.values()) + 1
    return Object.fromEntries(Object.keys(points).map((key) => [key, start + (depth.get(key) ?? last) * 0.45]))
}

// Everything that depends on the arrangement: star, line, art and label placements, and
// each figure's centre and size for the tap focus.
function layout(tall) {
    const stars = []
    const lines = []
    const arts = []
    const labels = []
    const targets = []
    const placed = new Map()
    constellations.forEach(({ branch, figure, members, points, box }, k) => {
        const at = tall ? figure.tall : figure.at
        const color = branchColor(branch)
        const member = (key) => members.find((skill) => skill.id === key)
        const parentLinks = members.filter((skill) => member(skill.parent)).map((skill) => [skill.parent, skill.id, 0])
        const extra = (figure.edges ?? '').split(' ').filter(Boolean)
        const links = [...parentLinks, ...extra.map((pair) => [...pair.split('-'), 1])]
        const roots = members.filter((skill) => !member(skill.parent)).map((skill) => skill.id)
        const start = 0.4 + k * 0.8
        const orders = ordersOf(points, links, roots, start)
        const position = (key) => toSky(at, ...points[key])
        Object.keys(points).forEach((key) => {
            const skill = member(key)
            const size = skill ? (skill.showOff ? STAR_SIZE.bright : STAR_SIZE.skill) : STAR_SIZE.figure
            stars.push({ position: position(key), color, order: orders[key], size, figure: k })
            if (skill) {
                placed.set(key, { position: position(key), order: orders[key], color })
                labels.push({ position: position(key), order: orders[key] + 0.3, figure: k, id: key })
            }
        })
        // A figure's curve chain draws as short pieces along one smooth curve, so its stars
        // trace the body. The pieces only stop short of a star at the chain's stars.
        const chain = figure.curve ?? []
        const onCurve = (a, b) => chain.some((key, i) => i > 0 && [a, b].includes(key) && [a, b].includes(chain[i - 1]))
        links
            .filter(([a, b]) => !onCurve(a, b))
            .forEach(([a, b, kind]) => {
                const [from, to] = orders[a] <= orders[b] ? [a, b] : [b, a]
                lines.push({ from: position(from), to: position(to), color, order: orders[from] + 0.2, kind, figure: k })
            })
        const path = chain.length > 1 ? smooth(chain.flatMap((key) => points[key]), CURVE_STEPS) : []
        chain.slice(1).forEach((key, i) => {
            const from = chain[i]
            const kind = member(key)?.parent === from || member(from)?.parent === key ? 0 : 1
            for (let s = 0; s < CURVE_STEPS; s += 1) {
                const j = (i * CURVE_STEPS + s) * 2
                lines.push({
                    from: toSky(at, path[j], path[j + 1]),
                    to: toSky(at, path[j + 2], path[j + 3]),
                    color,
                    order: THREE.MathUtils.lerp(orders[from], orders[key], s / CURVE_STEPS) + 0.2,
                    kind,
                    figure: k,
                    trim: [s === 0 ? GAP : 0, s === CURVE_STEPS - 1 ? GAP : 0],
                })
            }
        })
        arts.push({
            corners: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => toSky(at, box.cx + x * box.half, box.cy + y * box.half)),
            order: start,
            figure: k,
        })
        const title = (tall && figure.tallTitle) || figure.title || [box.cx, box.low - 3]
        labels.push({ position: toSky(at, ...title), order: start + 1.2, figure: k, title: k })
        targets.push({ centre: toSky(at, box.cx, box.cy).normalize(), half: rad(box.half * at[2]) })
    })
    // Links to a parent in another constellation, as faint dashed lines between the figures.
    skills.forEach((skill) => {
        const child = placed.get(skill.id)
        const parent = placed.get(skill.parent)
        if (!child || !parent || branchOf(skill) === branchOf(skills.find((s) => s.id === skill.parent))) return
        lines.push({ from: parent.position, to: child.position, color: parent.color, order: Math.max(parent.order, child.order) + 0.5, kind: 2, figure: -1 })
    })
    return { stars, lines, arts, labels, targets }
}

// Shared by every part: a part of a figure that the tap focus has not picked dims.
const DIM = /* glsl */ `
uniform float uFocus;
uniform float uDim;
float dimOf( float figure ) {
    return 1.0 - uDim * 0.75 * step( 0.5, abs( figure - uFocus ) );
}
`
const starVertex = /* glsl */ `
attribute vec3 aColor;
attribute float aOrder;
attribute float aSize;
attribute float aFigure;
uniform float uReveal;
uniform float uPixelRatio;
uniform float uTime;
${DIM}
varying vec3 vColor;
varying float vShow;
varying float vBig;
void main() {
    float lit = smoothstep( aOrder, aOrder + 0.5, uReveal );
    // A short flare as each star lights.
    float flare = exp( -pow( ( uReveal - aOrder - 0.4 ) * 3.0, 2.0 ) );
    vShow = ( 0.15 + 0.85 * lit ) * dimOf( aFigure );
    vColor = aColor * ( 1.0 + flare * 1.5 );
    vBig = step( 40.0, aSize );
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    float twinkle = 1.0 + 0.06 * sin( uTime * 1.7 + aOrder * 9.0 );
    gl_PointSize = aSize * ( 0.55 + 0.45 * lit + 0.4 * flare ) * twinkle * uPixelRatio;
}
`
const starFragment = /* glsl */ `
uniform float uWhiten;
varying vec3 vColor;
varying float vShow;
varying float vBig;
void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot( p, p );
    float core = exp( -d * 70.0 );
    float halo = exp( -d * 9.0 ) * 0.45 + exp( -d * 2.5 ) * 0.14;
    vec2 a = abs( p );
    float spikes = vBig * ( exp( -a.x * 45.0 ) * ( 1.0 - a.y ) + exp( -a.y * 45.0 ) * ( 1.0 - a.x ) ) * 0.5;
    vec3 tint = mix( vColor, vec3( 1.0 ), uWhiten );
    vec3 color = mix( tint, vec3( 1.0 ), core ) * ( core * 2.0 + halo + spikes * vShow );
    gl_FragColor = vec4( color * vShow * 1.6, 1.0 );
}
`
// Each line is a quad that the vertex shader widens on the screen. position is one end,
// aEnd the other, aLine.x the place along it (0 or 1), aLine.y the side and aLine.z its length.
const lineVertex = /* glsl */ `
attribute vec3 aEnd;
attribute vec3 aLine;
attribute vec3 aColor;
attribute float aOrder;
attribute float aKind;
attribute float aFigure;
uniform float uReveal;
uniform float uAspect;
uniform float uWidth;
${DIM}
varying vec3 vColor;
varying vec3 vLine;
varying float vKind;
varying float vDrawn;
void main() {
    vec4 a = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    vec4 b = projectionMatrix * modelViewMatrix * vec4( aEnd, 1.0 );
    vec2 along = normalize( ( b.xy / b.w - a.xy / a.w ) * vec2( uAspect, 1.0 ) );
    vec4 p = mix( a, b, aLine.x );
    p.xy += vec2( -along.y / uAspect, along.x ) * aLine.y * uWidth * p.w;
    gl_Position = p;
    vDrawn = smoothstep( aOrder, aOrder + 0.7, uReveal );
    vColor = aColor * dimOf( aFigure );
    vLine = aLine;
    vKind = aKind;
}
`
const lineFragment = /* glsl */ `
varying vec3 vColor;
varying vec3 vLine;
varying float vKind;
varying float vDrawn;
void main() {
    float side = vLine.y * vLine.y;
    float core = exp( -side * 14.0 );
    float glow = exp( -side * 3.0 ) * 0.35;
    float shown = 1.0 - smoothstep( vDrawn - 0.03, vDrawn, vLine.x );
    // A bright spark runs at the drawing end while the line draws in.
    float spark = exp( -pow( ( vLine.x - vDrawn ) * vLine.z * 0.7, 2.0 ) ) * step( 0.001, vDrawn ) * step( vDrawn, 0.999 );
    float dash = vKind > 1.5 ? step( 0.5, fract( vLine.x * vLine.z * 0.4 ) ) : 1.0;
    float strength = vKind < 0.5 ? 1.0 : ( vKind < 1.5 ? 0.5 : 0.3 );
    vec3 color = vColor * ( core + glow ) * strength * dash * shown + vec3( 1.0 ) * spark * core * 1.5;
    gl_FragColor = vec4( color, 1.0 );
}
`
const artVertex = /* glsl */ `
attribute float aOrder;
attribute float aFigure;
uniform float uReveal;
${DIM}
varying vec2 vUv;
varying float vShow;
void main() {
    vShow = smoothstep( aOrder, aOrder + 2.0, uReveal ) * dimOf( aFigure );
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
const artFragment = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying float vShow;
void main() {
    vec4 texel = texture2D( uMap, vUv );
    gl_FragColor = vec4( texel.rgb * texel.a * vShow * 0.5, 1.0 );
}
`
// The figure drawings, one square tile per constellation, in the branch colour.
function artAtlas(tile) {
    const canvas = document.createElement('canvas')
    canvas.width = tile * constellations.length
    canvas.height = tile
    const ctx = canvas.getContext('2d')
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    constellations.forEach(({ branch, figure, box }, k) => {
        const scale = tile / (2 * box.half)
        const path = (line) => {
            ctx.beginPath()
            for (let i = 0; i < line.length; i += 2) {
                ctx.lineTo(k * tile + tile / 2 + (line[i] - box.cx) * scale, tile / 2 - (line[i + 1] - box.cy) * scale)
            }
        }
        ctx.strokeStyle = ctx.fillStyle = ctx.shadowColor = PALETTE[branch.color]
        ctx.shadowBlur = tile * 0.025
        ;(figure.bands ?? []).forEach(([width, ...line]) => {
            path(line)
            ctx.globalAlpha = 0.16
            ctx.lineWidth = width * scale
            ctx.stroke()
            ctx.globalAlpha = 0.9
            ctx.lineWidth = tile * 0.005
            ctx.stroke()
        })
        figure.art.forEach((line) => {
            path(line)
            if (line[0] === line[line.length - 2] && line[1] === line[line.length - 1]) {
                ctx.globalAlpha = 0.14
                ctx.fill()
            }
            ctx.globalAlpha = 0.9
            ctx.lineWidth = tile * 0.005
            ctx.stroke()
        })
        ctx.globalAlpha = 1
    })
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

// One geometry from per-quad or per-point values. Each entry of `values` holds one array
// per vertex attribute, and `quads` adds the two triangles of every four vertices.
function geometryOf(values, count, quads) {
    const geometry = new THREE.BufferGeometry()
    Object.entries(values).forEach(([name, list]) => geometry.setAttribute(name, new THREE.Float32BufferAttribute(list, list.length / count)))
    if (quads) geometry.setIndex(Array.from({ length: count / 4 }, (_, i) => [0, 1, 2, 0, 2, 3].map((j) => i * 4 + j)).flat())
    return geometry
}

const QUAD = [[-1, -1], [1, -1], [1, 1], [-1, 1]]

function starsGeometry(stars) {
    return geometryOf(
        {
            position: stars.flatMap((s) => s.position.toArray()),
            aColor: stars.flatMap((s) => s.color.toArray()),
            aOrder: stars.map((s) => s.order),
            aSize: stars.map((s) => s.size),
            aFigure: stars.map((s) => s.figure),
        },
        stars.length
    )
}

function linesGeometry(lines) {
    const values = { position: [], aEnd: [], aLine: [], aColor: [], aOrder: [], aKind: [], aFigure: [] }
    lines.forEach(({ from, to, color, order, kind, figure, trim = [GAP, GAP] }) => {
        const direction = to.clone().sub(from).normalize()
        const a = from.clone().addScaledVector(direction, trim[0])
        const b = to.clone().addScaledVector(direction, -trim[1])
        QUAD.forEach(([side, end]) => {
            const t = (side + 1) / 2
            values.position.push(...a.toArray())
            values.aEnd.push(...b.toArray())
            values.aLine.push(t, end, a.distanceTo(b))
            values.aColor.push(...color.toArray())
            values.aOrder.push(order)
            values.aKind.push(kind)
            values.aFigure.push(figure)
        })
    })
    return geometryOf(values, lines.length * 4, true)
}

function artsGeometry(arts) {
    const count = constellations.length
    return geometryOf(
        {
            position: arts.flatMap((art) => art.corners.flatMap((c) => c.toArray())),
            uv: arts.flatMap(({ figure: k }) => QUAD.flatMap(([x, y]) => [(k + (x + 1) / 2) / count, (y + 1) / 2])),
            aOrder: arts.flatMap((art) => [art.order, art.order, art.order, art.order]),
            aFigure: arts.flatMap((art) => [art.figure, art.figure, art.figure, art.figure]),
        },
        arts.length * 4,
        true
    )
}

// A small star chart of one constellation for the skill card, in a unit square with y down:
// the figure drawing as SVG paths, its stars and lines, and the star of skill `id` marked.
function chartOf({ figure, members, points, box }, id) {
    const at = (x, y) => [0.5 + (x - box.cx) / (2 * box.half), 0.5 - (y - box.cy) / (2 * box.half)]
    const star = (key) => at(...points[key])
    const path = (line) => `M${line.flatMap((v, i) => (i % 2 ? [at(line[i - 1], v).map((n) => n.toFixed(3)).join(' ')] : [])).join('L')}`
    const pairs = [
        ...members.filter((skill) => points[skill.parent]).map((skill) => [skill.parent, skill.id]),
        ...(figure.edges ?? '').split(' ').filter(Boolean).map((pair) => pair.split('-')),
    ]
    return {
        name: figure.name,
        art: [...figure.art, ...(figure.bands ?? []).map((band) => band.slice(1))].map(path),
        stars: Object.keys(points).map((key) => [...star(key), key === id]),
        lines: pairs.map(([a, b]) => [...star(a), ...star(b)]),
    }
}

// canvas is the scene canvas. The HTML overlay goes right after it.
export function createConstellation({ pixelRatio = 1, small = false, canvas = null } = {}) {
    const scene = new THREE.Scene()
    scene.name = 'SkillSky'
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 12000)
    const uniforms = {
        uReveal: { value: 0 },
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uAspect: { value: 1 },
        uFocus: { value: -1 },
        uDim: { value: 0 },
        uWidth: { value: 0.0045 },
        uWhiten: { value: LOOK.whiten },
    }
    const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }
    const artMap = artAtlas(small ? 384 : 512)
    const material = (name, vertexShader, fragmentShader, extra = {}) =>
        new THREE.ShaderMaterial({ name, uniforms: { ...uniforms, ...extra }, vertexShader, fragmentShader, ...additive })
    const stars = new THREE.Points(undefined, material('sky.skills', starVertex, starFragment))
    const lines = new THREE.Mesh(undefined, material('sky.links', lineVertex, lineFragment))
    const art = new THREE.Mesh(undefined, material('sky.figures', artVertex, artFragment, { uMap: { value: artMap } }))
    const parts = [art, lines, stars]
    parts.forEach((object, i) => {
        object.frustumCulled = false
        object.renderOrder = i
    })
    const nebula = createNebula({ look: LOOK, small, time: uniforms.uTime })
    nebula.mesh.rotation.order = 'YXZ'
    scene.add(nebula.mesh, ...parts)

    const figureOf = new Map(constellations.flatMap(({ members }, k) => members.map((skill) => [skill.id, k])))
    const overlay = createSkyOverlay({
        parent: canvas,
        titles: constellations.map(({ branch, figure }) => ({ name: figure.name, label: branch.label, color: PALETTE[branch.color] })),
        chartOf: (id) => chartOf(constellations[figureOf.get(id)], id),
        onPick: (id, fromKeyboard) => pick(id, fromKeyboard, window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    })

    let tall = null
    let maxOrder = 1
    let targets = []
    const arrange = (wantTall) => {
        if (wantTall === tall) return
        tall = wantTall
        const placed = layout(tall)
        parts.forEach((object) => object.geometry.dispose())
        stars.geometry = starsGeometry(placed.stars)
        lines.geometry = linesGeometry(placed.lines)
        art.geometry = artsGeometry(placed.arts)
        overlay.setLabels(placed.labels)
        targets = placed.targets
        maxOrder = Math.max(...placed.labels.map((label) => label.order), ...placed.lines.map((line) => line.order)) + 1.2
    }

    const look = { x: 0, y: 0, fov: FOV }
    let baseFov = FOV
    const viewElevation = () => rad(tall ? VIEW_ELEVATION.tall : VIEW_ELEVATION.wide)
    const aim = () => {
        const yaw = -look.x
        const pitch = viewElevation() + look.y
        camera.lookAt(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)))
        camera.fov = look.fov
        camera.updateProjectionMatrix()
        nebula.mesh.rotation.set(look.y * BACKDROP, look.x * BACKDROP, 0)
    }
    arrange(false)
    aim()
    // The words follow the stars on every frame that draws the sky. A name grows a little as
    // the view zooms in, and waits while a degree of sky is under about 12 pixels.
    stars.onBeforeRender = () => {
        overlay.place({
            camera,
            reveal: uniforms.uReveal.value,
            focus: uniforms.uFocus.value,
            dim: uniforms.uDim.value,
            pixelsPerDegree: window.innerHeight / look.fov,
            zoom: THREE.MathUtils.clamp(Math.sqrt(baseFov / look.fov), 1, 1.5),
        })
    }

    // The view eases between the overview and one figure. `tween` holds the start and the
    // end of the look and of the dimming.
    let tween = null
    const ease = (to, dim, instant) => {
        tween = { from: { ...look, dim: uniforms.uDim.value }, to: { ...to, dim }, t: instant ? 1 : 0 }
        if (instant) step(0)
    }
    const step = (delta) => {
        tween.t = Math.min(1, tween.t + delta / FOCUS_SECONDS)
        const k = THREE.MathUtils.smoothstep(tween.t, 0, 1)
        ;['x', 'y', 'fov'].forEach((key) => {
            look[key] = THREE.MathUtils.lerp(tween.from[key], tween.to[key], k)
        })
        uniforms.uDim.value = THREE.MathUtils.lerp(tween.from.dim, tween.to.dim, k)
        aim()
        if (tween.t >= 1) tween = null
    }
    const overview = () => ({ x: 0, y: 0, fov: baseFov })
    const toOverview = (instant) => {
        uniforms.uFocus.value = -1
        ease(overview(), 0, instant)
    }
    // Flies to figure k, framed with a little room around it.
    const toFigure = (k, instant) => {
        const { centre, half } = targets[k]
        const across = 2 * Math.atan(Math.tan(half) * 1.15)
        const fov = camera.aspect >= 1 ? across : 2 * Math.atan(Math.tan(across / 2) / camera.aspect)
        uniforms.uFocus.value = k
        ease(
            {
                x: -Math.atan2(centre.x, -centre.z),
                y: Math.asin(centre.y) - viewElevation(),
                fov: THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(fov), baseFov * 0.3, baseFov),
            },
            1,
            instant
        )
    }
    // Opens the card for a skill, and flies to its constellation first if it is not in focus.
    const pick = (id, fromKeyboard, instant) => {
        const k = figureOf.get(id)
        if (k !== undefined && k !== uniforms.uFocus.value) toFigure(k, instant)
        overlay.openCard(id, fromKeyboard)
    }

    let revealing = null
    const open = () => {
        uniforms.uReveal.value = 0
        revealing = { t: 0 }
        tween = null
        uniforms.uFocus.value = -1
        uniforms.uDim.value = 0
        Object.assign(look, overview())
        aim()
        overlay.show()
    }
    const close = () => overlay.hide()
    const update = (delta, seconds) => {
        uniforms.uTime.value = seconds
        if (tween) step(delta)
        if (!revealing) return tween !== null
        revealing.t = Math.min(1, revealing.t + delta / REVEAL_SECONDS)
        uniforms.uReveal.value = revealing.t * maxOrder
        if (revealing.t >= 1) revealing = null
        return true
    }
    const showAll = () => {
        revealing = null
        uniforms.uReveal.value = maxOrder
    }
    // x and y are the tap in normalised device coordinates. A tap on a star opens its card.
    // A tap on a figure flies to it, and a tap on empty sky or on the figure in focus flies
    // back to the overview.
    const focus = (x, y, instant = false) => {
        const star = overlay.hitStar(((x + 1) / 2) * window.innerWidth, ((1 - y) / 2) * window.innerHeight)
        if (star) {
            pick(star, false, instant)
            return true
        }
        overlay.closeCard()
        const half = Math.tan(rad(camera.fov / 2))
        let hit = -1
        let nearest = Infinity
        targets.forEach((target, k) => {
            const p = target.centre.clone().multiplyScalar(RADIUS).project(camera)
            const distance = Math.hypot((p.x - x) * camera.aspect, p.y - y)
            if (p.z < 1 && distance < (Math.tan(target.half) / half) * 1.1 && distance < nearest) {
                hit = k
                nearest = distance
            }
        })
        if (hit < 0 || hit === uniforms.uFocus.value) toOverview(instant)
        else toFigure(hit, instant)
        return true
    }
    // dx and dy are screen pixels. A drag turns the view a little, inside fixed limits.
    const pan = (dx, dy) => {
        const perPixel = rad(look.fov) / window.innerHeight
        look.x = THREE.MathUtils.clamp(look.x - dx * perPixel, -LOOK_LIMIT.x, LOOK_LIMIT.x)
        look.y = THREE.MathUtils.clamp(look.y + dy * perPixel, -LOOK_LIMIT.y, LOOK_LIMIT.y)
        aim()
    }
    const zoom = (factor) => {
        look.fov = THREE.MathUtils.clamp(look.fov / factor, baseFov * 0.3, baseFov * 1.25)
        aim()
    }
    // A portrait screen keeps the width of a 16:9 view and gets the tall arrangement.
    const resize = (aspect) => {
        camera.aspect = aspect
        uniforms.uAspect.value = aspect
        arrange(aspect < 1)
        baseFov = fitFov(aspect)
        tween = null
        uniforms.uFocus.value = -1
        uniforms.uDim.value = 0
        Object.assign(look, overview())
        aim()
    }
    const setPixelRatio = (value) => {
        uniforms.uPixelRatio.value = value
    }
    const dispose = () => {
        parts.forEach((object) => {
            object.geometry.dispose()
            object.material.dispose()
        })
        artMap.dispose()
        nebula.dispose()
        overlay.dispose()
    }
    return { scene, camera, open, close, update, showAll, focus, pan, zoom, resize, setPixelRatio, dispose }
}
