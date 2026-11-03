import * as THREE from 'three'
import { CITY_HAZE, HAZE_GLSL } from './city-glsl.js'
import { BOKEH } from './city-map.js'
import { GROUND } from './city-skyline.js'

// The lights and the parks of the river (city-river.js). Every light is a bokeh disc of the
// same screen size as the ground lights: the bridge lamps, arches, pylons and cables, the
// colour show of the signature bridge, the path lights of the parks, and the cars on the two
// bank highways. A light over the water also casts a reflection, a streak stretched down the
// screen that shimmers. All lights are one draw: four corners to a light, placed in screen
// pixels by the vertex shader. They add to the city in its target, so the city haze dims
// them as it dims the ground lights. The parks are one more draw: dark green strips along
// the banks and over the island.

const CITY_CENTRE = [0, -900]
const CITY_RADIUS = 4500
const COLOURS = {
    sodium: [1.0, 0.58, 0.26],
    warm: [1.0, 0.78, 0.5],
    white: [0.86, 0.9, 1.0],
    cool: [0.62, 0.86, 1.0],
    green: [0.55, 1.0, 0.78],
    rose: [1.0, 0.62, 0.86],
    torch: [1.0, 0.7, 0.32],
    head: [1.0, 0.9, 0.72],
    tail: [1.0, 0.2, 0.12],
    park: [0.82, 1.0, 0.66],
}
// How a light moves and takes its colour.
// A bank streak is the reflection of the bank lights, which only shows from across the water.
const MODE = { still: 0, car: 1, show: 2, bank: 3 }
// How far a reflection reaches down the screen, as a share of the disc radius.
const STREAK = 2.6

const scaled = (colour, gain) => COLOURS[colour].map((c) => c * gain)

// Collects lights. add() places one light, and a second, dimmer one as its reflection
// when the light stands over the water.
function lightList(plan) {
    const list = []
    const add = (x, y, z, colour, gain, { size = 1, phase = 0, mode = MODE.still, reflect = true } = {}) => {
        const rgb = scaled(colour, gain)
        list.push({ at: [x, GROUND + y, z], rgb, info: [size, 1, phase, mode] })
        // A high light lies on the water further off, so its reflection is fainter.
        if (reflect && y > 1 && plan.isWater(x, z)) list.push({ at: [x, GROUND - y, z], rgb: rgb.map((c) => (c * 0.35) / (1 + y / 40)), info: [size, STREAK, phase, mode] })
    }
    return { list, add }
}

// The lights of one bridge, by its type. x runs along the bridge from its centre, side runs
// across it, and y is the height over the water.
function bridgeLights(bridge, add) {
    const { centre, dir, ends, water } = bridge
    const put = (x, side, y, colour, gain, options) =>
        add(centre[0] + dir[0] * x - dir[1] * side, y, centre[1] + dir[1] * x + dir[0] * side, colour, gain, options)
    const row = (side, y, spacing, colour, gain, options, [from, to] = ends) => {
        const count = Math.max(1, Math.round((to - from) / spacing))
        for (let i = 0; i <= count; i++) put(from + ((to - from) * i) / count, side, y, colour, gain, { size: 0.85, ...options })
    }
    const span = water[1] - water[0]
    // One arch of lights from a to b over the deck at height y, rise metres high at its top.
    const arch = (a, b, side, y, rise, colour, gain) => {
        const count = Math.max(4, Math.round((b - a) / 12))
        for (let i = 0; i <= count; i++) {
            const t = i / count
            put(a + (b - a) * t, side, y + rise * (1 - (2 * t - 1) ** 2), colour, gain)
        }
    }
    switch (bridge.type) {
        case 'girder':
            row(-11, 21, 30, 'sodium', 0.192)
            row(11, 21, 30, 'sodium', 0.192)
            break
        case 'arch': {
            row(-11, 20, 34, 'warm', 0.144)
            row(11, 20, 34, 'warm', 0.144)
            const count = span > 300 ? 3 : 2
            for (let k = 0; k < count; k++) {
                const a = water[0] + (span * k) / count
                arch(a, a + span / count, -10, 16, 34, 'cool', 0.132)
                arch(a, a + span / count, 10, 16, 34, 'cool', 0.132)
            }
            break
        }
        case 'cable':
            row(-10, 24, 34, 'white', 0.144)
            row(10, 24, 34, 'white', 0.144)
            for (const f of [0.3, 0.7]) {
                const x = water[0] + span * f
                for (let y = 24; y <= 104; y += 7) put(x, 0, y, 'white', 0.07, { size: 0.6 })
                put(x, 0, 112, 'torch', 0.33, { size: 1.3 })
                for (const reach of [-120, -75, -35, 35, 75, 120]) {
                    const steps = Math.round(Math.hypot(reach, 80) / 13)
                    for (let i = 1; i < steps; i++) put(x + (reach * i) / steps, 0, 104 - (80 * i) / steps, 'cool', 0.035, { size: 0.55 })
                }
            }
            break
        case 'double':
            row(-11, 28, 32, 'warm', 0.156)
            row(11, 28, 32, 'warm', 0.156)
            row(-9, 11, 20, 'green', 0.096, { size: 0.8 })
            row(9, 11, 20, 'green', 0.096, { size: 0.8 })
            break
        case 'banpo': {
            row(-12, 26, 32, 'warm', 0.156)
            row(12, 26, 32, 'warm', 0.156)
            row(-9, 9, 26, 'white', 0.072, { size: 0.8 })
            row(9, 9, 26, 'white', 0.072, { size: 0.8 })
            // The colour show: curtains of water fall from both sides of the deck, lit in
            // colours that drift slowly along the bridge.
            const count = Math.round(span / 9)
            for (let i = 0; i <= count; i++) {
                const x = water[0] + (span * i) / count
                for (const side of [-15, 15]) {
                    for (const [y, gain] of [[20, 0.07], [12, 0.09], [5, 0.11]]) put(x, side, y, 'white', gain, { size: 0.9, phase: x / span, mode: MODE.show })
                }
            }
            break
        }
        case 'foot':
            arch(ends[0], ends[1], -4, 6, 10, 'rose', 0.12)
            arch(ends[0], ends[1], 4, 6, 10, 'rose', 0.12)
            break
    }
}

