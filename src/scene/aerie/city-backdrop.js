import * as THREE from 'three'
import { hazeUniforms as skyHaze } from './sky.js'
import { HAZE_GLSL, NOISE_GLSL, PLANE_VERTEX } from './city-glsl.js'
import { createCityClouds } from './city-clouds.js'

// The city below the island, after Paris at night, drawn by one shader on one flat plane
// with no city geometry and no textures. The plan has what a view of Paris from far above
// shows: small irregular blocks with lit facades round dark courtyards, star places with
// boulevards out from them, a ring boulevard, the Seine with lit quays, bridges and an
// island, a golden lattice tower over a long park, and a cluster of high-rises far out on
// the horizon. The city is far behind the focus of the island, so it shows as a field of
// separate lights, each one an out-of-focus bokeh disc, in sodium orange, warm white and a
// few cool whites. The lights gather along the streets, stay off the river and the parks,
// and merge into a soft glow only where they crowd together.

const SIZE = 9000
const CENTRE = [0, -780, -900]
// How far every pixel mixes into the haze colour along its view, before the distance haze.
const CITY_HAZE = 0.45
// The bokeh disc of each out-of-focus light: its radius in CSS pixels near and far.
const BOKEH = [4.5, 6.5]
// The mean light of the city, before the districts and the outskirts dim it.
const LIGHT = 0.07
// One block of the street grid, in metres, along and across the nearest boulevard.
const BLOCK = [95, 48]

// The map frame: u runs along the Seine and n runs across it, toward the overview camera.
// ORIGIN is the map origin in world XZ metres.
const ORIGIN = [-700, -1000]
const ALONG = new THREE.Vector2(0.78, -0.62).normalize()
const ACROSS = new THREE.Vector2(-ALONG.y, ALONG.x)
const toWorld = ([u, n]) => [ORIGIN[0] + ALONG.x * u + ACROSS.x * n, ORIGIN[1] + ALONG.y * u + ACROSS.y * n]
// The Seine: its centre line across the map, its half width, and the island in it.
const SEINE_SHIFT = 125
const seine = (u) => SEINE_SHIFT + 120 * Math.sin(u / 700) + 50 * Math.sin(u / 260 + 1)
const RIVER = 65
const ISLE = { u: -100, length: 260, width: 22 }
// The lattice tower stands on the near bank, with its long park out toward the camera. It sits
// right of the waterfall and below the island, where the desktop and the phone overview both show it.
const TOWER_U = 150
const TOWER_N = seine(TOWER_U) + RIVER + 75
// The tower in stacked square frustums: bottom height, top height, bottom half width and
// top half width, in metres. It is half the size of the real one, like the whole plan.
const LATTICE = [
    [0, 28, 31, 17],
    [28, 57, 17, 10],
    [57, 138, 10, 2.6],
    [138, 162, 1.4, 0.5],
]
// Star places: map u, map n, the number of boulevards and their length in metres.
const PLACES = [
    [600, 620, 12, 1300],
    [-250, 480, 8, 900],
    [-1150, -520, 6, 900],
    [400, -700, 10, 1100],
]
// The ring boulevard round the centre, in metres.
const PARIS = [-150, 0]
const RING = 2300
// The high-rise cluster far out on the horizon: map u, map n, half width and height.
const HIGH_RISES = [
    [1950, -1450, 14, 120],
    [2050, -1380, 11, 95],
    [1880, -1340, 10, 80],
    [2120, -1500, 12, 105],
    [1990, -1580, 9, 70],
]

const glslVec2 = ([x, y]) => `vec2( ${x.toFixed(2)}, ${y.toFixed(2)} )`
const TOWER = toWorld([TOWER_U, TOWER_N])

// band() is the exact cover of a lit band of half width w, at distance d from its centre,
// over a soft edge of width f. A band thinner than f keeps its energy and spreads, so the
// streets far away melt into a soft glow and never alias into a moire.
// field() draws one level of the light field: one jittered light to a cell of s metres. A
// light near a street of the block grid shines brighter than a window light inside a block.
// Each light is a disc of discPx screen pixels, measured through toPx, the map to screen
// Jacobian inverse, so the disc stays round on screen at any view angle. The main pass blends
// two levels whose cells are a few discs wide, so the discs keep their screen size at any
// distance, and it scales each level so the mean light per area stays the same.
// frustum() clips the view ray, back from the ground point, against a square frustum and
// returns the ray parameter where the ray from the camera enters it, or -1. The hit nearest
// the camera has the largest ray parameter.
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uDpr;
varying vec2 vUv;
varying vec3 vWorld;
${HAZE_GLSL}
${NOISE_GLSL}

