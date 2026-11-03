import * as THREE from 'three'
import { hazeUniforms as skyHaze } from './sky.js'
import { CITY_HAZE, HAZE_GLSL, NOISE_GLSL, PLANE_VERTEX } from './city-glsl.js'
import { createCityClouds } from './city-clouds.js'
import { BOKEH, CITY_LOOK, GRID, GRID_NORMAL, MAP_CENTRE, MAP_SIZE, MAP_TEXELS, bakeCityMap } from './city-map.js'
import { createCityTowers } from './city-towers.js'
import { createCityOffscreen } from './city-offscreen.js'

// The invented night city far below the aerie, drawn by one shader on one flat plane, with
// its tall towers as one instanced mesh. The plan (city-map.js) mixes Paris, New York and
// Tokyo, with magenta and cyan neon as the mood. The city is far behind the focus of the
// aerie, so it shows as a field of separate lights, each one an out-of-focus bokeh disc, in
// sodium orange, warm white, a few cool whites and, in the neon districts, magenta and cyan.
// The lights gather along the streets, stay off the river and the parks, and merge into a
// soft glow only where they crowd together. Lines of rail cross the city, with trains on them.

const SIZE = 9000
const CENTRE = [0, -780, -900]
// The mean light of the city.
const LIGHT = 0.12
// One block of the street grid, in metres, along and across the grid.
const BLOCK = [80, 46]
// The rail ring: centre, radius, the length of one train and the trains on the ring.
const RING = { at: [-900, -1150], radius: 820, train: 70, trains: 14 }
// A straight rail line across the city, and its train spacing.
const LINE = { from: [-2600, -300], to: [900, -2350], spacing: 520, train: 70 }

const glslVec2 = ([x, y]) => `vec2( ${x.toFixed(3)}, ${y.toFixed(3)} )`
const lineDir = new THREE.Vector2(LINE.to[0] - LINE.from[0], LINE.to[1] - LINE.from[1])
const lineLength = lineDir.length()
lineDir.normalize()

// band() is the exact cover of a lit band of half width w, at distance d from its centre,
// over a soft edge of width f, so a far band keeps its energy, spreads and never aliases.
// field() draws one level of the light field: one jittered light to a cell of s metres. The
// pixel tests the four cells nearest it, which is exact while a disc stays under half a
// cell, and the level choice in main() keeps it so. Each light reads its density and neon
// from the map at the light position, so a disc is never cut at a river bank. Each disc is
// measured through toPx, the map to screen Jacobian inverse, so it stays round on screen.
const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uDpr;
uniform vec3 uRail;
uniform float uPool;
varying vec2 vUv;
varying vec3 vWorld;
${HAZE_GLSL}
${NOISE_GLSL}

const vec3 GOLD = vec3( 1.0, 0.6, 0.26 );
const vec3 CYAN = vec3( 0.35, 0.88, 1.0 );
const vec3 MAGENTA = vec3( 1.0, 0.3, 0.72 );
const vec3 VIOLET = vec3( 0.66, 0.45, 1.0 );
const vec2 GRID = ${glslVec2([GRID.x, GRID.y])};
const vec2 GRID_NORMAL = ${glslVec2([GRID_NORMAL.x, GRID_NORMAL.y])};
const vec2 MAP_MIN = ${glslVec2([MAP_CENTRE[0] - MAP_SIZE / 2, MAP_CENTRE[1] - MAP_SIZE / 2])};

mat2 toPx;
float discPx;

