import * as THREE from 'three'
import { createRiverLights } from './city-river-lights.js'

// The wide river of the night city, after the Han in Seoul: a broad dark band in long slow
// bends, with river parks along both banks, a highway on each bank, a park island, and
// bridges at uneven spans and angles, each type with its own night lighting. This module
// loads in its own chunk beside the scene. The city map bake (city-map.js) reads the river
// through riverGlsl, and the towers stay off it through isOpen. All positions are world XZ
// metres on the city plane.

// The course, which the owner picked from three on 3 November 2026: a broad band across
// the campfire view behind the tall towers, as the Han shows from Namsan. Control points
// [x, z, half width], with a smooth curve through them.
// isle: the park island, at a share of the course length, with its half length, its half
// width, and its offset across the river (positive to the left bank as the river flows).
// bridges: the share of the course length, the skew from square in degrees, and the type.
// A foot bridge runs from the bank on its side (1 left, -1 right) to the island.
export const LAYOUT = {
    course: [
        [-4400, -250, 120],
        [-3100, -900, 135],
        [-1900, -1650, 150],
        [-700, -2000, 165],
        [600, -2050, 175],
        [1700, -1850, 185],
        [2700, -1350, 195],
        [4300, -900, 200],
    ],
    isle: { at: 0.47, length: 380, width: 80, offset: -60 },
    bridges: [
        { at: 0.16, skew: 10, type: 'girder' },
        { at: 0.3, skew: -8, type: 'double' },
        { at: 0.4, skew: -24, type: 'arch' },
        { at: 0.465, skew: 16, type: 'girder' },
        { at: 0.485, skew: 0, type: 'foot', side: 1 },
        { at: 0.555, skew: -16, type: 'banpo' },
        { at: 0.605, skew: 26, type: 'cable' },
        { at: 0.685, skew: -10, type: 'arch' },
        { at: 0.8, skew: -14, type: 'girder' },
        { at: 0.9, skew: 10, type: 'cable' },
    ],
}

// The width of the park strip along each bank, and the distance of the highway centre from
// the outer edge of the park.
export const PARK_WIDTH = 70
export const ROAD = 14
// The course as SAMPLES points at even spacing along it. The bake tests every segment.
export const SAMPLES = 64

// The course at even spacing: x, z and half width for each sample, the spacing and the length.
function sampleCourse(course) {
    const curve = new THREE.CatmullRomCurve3(course.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal')
    const samples = new Float32Array(SAMPLES * 4)
    const point = new THREE.Vector3()
    for (let i = 0; i < SAMPLES; i++) {
        const t = curve.getUtoTmapping(i / (SAMPLES - 1))
        curve.getPoint(t, point)
        const k = t * (course.length - 1)
        const j = Math.min(Math.floor(k), course.length - 2)
        samples.set([point.x, point.z, THREE.MathUtils.lerp(course[j][2], course[j + 1][2], k - j), 0], i * 4)
    }
    const length = curve.getLength()
    return { samples, length, step: length / (SAMPLES - 1) }
}

// Builds the plan of one layout. at(s) gives the point, the unit direction, the unit normal to
// the left bank and the half width at a distance s along the course. locate(x, z) gives the
// distance along the course, the signed distance across it and the half width there.
export function planRiver(ground, layout = LAYOUT) {
    const { samples, length, step } = sampleCourse(layout.course)
    const sample = (i) => samples.subarray(i * 4, i * 4 + 3)
    const at = (s) => {
        const f = THREE.MathUtils.clamp(s / step, 0, SAMPLES - 1.001)
        const i = Math.floor(f)
        const t = f - i
        const [ax, az, aw] = sample(i)
        const [bx, bz, bw] = sample(i + 1)
        const dx = bx - ax
        const dz = bz - az
        const n = Math.hypot(dx, dz)
        return { x: ax + dx * t, z: az + dz * t, dir: [dx / n, dz / n], normal: [-dz / n, dx / n], half: aw + (bw - aw) * t }
    }
    const locate = (x, z) => {
        let best = { d: Infinity, s: 0, across: 0, half: 0 }
        for (let i = 0; i < SAMPLES - 1; i++) {
            const [ax, az, aw] = sample(i)
            const [bx, bz, bw] = sample(i + 1)
            const ex = bx - ax
            const ez = bz - az
            const t = THREE.MathUtils.clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez), 0, 1)
            const qx = x - ax - ex * t
            const qz = z - az - ez * t
            const d = Math.hypot(qx, qz)
            if (d < best.d) best = { d, s: (i + t) * step, across: Math.sign(ex * qz - ez * qx) * d, half: aw + (bw - aw) * t }
        }
        return best
    }
    const isle = { ...layout.isle, s: layout.isle.at * length }
    // The half width of the island at a distance s along the course, 0 off the island.
    const isleHalf = (s) => isle.width * Math.sqrt(Math.max(0, 1 - ((s - isle.s) / isle.length) ** 2))
    const isWater = (x, z) => {
        const r = locate(x, z)
        return Math.abs(r.across) < r.half && Math.abs(r.across - isle.offset) >= isleHalf(r.s)
    }
    // True on the water, the parks and the highways, where no tower stands.
    const isOpen = (x, z) => {
        const r = locate(x, z)
        return Math.abs(r.across) < r.half + PARK_WIDTH + ROAD + 20
    }
    const bridges = layout.bridges.map((b) => planBridge(b, at, isle, length))
    return { ground, samples, length, step, park: PARK_WIDTH, road: PARK_WIDTH + ROAD, at, locate, isle, isleHalf, isWater, isOpen, bridges }
}

