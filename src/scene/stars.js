import * as THREE from 'three'
import starVertex from '../assets/shaders/stars/vertex.glsl?raw'
import starFragment from '../assets/shaders/stars/fragment.glsl?raw'

const COUNT = 5000
// The old stars sat in a slab behind the old island. The new cameras look every
// way, so the stars now sit on a dome past the fog, all above the horizon.
const DOME_RADIUS = 1900
const LOWEST = 0.04
const CENTRE = new THREE.Vector3(30, 0, -20)
const STAR = new THREE.Color().setRGB(202 / 255, 144 / 255, 126 / 255, THREE.SRGBColorSpace).multiplyScalar(1.1)

export function createStars(scene, pixelRatio) {
    const position = new Float32Array(COUNT * 3)
    const color = new Float32Array(COUNT * 3)
    const scale = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
        const angle = Math.random() * Math.PI * 2
        const height = LOWEST + Math.random() * (1 - LOWEST)
        const ring = Math.sqrt(1 - height * height)
        position[i * 3] = CENTRE.x + Math.cos(angle) * ring * DOME_RADIUS
        position[i * 3 + 1] = CENTRE.y + height * DOME_RADIUS
        position[i * 3 + 2] = CENTRE.z + Math.sin(angle) * ring * DOME_RADIUS
        scale[i] = Math.random() * 0.5 + 0.5
        color[i * 3] = STAR.r
        color[i * 3 + 1] = STAR.g
        color[i * 3 + 2] = STAR.b
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scale, 1))

    const material = new THREE.ShaderMaterial({
        vertexShader: starVertex,
        fragmentShader: starFragment,
        uniforms: {
            uSize: { value: 20 * pixelRatio },
            uTime: { value: 0 },
        },
        vertexColors: true,
        depthTest: true,
        transparent: true,
        depthWrite: false,
        fog: false,
    })

    const mesh = new THREE.Points(geometry, material)
    scene.add(mesh)

    const update = (time) => {
        material.uniforms.uTime.value = time
    }

    return { mesh, geometry, material, update }
}

export function disposeStars(scene, { mesh, geometry, material }) {
    scene.remove(mesh)
    geometry.dispose()
    material.dispose()
}
