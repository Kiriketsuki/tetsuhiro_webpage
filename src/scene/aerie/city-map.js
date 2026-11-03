import * as THREE from 'three'
import { NOISE_GLSL } from './city-glsl.js'

// The plan of the invented night city below the aerie. The GPU bakes it once at load into
// one map texture, so the city shader reads its districts, water and avenues in one fetch
// and never computes them per pixel. The plan mixes four cities: a river with quays and
// bridges and star places with boulevards out from them (Paris), a grid of avenues with a
// long diagonal across it, a dark rectangular park and a cluster of tall towers (New York),
// dense neon districts with small streets and lines of rail (Tokyo), and magenta and cyan
// neon over all of it as a mood. All positions are world XZ metres. The plane sits at
// y -780, centred at x 0, z -900.

export const MAP_CENTRE = [0, -900]
export const MAP_SIZE = 9000
// 1024 texels give about 9 m to a texel, so an avenue stays a line from far above.
export const MAP_TEXELS = 1024
// The bokeh disc of each out-of-focus light: its radius in CSS pixels near and far.
export const BOKEH = [4.5, 6.5]

// The grid of the avenues and the small streets: its unit vector and the normal to it.
export const GRID = new THREE.Vector2(0.783, -0.622)
export const GRID_NORMAL = new THREE.Vector2(-GRID.y, GRID.x)

// The river runs along the grid. Its centre line sits RIVER_SHIFT metres off the grid line
// through RIVER_ORIGIN, with two slow bends, and it has an island near u -100.
const RIVER_ORIGIN = [-700, -1000]
const RIVER_SHIFT = 125
export const RIVER = 70
const ISLE = { u: -100, length: 260, width: 24 }
const BRIDGE_STEP = 560

// Districts as soft round blobs: centre, radius, light density, neon share and neon hue
// (-1 magenta, 1 cyan). The neon share is the chance that a light in the blob is a neon sign.
const DISTRICTS = [
    { at: [-420, -760], radius: 520, density: 1.0, neon: 0.16, hue: 1 },
    { at: [-1150, -1380], radius: 420, density: 1.0, neon: 0.55, hue: -1 },
    { at: [-1800, -880], radius: 360, density: 0.95, neon: 0.5, hue: 1 },
    { at: [260, -1520], radius: 460, density: 0.85, neon: 0.42, hue: 1 },
    { at: [-640, -1950], radius: 380, density: 0.95, neon: 0.5, hue: -1 },
    { at: [-75, -3300], radius: 700, density: 0.9, neon: 0.2, hue: -1 },
]
// The dark park of the grid district: its centre and its half length along and across the grid.
export const PARK = { at: [-860, -380], half: [300, 70] }
// Star places with boulevards out from them: centre, count and length in metres.
const PLACES = [
    { at: [-1520, -470], count: 8, length: 820 },
    { at: [-260, -1720], count: 6, length: 700 },
]
// The avenues of the grid district run along the grid, AVENUE_STEP metres apart, and the
// cross streets every CROSS_STEP metres, inside the area round AVENUE_AREA. The diagonal
// runs through DIAGONAL at an angle to the grid.
const AVENUE_STEP = 210
const CROSS_STEP = 420
const AVENUE_AREA = { at: [-560, -600], radius: 1250 }
const DIAGONAL = { at: [-700, -560], turn: 0.5 }

// The look: the tall towers of the skyline in warm lantern colours. neon scales every neon
// share, pool the neon glow over the neon districts, avenue the avenue and boulevard glow,
// rail the colour of the rail lines, towers and height the tower count and height, skyline
// the count of the big cluster right of the aerie, and crowns the colours of the lit tops.
export const CITY_LOOK = {
    neon: 0.35,
    pool: 0.45,
    avenue: 1.35,
    rail: [0.95, 0.66, 0.38],
    towers: 1.4,
    height: 1.3,
    skyline: 1.2,
    crowns: ['warm', 'warm', 'white', 'gold', 'warm', 'cyan'],
}

const toGrid = (x, z, [ox, oz]) => {
    const dx = x - ox
    const dz = z - oz
    return [dx * GRID.x + dz * GRID.y, dx * GRID_NORMAL.x + dz * GRID_NORMAL.y]
}
const riverOffset = (u) => RIVER_SHIFT + 120 * Math.sin(u / 700) + 50 * Math.sin(u / 260 + 1)

// True where the ground is water or park, so no tower stands there.
export function isOpen(x, z) {
    const [u, n] = toGrid(x, z, RIVER_ORIGIN)
    if (Math.abs(n - riverOffset(u)) < RIVER + 25) return true
    const [a, b] = toGrid(x, z, PARK.at)
    return Math.abs(a) < PARK.half[0] + 20 && Math.abs(b) < PARK.half[1] + 20
}

const v2 = ([x, y]) => `vec2( ${x.toFixed(3)}, ${y.toFixed(3)} )`
const f1 = (x) => x.toFixed(3)
const gridTurn = Math.atan2(GRID.y, GRID.x)