// The path lights of the parks along both banks and round the island.
function parkLights(plan, add, rand) {
    for (const side of [-1, 1]) {
        for (let s = rand() * 40; s < plan.length; s += 42 + rand() * 30) {
            const p = plan.at(s)
            const across = side * (p.half + 0.5 * plan.park * (0.4 + 0.6 * rand()))
            add(p.x + p.normal[0] * across, 4, p.z + p.normal[1] * across, 'park', 0.1, { size: 0.7, reflect: false })
        }
    }
    const { isle } = plan
    for (let s = isle.s - isle.length; s <= isle.s + isle.length; s += 34) {
        const p = plan.at(s)
        for (const edge of [-0.7, 0.7]) {
            const across = isle.offset + edge * plan.isleHalf(s)
            add(p.x + p.normal[0] * across, 4, p.z + p.normal[1] * across, 'park', 0.12, { size: 0.7, reflect: false })
        }
    }
}
// The reflections of the bank lights: streaks on the water along both banks. The phase holds
// the angle of the outward normal of the bank, so the vertex shader drops the streaks of the
// bank on the camera side, where the bank itself hides them.
function bankStreaks(plan, list, rand) {
    const tints = ['sodium', 'warm', 'warm', 'white']
    for (const side of [-1, 1]) {
        for (let s = rand() * 30; s < plan.length; s += 22 + 30 * rand()) {
            const p = plan.at(s)
            const across = side * (p.half - 14)
            const colour = tints[Math.floor(rand() * tints.length)]
            list.push({
                at: [p.x + p.normal[0] * across, GROUND - 22 - 30 * rand(), p.z + p.normal[1] * across],
                rgb: scaled(colour, 0.04 + 0.06 * rand()),
                info: [0.9, STREAK, Math.atan2(side * p.normal[1], side * p.normal[0]), MODE.bank],
            })
        }
    }
}

// The cars on the two bank highways. Each is a disc that the vertex shader moves along the
// course. Its centre holds its start distance, its signed distance out from the bank, and its
// speed. Each highway carries headlights one way and tail lights the other.
function carLights(plan, list, rand) {
    for (const side of [-1, 1]) {
        for (const [lane, colour, speed] of [[-4, 'head', 15], [4, 'tail', -15]]) {
            for (let s = rand() * 40; s < plan.length; s += 24 + 150 * rand() * rand()) {
                list.push({ at: [s, side * (plan.road + lane), speed * (0.8 + 0.4 * rand())], rgb: scaled(colour, 0.22), info: [0.75, 1, 0, MODE.car] })
            }
        }
    }
}

const f1 = (x) => x.toFixed(3)

