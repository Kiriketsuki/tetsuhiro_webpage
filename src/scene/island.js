import * as THREE from 'three'
import islandUrl from '../assets/models/island.glb?url'
import { applyTerrainMaterials, disposeTerrainMaterials } from './terrain-material.js'

const ANCHORS = ['Anchor_Campfire', 'Anchor_Portal', 'Anchor_Lava', 'Anchor_Dodecahedron']
const SLOT_PREFIX = 'SkillSlot_'
const CAMERA_PREFIX = 'Cam_'

// Props that stand up off the ground. They throw shadows, the ground takes them.
const CASTERS = ['Island', 'VolcanoIsland', 'Volcano', 'SkillTree', 'PortalLedge', 'PortalRing',
    'Lanterns', 'Fences', 'ToriiPath', 'CherryGrove', 'Campfire']

// Pulls the named empties and the five shot cameras out of the gltf. Everything
// is read in world space so the rest of the scene never needs the hierarchy.
function readMarkers(root, cameras) {
    root.updateMatrixWorld(true)
    const anchors = {}
    ANCHORS.forEach((name) => {
        const node = root.getObjectByName(name)
        if (node) anchors[name.replace('Anchor_', '').toLowerCase()] = node.getWorldPosition(new THREE.Vector3())
    })

    const slots = []
    root.traverse((node) => {
        if (node.name.startsWith(SLOT_PREFIX)) slots.push({ name: node.name, position: node.getWorldPosition(new THREE.Vector3()) })
    })
    slots.sort((a, b) => a.name.localeCompare(b.name))

    const shots = cameras
        .filter((camera) => camera.name.startsWith(CAMERA_PREFIX))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((camera) => ({
            name: camera.name,
            position: camera.getWorldPosition(new THREE.Vector3()),
            direction: camera.getWorldDirection(new THREE.Vector3()),
            fov: camera.fov,
        }))

    return { anchors, slots, shots }
}

// Emissive strength per material name. The bloom threshold sits just under 1, so
// these decide what glows. Lava keeps the 2.2 from Blender.
const GLOW = {
    lava: 2.2,
    portal_core: 3.2,
    lantern_glow: 2.6,
    coral: 1.4,
}

// Albedo lift per material. The rock and the portal stones read near black at
// night next to the Blender renders, so they get a brighter base colour.
const LIFT = {
    terrain_rock: 1.45,
    terrain_volcanic: 1.2,
    portal_stone: 1.7,
    portal_stone_edge: 1.5,
}
// The ring picks up a little of the core's violet, like the render.
const RING_GLOW = { names: ['portal_stone', 'portal_stone_edge'], color: 0xab85f4, strength: 0.12 }

function tuneGlow(materials) {
    Object.entries(GLOW).forEach(([name, strength]) => {
        const material = materials.get(name)
        if (material) material.emissiveIntensity = strength
    })
    Object.entries(LIFT).forEach(([name, lift]) => {
        materials.get(name)?.color.multiplyScalar(lift)
    })
    RING_GLOW.names.forEach((name) => {
        const material = materials.get(name)
        if (!material?.emissive) return
        material.emissive.setHex(RING_GLOW.color)
        material.emissiveIntensity = RING_GLOW.strength
    })
}

// The terrain carries custom split normals from Blender. Leave the normals alone:
// no computeVertexNormals, no mergeVertices, no flat shading.
function prepareMeshes(root) {
    const materials = new Map()
    root.traverse((node) => {
        if (!node.isMesh) return
        const top = CASTERS.includes(node.name) || CASTERS.includes(node.parent?.name)
        node.castShadow = top
        node.receiveShadow = true
        const list = Array.isArray(node.material) ? node.material : [node.material]
        list.forEach((material) => {
            material.flatShading = false
            materials.set(material.name, material)
        })
    })
    tuneGlow(materials)
    return materials
}

export function createIsland({ scene, loaders, onProgress }) {
    const group = new THREE.Group()
    group.name = 'island'
    scene.add(group)

    const island = { group, root: null, materials: new Map(), terrain: null, anchors: {}, slots: [], shots: [] }

    island.ready = new Promise((resolve, reject) => {
        loaders.gltf.load(
            islandUrl,
            (gltf) => {
                island.root = gltf.scene
                island.materials = prepareMeshes(gltf.scene)
                // Runs inside the load callback, before the manager counts the gltf
                // as done, so the texture loads hold the loading screen open too.
                island.terrain = applyTerrainMaterials(island.materials, loaders.texture)
                Object.assign(island, readMarkers(gltf.scene, gltf.cameras))
                group.add(gltf.scene)
                resolve(island)
            },
            onProgress,
            (error) => {
                console.error('island.glb failed to load', error)
                reject(error)
            }
        )
    })

    return island
}

export function disposeIsland(scene, { group, terrain }) {
    scene.remove(group)
    if (terrain) disposeTerrainMaterials(terrain)
    group.traverse((node) => {
        if (!node.isMesh) return
        node.geometry.dispose()
        const list = Array.isArray(node.material) ? node.material : [node.material]
        list.forEach((material) => {
            Object.values(material).forEach((value) => {
                if (value?.isTexture) value.dispose()
            })
            material.dispose()
        })
    })
}