// The two ends of a bridge, its unit direction, and the stretch of it over the water. A road
// bridge reaches over the park and the highway on both banks. A foot bridge runs from the
// park on its side to the middle of the island.
function planBridge(bridge, at, isle, length) {
    const s = bridge.at * length
    const p = at(s)
    const turn = THREE.MathUtils.degToRad(bridge.skew)
    const dir = [p.normal[0] * Math.cos(turn) - p.dir[0] * Math.sin(turn), p.normal[1] * Math.cos(turn) - p.dir[1] * Math.sin(turn)]
    const stretch = 1 / Math.cos(turn)
    if (bridge.type === 'foot') {
        const from = bridge.side * (p.half + 0.5 * PARK_WIDTH) * stretch
        const to = isle.offset * stretch
        const ends = [from, to].sort((a, b) => a - b)
        return { ...bridge, centre: [p.x, p.z], dir, ends, water: ends }
    }
    const reach = (p.half + PARK_WIDTH + ROAD + 25) * stretch
    return { ...bridge, centre: [p.x, p.z], dir, ends: [-reach, reach], water: [-p.half * stretch, p.half * stretch] }
}

// GLSL for the map bake. riverAt( p ) returns the water (off the island), the park (the bank
// strips and the island), the bridge decks and the highways at the point p. It tests each
// segment of the course for the nearest one. The bake runs once at load.
export function riverGlsl(plan) {
    const f1 = (x) => x.toFixed(3)
    const v2 = ([x, y]) => `vec2( ${f1(x)}, ${f1(y)} )`
    const decks = plan.bridges.map(({ centre, dir, ends, type }) => {
        const a = [centre[0] + dir[0] * ends[0], centre[1] + dir[1] * ends[0]]
        const b = [centre[0] + dir[0] * ends[1], centre[1] + dir[1] * ends[1]]
        return `deck = max( deck, lamp( segment( p, ${v2(a)}, ${v2(b)} ), ${type === 'foot' ? '4.0' : '9.0'} ) );`
    })
    const { isle } = plan
    return {
        uniforms: { uRiver: { value: plan.samples } },
        glsl: /* glsl */ `
uniform vec4 uRiver[ ${SAMPLES} ];
float segment( vec2 p, vec2 a, vec2 b ) {
    vec2 e = b - a;
    return length( p - a - e * clamp( dot( p - a, e ) / dot( e, e ), 0.0, 1.0 ) );
}
vec4 riverAt( vec2 p ) {
    float best = 1e12;
    float s = 0.0;
    float across = 0.0;
    float hw = 0.0;
    for ( int i = 0; i < ${SAMPLES - 1}; i ++ ) {
        vec2 a = uRiver[ i ].xy;
        vec2 e = uRiver[ i + 1 ].xy - a;
        float t = clamp( dot( p - a, e ) / dot( e, e ), 0.0, 1.0 );
        vec2 q = p - a - e * t;
        float d = dot( q, q );
        if ( d < best ) {
            best = d;
            s = ( float( i ) + t ) * ${f1(plan.step)};
            across = sign( e.x * q.y - e.y * q.x ) * sqrt( d );
            hw = mix( uRiver[ i ].z, uRiver[ i + 1 ].z, t );
        }
    }
    float q = ( s - ${f1(isle.s)} ) / ${f1(isle.length)};
    float isleHalf = ${f1(isle.width)} * sqrt( max( 0.0, 1.0 - q * q ) );
    float onIsle = lamp( abs( across - ${f1(isle.offset)} ), isleHalf );
    float water = lamp( abs( across ), hw ) * ( 1.0 - onIsle );
    float park = max( lamp( abs( abs( across ) - hw - ${f1(PARK_WIDTH / 2)} ), ${f1(PARK_WIDTH / 2)} ), onIsle );
    float road = 0.45 * lamp( abs( abs( across ) - hw - ${f1(PARK_WIDTH + ROAD)} ), 7.0 );
    float deck = 0.0;
    ${decks.join('\n    ')}
    return vec4( water, park, deck, road );
}
`,
    }
}

// Loads the river: its plan, its bake GLSL, and its lights and parks layer. city holds the
// ground height, the bokeh sizes, the city haze and its GLSL (city-river-lights.js).
export function createCityRiver({ city, hazeUniforms, time, dpr }) {
    const plan = planRiver(city.ground)
    const lights = createRiverLights({ plan, city, hazeUniforms, time, dpr })
    return { plan, bake: riverGlsl(plan), isOpen: plan.isOpen, group: lights.group, dispose: lights.dispose }
}