const vec3 GOLD = vec3( 1.0, 0.6, 0.26 );
const vec2 ALONG = ${glslVec2([ALONG.x, ALONG.y])};
const vec2 ACROSS = ${glslVec2([ACROSS.x, ACROSS.y])};

float band( float d, float w, float f ) {
    f = max( f, 1e-4 );
    return max( 0.0, min( d + 0.5 * f, w ) - max( d - 0.5 * f, -w ) ) / f;
}
mat2 toPx;
float discPx;
float seineAt( float u ) {
    return ${SEINE_SHIFT.toFixed(1)} + 120.0 * sin( u / 700.0 ) + 50.0 * sin( u / 260.0 + 1.0 );
}
float ground( vec2 q ) {
    float w = step( ${(RIVER + 3).toFixed(1)}, abs( q.y - seineAt( q.x ) ) );
    w *= 1.0 - 0.9 * step( abs( q.x - ${TOWER_U.toFixed(1)} ), 50.0 ) * step( abs( q.y - ${(TOWER_N + 290).toFixed(1)} ), 225.0 );
    return w * ( 1.0 - 0.9 * step( abs( q.x - ${TOWER_U.toFixed(1)} ), 110.0 ) * step( abs( q.y - ${(seine(TOWER_U) - RIVER - 120).toFixed(1)} ), 95.0 ) );
}
vec3 tint( float h ) {
    return h < 0.45 ? vec3( 1.0, 0.5, 0.17 ) : h < 0.82 ? vec3( 1.0, 0.75, 0.46 ) : vec3( 0.74, 0.84, 1.0 );
}
vec3 field( vec2 m, float s, vec2 dir, float seed ) {
    vec3 sum = vec3( 0.0 );
    vec2 c = floor( m / s );
    vec2 perp = vec2( -dir.y, dir.x );
    float resolve = 1.0 - smoothstep( 40.0, 110.0, s );
    for ( int j = -1; j <= 1; j ++ ) {
        for ( int i = -1; i <= 1; i ++ ) {
            vec2 id = c + vec2( float( i ), float( j ) );
            vec2 q = ( id + 0.15 + 0.7 * vec2( hash12( id + seed ), hash12( id + seed + 4.1 ) ) ) * s;
            vec2 e = ( 0.5 - abs( fract( vec2( dot( q, dir ) / ${BLOCK[0].toFixed(1)}, dot( q, perp ) / ${BLOCK[1].toFixed(1)} ) ) - 0.5 ) ) * vec2( ${BLOCK[0].toFixed(1)}, ${BLOCK[1].toFixed(1)} );
            float street = smoothstep( 9.0, 2.0, min( e.x, e.y ) );
            float w = mix( 0.48, mix( 0.3, 1.0, street ), resolve ) * ground( q ) * exp2( 3.2 * hash12( id + seed + 9.7 ) - 1.6 );
            float d = length( toPx * ( q - m ) );
            float disc = smoothstep( discPx + 0.8, discPx - 0.8, d ) * ( 0.85 + 0.3 * smoothstep( 0.55 * discPx, discPx, d ) );
            sum += tint( hash12( id + seed + 2.3 ) ) * w * disc;
        }
    }
    return sum;
}
void clip( float k, float m, inout vec2 r ) {
    if ( k > 1e-6 ) r.y = min( r.y, m / k );
    else if ( k < -1e-6 ) r.x = max( r.x, m / k );
    else if ( m < 0.0 ) r.y = -1.0;
}
float frustum( vec2 a, vec2 b, float dy, float y0, float y1, float s0, float s1 ) {
    float B = ( s1 - s0 ) / ( y1 - y0 );
    float A = s0 - B * y0;
    B *= dy;
    vec2 r = vec2( max( y0 / dy, 0.0 ), y1 / dy );
    clip( b.x - B, A - a.x, r );
    clip( -b.x - B, A + a.x, r );
    clip( b.y - B, A - a.y, r );
    clip( -b.y - B, A + a.y, r );
    return r.x <= r.y ? r.y : -1.0;
}
vec2 toMap( vec2 d ) {
    return vec2( dot( d, ALONG ), dot( d, ACROSS ) );
}

