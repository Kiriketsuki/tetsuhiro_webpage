import * as THREE from 'three'

// The moon's shadow for the toon island. The light exists only so three.js renders and
// binds the shadow map. The toon material ignores its colour. The scene is static, so the
// map renders once after load and again only when something asks for it.
const REACH = 34
const MAP = 2048
const MAP_SMALL = 1024
const DISTANCE = 80

export function createMoonShadow({ direction, centre = new THREE.Vector3(0, 0, 0), small = false }) {
    const light = new THREE.DirectionalLight(0xffffff, 0)
    light.name = 'MoonShadow'
    light.position.copy(centre).addScaledVector(direction.clone().normalize(), DISTANCE)
    light.target.position.copy(centre)
    light.castShadow = true
    const size = small ? MAP_SMALL : MAP
    light.shadow.mapSize.set(size, size)
    Object.assign(light.shadow.camera, {
        left: -REACH,
        right: REACH,
        top: REACH,
        bottom: -REACH,
        near: 1,
        far: DISTANCE * 2,
    })
    light.shadow.camera.updateProjectionMatrix()
    // Flat facets need a little normal bias, or the lit faces speckle with acne.
    light.shadow.bias = -0.0004
    light.shadow.normalBias = 0.04
    light.shadow.radius = 3
    light.shadow.intensity = 0.85
    return light
}

// Sets which island meshes cast and take the shadow. Glass and glow faces stay out of it.
export function markShadows(root) {
    root.traverse((node) => {
        if (!node.isMesh) return
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        const solid = materials.some((material) => material.name === 'aerie.toon')
        node.castShadow = solid
        node.receiveShadow = solid
    })
}

export function configureShadows(renderer) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = true
}
