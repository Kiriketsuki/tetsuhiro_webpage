import * as THREE from 'three'

// The waterfall off the aerie rim. One ribbon starts on the open stream mouth that
// prepareWater (water.js) finds, so it is as wide as the stream you see and lies at the same
// angle. The water leaves the lip level, arcs out over the soil rim on a ballistic path and
// falls. It uses the stream palette, the same crest and the same dash speed at the lip, and
// its streaks stretch as the water speeds up. The top 20 percent is opaque and the tail
// fades out below the aerie underside, so the fall never lands. There is no mist and no
// noise tap.

// Metres below the lip at each row after the first. The rows sit close at the rim, where the
// sheet turns over, and far apart lower down, where it falls almost straight.
const ROW_DROP = [0, 0.08, 0.25, 0.55, 1, 1.7, 2.8, 4.4, 6.8, 10.2, 15.2, 22]
// The full drop, in metres. The aerie underside ends about 17 m below the lip, so the tail
// fades out just past it.
const DROP = 22
// The horizontal speed at the lip, in m/s, and gravity. The face under the mouth bulges about
// 0.32 m out at 0.6 m below the lip. This path is 0.58 m out there, so it clears the face.
const PUSH = 1.3
const GRAVITY = 9.8
// The sheet leaves the lip this far out, in metres, before it starts to drop. The crest
// stays level over the grass corners at each end of the mouth.
const LIP_OUT = 0.12
// The first row starts this far upstream, over the end of the stream, and every row sits
// this far higher than the water. The stream crest hides the overlap.
const START_IN = 0.06
const LIFT = 0.02
// The bottom width as a share of the mouth width.
const NARROW = 0.85
// The half width of the fallback mouth, in metres, when prepareWater found no mouth edge.
// The open mouth measures about 2.5 m.
const FALLBACK_HALF = 1.25

const ribbonVertex = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
}
`

const ribbonFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform float uLength;
uniform float uWidth;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uShallow;
uniform vec3 uDash;
uniform vec3 uFoam;
varying vec2 vUv;

float waterHash( float n ) {
    return fract( sin( n * 127.1 + 311.7 ) * 43758.5453 );
}
// A step with an edge about one pixel wide, so the toon lines do not alias.
float aaStep( float edge, float x, float w ) {
    return smoothstep( edge - w, edge + w, x );
}

void main() {
    // fall runs 0 at the lip to 1 at the tail. d is metres below the lip, x metres across.
    float fall = vUv.y;
    float d = fall * uLength;
    float x = vUv.x * uWidth;
    float edge = min( x, uWidth - x );
    // The flow phase. At the lip it runs 0.45 per metre and slides at 0.32 per second, as on
    // the stream, so the water leaves the lip at 0.71 m/s. The phase per metre falls with d,
    // so every mark stretches and speeds up as it falls.
    float q = 0.45 * d / ( 1.0 + 0.12 * d );
    float wq = fwidth( q ) * 0.75 + 1e-4;

    // Flat body: MID at the lip, as the end of the stream, and DEEP lower down.
    vec3 color = mix( uMid, uDeep, smoothstep( 0.2, 0.6, fall ) );

    // Broad bands: wide lanes of the shallow colour that slide down at half speed, so the
    // sheet shows its flow between the streaks.
    float broad = x * 0.8;
    float broadSeed = waterHash( floor( broad ) + 31.0 );
    float band = 1.0 - aaStep( 0.12 + 0.12 * broadSeed, abs( fract( broad ) - 0.5 ), fwidth( broad ) * 0.75 + 1e-4 );
    float bandAlong = fract( q * 0.5 - uTime * 0.16 + broadSeed * 5.0 );
    band *= aaStep( 0.25, bandAlong, wq ) * ( 1.0 - aaStep( 0.95, bandAlong, wq ) );
    color = mix( color, uShallow, band * 0.5 );

    // Streaks: thin lanes with their own offset, length and phase, as on the stream.
    float lanes = x * 2.2;
    float laneSeed = waterHash( floor( lanes ) );
    float lane = 1.0 - aaStep( 0.06, abs( fract( lanes ) - 0.3 - 0.4 * laneSeed ), fwidth( lanes ) * 0.75 + 1e-4 );
    float along = fract( q - uTime * 0.32 + laneSeed * 7.0 );
    float streak = lane * aaStep( 0.5 - 0.2 * laneSeed, along, wq ) * ( 1.0 - aaStep( 0.97, along, wq ) );
    color = mix( color, uDash, streak * 0.6 );

    // The crest: solid foam where the sheet turns over the rim, the same crest that ends the
    // stream. Just below it the streaks turn to foam, as white water.
    float wd = fwidth( d ) * 0.75 + 1e-4;
    float crest = 1.0 - aaStep( 0.08, d, wd );
    float white = streak * ( 1.0 - aaStep( 0.45, d, wd ) );
    color = mix( color, uFoam, max( crest, white ) );
    // The sides fall a step darker than the middle, so the sheet reads as a curved body of
    // water and not as a flat card.
    color *= 0.75 + 0.25 * smoothstep( 0.0, 0.5, edge );

    // The lower sheet takes the fog colour before it fades, so it sinks into the haze under
    // the aerie. The grade lifts the water blues, and without this the tail read as a lit beam.
    #ifdef USE_FOG
    color = mix( color, fogColor, smoothstep( 0.15, 0.7, fall ) * 0.75 );
    #endif
    // Opaque over the top 20 percent, then a fade into the haze. A slow wave across the
    // sheet ends it at different heights, so the tail has no flat edge.
    float alpha = 1.0 - smoothstep( 0.2, 0.8, fall + 0.05 * sin( x * 3.1 ) );
    // The sides ripple a little as the sheet falls, so its edges do not read as cut card.
    float ripple = 0.04 * ( 1.0 + sin( d * 2.2 - uTime * 3.0 + x ) );
    alpha *= aaStep( ripple, edge, fwidth( edge ) * 0.75 + 1e-4 );
    gl_FragColor = vec4( color, alpha );
    #include <fog_fragment>
}
`

