import * as THREE from 'three'
import { createDropRay } from './drop-ray.js'

// The pond and the stream (web_water), drawn as flat toon water. One material covers both,
// so they read as one body of water:
// - flat colour bands by the distance to the mesh edge: lighter near the banks, deep in the middle
// - thin flow dashes that slide down the stream toward the lip
// - a few slow glints on the calm pond
// - a foam crest on the mouth edge, where the waterfall ribbon (waterfall.js) starts
// Every pattern is a step on an analytic coordinate. There is no noise tap, no texture and
// no extra pass. Alpha stays 1, so the water takes no ink (toon-material.js).
//
// Each vertex stores its flow coordinate (aFlow): s, the ground distance to
// Anchor_Waterfall_Top, and the arc length round the lip. Arc lanes stay parallel to the
// stream banks, where a straight lateral axis sheared across them. Each vertex also stores
// aBank, its distance to the nearest bank edge of the mesh. The mesh runs on under the grass
// by 0.5 to 0.9 m, so no foam line sits on that hidden edge. The bands only darken the
// middle of the channel and the pond.

// The palette, shared with waterfall.js so the stream and the fall cannot drift apart. The
// cool blues are the counterpoint to the warm lamps, the red leaves and the mauve haze. The
// foam stays a cool pale blue. Its brightest linear channel (0.5) stays under the glow knee
// (glow-pass.js), so the foam never glows.
export const WATER_COLORS = {
    deep: 0x1c2a36,
    mid: 0x243846,
    shallow: 0x2d4652,
    dash: 0x5f7e8a,
    foam: 0xa2b6bd,
}
// The share of the farthest water vertex distance that counts as the calm pond.
const POND_SHARE = 0.7
// Vertices closer than 1/WELD metres count as one point. The export keeps three vertices per
// triangle, so the boundary search welds them first.
const WELD = 1000
// A mouth edge lies within MOUTH_REACH metres of the lip, and its outward normal faces the
// flow by at least MOUTH_FACING. The side banks run along the flow, so their normals sit near 0.
const MOUTH_REACH = 3
const MOUTH_FACING = 0.6
// The bank distance stops here, in metres. Past it the water is deep.
const BANK_CAP = 3
// The water this far upstream of the lip, in metres, sets the flow direction at the mouth.
const UPSTREAM_NEAR = 2
const UPSTREAM_FAR = 6
// The mouth trim: the samples along the mouth, how far inside the mouth line they sit and how
// far above the water each ray starts, in metres. A hit means ground covers the water there.
const MOUTH_SAMPLES = 25
const MOUTH_PROBE = 0.15
const RAY_HEIGHT = 2
// One drop-ray grid per ground array. shapeAerie passes the same array to every water mesh, so
// prepareWater builds the grid once. The ground meshes must not change while the array lives.
const dropRays = new WeakMap()

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec2 aFlow;
attribute float aBank;
varying vec2 vFlow;
varying float vBank;
varying vec3 vWorld;
void main() {
    vFlow = aFlow;
    vBank = aBank;
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
}
`

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform float uPond;
uniform vec2 uMouthCentre;
uniform vec2 uMouthNormal;
uniform float uMouthHalf;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uShallow;
uniform vec3 uDash;
uniform vec3 uFoam;
varying vec2 vFlow;
varying float vBank;
varying vec3 vWorld;

float waterHash( float n ) {
    return fract( sin( n * 127.1 + 311.7 ) * 43758.5453 );
}
// A step with an edge about one pixel wide, so the toon lines do not alias.
float aaStep( float edge, float x, float w ) {
    return smoothstep( edge - w, edge + w, x );
}

void main() {
    float s = vFlow.x;
    float bank = vBank;
    float wBank = fwidth( bank ) * 0.75 + 1e-4;
    // The distance to the mouth line. It counts only in front of the open mouth, so no other
    // water near the line extension takes the crest.
    vec2 rel = vWorld.xz - uMouthCentre;
    float toLine = -dot( rel, uMouthNormal );
    float across = abs( dot( rel, vec2( -uMouthNormal.y, uMouthNormal.x ) ) );
    float mouth = mix( 9.0, max( toLine, 0.0 ), step( across, uMouthHalf + 0.25 ) );
    float wMouth = fwidth( toLine ) * 0.75 + 1e-4;
    // 1 in the stream, 0 in the pond.
    float stream = 1.0 - smoothstep( uPond * 0.55, uPond, s );

    // 1. Flat colour bands by the distance to the mesh edge. The last 0.9 m before the mouth
    // takes MID, the colour the waterfall ribbon starts with, so the join has no seam.
    vec3 color = mix( uShallow, uMid, aaStep( 0.75, bank, wBank ) );
    color = mix( color, uDeep, aaStep( 1.2, bank, wBank ) );
    color = mix( uMid, color, aaStep( 0.9, mouth, wMouth ) );

    // 2. Flow dashes: thin lanes along the flow, each with its own offset, length and phase.
    // A dash at a fixed phase has s = ( phase - 0.32 t ) / 0.45, so it slides toward the lip
    // at about 0.71 m/s, the speed the ribbon starts with. The dashes thin out toward the pond.
    float lanes = vFlow.y * 1.6;
    float laneId = floor( lanes );
    float laneSeed = waterHash( laneId );
    float wLane = fwidth( lanes ) * 0.75 + 1e-4;
    float lane = 1.0 - aaStep( 0.04, abs( fract( lanes ) - 0.3 - 0.4 * laneSeed ), wLane );
    float phase = s * 0.45 + uTime * 0.32 + laneSeed * 7.0;
    float along = fract( phase );
    float wAlong = fwidth( s * 0.45 ) * 0.75 + 1e-4;
    float dashStart = mix( 1.0, 0.8 + 0.1 * laneSeed, stream );
    float dash = aaStep( dashStart, along, wAlong ) * ( 1.0 - aaStep( 0.97, along, wAlong ) );
    // Some dashes drop out, so the lanes never read as painted road lines.
    dash *= step( 0.6, waterHash( floor( phase ) * 17.0 + laneId ) );
    // The arc coordinate turns fast round the lip, so the dashes stop short of the mouth band.
    dash *= lane * stream * aaStep( 1.4, mouth, wMouth );
    color = mix( color, uDash, dash * 0.45 );

    // 3. Pond glints: one short dash per 1.1 m cell. Each grows and shrinks over about two
    // seconds once in a 20 second cycle, so a few show at a time and none of them blinks.
    vec2 g = vWorld.xz * 0.9;
    vec2 cell = floor( g );
    float seed = waterHash( cell.x + cell.y * 57.0 );
    vec2 f = fract( g ) - 0.5 - ( seed - 0.5 ) * vec2( 0.3, 0.5 );
    float life = fract( seed * 7.0 + uTime * 0.05 );
    float grow = smoothstep( 0.0, 0.05, life ) * ( 1.0 - smoothstep( 0.05, 0.1, life ) );
    float wGlint = fwidth( g.x ) * 0.75 + 1e-4;
    float glint = ( 1.0 - aaStep( 0.035, abs( f.y ), wGlint ) ) * ( 1.0 - aaStep( 0.3 * grow, abs( f.x ), wGlint ) );
    color = mix( color, uDash, glint * ( 1.0 - stream ) * step( 0.9, bank ) );

    // 4. The lip: a light band, then a solid foam crest on the mouth edge itself. The ribbon
    // opens with the same crest, so the water reads as one sheet tipping over.
    float rim = aaStep( 0.16, mouth, wMouth ) * ( 1.0 - aaStep( 0.38, mouth, wMouth ) );
    color = mix( color, uDash, rim );
    color = mix( color, uFoam, 1.0 - aaStep( 0.16, mouth, wMouth ) );

    gl_FragColor = vec4( color, 1.0 );
    #include <fog_fragment>
}
`

