import * as THREE from 'three'
import { hazeUniforms as skyHaze } from './sky.js'
import { HAZE_GLSL, NOISE_GLSL, PLANE_VERTEX } from './city-glsl.js'
import { createCityClouds } from './city-clouds.js'

// The city below the island, after Paris at night, drawn by one shader on one flat plane
// with no city geometry and no textures. The plan has what a view of Paris from far above
// shows: small irregular blocks with lit facades round dark courtyards, star places with
// boulevards out from them, a ring boulevard, the Seine with lit quays, bridges and an
// island, a golden lattice tower over a long park, and a cluster of high-rises far out on
// the horizon. Every light has a soft edge that grows with distance, so the city reads as
// a warm glow seen through the air, not as a crisp map.

const SIZE = 9000
const CENTRE = [0, -780, -900]
// How far every pixel mixes into the haze colour along its view, before the distance haze.
const CITY_HAZE = 0.45
// The soft edge of every light, in metres: SOFT[0] plus SOFT[1] metres for each metre of
// distance from the camera.
const SOFT = [16, 0.016]

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
// cells() returns the distance to the nearest border of a jittered Voronoi cell, in cell
// units, and a random value for the cell. The borders are the streets.
// frustum() clips the view ray, back from the ground point, against a square frustum and
// returns the ray parameter where the ray from the camera enters it, or -1. The hit nearest
// the camera has the largest ray parameter.
const fragmentShader = /* glsl */ `
uniform float uTime;
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
float box( vec2 p, vec2 h, float f ) {
    vec2 d = abs( p ) - h;
    return 1.0 - smoothstep( -0.5 * f, 0.5 * f, length( max( d, 0.0 ) ) + min( max( d.x, d.y ), 0.0 ) );
}
vec2 jitter( vec2 c ) {
    return vec2( hash12( c ), hash12( c + 17.0 ) ) * 0.8 + 0.1;
}
vec2 cells( vec2 x ) {
    vec2 n = floor( x );
    vec2 f = fract( x );
    vec2 mg = vec2( 0.0 );
    vec2 mr = vec2( 0.0 );
    float md = 8.0;
    for ( int j = -1; j <= 1; j ++ ) {
        for ( int i = -1; i <= 1; i ++ ) {
            vec2 g = vec2( float( i ), float( j ) );
            vec2 r = g + jitter( n + g ) - f;
            float d = dot( r, r );
            if ( d < md ) {
                md = d;
                mr = r;
                mg = g;
            }
        }
    }
    md = 8.0;
    for ( int j = -1; j <= 1; j ++ ) {
        for ( int i = -1; i <= 1; i ++ ) {
            vec2 g = mg + vec2( float( i ), float( j ) );
            vec2 r = g + jitter( n + g ) - f;
            if ( dot( mr - r, mr - r ) > 1e-5 ) md = min( md, dot( 0.5 * ( mr + r ), normalize( r - mr ) ) );
        }
    }
    return vec2( md, hash12( n + mg + 3.1 ) );
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
    float fp = length( fwidth( p ) );
    float soft = max( fp, ${SOFT[0].toFixed(1)} + distance( vWorld, cameraPosition ) * ${SOFT[1].toFixed(4)} );
    vec2 m = toMap( p - ${glslVec2(ORIGIN)} );
    float rc = length( m - ${glslVec2(PARIS)} );
    float dens = mix( 0.4, 1.0, 1.0 - smoothstep( ${(RING - 200).toFixed(1)}, ${(RING + 400).toFixed(1)}, rc ) );
    float far = smoothstep( 14.0, 34.0, soft );

    // Boulevards out from the star places, and the ring boulevard. The blocks between two
    // boulevards line up with the nearer one and stretch along it, as the wedge blocks of Paris do.
    float boulevards = band( abs( rc - ${RING.toFixed(1)} ), 16.0, soft );
    float nearest = 1e9;
    float heading = 0.0;
    ${PLACES.map(([u, n, count, length], i) => `{
        vec2 d = m - ${glslVec2([u, n])};
        float k = ${(6.2832 / count).toFixed(4)};
        float a = atan( d.y, d.x ) - ${(i * 0.7).toFixed(1)};
        float off = a - k * floor( a / k + 0.5 );
        boulevards = max( boulevards, band( length( d ) * abs( sin( off ) ), 7.0, soft ) * smoothstep( ${length.toFixed(1)}, ${(length * 0.45).toFixed(1)}, length( d ) ) );
        boulevards = max( boulevards, band( abs( length( d ) - 55.0 ), 6.0, soft ) );
        if ( length( d ) < nearest ) {
            nearest = length( d );
            heading = a - off + ${(i * 0.7).toFixed(1)};
        }
    }`).join('\n    ')}

    // Streets on the borders of the stretched cells. Buildings line each street, round a darker courtyard.
    vec2 dir = vec2( cos( heading ), sin( heading ) );
    vec2 v = cells( vec2( dot( m, dir ) / 95.0, dot( m, vec2( -dir.y, dir.x ) ) / 48.0 ) );
    float street = mix( band( v.x * 60.0, 3.0, soft ) * ( 0.6 + 0.4 * v.y ), 0.1, far );
    float lit = dens * mix( ( 0.55 + 0.45 * v.y ) * smoothstep( 0.42, 0.1, v.x ), 0.32, far );

    // Parks: the long park under the tower, a garden across the river, and two large woods.
    float park = box( m - vec2( ${TOWER_U.toFixed(1)}, ${(TOWER_N + 290).toFixed(1)} ), vec2( 50.0, 225.0 ), soft );
    park = max( park, box( m - vec2( ${TOWER_U.toFixed(1)}, ${(seine(TOWER_U) - RIVER - 120).toFixed(1)} ), vec2( 110.0, 95.0 ), soft ) );
    park = max( park, smoothstep( 0.73, 0.8, noise( p / 1100.0 + 9.0 ) ) );
    lit *= 1.0 - park;
    street *= 1.0 - 0.8 * park;

    // Districts: a slow noise and a finer one make some quarters bright and others dim.
    float district = mix( 0.3, 1.15, 0.6 * smoothstep( 0.25, 0.75, noise( p / 1300.0 + 2.0 ) ) + 0.25 * noise( p / 420.0 ) + 0.15 * noise( p / 150.0 ) );
    lit *= district;
    street *= district;
    boulevards *= mix( 0.55, 1.0, district );

    vec2 c = p / 6.0;
    float glints = 0.0;
    if ( far < 1.0 ) {
        float pixel = max( fp, soft * 0.5 ) / 6.0;
        float h = hash12( floor( c ) );
        vec2 o = fract( c ) - 0.5 - ( vec2( hash12( floor( c ) + 4.1 ), hash12( floor( c ) + 9.7 ) ) - 0.5 ) * 0.5;
        float r = max( 0.18, 0.5 * pixel );
        glints = step( h, 0.5 * lit ) * smoothstep( r + 0.5 * pixel, r - 0.5 * pixel, length( o ) ) * 0.0324 / ( r * r );
    }

    vec3 col = vec3( 0.012, 0.01, 0.02 ) + vec3( 0.004, 0.008, 0.004 ) * park;
    col += vec3( 0.26, 0.15, 0.07 ) * lit + GOLD * mix( glints, 0.05 * lit, far ) * 1.4;
    col += GOLD * ( street * 0.35 * dens + boulevards * 0.38 + 0.35 * exp( -length( p - ${glslVec2(TOWER)} ) / 70.0 ) );

    // The Seine, with lit quays, bridges every 280 m and the island in the middle.
    float dn = m.y - ( ${SEINE_SHIFT.toFixed(1)} + 120.0 * sin( m.x / 700.0 ) + 50.0 * sin( m.x / 260.0 + 1.0 ) );
    float isle = ${ISLE.width.toFixed(1)} * smoothstep( ${ISLE.length.toFixed(1)}, ${(ISLE.length * 0.7).toFixed(1)}, abs( m.x - ${ISLE.u.toFixed(1)} ) );
    float water = band( abs( dn ), ${RIVER.toFixed(1)}, soft ) * ( 1.0 - band( abs( dn ), isle, soft ) );
    float quays = band( abs( abs( dn ) - ${(RIVER + 4).toFixed(1)} ), 3.0, soft ) + band( abs( abs( dn ) - isle - 2.0 ), 2.5, soft ) * step( 4.0, isle );
    float bridges = band( abs( fract( m.x / 280.0 + 0.5 ) - 0.5 ) * 280.0, 8.0, soft ) * band( abs( dn ), ${(RIVER + 6).toFixed(1)}, soft );
    vec3 river = vec3( 0.006, 0.008, 0.02 ) + GOLD * 0.25 * exp( -max( ${RIVER.toFixed(1)} - abs( dn ), 0.0 ) / 22.0 );
    col = mix( col, river, water ) + GOLD * ( quays * 0.8 + bridges );

    vec4 mark = landmarks( vWorld, length( fwidth( normalize( vWorld - cameraPosition ) ) ) );
    col = mix( col, mark.rgb, mark.a );

    float alpha = max( 1.0 - smoothstep( 0.55, 1.0, length( vUv - 0.5 ) * 2.0 ), mark.a );
    col = mix( col, hazeAt( normalize( vWorld - cameraPosition ) ), ${CITY_HAZE.toFixed(2)} );
    gl_FragColor = vec4( applyHaze( col, vWorld ), alpha );
}
`

export function createCityBackdrop({ haze, hazeDensity = 1 / 4200 }) {
    const group = new THREE.Group()
    group.name = 'CityBackdrop'
    const time = { value: 0 }
    const hazeUniforms = { ...skyHaze(), uHaze: { value: haze }, uHazeDensity: { value: hazeDensity } }
    const material = new THREE.ShaderMaterial({
        name: 'city.night',
        uniforms: { ...hazeUniforms, uTime: time },
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
    }

    const dispose = () => {
        geometry.dispose()
        material.dispose()
        clouds.dispose()
    }

    return { group, update, dispose }
}