const lightsVertex = (plan) => /* glsl */ `
uniform float uTime;
uniform float uDpr;
uniform float uHazeDensity;
uniform vec2 uView;
uniform sampler2D uCourse;
attribute vec3 aCentre;
attribute vec2 aCorner;
attribute vec3 aColour;
attribute vec4 aInfo;
varying vec2 vPx;
varying vec3 vColour;
varying float vRadius;
varying float vStretch;
varying float vPhase;
void main() {
    vec3 world = aCentre;
    vec3 colour = aColour;
    if ( aInfo.w > 0.5 && aInfo.w < 1.5 ) {
        float s = mod( aCentre.x + uTime * aCentre.z, ${f1(plan.length)} );
        float f = min( s / ${f1(plan.step)}, ${f1(plan.samples.length / 4 - 1.001)} );
        int i = int( f );
        vec4 a = texelFetch( uCourse, ivec2( i, 0 ), 0 );
        vec4 b = texelFetch( uCourse, ivec2( i + 1, 0 ), 0 );
        vec2 e = normalize( b.xy - a.xy );
        float across = sign( aCentre.y ) * ( mix( a.z, b.z, f - float( i ) ) + abs( aCentre.y ) );
        vec2 c = mix( a.xy, b.xy, f - float( i ) ) + vec2( -e.y, e.x ) * across;
        world = vec3( c.x, ${f1(GROUND + 3)}, c.y );
    } else if ( aInfo.w > 2.5 ) {
        colour *= step( dot( cameraPosition.xz - world.xz, vec2( cos( aInfo.z ), sin( aInfo.z ) ) ), 0.0 );
    } else if ( aInfo.w > 1.5 ) {
        float h = fract( aInfo.z - uTime * 0.035 );
        vec3 hue = 0.5 + 0.5 * cos( 6.2832 * ( h + vec3( 0.0, 0.33, 0.67 ) ) );
        colour *= mix( vec3( 0.75 ), hue, 0.7 ) * ( 0.8 + 0.2 * sin( uTime * 0.9 + aInfo.z * 25.0 ) );
    }
    float dist = distance( world, cameraPosition );
    float fog = dist * uHazeDensity;
    float edge = 1.0 - smoothstep( 0.55, 1.0, length( world.xz - ${`vec2( ${f1(CITY_CENTRE[0])}, ${f1(CITY_CENTRE[1])} )`} ) / ${f1(CITY_RADIUS)} );
    vColour = colour * ${f1(1 - CITY_HAZE)} * exp( -fog * fog ) * edge;
    vRadius = uDpr * mix( ${f1(BOKEH[0])}, ${f1(BOKEH[1])}, smoothstep( 900.0, 3000.0, dist ) ) * aInfo.x;
    vStretch = aInfo.y;
    vPhase = aInfo.z;
    vPx = aCorner * ( vRadius + 1.0 ) * vec2( 1.0, aInfo.y );
    vec4 clip = projectionMatrix * viewMatrix * vec4( world, 1.0 );
    clip.xy += vPx * 2.0 / uView * clip.w;
    gl_Position = clip;
}
`

// A disc has the same bright rim as the ground lights. A reflection is a narrow streak that
// fades toward its ends and breaks into moving bands, as light on rippled water does.
const lightsFragment = /* glsl */ `
uniform float uTime;
varying vec2 vPx;
varying vec3 vColour;
varying float vRadius;
varying float vStretch;
varying float vPhase;
void main() {
    float a;
    if ( vStretch > 1.5 ) {
        vec2 q = vPx / vec2( vRadius, vRadius * vStretch );
        a = smoothstep( 1.0, 0.2, abs( q.x ) ) * ( 1.0 - q.y * q.y ) * ( 0.55 + 0.45 * sin( q.y * 9.0 + uTime * 1.7 + vPhase * 40.0 ) );
    } else {
        float d = length( vPx );
        a = smoothstep( vRadius + 0.8, vRadius - 0.8, d ) * ( 0.85 + 0.3 * smoothstep( 0.55 * vRadius, vRadius, d ) );
    }
    gl_FragColor = vec4( vColour * max( a, 0.0 ), 0.0 );
}
`

const parksVertex = /* glsl */ `
attribute float aEdge;
varying float vEdge;
varying vec3 vWorld;
void main() {
    vEdge = aEdge;
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`
const parksFragment = /* glsl */ `
varying float vEdge;
varying vec3 vWorld;
${HAZE_GLSL}
void main() {
    float soft = smoothstep( 0.0, 0.3, vEdge ) * smoothstep( 1.0, 0.7, vEdge );
    float edge = 1.0 - smoothstep( 0.55, 1.0, length( vWorld.xz - vec2( ${f1(CITY_CENTRE[0])}, ${f1(CITY_CENTRE[1])} ) ) / ${f1(CITY_RADIUS)} );
    vec3 col = mix( vec3( 0.018, 0.055, 0.032 ), hazeAt( normalize( vWorld - cameraPosition ) ), ${f1(CITY_HAZE)} );
    gl_FragColor = vec4( applyHaze( col, vWorld ), 0.85 * soft * edge );
}
`