const worldPoints = (mesh) => {
    const position = mesh.geometry.attributes.position
    return Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld))
}

// s is the ground distance to the lip. The lateral coordinate is the arc length round the
// lip, measured from the line that runs from the lip back to the farthest water. It
// follows every bend of the stream, and its seam lies behind the lip, where no water is.
function flowCoordinates(points, lip) {
    const s = points.map((p) => Math.hypot(p.x - lip.x, p.z - lip.z))
    const farthest = Math.max(0, ...s)
    const far = points[s.indexOf(farthest)] ?? lip
    const back = Math.atan2(far.z - lip.z, far.x - lip.x)
    const flow = new Float32Array(points.length * 2)
    points.forEach((p, i) => {
        const angle = Math.atan2(p.z - lip.z, p.x - lip.x) - back
        const turn = Math.atan2(Math.sin(angle), Math.cos(angle))
        flow[i * 2] = s[i]
        flow[i * 2 + 1] = turn * Math.max(s[i], 1)
    })
    return { flow, s, farthest }
}

// A boundary edge belongs to one triangle only. Each one keeps the third vertex of its
// triangle, so the caller can tell which side the water lies on.
function boundaryEdges(geometry, points) {
    const { index } = geometry
    const count = index ? index.count : points.length
    const vertexAt = (k) => (index ? index.getX(k) : k)
    const key = (p) => `${Math.round(p.x * WELD)},${Math.round(p.z * WELD)}`
    const edges = new Map()
    for (let t = 0; t + 2 < count; t += 3) {
        const ids = [vertexAt(t), vertexAt(t + 1), vertexAt(t + 2)]
        for (let k = 0; k < 3; k += 1) {
            const a = points[ids[k]]
            const b = points[ids[(k + 1) % 3]]
            const ka = key(a)
            const kb = key(b)
            if (ka === kb) continue
            const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
            const edge = edges.get(id)
            if (edge) edge.uses += 1
            else edges.set(id, { a, b, apex: points[ids[(k + 2) % 3]], uses: 1 })
        }
    }
    return [...edges.values()].filter((edge) => edge.uses === 1)
}

