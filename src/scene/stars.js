import * as THREE from 'three'
import starVertex from '../assets/shaders/stars/vertex.glsl?raw'
import starFragment from '../assets/shaders/stars/fragment.glsl?raw'

const COUNT = 5000

export function createStars(scene, pixelRatio) {
    const position = new Float32Array(COUNT * 3)
    const color = new Float32Array(COUNT * 3)
    const scale = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
        position[i * 3] = Math.random() * 1000 - 500
        position[i * 3 + 1] = Math.random() * 300 - 30
        position[i * 3 + 2] = Math.random() * 1000 + 200
        scale[i] = Math.random() * 0.5 + 0.5
        color[i * 3] = 202 / 255
        color[i * 3 + 1] = 144 / 255
        color[i * 3 + 2] = 126 / 255
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
