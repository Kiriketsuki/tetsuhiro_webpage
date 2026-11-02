import * as THREE from 'three'
import { HAZE_AT, hazeUniforms as skyHaze } from './sky.js'

// The city below the island, drawn by one shader on one flat plane, with no city geometry
// and no textures. Seen from far above at night, a city reads as a grid of lit streets,
// blocks with scattered window light, a dark river with lit banks and a few tall towers.
// The shader draws each of these from the world position, so the city stays sharp at any
// distance, and the distance haze and a radial fade melt its far edge into the void.

const SIZE = 9000
const CENTRE = [0, -780, -900]
// The angle of the main street grid, in radians. A second district runs at GRID + 0.6.
const GRID = 0.35
// One block, in metres, across and along the grid. Avenues run every 4 blocks across and
// every 3 blocks along.
const BLOCK = [80, 60]
// The downtown core, in world XZ metres. The lights thin out with distance from it.
const CORE = [-1250, -500]
// How far every pixel mixes into the haze colour along its view, before the distance haze.
const CITY_HAZE = 0.3
// Landmark towers: world X, world Z, half width and height, in metres. Each is a lit
// prism that the shader finds along the view ray, so a tower leans and shifts against the
// streets as the camera moves.
const TOWERS = [
    [-1300, -450, 17, 190],
    [-1180, -330, 12, 140],
    [-1420, -560, 12, 120],
    [-1150, -580, 11, 105],
    [-160, -1330, 14, 160],
    [-40, -1200, 10, 100],
    [-340, -540, 13, 150],
    [-700, -420, 11, 110],
]

const vertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`

// Shared haze: a distance fog toward the haze colour along the view (sky.js HAZE_AT), so
// the far city melts into the same gradient as the sky dome.
const HAZE_GLSL = /* glsl */ `
${HAZE_AT}
uniform float uHazeDensity;
vec3 applyHaze( vec3 color, vec3 world ) {
    vec3 toward = world - cameraPosition;
    float d = length( toward ) * uHazeDensity;
    return mix( color, hazeAt( toward / max( length( toward ), 1e-3 ) ), 1.0 - exp( -d * d ) );
}
`

// band() is the exact cover of a lit band of half width w, at distance d from its centre,
// over a pixel of width f. A band thinner than a pixel keeps its energy and fades, so the
// streets far away melt into a soft glow and never alias into a moire.
// lineAt() repeats the band at each integer of x. Past one cell a pixel the cover becomes
// the mean of the pattern.
// towers() tests the view ray back from the ground point against each tower prism (a slab
// test) and keeps the hit nearest the camera, which is the largest ray parameter.
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec4 uTowers[ ${TOWERS.length} ];
varying vec2 vUv;
varying vec3 vWorld;
${HAZE_GLSL}

float hash12( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
}
float noise( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash12( i ), hash12( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash12( i + vec2( 0.0, 1.0 ) ), hash12( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
mat2 turn( float a ) {
    float c = cos( a ), s = sin( a );
    return mat2( c, s, -s, c );
}
float band( float d, float w, float f ) {
    f = max( f, 1e-4 );
    return max( 0.0, min( d + 0.5 * f, w ) - max( d - 0.5 * f, -w ) ) / f;
}
float lineAt( float x, float w, float f ) {
    return mix( band( abs( fract( x + 0.5 ) - 0.5 ), w, f ), 2.0 * w, smoothstep( 0.3, 1.0, f ) );
}
// A field of round lights, one jittered light to a cell in a share 'on' of the cells.
float lights( vec2 c, float on, float pixel, float seed ) {
    vec2 id = floor( c );
    float h = hash12( id + seed );
    float r = 0.18;
    vec2 o = fract( c ) - 0.5 - ( vec2( hash12( id + 4.1 ), hash12( id + 9.7 ) ) - 0.5 ) * 0.5;
    float lit = step( h, on ) * smoothstep( r + 0.5 * pixel, r - 0.5 * pixel, length( o ) ) * ( 0.6 + 0.4 * sin( uTime * ( 0.3 + h ) + h * 50.0 ) );
    return mix( lit, on * 3.1416 * r * r * 0.8, smoothstep( 0.4, 1.4, pixel ) );
}

vec4 towers( vec3 P, float pixelAngle ) {
    vec3 toCam = cameraPosition - P;
    mat2 R = turn( ${GRID.toFixed(2)} );
    vec2 b = R * toCam.xz + 1e-4;
    float best = -1.0;
    vec3 colour = vec3( 0.0 );
    for ( int i = 0; i < ${TOWERS.length}; i ++ ) {
        vec4 T = uTowers[ i ];
        vec2 a = R * ( P.xz - T.xy );
        vec2 t0 = ( -T.z - a ) / b;
        vec2 t1 = ( T.z - a ) / b;
        vec2 hi = max( t0, t1 );
        float tIn = max( max( min( t0.x, t1.x ), min( t0.y, t1.y ) ), 0.0 );
        float tTop = T.w / toCam.y;
        float tOut = min( min( hi.x, hi.y ), tTop );
        if ( tIn > tOut || tOut <= best ) continue;
        best = tOut;
        vec2 s = a + b * tOut;
        float y = toCam.y * tOut;
        float seed = hash12( T.xy );
        vec3 glass = mix( vec3( 1.0, 0.74, 0.42 ), vec3( 0.62, 0.78, 1.0 ), step( 0.7, seed ) );
        float pixel = pixelAngle * length( toCam ) * ( 1.0 - tOut );
        float blink = step( 0.6, sin( uTime * 2.4 + seed * 20.0 ) );
        if ( tOut >= tTop - 1e-5 ) {
            colour = vec3( 0.02, 0.02, 0.03 ) + glass * 0.5 * band( T.z - max( abs( s.x ), abs( s.y ) ), 1.2, pixel )
                + vec3( 1.0, 0.08, 0.05 ) * 3.0 * blink * band( length( s ), max( 2.5, pixel ), pixel );
        } else {
            float side = hi.x < hi.y ? 1.0 : 0.62;
            float u = hi.x < hi.y ? s.y : s.x;
            vec2 w = vec2( u / 3.2, y / 3.8 );
            float f = pixel / 3.2;
            float on = 0.2 + 0.2 * seed;
            float pane = step( hash12( floor( w ) + T.xy ), on ) * band( abs( fract( w.x ) - 0.5 ), 0.32, f ) * band( abs( fract( w.y ) - 0.5 ), 0.26, f );
            pane = mix( pane, on * 0.33, smoothstep( 0.4, 1.4, f ) );
            float crown = smoothstep( T.w - 14.0, T.w - 10.0, y ) - smoothstep( T.w - 6.0, T.w - 4.0, y );
            colour = side * ( vec3( 0.008, 0.008, 0.016 ) + glass * ( pane * 1.8 + crown * 2.2 ) );
        }
    }
    return vec4( colour, step( 0.0, best ) );
}

void main() {
    vec2 p = vWorld.xz;
    float core = exp( -length( p - vec2( ${CORE[0].toFixed(1)}, ${CORE[1].toFixed(1)} ) ) / 1600.0 );
    float dens = mix( 0.15, 1.0, core );

    // Streets: a grid bent a little by a slow noise, with a second district at another angle.
    vec2 pw = p + ( vec2( noise( p / 900.0 ), noise( p / 900.0 + 5.2 ) ) - 0.5 ) * 160.0;
    float alt = step( 0.64, noise( p / 1500.0 + 3.0 ) );
    vec2 m = turn( ${GRID.toFixed(2)} + alt * 0.6 ) * pw;
    vec2 q = m / vec2( ${BLOCK[0].toFixed(1)}, ${BLOCK[1].toFixed(1)} );
    vec2 f = min( fwidth( q ), vec2( 2.0 ) );
    float minor = max( lineAt( q.x, 0.06, f.x ), lineAt( q.y, 0.08, f.y ) );
    vec2 qa = q / vec2( 4.0, 3.0 );
    vec2 fa = f / vec2( 4.0, 3.0 );
    float major = max( lineAt( qa.x, 0.03, fa.x ), lineAt( qa.y, 0.035, fa.y ) );
    float spill = max( lineAt( qa.x, 0.08, fa.x ), lineAt( qa.y, 0.1, fa.y ) );

    // Blocks: parks, dark lots and lit lots, with window lights on a 7 m cell.
    vec2 cell = floor( q ) + alt * 31.0;
    float kind = hash12( cell );
    float park = step( kind, 0.08 );
    float lot = hash12( floor( q * vec2( 3.0, 2.0 ) ) + 11.3 + alt * 7.0 );
    float lit = dens * ( 0.35 + 0.65 * lot ) * ( 1.0 - park ) * ( 1.0 - minor );
    vec2 wc = m / 7.0;
    float pixel = max( fwidth( wc.x ), fwidth( wc.y ) );
    float glints = lights( wc, 0.6 * lit, pixel, 0.0 );
    float warm = step( 0.3, hash12( floor( wc ) + 2.3 ) );

    vec3 sodium = vec3( 1.0, 0.5, 0.18 );
    vec3 col = mix( vec3( 0.012, 0.011, 0.022 ), vec3( 0.006, 0.014, 0.01 ), park );
    col += vec3( 0.16, 0.09, 0.06 ) * lit * lot;
    col += mix( vec3( 0.7, 0.82, 1.0 ), vec3( 1.0, 0.78, 0.48 ), warm ) * glints * 1.6;
    float streets = mix( 0.35, 1.0, core );
    col += sodium * ( minor * ( 1.0 - park * 0.7 ) * 0.12 + major * 0.4 + spill * 0.04 ) * streets;

    // The river: a dark winding band with lit banks. Only the avenues cross it, as bridges.
    vec2 rq = turn( -0.5 ) * p;
    float rx = rq.x - 250.0 * sin( rq.y / 800.0 ) - 100.0 * sin( rq.y / 310.0 + 1.0 ) + 700.0;
    float fr = fwidth( rx );
    float river = band( abs( rx ), 75.0, fr );
    vec3 water = vec3( 0.004, 0.006, 0.016 ) + sodium * 0.03 * smoothstep( 0.55, 0.9, noise( vec2( rx / 5.0, rq.y / 60.0 + uTime * 0.05 ) ) );
    col = mix( col, water, river );
    col += sodium * major * river * streets * 1.4;
    col += vec3( 1.0, 0.7, 0.4 ) * band( abs( abs( rx ) - 79.0 ), 2.5, fr ) * 1.2 * streets;

    // A highway on a long curve, with white lights one way and red lights the other.
    vec2 hq = turn( 1.1 ) * p;
    float hx = hq.x - 350.0 * sin( hq.y / 1100.0 ) - 300.0;
    float fh = fwidth( hx );
    float lane = sign( hx );
    float cars = lights( vec2( hx / 8.0, hq.y / 14.0 - uTime * 1.2 * lane ), 0.5, max( fh / 8.0, fwidth( hq.y ) / 14.0 ), 5.0 );
    col += sodium * band( abs( hx ), 14.0, fh ) * 0.9 * streets;
    col += mix( vec3( 1.0, 0.12, 0.06 ), vec3( 1.0, 0.95, 0.85 ), step( 0.0, lane ) ) * cars * band( abs( hx ), 9.0, fh ) * 2.0;

    vec4 tower = towers( vWorld, length( fwidth( normalize( vWorld - cameraPosition ) ) ) );
    col = mix( col, tower.rgb, tower.a );

    float alpha = max( 1.0 - smoothstep( 0.55, 1.0, length( vUv - 0.5 ) * 2.0 ), tower.a );
    col = mix( col, hazeAt( normalize( vWorld - cameraPosition ) ), ${CITY_HAZE.toFixed(2)} );
    gl_FragColor = vec4( applyHaze( col, vWorld ), alpha );
}
`

export function createCityBackdrop({ haze, hazeDensity = 1 / 4200 }) {
    const group = new THREE.Group()
    group.name = 'CityBackdrop'
    const time = { value: 0 }
    const material = new THREE.ShaderMaterial({
        name: 'city.night',
        uniforms: {
            ...skyHaze(),
            uHaze: { value: haze },
            uHazeDensity: { value: hazeDensity },
            uTowers: { value: TOWERS.map((tower) => new THREE.Vector4(...tower)) },
            uTime: time,
        },
        vertexShader,
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
    group.add(mesh)

    const update = (seconds) => {
        time.value = seconds
    }

    const dispose = () => {
        geometry.dispose()
        material.dispose()
    }

    return { group, update, dispose }
}
