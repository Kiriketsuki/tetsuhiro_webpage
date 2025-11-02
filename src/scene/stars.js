import * as THREE from 'three'
import starVertex from '../assets/shaders/stars/vertex.glsl?raw'
import starFragment from '../assets/shaders/stars/fragment.glsl?raw'

// Fewer stars than the old 5000, and fewer again on a portrait phone, where
// the tall sky filled up with dots.
const COUNT = 1800
const COUNT_PORTRAIT = 650
const isPortraitPhone = () => window.matchMedia('(orientation: portrait) and (max-width: 767px)').matches
// The old stars sat in a slab behind the old island. The new cameras look every
// way, so the stars now sit on a dome past the fog, all above the horizon.
const DOME_RADIUS = 1900
const LOWEST = 0.04
const CENTRE = new THREE.Vector3(30, 0, -20)
// White to a faint blue. The old peach stars read as embers next to the lava.
const WHITE = new THREE.Color().setRGB(0.96, 0.97, 1, THREE.SRGBColorSpace)
const BLUE = new THREE.Color().setRGB(0.74, 0.83, 1, THREE.SRGBColorSpace)
const BRIGHTNESS = 1.15
const SIZE = 16

export function createStars(scene, pixelRatio) {
    const count = isPortraitPhone() ? COUNT_PORTRAIT : COUNT
    const position = new Float32Array(count * 3)
    const color = new Float32Array(count * 3)
    const scale = new Float32Array(count)
    const tint = new THREE.Color()
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const height = LOWEST + Math.random() * (1 - LOWEST)
        const ring = Math.sqrt(1 - height * height)
        position[i * 3] = CENTRE.x + Math.cos(angle) * ring * DOME_RADIUS
        position[i * 3 + 1] = CENTRE.y + height * DOME_RADIUS
        position[i * 3 + 2] = CENTRE.z + Math.sin(angle) * ring * DOME_RADIUS
        scale[i] = Math.random() * 0.5 + 0.5
        tint.lerpColors(WHITE, BLUE, Math.random()).multiplyScalar(BRIGHTNESS)
        color[i * 3] = tint.r
        color[i * 3 + 1] = tint.g
        color[i * 3 + 2] = tint.b
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scale, 1))

    const material = new THREE.ShaderMaterial({
        vertexShader: starVertex,
        fragmentShader: starFragment,
        uniforms: {
            uSize: { value: SIZE * pixelRatio },
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