float band( float d, float w, float f ) {
    f = max( f, 1e-4 );
    return max( 0.0, min( d + 0.5 * f, w ) - max( d - 0.5 * f, -w ) ) / f;
}
vec2 mapUv( vec2 p ) {
    return ( p - MAP_MIN ) / ${MAP_SIZE.toFixed(1)};
}
// The neon of the map: its share of the lights, and its hue, magenta under 0.5 and cyan over.
vec3 neonOf( float g, float k ) {
    vec3 primary = g > 0.5 ? CYAN : MAGENTA;
    vec3 other = g > 0.5 ? VIOLET : CYAN;
    return fract( k * 53.1 ) < 0.78 ? primary : other;
}
vec3 tint( float k, float g ) {
    if ( fract( k * 31.7 ) < abs( g - 0.5 ) * 2.0 ) return neonOf( g, k ) * 1.5;
    float h = fract( k * 7.3 );
    return h < 0.45 ? vec3( 1.0, 0.5, 0.17 ) : h < 0.82 ? vec3( 1.0, 0.75, 0.46 ) : vec3( 0.74, 0.84, 1.0 );
}
vec3 field( vec2 p, float s, float seed, float lod ) {
    vec3 sum = vec3( 0.0 );
    vec2 c = floor( p / s - 0.5 );
    float resolve = 1.0 - smoothstep( 40.0, 110.0, s );
    for ( int j = 0; j <= 1; j ++ ) {
        for ( int i = 0; i <= 1; i ++ ) {
            vec2 id = c + vec2( float( i ), float( j ) );
            vec2 q = ( id + hash22( id + seed ) ) * s;
            float d = length( toPx * ( q - p ) );
            if ( d >= discPx + 0.8 ) continue;
            vec4 m = textureLod( uMap, mapUv( q ), lod );
            float k = hash12( id + seed + 7.7 );
            vec2 e = ( 0.5 - abs( fract( vec2( dot( q, GRID ) / ${BLOCK[0].toFixed(1)}, dot( q, GRID_NORMAL ) / ${BLOCK[1].toFixed(1)} ) ) - 0.5 ) ) * vec2( ${BLOCK[0].toFixed(1)}, ${BLOCK[1].toFixed(1)} );
            float street = smoothstep( 9.0, 2.0, min( e.x, e.y ) );
            float w = mix( 0.48, mix( 0.3, 1.0, street ), resolve ) * ( m.r + 1.2 * m.b ) * exp2( 3.2 * fract( k * 3.9 ) - 1.6 );
            float disc = smoothstep( discPx + 0.8, discPx - 0.8, d ) * ( 0.85 + 0.3 * smoothstep( 0.55 * discPx, discPx, d ) );
            sum += tint( k, m.g ) * w * disc;
        }
    }
    return sum;
}

// Soft rail lines with trains on them. A train is a brighter dash that moves along the line.
float rails( vec2 p, float soft, out float trains ) {
    trains = 0.0;
    vec2 r = p - ${glslVec2(RING.at)};
    float dRing = abs( length( r ) - ${RING.radius.toFixed(1)} );
    float glow = 0.0;
    if ( dRing < 12.0 + soft ) {
        glow = band( dRing, 2.5, soft );
        float spacing = ${((2 * Math.PI * RING.radius) / RING.trains).toFixed(3)};
        float a = atan( r.y, r.x ) * ${RING.radius.toFixed(1)} - uTime * 24.0;
        trains += glow * band( abs( fract( a / spacing ) - 0.5 ) * spacing, ${(RING.train / 2).toFixed(1)}, soft );
    }
    vec2 l = p - ${glslVec2(LINE.from)};
    float t = dot( l, ${glslVec2([lineDir.x, lineDir.y])} );
    float dLine = abs( dot( l, ${glslVec2([-lineDir.y, lineDir.x])} ) );
    if ( dLine < 12.0 + soft && t > 0.0 && t < ${lineLength.toFixed(1)} ) {
        float g = band( dLine, 2.5, soft );
        glow = max( glow, g );
        float a = t + uTime * 30.0;
        trains += g * band( abs( fract( a / ${LINE.spacing.toFixed(1)} ) - 0.5 ) * ${LINE.spacing.toFixed(1)}, ${(LINE.train / 2).toFixed(1)}, soft );
    }
    return glow;
}

