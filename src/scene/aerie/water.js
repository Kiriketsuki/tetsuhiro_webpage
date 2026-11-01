import * as THREE from 'three'

// The pond and the stream (web_water). Each vertex stores its flow coordinate: s, the
// ground distance to Anchor_Waterfall_Top, and a lateral coordinate across the stream: the
// arc length round the lip. The streaks scroll toward a smaller s, so the water runs from
// the pond, down the stream and over the lip, where the waterfall ribbon takes it. The
// pond stays calm. The stream speed matches the ribbon speed at the lip, about 0.7 m/s.
// The streaks are thin lines along the flow: long along s and narrow across it. Round 4
// used a straight lateral axis, so where the stream bent, the streaks turned into round
// pale blotches, and the faceted normals threw a moon glint on single facets.

const DEEP = 0x2f4a52
const STREAK = 0x9fb8bf
// The share of the farthest water vertex distance that counts as the calm pond.
const POND_SHARE = 0.7

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec2 aFlow;
varying vec2 vFlow;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
    vFlow = aFlow;
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    vNormal = normalize( mat3( modelMatrix ) * normal );
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
uniform vec3 uDeep;
uniform vec3 uStreak;
uniform vec3 uMoonDir;
uniform vec3 uMoon;
uniform vec3 uSky;
varying vec2 vFlow;
varying vec3 vWorld;
varying vec3 vNormal;

float waterHash( vec2 p ) {
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float waterNoise( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( waterHash( i ), waterHash( i + vec2( 1, 0 ) ), f.x ), mix( waterHash( i + vec2( 0, 1 ) ), waterHash( i + vec2( 1, 1 ) ), f.x ), f.y );
}

void main() {
    float s = vFlow.x;
    // Adding time to s * 0.8 moves each streak toward a smaller s, toward the lip, at
    // 0.58 / 0.8, about 0.73 m/s. The pattern changes about six times faster across the
    // stream than along it, so each streak is a soft flow line that slides toward the lip.
    vec2 p = vec2( s * 0.8 + uTime * 0.58, vFlow.y * 5.0 );
    float n = waterNoise( p ) * 0.7 + waterNoise( p * vec2( 1.7, 2.3 ) + 3.1 ) * 0.3;
    float stream = 1.0 - smoothstep( uPond * 0.4, uPond, s );
    // Close to the lip the lateral coordinate turns fast round the lip point, and the streaks
    // there broke into a bright zig-zag of hard lines. The streaks fade out over the last
    // 2.4 m, and a soft band that moves only along s, toward the lip, takes their place.
    float nearLip = smoothstep( 0.6, 3.0, s );
    float streak = smoothstep( 0.55, 0.9, n ) * stream * nearLip;
    float lipBand = ( 1.0 - nearLip ) * ( 0.5 + 0.5 * sin( ( s + uTime * 0.73 ) * 4.0 ) ) * 0.55;

    vec3 view = normalize( cameraPosition - vWorld );
    // The water surface is flat, so it reflects with a straight-up normal. The faceted
    // mesh normals threw the moon glint onto single facets as pale patches.
    vec3 normal = vec3( 0.0, 1.0, 0.0 );
    float fresnel = pow( 1.0 - clamp( dot( normal, view ), 0.0, 1.0 ), 3.0 );
    float moon = pow( max( dot( reflect( -view, normal ), uMoonDir ), 0.0 ), 40.0 );
    // A slow, faint shimmer keeps the calm pond from reading as a flat plate.
    float calm = waterNoise( vWorld.xz * 0.9 + uTime * 0.05 ) * 0.5 + 0.5;

    vec3 color = uDeep * ( 0.55 + 0.15 * calm ) + uSky * fresnel * 0.35;
    color += uStreak * ( streak + lipBand ) * 0.24 + uMoon * moon * 0.3;
    gl_FragColor = vec4( color, 1.0 );
    #include <fog_fragment>
}
`

// Writes the aFlow attribute and returns the pond distance for the material.
export function prepareWater(mesh, lip) {
    const position = mesh.geometry.attributes.position
    const p = new THREE.Vector3()
    const s = new Float32Array(position.count)
    let farthest = 0
    const far = new THREE.Vector3()
    for (let i = 0; i < position.count; i += 1) {
        p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
        s[i] = Math.hypot(p.x - lip.x, p.z - lip.z)
        if (s[i] > farthest) {
            farthest = s[i]
            far.copy(p)
        }
    }
    // The lateral coordinate is the arc length round the lip, measured from the line that
    // runs from the lip back to the farthest water. It follows every bend of the stream,
    // and its seam lies behind the lip, where no water is.
    const back = Math.atan2(far.z - lip.z, far.x - lip.x)
    const flow = new Float32Array(position.count * 2)
    for (let i = 0; i < position.count; i += 1) {
        p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
        const turn = Math.atan2(Math.sin(Math.atan2(p.z - lip.z, p.x - lip.x) - back), Math.cos(Math.atan2(p.z - lip.z, p.x - lip.x) - back))
        flow[i * 2] = s[i]
        flow[i * 2 + 1] = turn * Math.max(s[i], 1)
    }
    mesh.geometry.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2))
    return farthest * POND_SHARE
}

export function createWaterMaterial({ pond, time, moonDirection, moon, sky }) {
    return new THREE.ShaderMaterial({
        name: 'aerie.water',
        uniforms: {
            ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
            uTime: time,
            uPond: { value: pond },
            uDeep: { value: new THREE.Color(DEEP) },
            uStreak: { value: new THREE.Color(STREAK) },
            uMoonDir: { value: moonDirection.clone().normalize() },
            uMoon: { value: moon.clone() },
            uSky: { value: sky.clone() },
        },
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        fog: true,
    })
}