// Builds a straight mouth from the two anchors when the water mesh gave none. It is square
// to the line from the top to the base.
function fallbackMouth(top, base) {
    const out = new THREE.Vector3(base.x - top.x, 0, base.z - top.z)
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1)
    out.normalize()
    const side = new THREE.Vector3(-out.z, 0, out.x)
    return {
        a: top.clone().addScaledVector(side, -FALLBACK_HALF),
        b: top.clone().addScaledVector(side, FALLBACK_HALF),
        normal: out,
    }
}

// Two columns, one per mouth end, and one row per drop: 26 vertices and 24 triangles. The
// mouth bows by about 2 cm, so two columns follow it.
function ribbonGeometry({ a, b, normal }) {
    const across = new THREE.Vector3(b.x - a.x, 0, b.z - a.z)
    const width = across.length()
    across.normalize()
    const centre = new THREE.Vector3((a.x + b.x) / 2, Math.max(a.y, b.y) + LIFT, (a.z + b.z) / 2)
    const rows = [
        { out: -START_IN, drop: 0 },
        ...ROW_DROP.map((drop) => ({ out: LIP_OUT + PUSH * Math.sqrt((2 * drop) / GRAVITY), drop })),
    ]
    const positions = []
    const uvs = []
    rows.forEach(({ out, drop }) => {
        const fall = drop / DROP
        const half = 0.5 * width * (1 - (1 - NARROW) * fall)
        ;[0, 1].forEach((u) => {
            const p = centre.clone().addScaledVector(across, (u * 2 - 1) * half).addScaledVector(normal, out)
            positions.push(p.x, p.y - drop, p.z)
            uvs.push(u, fall)
        })
    })
    const index = []
    for (let j = 0; j < rows.length - 1; j += 1) {
        const k = j * 2
        index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(index)
    geometry.computeBoundingSphere()
    return { geometry, width }
}

// mouth is the open mouth line from prepareWater ({ a, b, normal }). Without it, top and base
// (Anchor_Waterfall_Top and Anchor_Waterfall_Base) build a straight fallback mouth. colors is
// WATER_COLORS from water.js. The caller passes it in, because this module loads in its own
// chunk, and an import from the scene chunk would make Rollup split the scene chunk.
export function createWaterfall({ mouth = null, top = null, base = null, colors }) {
    const group = new THREE.Group()
    group.name = 'Waterfall'
    const time = { value: 0 }
    const { geometry, width } = ribbonGeometry(mouth ?? fallbackMouth(top, base))
    const material = new THREE.ShaderMaterial({
        name: 'aerie.waterfall',
        uniforms: {
            ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
            uTime: time,
            uLength: { value: DROP },
            uWidth: { value: width },
            uDeep: { value: new THREE.Color(colors.deep) },
            uMid: { value: new THREE.Color(colors.mid) },
            uShallow: { value: new THREE.Color(colors.shallow) },
            uDash: { value: new THREE.Color(colors.dash) },
            uFoam: { value: new THREE.Color(colors.foam) },
        },
        vertexShader: ribbonVertex,
        fragmentShader: ribbonFragment,
        // Only the tail and the rippled sides have alpha below 1. A blended layer only raises
        // the target alpha, so it never turns ink on (toon-material.js).
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
    })
    const ribbon = new THREE.Mesh(geometry, material)
    ribbon.renderOrder = 2
    group.add(ribbon)

    const update = (seconds) => {
        time.value = seconds
    }
    // The ribbon has no screen-sized sprite, so a resize changes nothing. scene-manager.js
    // still calls it with the other sprite layers.
    const resize = () => {}
    const dispose = () => {
        geometry.dispose()
        material.dispose()
    }
    return { group, update, resize, dispose }
}
