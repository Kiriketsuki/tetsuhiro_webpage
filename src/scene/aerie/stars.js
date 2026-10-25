import * as THREE from 'three'

// Stars on a dome that follows the camera, all above the horizon. They fade into the haze
// near the horizon and twinkle slowly. One THREE.Points draw call.
const COUNT = 1500
const COUNT_SMALL = 600
const RADIUS = 8500
const LOWEST = 0.06

const vertexShader = /* glsl */ `
attribute float aSize;
attribute float aSeed;
uniform float uPixelRatio;
uniform float uTime;
varying float vBright;
void main() {
    vec4 view = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * view;
    gl_Position.z = gl_Position.w * 0.99999;
    float height = normalize( position ).y;
    float twinkle = 0.75 + 0.25 * sin( uTime * ( 0.6 + aSeed * 1.8 ) + aSeed * 50.0 );
    vBright = smoothstep( 0.04, 0.35, height ) * twinkle;
    gl_PointSize = aSize * uPixelRatio;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
varying float vBright;
void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot( p, p );
    float dot_ = exp( -d * 6.0 );
    gl_FragColor = vec4( uColor * vBright, dot_ * vBright );
}
`

export function createStars({ small = false, pixelRatio = 1 } = {}) {
    const count = small ? COUNT_SMALL : COUNT
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const seeds = new Float32Array(count)
    // A fixed sequence, so every visit sees the same sky.
    let s = 12345
    const random = () => {
        s = (s * 16807) % 2147483647
        return s / 2147483647
    }
    for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2
        const height = LOWEST + Math.pow(random(), 0.8) * (1 - LOWEST)
        const ring = Math.sqrt(1 - height * height)
        positions[i * 3] = Math.cos(angle) * ring * RADIUS
        positions[i * 3 + 1] = height * RADIUS
        positions[i * 3 + 2] = Math.sin(angle) * ring * RADIUS
        sizes[i] = 1.2 + Math.pow(random(), 6) * 3.2
        seeds[i] = random()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RADIUS)

    const uniforms = {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uColor: { value: new THREE.Color(0.85, 0.9, 1.0).multiplyScalar(1.6) },
    }
    const material = new THREE.ShaderMaterial({
        name: 'aerie.stars',
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geometry, material)
    points.name = 'Stars'
    points.renderOrder = -9
    points.frustumCulled = false
    points.onBeforeRender = (renderer, scene, camera) => {
        points.position.copy(camera.position)
        points.updateMatrixWorld()
    }
    return {
        points,
        update: (seconds) => {
            uniforms.uTime.value = seconds
        },
        setPixelRatio: (ratio) => {
            uniforms.uPixelRatio.value = ratio
        },
        dispose: () => {
            geometry.dispose()
            material.dispose()
        },
    }
}
