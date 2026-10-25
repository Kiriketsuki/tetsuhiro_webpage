import * as THREE from 'three'
import manifest from '../../assets/city/city_layers.json'
import farUrl from '../../assets/city/city_far.webp?url'
import midUrl from '../../assets/city/city_mid.webp?url'
import nearUrl from '../../assets/city/city_near.webp?url'
import mistUrl from '../../assets/city/city_mist.webp?url'

// The city below the island, faked with no city geometry. Three painted layers lie on
// planes under the island: far, mid and near. Each is a pre-blurred top-down render from
// `export_island_b.py --city-layers`, and each farther layer has more blur. The planes sit
// at different heights, and two mist veils drift between the island and the city, so the
// layers shift against each other as the camera moves.

const URLS = { far: farUrl, mid: midUrl, near: nearUrl }

// Radial fade per layer, as a fraction of the half size. A nearer layer fades out where
// the next layer down takes over, so the blur grows with distance from the island.
const FADE = { far: [0.55, 1.0], mid: [0.5, 0.96], near: [0.42, 0.94] }
const BRIGHTNESS = { far: 2.1, mid: 1.9, near: 1.8 }
// Window twinkle on the near layer: about one cell per building block.
const TWINKLE_CELLS = 170

// Two veils of the same tileable mist: one deep above the city, one just under the island.
const MISTS = [
    { height: -430, size: 5200, repeat: 2.2, opacity: 0.2, drift: [0.0016, 0.0007] },
    { height: -70, size: 1400, repeat: 1.4, opacity: 0.1, drift: [-0.0022, 0.0012] },
]

const layerVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`

// Shared haze: a distance fog toward the horizon colour. The sky dome uses the same colour
// below the horizon, so the far edge of the city melts into it.
const HAZE_GLSL = /* glsl */ `
uniform vec3 uHaze;
uniform float uHazeDensity;
vec3 applyHaze( vec3 color, vec3 world ) {
    float d = length( world - cameraPosition ) * uHazeDensity;
    return mix( color, uHaze, 1.0 - exp( -d * d ) );
}
`

const layerFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uGain;
uniform float uBrightness;
uniform vec2 uFade;
uniform float uTwinkle;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
${HAZE_GLSL}

float hash12( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
}

void main() {
    vec3 encoded = min( texture2D( uMap, vUv ).rgb, vec3( 0.996 ) );
    vec3 radiance = -log( 1.0 - encoded ) / uGain * uBrightness;

    if ( uTwinkle > 0.0 ) {
        // Warm windows have far more red than blue. The night ground is the other way round.
        float window = smoothstep( 0.0, 0.06, radiance.r - radiance.b );
        float seed = hash12( floor( vUv * ${TWINKLE_CELLS.toFixed(1)} ) );
        float wave = 0.78 + 0.4 * sin( uTime * ( 0.5 + seed * 1.6 ) + seed * 40.0 );
        radiance *= mix( 1.0, wave, window * uTwinkle );
    }

    float r = length( vUv - 0.5 ) * 2.0;
    float alpha = 1.0 - smoothstep( uFade.x, uFade.y, r );
    gl_FragColor = vec4( applyHaze( radiance, vWorld ), alpha );
}
`

const mistFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uRepeat;
uniform float uOpacity;
uniform vec2 uDrift;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
${HAZE_GLSL}

void main() {
    // Two scales of one texture hide the tiling.
    float a = texture2D( uMap, vUv * uRepeat + uDrift * uTime ).r;
    float b = texture2D( uMap, vUv * uRepeat * 0.43 - uDrift * uTime * 0.6 + 0.37 ).r;
    float mist = a * b * 1.6;
    float r = length( vUv - 0.5 ) * 2.0;
    float alpha = mist * uOpacity * ( 1.0 - smoothstep( 0.45, 1.0, r ) );
    gl_FragColor = vec4( uHaze * 1.25, alpha );
}
`

function flatPlane(size) {
    const geometry = new THREE.PlaneGeometry(size, size)
    geometry.rotateX(-Math.PI / 2)
    return geometry
}

export function createCityBackdrop({ textureLoader, haze, hazeDensity = 1 / 4200, maxAnisotropy = 1 }) {
    const group = new THREE.Group()
    group.name = 'CityBackdrop'
    const time = { value: 0 }
    const hazeUniforms = { uHaze: { value: haze }, uHazeDensity: { value: hazeDensity } }
    const textures = []

    const load = (url, colorSpace) => {
        const texture = textureLoader.load(url)
        texture.colorSpace = colorSpace
        texture.anisotropy = maxAnisotropy
        textures.push(texture)
        return texture
    }

    manifest.layers.forEach((layer, index) => {
        const material = new THREE.ShaderMaterial({
            name: `city.${layer.name}`,
            uniforms: {
                ...hazeUniforms,
                uMap: { value: load(URLS[layer.name], THREE.SRGBColorSpace) },
                uGain: { value: layer.gain },
                uBrightness: { value: BRIGHTNESS[layer.name] },
                uFade: { value: new THREE.Vector2(...FADE[layer.name]) },
                uTwinkle: { value: layer.name === 'near' ? 1 : 0 },
                uTime: time,
            },
            vertexShader: layerVertex,
            fragmentShader: layerFragment,
            transparent: true,
            depthWrite: false,
        })
        const mesh = new THREE.Mesh(flatPlane(layer.size), material)
        mesh.position.fromArray(layer.centre)
        mesh.renderOrder = -8 + index
        mesh.name = `City_${layer.name}`
        group.add(mesh)
    })

    const mistTexture = load(mistUrl, THREE.NoColorSpace)
    mistTexture.wrapS = THREE.RepeatWrapping
    mistTexture.wrapT = THREE.RepeatWrapping
    MISTS.forEach((veil, index) => {
        const material = new THREE.ShaderMaterial({
            name: `city.mist.${index}`,
            uniforms: {
                ...hazeUniforms,
                uMap: { value: mistTexture },
                uRepeat: { value: veil.repeat },
                uOpacity: { value: veil.opacity },
                uDrift: { value: new THREE.Vector2(...veil.drift) },
                uTime: time,
            },
            vertexShader: layerVertex,
            fragmentShader: mistFragment,
            transparent: true,
            depthWrite: false,
        })
        const mesh = new THREE.Mesh(flatPlane(veil.size), material)
        mesh.position.set(0, veil.height, -300 * (1 - index))
        mesh.renderOrder = -4 + index
        mesh.name = `City_mist_${index}`
        group.add(mesh)
    })

    const update = (seconds) => {
        time.value = seconds
    }

    const dispose = () => {
        textures.forEach((texture) => texture.dispose())
        group.traverse((child) => {
            if (!child.isMesh) return
            child.geometry.dispose()
            child.material.dispose()
        })
    }

    return { group, update, dispose, bytes: manifest.total_bytes }
}