// The lattice tower and the far high-rises, as seen along the view ray through P.
vec4 landmarks( vec3 P, float pixelAngle ) {
    vec3 toCam = cameraPosition - P;
    float dy = toCam.y;
    vec2 b = toMap( toCam.xz ) + 1e-4;
    vec2 a = toMap( P.xz - ${glslVec2(TOWER)} );
    float t = ${LATTICE.map(([y0, y1, s0, s1]) => `frustum( a, b, dy, ${y0.toFixed(1)}, ${y1.toFixed(1)}, ${s0.toFixed(1)}, ${s1.toFixed(1)} )`).reduce((all, next) => `max( ${all}, ${next} )`)};
    vec3 colour = vec3( 0.0 );
    float best = -1.0;
    if ( t > 0.0 ) {
        best = t;
        vec2 s = a + b * t;
        float y = dy * t;
        float pixel = pixelAngle * length( toCam ) * ( 1.0 - t );
        bool xFace = abs( s.x ) > abs( s.y );
        float u = xFace ? s.y : s.x;
        float hw = ${LATTICE.slice(0, -1).map(([y0, y1, s0, s1]) => `y < ${y1.toFixed(1)} ? mix( ${s0.toFixed(1)}, ${s1.toFixed(1)}, ( y - ${y0.toFixed(1)} ) / ${(y1 - y0).toFixed(1)} ) : `).join('')}1.0;
        float f = pixel / 5.0;
        float x1 = abs( fract( ( u + y ) / 5.0 + 0.5 ) - 0.5 );
        float x2 = abs( fract( ( u - y ) / 5.0 + 0.5 ) - 0.5 );
        float lattice = 0.5 + 0.5 * mix( max( band( x1, 0.12, f ), band( x2, 0.12, f ) ), 0.45, smoothstep( 0.3, 1.0, f ) );
        float deck = band( abs( y - 28.0 ), 1.6, pixel ) + band( abs( y - 57.0 ), 1.4, pixel ) + band( abs( y - 138.0 ), 1.2, pixel );
        float arch = y < 24.0 ? step( abs( u ), 0.6 * hw * sqrt( max( 1.0 - y * y / 576.0, 0.0 ) ) ) : 0.0;
        float sparkle = step( fract( uTime / 50.0 ), 0.16 ) * step( hash12( floor( vec2( u, y ) / 2.5 ) + floor( uTime * 6.0 ) ), 0.07 );
        colour = ( GOLD * ( 1.7 * lattice * ( xFace ? 1.0 : 0.75 ) + 1.4 * deck ) + vec3( 1.6 ) * sparkle ) * ( 1.0 - 0.85 * arch )
            + vec3( 1.0, 0.85, 0.6 ) * 2.5 * step( 156.0, y );
    }
    ${HIGH_RISES.map(([u, n, half, height]) => {
        const [x, z] = toWorld([u, n])
        return `t = frustum( toMap( P.xz - ${glslVec2([x, z])} ), b, dy, 0.0, ${height.toFixed(1)}, ${half.toFixed(1)}, ${half.toFixed(1)} );
    if ( t > best ) {
        best = t;
        vec2 s = toMap( P.xz - ${glslVec2([x, z])} ) + b * t;
        vec2 w = vec2( ( abs( s.x ) > abs( s.y ) ? s.y : s.x ) / 3.2, dy * t / 3.8 );
        float on = step( hash12( floor( w ) + ${u.toFixed(1)} ), 0.3 );
        colour = vec3( 0.01, 0.012, 0.022 ) + vec3( 0.75, 0.82, 1.0 ) * mix( on, 0.3, 0.6 ) * 0.9;
    }`
    }).join('\n    ')}
    return vec4( colour, step( 0.0, best ) );
}