// The flow direction at the mouth, in xz: from the water a few metres upstream to the lip.
function flowDirection(points, s, lip, farthest) {
    const upstream = points.filter((_, i) => s[i] > UPSTREAM_NEAR && s[i] < UPSTREAM_FAR)
    const from = upstream.length
        ? upstream.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(upstream.length)
        : points[s.indexOf(farthest)] ?? lip
    const direction = new THREE.Vector2(lip.x - from.x, lip.z - from.z)
    return direction.lengthSq() > 1e-8 ? direction.normalize() : new THREE.Vector2(0, 1)
}

// The outward normal of a boundary edge in xz. It points away from the water.
function outwardNormal({ a, b, apex }) {
    const normal = new THREE.Vector2(-(b.z - a.z), b.x - a.x).normalize()
    const inward = (apex.x - (a.x + b.x) / 2) * normal.x + (apex.z - (a.z + b.z) / 2) * normal.y
    return inward > 0 ? normal.negate() : normal
}

// The mouth is the boundary run at the lip that faces the flow. Every other edge is bank.
function splitMouth(edges, lip, flow) {
    const isMouth = (edge) => {
        const near = Math.hypot((edge.a.x + edge.b.x) / 2 - lip.x, (edge.a.z + edge.b.z) / 2 - lip.z) < MOUTH_REACH
        return near && outwardNormal(edge).dot(flow) > MOUTH_FACING
    }
    return { mouth: edges.filter(isMouth), bank: edges.filter((edge) => !isMouth(edge)) }
}

// The mouth as one straight line: its two end points, its centre, its half width and its
// outward normal. The measured mouth bows by about 2 cm over 3.7 m, so a line fits it.
function mouthLine(edges, flow) {
    if (!edges.length) return null
    const side = new THREE.Vector2(-flow.y, flow.x)
    const ends = edges.flatMap((edge) => [edge.a, edge.b])
    const along = (p) => p.x * side.x + p.z * side.y
    const a = ends.reduce((low, p) => (along(p) < along(low) ? p : low)).clone()
    const b = ends.reduce((high, p) => (along(p) > along(high) ? p : high)).clone()
    const normal = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize()
    if (normal.x * flow.x + normal.z * flow.y < 0) normal.negate()
    return { a, b, centre: a.clone().add(b).multiplyScalar(0.5), half: a.distanceTo(b) / 2, normal }
}

