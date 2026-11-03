import * as THREE from 'three'
import { HAZE_GLSL, PLANE_VERTEX } from './city-glsl.js'

// Cloud and fog layers between the island and the city. Each layer is one flat plane of
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

// The noise tile: NOISE_TEXELS texels across, NOISE_CELLS value noise cells across. R and G
// hold one octave each for the warp, B holds four octaves for the cloud.
const NOISE_TEXELS = 128
const NOISE_CELLS = 16

function createNoiseTile() {
    const lattice = (seed, period) => {
        const values = new Float32Array(period * period)
        let a = seed
        for (let i = 0; i < values.length; i++) {
            a = (Math.imul(a ^ (a >>> 15), 2246822519) + 0x9e3779b9) >>> 0
            values[i] = a / 4294967296
        }
        return (x, y) => {
            const ix = Math.floor(x)
            const iy = Math.floor(y)
            const fx = x - ix
            const fy = y - iy
            const sx = fx * fx * (3 - 2 * fx)
            const sy = fy * fy * (3 - 2 * fy)
            const at = (i, j) => values[(((j % period) + period) % period) * period + (((i % period) + period) % period)]
            const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx
            const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx
            return top + (bottom - top) * sy
        }
    }
    const warpA = lattice(11, NOISE_CELLS)
    const warpB = lattice(29, NOISE_CELLS)
    const octaves = [0, 1, 2, 3].map((o) => lattice(47 + o * 13, NOISE_CELLS << o))
    const data = new Uint8Array(NOISE_TEXELS * NOISE_TEXELS * 4)
    for (let j = 0; j < NOISE_TEXELS; j++) {
        for (let i = 0; i < NOISE_TEXELS; i++) {
            const x = (i / NOISE_TEXELS) * NOISE_CELLS
            const y = (j / NOISE_TEXELS) * NOISE_CELLS
            const fbm = octaves.reduce((sum, octave, o) => sum + octave(x * 2 ** o, y * 2 ** o) * 0.5 ** (o + 1), 0)
            const k = (j * NOISE_TEXELS + i) * 4
            data[k] = Math.round(255 * warpA(x, y))
            data[k + 1] = Math.round(255 * warpB(x, y))
            data[k + 2] = Math.round(255 * fbm)
            data[k + 3] = 255
        }
    }
    const texture = new THREE.DataTexture(data, NOISE_TEXELS, NOISE_TEXELS, THREE.RGBAFormat)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
    return texture
}

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
    vec3 thin = haze + vec3( 1.0, 0.6, 0.26 ) * 0.05;
    vec3 col = mix( thin, top, smoothstep( 0.0, 0.6, cloud ) );
    gl_FragColor = vec4( applyHaze( col, vWorld ), edge * mix( uFog, 1.0, cloud ) * uOpacity );
}
`

export function createCityClouds({ hazeUniforms, time, centre }) {
    const noise = createNoiseTile()
    const geometry = new THREE.PlaneGeometry(SIZE, SIZE)
    geometry.rotateX(-Math.PI / 2)
    const meshes = LAYERS.map((layer, index) => {
        const material = new THREE.ShaderMaterial({
            name: `city.cloud${index}`,
            uniforms: {
                ...hazeUniforms,
                uNoise: { value: noise },
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