void main() {
    vec2 p = vWorld.xz;
    vec2 m = toMap( p - ${glslVec2(ORIGIN)} );
    vec2 dx = dFdx( m );
    vec2 dy = dFdy( m );
    float det = dx.x * dy.y - dy.x * dx.y;
    toPx = mat2( dy.y, -dx.y, -dy.x, dx.x ) / ( abs( det ) < 1e-6 ? 1e-6 : det );
    float mpp = max( length( dx ), length( dy ) );
    float dist = distance( vWorld, cameraPosition );
    discPx = uDpr * mix( ${BOKEH[0].toFixed(2)}, ${BOKEH[1].toFixed(2)}, smoothstep( 900.0, 3000.0, dist ) );
    float soft = 2.0 * discPx * mpp;

    float rc = length( m - ${glslVec2(PARIS)} );
    float dens = mix( 0.35, 1.0, 1.0 - smoothstep( ${(RING - 200).toFixed(1)}, ${(RING + 400).toFixed(1)}, rc ) );
    float district = mix( 0.25, 1.2, 0.6 * smoothstep( 0.25, 0.75, noise( p / 1300.0 + 2.0 ) ) + 0.25 * noise( p / 420.0 ) + 0.15 * noise( p / 160.0 ) );
    district *= 1.0 - 0.85 * smoothstep( 0.73, 0.8, noise( p / 1100.0 + 9.0 ) );

    // Boulevards out from the star places and the ring boulevard, as soft lines of merged lamps.
    // The street grid of the light field lines up with the nearest boulevard.
    float boulevards = band( abs( rc - ${RING.toFixed(1)} ), 12.0, soft );
    float nearest = 1e9;
    float heading = 0.0;
    ${PLACES.map(([u, n, count, length], i) => `{
        vec2 d = m - ${glslVec2([u, n])};
        float k = ${(6.2832 / count).toFixed(4)};
        float a = atan( d.y, d.x ) - ${(i * 0.7).toFixed(1)};
        float off = a - k * floor( a / k + 0.5 );
        boulevards = max( boulevards, band( length( d ) * abs( sin( off ) ), 8.0, soft ) * smoothstep( ${length.toFixed(1)}, ${(length * 0.45).toFixed(1)}, length( d ) ) );
        boulevards = max( boulevards, band( abs( length( d ) - 55.0 ), 6.0, soft ) );
        if ( length( d ) < nearest ) {
            nearest = length( d );
            heading = a - off + ${(i * 0.7).toFixed(1)};
        }
    }`).join('\n    ')}

    // The light field: two levels, blended so the discs keep their screen size.
    vec2 dir = vec2( cos( heading ), sin( heading ) );
    float level = max( log2( 2.6 * discPx * mpp / 8.0 ), 0.0 );
    float k = floor( level );
    float s1 = 8.0 * exp2( k );
    float gain = 1.0 / ( 3.1416 * discPx * discPx * abs( det ) + 1e-6 );
    vec3 lights = mix( field( m, s1, dir, k * 13.1 ) * s1 * s1, field( m, 2.0 * s1, dir, k * 13.1 + 13.1 ) * 4.0 * s1 * s1, level - k ) * gain;

    float shine = ${LIGHT.toFixed(3)} * dens * district;
    vec3 col = vec3( 0.006, 0.006, 0.014 ) + lights * shine + GOLD * shine * ( 0.25 + 1.4 * boulevards );
    col += GOLD * 0.3 * exp( -length( p - ${glslVec2(TOWER)} ) / 70.0 );

    // The Seine: dark water with the soft glow of its quay lamps.
    float dn = m.y - seineAt( m.x );
    float isle = ${ISLE.width.toFixed(1)} * smoothstep( ${ISLE.length.toFixed(1)}, ${(ISLE.length * 0.7).toFixed(1)}, abs( m.x - ${ISLE.u.toFixed(1)} ) );
    float water = band( abs( dn ), ${RIVER.toFixed(1)}, soft ) * ( 1.0 - band( abs( dn ), isle, soft ) );
    float quays = band( abs( abs( dn ) - ${(RIVER + 4).toFixed(1)} ), 3.0, soft );
    col = mix( col, vec3( 0.004, 0.006, 0.016 ) + GOLD * 0.12 * exp( -max( ${RIVER.toFixed(1)} - abs( dn ), 0.0 ) / 20.0 ), water ) + GOLD * 0.12 * quays;

    vec4 mark = landmarks( vWorld, length( fwidth( normalize( vWorld - cameraPosition ) ) ) );
    col = mix( col, mark.rgb, mark.a );

    float alpha = max( 1.0 - smoothstep( 0.55, 1.0, length( vUv - 0.5 ) * 2.0 ), mark.a );
    col = mix( col, hazeAt( normalize( vWorld - cameraPosition ) ), ${CITY_HAZE.toFixed(2)} );
    gl_FragColor = vec4( applyHaze( col, vWorld ), alpha );
}
`

// pixelRatio returns the renderer pixel ratio, so a bokeh disc keeps its size in CSS pixels.
export function createCityBackdrop({ haze, hazeDensity = 1 / 4200, pixelRatio = () => 1 }) {
    const group = new THREE.Group()
    group.name = 'CityBackdrop'
    const time = { value: 0 }
    const dpr = { value: pixelRatio() }
    const hazeUniforms = { ...skyHaze(), uHaze: { value: haze }, uHazeDensity: { value: hazeDensity } }
    const material = new THREE.ShaderMaterial({
        name: 'city.night',
        uniforms: { ...hazeUniforms, uTime: time, uDpr: dpr },
        vertexShader: PLANE_VERTEX,
        fragmentShader,
        transparent: true,
        depthWrite: false,
    })
    const geometry = new THREE.PlaneGeometry(SIZE, SIZE)
    geometry.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.fromArray(CENTRE)
    mesh.renderOrder = -8
    mesh.name = 'City'
    const clouds = createCityClouds({ hazeUniforms, time, centre: CENTRE })
    group.add(mesh, ...clouds.meshes)

    const update = (seconds) => {
        time.value = seconds
        dpr.value = pixelRatio()
    }

    const dispose = () => {
        geometry.dispose()
        material.dispose()
        clouds.dispose()
    }

    return { group, update, dispose }
}