// The water mesh runs on under the grass, so its mouth (3.7 m) is wider than the open water
// (about 2.5 m). A row of short rays finds where the ground rises over the water just inside
// the mouth, and the mouth shrinks to the open run round its centre. The ground is the grass
// and soil only, about 10k triangles. A Raycaster tested every one of them for each ray, so the
// rays go through a drop-ray grid (drop-ray.js). It gives the same hits and tests only the
// triangles near each ray. The grid builds here, and only when a mouth line exists.
function trimMouth(line, ground) {
    if (!line || !ground.length) return line
    const step = line.b.clone().sub(line.a).divideScalar(MOUTH_SAMPLES - 1)
    let drop = dropRays.get(ground)
    if (!drop) {
        drop = createDropRay(ground)
        dropRays.set(ground, drop)
    }
    const open = Array.from({ length: MOUTH_SAMPLES }, (_, i) => {
        const p = line.a.clone().addScaledVector(step, i).addScaledVector(line.normal, -MOUTH_PROBE)
        return drop.cast(new THREE.Vector3(p.x, p.y + RAY_HEIGHT, p.z), RAY_HEIGHT) === null
    })
    const middle = (MOUTH_SAMPLES - 1) / 2
    const nearest = open.reduce((best, isOpen, i) => (isOpen && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle)) ? i : best), -1)
    if (nearest < 0) return line
    let first = nearest
    let last = nearest
    while (first > 0 && open[first - 1]) first -= 1
    while (last < MOUTH_SAMPLES - 1 && open[last + 1]) last += 1
    // Each end moves half a step out, to the midpoint between an open and a covered sample.
    const a = line.a.clone().addScaledVector(step, Math.max(first - 0.5, 0))
    const b = line.a.clone().addScaledVector(step, Math.min(last + 0.5, MOUTH_SAMPLES - 1))
    return { ...line, a, b, centre: a.clone().add(b).multiplyScalar(0.5), half: a.distanceTo(b) / 2 }
}

function distanceToSegment(p, { a, b }) {
    const dx = b.x - a.x
    const dz = b.z - a.z
    const t = THREE.MathUtils.clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1)
    return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t)
}

// Writes the aFlow and aBank attributes. Returns the pond distance for the material and the
// open mouth line ({ a, b, centre, half, normal }) for the material and the waterfall. The
// mouth is null when no boundary edge faces the flow. ground holds the meshes that can cover
// the water at the mouth. Without them the mouth keeps the full mesh width.
export function prepareWater(mesh, lip, ground = []) {
    const points = worldPoints(mesh)
    const { flow, s, farthest } = flowCoordinates(points, lip)
    mesh.geometry.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2))

    const direction = flowDirection(points, s, lip, farthest)
    const { mouth, bank } = splitMouth(boundaryEdges(mesh.geometry, points), lip, direction)
    // A distance across a flat triangle interpolates linearly. Next to a bank edge that is
    // exact, and at a bank corner it draws a small wedge, which reads as a hand-drawn wobble.
    const bankDistance = Float32Array.from(points, (p) => bank.reduce((nearest, edge) => Math.min(nearest, distanceToSegment(p, edge)), BANK_CAP))
    mesh.geometry.setAttribute('aBank', new THREE.BufferAttribute(bankDistance, 1))
    return { pond: farthest * POND_SHARE, mouth: trimMouth(mouthLine(mouth, direction), ground) }
}

// mouth is the line from prepareWater. A null mouth turns the crest off.
export function createWaterMaterial({ pond, time, mouth = null }) {
    return new THREE.ShaderMaterial({
        name: 'aerie.water',
        uniforms: {
            ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
            uTime: time,
            uPond: { value: pond },
            uMouthCentre: { value: mouth ? new THREE.Vector2(mouth.centre.x, mouth.centre.z) : new THREE.Vector2() },
            uMouthNormal: { value: mouth ? new THREE.Vector2(mouth.normal.x, mouth.normal.z) : new THREE.Vector2(0, 1) },
            uMouthHalf: { value: mouth ? mouth.half : -1 },
            uDeep: { value: new THREE.Color(WATER_COLORS.deep) },
            uMid: { value: new THREE.Color(WATER_COLORS.mid) },
            uShallow: { value: new THREE.Color(WATER_COLORS.shallow) },
            uDash: { value: new THREE.Color(WATER_COLORS.dash) },
            uFoam: { value: new THREE.Color(WATER_COLORS.foam) },
        },
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        fog: true,
    })
}
