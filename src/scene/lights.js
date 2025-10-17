import * as THREE from 'three'

// Point lights from the Blender scene. The positions are read off the model.
const LIGHTS = [
    { color: 0xfff9b0, intensity: 0.42, position: [24.67058753967285, 30.510108947753906, 27.250045776367188], near: 0.1, far: 1000, mapSize: 1024 },
    { color: 0xfff49c, intensity: 0.2, position: [41.705875396728516, 25.02428436279297, 0], near: 0.1, far: 100 },
    { color: 0x8080cf, intensity: 1.4, position: [12.767450332641602, 26.301376342773438, -63.92277908325195], far: 400, radius: 10 },
]

export function createLights(scene) {
    const lights = LIGHTS.map((spec) => {
        const light = new THREE.PointLight(spec.color, spec.intensity, 0)
        light.position.set(...spec.position)
        light.castShadow = true
        light.shadow.camera.far = spec.far
        if (spec.near) light.shadow.camera.near = spec.near
        light.shadow.bias = -0.1
        if (spec.radius) light.shadow.radius = spec.radius
        if (spec.mapSize) light.shadow.mapSize.set(spec.mapSize, spec.mapSize)
        scene.add(light)
        return light
    })
    return { lights }
}

export function disposeLights(scene, { lights }) {
    lights.forEach((light) => {
        scene.remove(light)
        light.dispose()
    })
}
