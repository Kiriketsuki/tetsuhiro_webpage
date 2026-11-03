import * as THREE from 'three'
import { HAZE_GLSL, NOISE_GLSL, PLANE_VERTEX } from './city-glsl.js'
import { bake } from './city-map.js'

// Cloud and fog layers between the aerie and the city. Each layer is one flat plane of
// slow drifting cloud over a thin even fog. The layers sit at different heights, so they
// slide against each other and against the city as the camera moves, and the city shows
// only through the gaps. Thin cloud takes a warm glow from the city below it. Thick cloud
// shows its moonlit top in the haze colour. The noise comes from one small tiling texture
// that the module bakes at load, so a cloud pixel costs two texture reads.

const SIZE = 9000
// One layer each: height, the cloud scale in metres, the share of sky that stays clear (0 to
// 1), the even fog under the cloud, and the opacity of the thickest cloud.
const LAYERS = [
    { y: -620, scale: 650, clear: 0.44, fog: 0.35, opacity: 0.85 },
    { y: -340, scale: 1100, clear: 0.52, fog: 0.0, opacity: 0.75 },
]
// The fog of the lowest layer, for the tower parts that rise above it: its height, and the
// mean alpha of the layer over its fog and its cloud. The towers write depth, so the layer
// covers only the parts below it, and the parts above it take this fog in their own shader.
export const FOG_LAYER = { y: LAYERS[0].y, alpha: 0.42 }
// The colour of thin cloud, in GLSL, from the haze colour along the view.
export const THIN_CLOUD = 'haze + vec3( 1.0, 0.6, 0.26 ) * 0.05'

// The noise tile: NOISE_TEXELS texels across, NOISE_CELLS value noise cells across. The GPU
// bakes it once at load. R and G hold one octave each for the warp, B holds four octaves for
// the cloud. Each octave wraps at the tile edge, so the tile repeats with no seam.
const NOISE_TEXELS = 128
const NOISE_CELLS = 16
const NOISE_BAKE = /* glsl */ `
varying vec2 vUv;
${NOISE_GLSL}
float tiled( vec2 p, float period ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    float a = hash12( mod( i, period ) );
    float b = hash12( mod( i + vec2( 1.0, 0.0 ), period ) );
    float c = hash12( mod( i + vec2( 0.0, 1.0 ), period ) );
    float d = hash12( mod( i + 1.0, period ) );
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
void main() {
    vec2 p = vUv * ${NOISE_CELLS.toFixed(1)};
    float fbm = 0.0;
    for ( int o = 0; o < 4; o ++ ) {
        float s = exp2( float( o ) );
        fbm += tiled( p * s + 47.0, ${NOISE_CELLS.toFixed(1)} * s ) / ( 2.0 * s );
    }
    gl_FragColor = vec4( tiled( p + 11.0, ${NOISE_CELLS.toFixed(1)} ), tiled( p + 29.0, ${NOISE_CELLS.toFixed(1)} ), fbm, 1.0 );
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform float uScale;
uniform float uClear;
uniform float uFog;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vWorld;
${HAZE_GLSL}

void main() {
    // Past the round edge the alpha is exactly zero. Normal blending with a zero source alpha
    // leaves the target unchanged and depth writes are off, so these pixels skip the noise.
    float edge = 1.0 - smoothstep( 0.5, 1.0, length( vUv - 0.5 ) * 2.0 );
    if ( edge <= 0.0 ) {
        gl_FragColor = vec4( 0.0 );
        return;
    }
    vec2 p = vWorld.xz / uScale + vec2( 0.004, 0.0025 ) * uTime;
    p += 0.8 * texture2D( uNoise, p * ${(0.7 / NOISE_CELLS).toFixed(5)} ).rg;
    float d = texture2D( uNoise, p / ${NOISE_CELLS.toFixed(1)} ).b;
    float cloud = smoothstep( uClear * 0.94, uClear * 0.94 + 0.22, d );
    // A layer with no fog and no cloud here has alpha exactly zero, so it skips the haze work.
    if ( cloud <= 0.0 && uFog == 0.0 ) {
        gl_FragColor = vec4( 0.0 );
        return;
    }
    vec3 view = normalize( vWorld - cameraPosition );
    vec3 haze = hazeAt( view );
    vec3 top = haze * 1.45 + vec3( 0.03, 0.03, 0.05 );
    vec3 thin = ${THIN_CLOUD};
    vec3 col = mix( thin, top, smoothstep( 0.0, 0.6, cloud ) );
    gl_FragColor = vec4( applyHaze( col, vWorld ), edge * mix( uFog, 1.0, cloud ) * uOpacity );
}
`

export function createCityClouds({ renderer, hazeUniforms, time, centre }) {
    const noise = bake(renderer, NOISE_TEXELS, NOISE_BAKE, THREE.RepeatWrapping)
    const geometry = new THREE.PlaneGeometry(SIZE, SIZE)
    geometry.rotateX(-Math.PI / 2)
    const meshes = LAYERS.map((layer, index) => {
        const material = new THREE.ShaderMaterial({
            name: `city.cloud${index}`,
            uniforms: {
                ...hazeUniforms,
                uNoise: { value: noise.texture },
                uTime: time,
                uScale: { value: layer.scale },
                uClear: { value: layer.clear },
                uFog: { value: layer.fog },
                uOpacity: { value: layer.opacity },
            },
            vertexShader: PLANE_VERTEX,
            fragmentShader,
            transparent: true,
            depthWrite: false,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(centre[0], layer.y, centre[2])
        mesh.renderOrder = -7 + index
        mesh.name = `CityCloud_${index}`
        return mesh
    })
    const dispose = () => {
        geometry.dispose()
        noise.dispose()
        meshes.forEach((mesh) => mesh.material.dispose())
    }
    return { meshes, dispose }
}
