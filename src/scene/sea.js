import * as THREE from 'three'
import seaVertex from '../assets/shaders/water/vertex.glsl?raw'
import seaFragment from '../assets/shaders/water/fragment.glsl?raw'

const SEA = 0x164e67
const MOON = 0xd8ebfb
// Far past the fog, so the sea runs out at the horizon instead of at an edge.
const SIZE = 6000
const RIPPLE = 0.35
// Alpha looking straight down and at a grazing angle.
const CLEAREST = 0.42
const MURKIEST = 0.96

// One plane at y = 0 for the lake, the channels and the open sea. The island
// mesh has its own seabed, so the reefs and the lake floor show through.
export function createSea(scene, { moonDirection = new THREE.Vector3(-0.5, 0.7, 0.5) } = {}) {
    const geometry = new THREE.PlaneGeometry(SIZE, SIZE)
    geometry.rotateX(-Math.PI / 2)

    const material = new THREE.ShaderMaterial({
        vertexShader: seaVertex,
        fragmentShader: seaFragment,
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
                uTime: { value: 0 },
                uColour: { value: new THREE.Color(SEA) },
                uMoonColour: { value: new THREE.Color(MOON) },
                uMoonDirection: { value: moonDirection.clone().normalize() },
                uRipple: { value: RIPPLE },
                uClearest: { value: CLEAREST },
                uMurkiest: { value: MURKIEST },
            },
        ]),
        transparent: true,
        fog: true,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'sea'
    // Drawn after the other see-through things, so the corals stay under it.
    mesh.renderOrder = 1
    scene.add(mesh)

    const update = (time) => {
        material.uniforms.uTime.value = time
    }

    return { mesh, geometry, material, update }
}

export function disposeSea(scene, { mesh, geometry, material }) {
    scene.remove(mesh)
    geometry.dispose()
    material.dispose()
}
