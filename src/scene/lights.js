import * as THREE from 'three'

// Night light for the new island. The old point lights were placed for
// lake_mountain.glb and sat in the wrong spots once the island changed.
const SKY = 0x5d7fa8
const GROUND = 0x0b1a31
const MOON = 0xd8ebfb
const LAVA = 0xec4e2f
const PORTAL = 0xab85f4

// Where the moon sits, as a direction from the middle of the island.
const MOON_FROM = new THREE.Vector3(-260, 380, 300)
const ISLAND_MIDDLE = new THREE.Vector3(30, 0, -20)
// Half the width of the shadow box. It covers both islands and nothing else.
const SHADOW_REACH = 270
const SHADOW_MAP = 2048

export function createLights(scene) {
    const hemisphere = new THREE.HemisphereLight(SKY, GROUND, 1.1)

    const moon = new THREE.DirectionalLight(MOON, 1.8)
    moon.position.copy(ISLAND_MIDDLE).add(MOON_FROM)
    moon.target.position.copy(ISLAND_MIDDLE)
    moon.castShadow = true
    moon.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP)
    Object.assign(moon.shadow.camera, {
        left: -SHADOW_REACH,
        right: SHADOW_REACH,
        top: SHADOW_REACH,
        bottom: -SHADOW_REACH,
        near: 1,
        far: MOON_FROM.length() * 2,
    })
    moon.shadow.camera.updateProjectionMatrix()
    moon.shadow.bias = -0.0004
    moon.shadow.normalBias = 0.35

    scene.add(hemisphere, moon, moon.target)
    return { lights: [hemisphere, moon], moon }
}

// Lights that need the gltf anchors: the lava run and the portal.
export function createAnchorLights(scene, anchors, { reducedMotion } = {}) {
    const lights = []

    const lava = anchors.lava ? new THREE.PointLight(LAVA, 900, 140, 2) : null
    if (lava) {
        lava.position.copy(anchors.lava).add(new THREE.Vector3(0, 4, 0))
        lights.push(lava)
    }

    // The portal faces +Z, so its light sits a little out in front of the ring.
    const portal = anchors.portal ? new THREE.PointLight(PORTAL, 220, 70, 2) : null
    if (portal) {
        portal.position.copy(anchors.portal).add(new THREE.Vector3(0, 1, 3))
        lights.push(portal)
    }

    lights.forEach((light) => scene.add(light))

    const update = (delta, time) => {
        if (reducedMotion?.value) return
        if (portal) portal.intensity = 220 + Math.sin(time * 1.6) * 60
        if (lava) lava.intensity = 900 + Math.sin(time * 0.9) * 80 + Math.sin(time * 3.7) * 30
    }

    return { lights, update }
}

export function disposeLights(scene, { lights, moon }) {
    if (moon) scene.remove(moon.target)
    lights.forEach((light) => {
        scene.remove(light)
        light.dispose()
    })
}