// The bake shader writes R the light density, G the neon (0.5 none, under it magenta, over
// it cyan, and the distance from 0.5 the share), B the glow of the avenues, quays and
// bridges, and A the water.
const bakeShader = (look) => /* glsl */ `
varying vec2 vUv;
${NOISE_GLSL}
const vec2 GRID = ${v2([GRID.x, GRID.y])};
const vec2 GRID_NORMAL = ${v2([GRID_NORMAL.x, GRID_NORMAL.y])};
const float TEXEL = ${f1(MAP_SIZE / MAP_TEXELS)};
vec2 toGrid( vec2 p, vec2 o ) {
    return vec2( dot( p - o, GRID ), dot( p - o, GRID_NORMAL ) );
}
float lamp( float d, float w ) {
    return smoothstep( w + TEXEL, w - 0.5 * TEXEL, d );
}
float repeatDist( float x, float step ) {
    return abs( x - step * floor( x / step + 0.5 ) );
}
void main() {
    vec2 p = ${v2([MAP_CENTRE[0] - MAP_SIZE / 2, MAP_CENTRE[1] - MAP_SIZE / 2])} + vUv * ${f1(MAP_SIZE)};
    float density = 0.32 + 0.35 * smoothstep( 0.3, 0.75, noise( p / 900.0 + 3.0 ) ) + 0.15 * noise( p / 260.0 );
    density *= 1.0 - 0.7 * smoothstep( 0.7, 0.8, noise( p / 1300.0 + 9.0 ) );
    float neon = 0.0;
    ${DISTRICTS.map((d) => `{
        float w = exp( -dot( p - ${v2(d.at)}, p - ${v2(d.at)} ) / ${f1(d.radius * d.radius)} );
        density = mix( density, max( density, ${f1(d.density)} ), w );
        neon += ${f1(d.neon * d.hue * look.neon)} * w;
    }`).join('\n    ')}
    neon = clamp( neon, -0.9, 0.9 );

    vec2 r = toGrid( p, ${v2(RIVER_ORIGIN)} );
    float across = r.y - ( ${f1(RIVER_SHIFT)} + 120.0 * sin( r.x / 700.0 ) + 50.0 * sin( r.x / 260.0 + 1.0 ) );
    float isle = ${f1(ISLE.width)} * smoothstep( ${f1(ISLE.length)}, ${f1(ISLE.length * 0.7)}, abs( r.x - ${f1(ISLE.u)} ) );
    float water = lamp( abs( across ), ${f1(RIVER)} ) * ( 1.0 - lamp( abs( across ), isle ) );
    float bridge = lamp( repeatDist( r.x, ${f1(BRIDGE_STEP)} ), 7.0 ) * lamp( abs( across ), ${f1(RIVER + 8)} );
    float quay = lamp( abs( abs( across ) - ${f1(RIVER + 7)} ), 4.0 );

    vec2 pk = abs( toGrid( p, ${v2(PARK.at)} ) );
    float park = smoothstep( ${f1(PARK.half[0] + 12)}, ${f1(PARK.half[0] - 12)}, pk.x ) * smoothstep( ${f1(PARK.half[1] + 12)}, ${f1(PARK.half[1] - 12)}, pk.y );
    vec2 g = toGrid( p, ${v2(AVENUE_AREA.at)} );
    float inGrid = smoothstep( ${f1(AVENUE_AREA.radius)}, ${f1(AVENUE_AREA.radius * 0.55)}, length( g ) );
    float avenues = max( lamp( repeatDist( g.y, ${f1(AVENUE_STEP)} ), 9.0 ), 0.6 * lamp( repeatDist( g.x, ${f1(CROSS_STEP)} ), 7.0 ) );
    float diagonal = lamp( abs( dot( p - ${v2(DIAGONAL.at)}, ${v2([-Math.sin(gridTurn + DIAGONAL.turn), Math.cos(gridTurn + DIAGONAL.turn)])} ) ), 10.0 );
    float lines = max( avenues, diagonal ) * inGrid * ( 1.0 - park );
    ${PLACES.map(({ at, count, length }, i) => `{
        vec2 d = p - ${v2(at)};
        float k = ${f1((2 * Math.PI) / count)};
        float a = atan( d.y, d.x ) + ${f1(i * 0.7)};
        float off = a - k * floor( a / k + 0.5 );
        lines = max( lines, lamp( length( d ) * abs( sin( off ) ), 10.0 ) * smoothstep( ${f1(length)}, ${f1(length * 0.4)}, length( d ) ) );
        lines = max( lines, lamp( abs( length( d ) - 60.0 ), 7.0 ) );
    }`).join('\n    ')}
    lines = max( lines * ${f1(look.avenue)}, max( quay, bridge ) );
    density *= ( 1.0 - water * ( 1.0 - bridge ) ) * ( 1.0 - 0.92 * park );
    gl_FragColor = vec4( clamp( density, 0.0, 1.0 ), 0.5 + 0.5 * neon, clamp( lines, 0.0, 1.0 ), water * ( 1.0 - bridge ) );
}
`

// Bakes the plan into a mipmapped render target, with one draw.
export function bakeCityMap(renderer, look) {
    const target = new THREE.WebGLRenderTarget(MAP_TEXELS, MAP_TEXELS, {
        depthBuffer: false,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
    })
    const material = new THREE.ShaderMaterial({
        name: 'city.map',
        vertexShader: 'varying vec2 vUv;\nvoid main() {\n    vUv = uv;\n    gl_Position = vec4( position.xy, 0.0, 1.0 );\n}',
        fragmentShader: bakeShader(look),
        depthTest: false,
        depthWrite: false,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    quad.frustumCulled = false
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(target)
    renderer.render(quad, camera)
    renderer.setRenderTarget(previous)
    quad.geometry.dispose()
    material.dispose()
    return target
}