// The park strips as triangle strips: one along each bank and one over the island.
function parkGeometry(plan) {
    const position = []
    const edge = []
    const index = []
    const strip = (points) => {
        const base = position.length / 3
        points.forEach(([x0, z0, x1, z1], i) => {
            position.push(x0, GROUND + 0.5, z0, x1, GROUND + 0.5, z1)
            edge.push(0, 1)
            if (i > 0) index.push(base + 2 * i - 2, base + 2 * i - 1, base + 2 * i, base + 2 * i - 1, base + 2 * i + 1, base + 2 * i)
        })
    }
    const across = (p, a) => [p.x + p.normal[0] * a, p.z + p.normal[1] * a]
    const count = Math.ceil(plan.length / 60)
    for (const side of [-1, 1]) {
        strip(Array.from({ length: count + 1 }, (_, i) => {
            const p = plan.at((plan.length * i) / count)
            return [...across(p, side * (p.half - 8)), ...across(p, side * (p.half + plan.park))]
        }))
    }
    const { isle } = plan
    strip(Array.from({ length: 25 }, (_, i) => {
        const s = isle.s - isle.length + (2 * isle.length * i) / 24
        const p = plan.at(s)
        const half = plan.isleHalf(s) + 6
        return [...across(p, isle.offset - half), ...across(p, isle.offset + half)]
    }))
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
    geometry.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1))
    geometry.setIndex(index)
    return geometry
}

function lightGeometry(list) {
    const centre = new Float32Array(list.length * 12)
    const colour = new Float32Array(list.length * 12)
    const info = new Float32Array(list.length * 16)
    const corner = new Float32Array(list.length * 8)
    const index = []
    list.forEach(({ at, rgb, info: values }, i) => {
        for (let k = 0; k < 4; k++) {
            centre.set(at, i * 12 + k * 3)
            colour.set(rgb, i * 12 + k * 3)
            info.set(values, i * 16 + k * 4)
        }
        corner.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8)
        index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('aCentre', new THREE.BufferAttribute(centre, 3))
    geometry.setAttribute('aColour', new THREE.BufferAttribute(colour, 3))
    geometry.setAttribute('aInfo', new THREE.BufferAttribute(info, 4))
    geometry.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2))
    // three.js reads the vertex count from the position attribute.
    geometry.setAttribute('position', new THREE.BufferAttribute(centre, 3))
    geometry.setIndex(index)
    return geometry
}

// A small seeded random, so every load places the same cars and path lights.
function random(seed) {
    let a = seed >>> 0
    return () => {
        a = (a * 1664525 + 1013904223) >>> 0
        return a / 4294967296
    }
}

export function createRiverLights({ plan, hazeUniforms, time, dpr }) {
    const rand = random(20261103)
    const { list, add } = lightList(plan)
    plan.bridges.forEach((bridge) => bridgeLights(bridge, add))
    parkLights(plan, add, rand)
    bankStreaks(plan, list, rand)
    carLights(plan, list, rand)

    const course = new THREE.DataTexture(plan.samples, plan.samples.length / 4, 1, THREE.RGBAFormat, THREE.FloatType)
    course.needsUpdate = true
    const view = new THREE.Vector2(1, 1)
    const lights = new THREE.Mesh(
        lightGeometry(list),
        new THREE.ShaderMaterial({
            name: 'city.river.lights',
            uniforms: { uTime: time, uDpr: dpr, uHazeDensity: hazeUniforms.uHazeDensity, uView: { value: view }, uCourse: { value: course } },
            vertexShader: lightsVertex(plan),
            fragmentShader: lightsFragment,
            transparent: true,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
            blendSrcAlpha: THREE.ZeroFactor,
            blendDstAlpha: THREE.OneFactor,
        })
    )
    // The discs are sized in pixels of the target they draw into.
    lights.onBeforeRender = (renderer) => {
        const target = renderer.getRenderTarget()
        if (target) view.set(target.width, target.height)
        else renderer.getDrawingBufferSize(view)
    }
    const parks = new THREE.Mesh(
        parkGeometry(plan),
        new THREE.ShaderMaterial({ name: 'city.river.parks', uniforms: hazeUniforms, vertexShader: parksVertex, fragmentShader: parksFragment, transparent: true, depthWrite: false })
    )
    lights.name = 'CityRiverLights'
    parks.name = 'CityRiverParks'
    lights.frustumCulled = false
    parks.frustumCulled = false
    // The parks draw over the city plane, and the lights after the towers, so a tower in
    // front of a bridge hides its lamps through the depth test.
    parks.renderOrder = -7.9
    lights.renderOrder = -7.4
    const group = new THREE.Group()
    group.name = 'CityRiver'
    group.add(parks, lights)
    const dispose = () => {
        ;[lights, parks].forEach((mesh) => {
            mesh.geometry.dispose()
            mesh.material.dispose()
        })
        course.dispose()
    }
    return { group, dispose }
}
