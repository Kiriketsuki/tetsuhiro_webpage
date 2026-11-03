import * as THREE from 'three'
import { HAZE_GLSL, NOISE_GLSL, PLANE_VERTEX } from './city-glsl.js'

// Cloud and fog layers between the island and the city. Each layer is one flat plane of
// slow drifting cloud over a thin even fog. The layers sit at different heights, so they
// slide against each other and against the city as the camera moves, and the city shows
// only through the gaps. Thin cloud takes a warm glow from the city below it. Thick cloud
// shows its moonlit top in the haze colour.

const SIZE = 9000
// One layer each: height, the cloud scale in metres, the share of sky that stays clear (0 to
// 1), the even fog under the cloud, and the opacity of the thickest cloud.
const LAYERS = [
    { y: -620, scale: 650, clear: 0.44, fog: 0.35, opacity: 0.85 },
    { y: -340, scale: 1100, clear: 0.52, fog: 0.0, opacity: 0.75 },
]

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform float uClear;
uniform float uFog;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vWorld;
${HAZE_GLSL}
${NOISE_GLSL}

float fbm( vec2 p ) {
    float sum = 0.0;
    float amp = 0.5;
    for ( int i = 0; i < 4; i ++ ) {
        sum += amp * noise( p );
        p = p * 2.03 + 17.1;
        amp *= 0.5;
    }
    return sum;
}

void main() {
    vec2 p = vWorld.xz / uScale + vec2( 0.004, 0.0025 ) * uTime;
    p += 0.8 * vec2( noise( p * 0.7 ), noise( p * 0.7 + 5.2 ) );
    float d = fbm( p );
    float cloud = smoothstep( uClear * 0.94, uClear * 0.94 + 0.22, d );
    vec3 view = normalize( vWorld - cameraPosition );
    vec3 haze = hazeAt( view );
    vec3 top = haze * 1.45 + vec3( 0.03, 0.03, 0.05 );
    vec3 thin = haze + vec3( 1.0, 0.6, 0.26 ) * 0.05;
    vec3 col = mix( thin, top, smoothstep( 0.0, 0.6, cloud ) );
    float edge = 1.0 - smoothstep( 0.5, 1.0, length( vUv - 0.5 ) * 2.0 );
    gl_FragColor = vec4( applyHaze( col, vWorld ), edge * mix( uFog, 1.0, cloud ) * uOpacity );
}
`

export function createCityClouds({ hazeUniforms, time, centre }) {
    const geometry = new THREE.PlaneGeometry(SIZE, SIZE)
    geometry.rotateX(-Math.PI / 2)
    const meshes = LAYERS.map((layer, index) => {
        const material = new THREE.ShaderMaterial({
            name: `city.cloud${index}`,
            uniforms: {
                ...hazeUniforms,
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
        meshes.forEach((mesh) => mesh.material.dispose())
    }
    return { meshes, dispose }
}