void main() {
    // Past the round edge the alpha is exactly zero, so these pixels skip all the work.
    float edge = 1.0 - smoothstep( 0.55, 1.0, length( vUv - 0.5 ) * 2.0 );
    if ( edge <= 0.0 ) {
        gl_FragColor = vec4( 0.0 );
        return;
    }
    vec2 p = vWorld.xz;
    vec2 dx = dFdx( p );
    vec2 dy = dFdy( p );
    float det = dx.x * dy.y - dy.x * dx.y;
    toPx = mat2( dy.y, -dx.y, -dy.x, dx.x ) / ( abs( det ) < 1e-6 ? 1e-6 : det );
    float mpp = max( length( dx ), length( dy ) );
    float dist = distance( vWorld, cameraPosition );
    discPx = uDpr * mix( ${BOKEH[0].toFixed(2)}, ${BOKEH[1].toFixed(2)}, smoothstep( 900.0, 3000.0, dist ) );
    float soft = 2.0 * discPx * mpp;
    vec4 map = texture2D( uMap, mapUv( p ) );

    // The light field: two levels, blended so the discs keep their screen size. A disc stays
    // under half a cell: its reach along a map axis is at most its radius times the length
    // of ( |dx|, |dy| ), and the first level cell is at least 2.05 times that reach.
    float reach = ( discPx + 0.8 ) * length( vec2( length( dx ), length( dy ) ) );
    float level = max( log2( 2.05 * reach / 8.0 ), 0.0 );
    float k = floor( level );
    float s1 = 8.0 * exp2( k );
    float lod = max( log2( s1 / ${(MAP_SIZE / MAP_TEXELS).toFixed(3)} ), 0.0 );
    // Far off, a cell holds too few lights to read as a city, so the field gives way to its own
    // mean glow, and those pixels skip the light tests.
    float far = smoothstep( 3000.0, 4400.0, dist );
    vec3 lights = vec3( 0.95, 0.65, 0.42 ) * 0.95 * map.r;
    if ( far < 1.0 ) {
        float gain = 1.0 / ( 3.1416 * discPx * discPx * abs( det ) + 1e-6 );
        vec3 near = mix( field( p, s1, k * 13.1, lod ) * s1 * s1, field( p, 2.0 * s1, k * 13.1 + 13.1, lod + 1.0 ) * 4.0 * s1 * s1, level - k ) * gain;
        lights = mix( near, lights, far );
    }

    float share = abs( map.g - 0.5 ) * 2.0;
    vec3 pool = map.g > 0.5 ? CYAN : MAGENTA;
    float shine = ${LIGHT.toFixed(3)};
    vec3 col = vec3( 0.006, 0.006, 0.014 ) + lights * shine;
    col += mix( GOLD, pool, 0.6 * share ) * shine * ( 0.12 + 0.3 * map.r + 2.2 * map.b );
    col += pool * shine * uPool * share * ( 0.15 + map.r );

    float trains;
    float rail = rails( p, soft, trains );
    col += uRail * shine * ( 2.0 * rail + 3.5 * trains * ( 1.0 - smoothstep( 1500.0, 3500.0, dist ) ) );

    // The river: dark water with the soft glow of the quay lamps along its banks.
    vec3 water = vec3( 0.004, 0.006, 0.018 ) + ( GOLD + pool * share ) * shine * 0.3;
    col = mix( col, water, map.a * 0.95 );

    col = mix( col, hazeAt( normalize( vWorld - cameraPosition ) ), ${CITY_HAZE.toFixed(2)} );
    gl_FragColor = vec4( applyHaze( col, vWorld ), edge );
}
`

// pixelRatio returns the renderer pixel ratio, so a bokeh disc keeps its size in CSS pixels.
// The renderer bakes the city map once, here.
export function createCityBackdrop({ renderer, haze, hazeDensity = 1 / 4200, pixelRatio = () => 1 }) {
    const group = new THREE.Group()
    group.name = 'CityBackdrop'
    const time = { value: 0 }
    const dpr = { value: pixelRatio() }
    const map = bakeCityMap(renderer, CITY_LOOK)
    const hazeUniforms = { ...skyHaze(), uHaze: { value: haze }, uHazeDensity: { value: hazeDensity } }
    const material = new THREE.ShaderMaterial({
        name: 'city.night',
        uniforms: { ...hazeUniforms, uMap: { value: map.texture }, uTime: time, uDpr: dpr, uRail: { value: new THREE.Vector3(...CITY_LOOK.rail) }, uPool: { value: CITY_LOOK.pool } },
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
    const towers = createCityTowers({ hazeUniforms, look: CITY_LOOK, dpr })
    const clouds = createCityClouds({ renderer, hazeUniforms, time, centre: CENTRE })
    const layers = [mesh, towers.mesh, ...clouds.meshes]
    const offscreen = createCityOffscreen(layers)
    group.add(offscreen.quad, ...layers)
    group.userData.layers = layers

    // A disc keeps its size in CSS pixels, so its size in target pixels follows the target scale.
    const update = (seconds) => {
        time.value = seconds
        dpr.value = pixelRatio() * offscreen.sync(group, pixelRatio())
    }
    update(0)

    const dispose = () => {
        geometry.dispose()
        material.dispose()
        map.dispose()
        towers.dispose()
        clouds.dispose()
        offscreen.dispose()
    }

    return { group, update, dispose }
}
