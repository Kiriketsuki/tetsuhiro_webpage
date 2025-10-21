import * as THREE from 'three'

// Night light for the new island. The old point lights were placed for
// lake_mountain.glb and sat in the wrong spots once the island changed.
const SKY = 0x5d7fa8
const GROUND = 0x0b1a31
const MOON = 0xd8ebfb

// Where the moon sits, as a direction from the middle of the island.
const MOON_FROM = new THREE.Vector3(-260, 380, 300)
const ISLAND_MIDDLE = new THREE.Vector3(30, 0, -20)

export function createLights(scene) {
    const hemisphere = new THREE.HemisphereLight(SKY, GROUND, 1.1)

    const moon = new THREE.DirectionalLight(MOON, 1.6)
    moon.position.copy(ISLAND_MIDDLE).add(MOON_FROM)
    moon.target.position.copy(ISLAND_MIDDLE)

    scene.add(hemisphere, moon, moon.target)
    return { lights: [hemisphere, moon], moon }
}

export function disposeLights(scene, { lights, moon }) {
    scene.remove(moon.target)
    lights.forEach((light) => {
        scene.remove(light)
        light.dispose()
    })
}
