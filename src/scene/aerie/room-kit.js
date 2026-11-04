import * as THREE from 'three'
import kitUrl from '../../assets/models/aerie_bedroom_kit.glb?url'
import printsUrl from '../../assets/about-prints.webp'

// The bedroom kit for the About room: a full interior from aerie_bedroom_kit.glb
// (scenes/urban-aerie-studies/aerie_bedroom_kit.py), built in the aerie frame, so it needs no
// transform. The solid parts take the aerie toon material, so the moon, the shadow, the ink and
// the wall paper treat them as the aerie. The walls are plaster, so toon-material.js paints the
// asanoha paper and the honey wainscot on them. The screens, the lamps and the fairy lights draw
// unlit, the photo prints draw the owner's photos from one atlas, and the glass is see-through.
//
// This file is part of the room chunk, so it imports nothing from src/scene/aerie. room.js hands
// in the toon material, SURFACE and softenGeometry from the scene manager.

// The toon surface family of each kit material, by its name in SURFACE (toon-material.js).
const FAMILY = {
    kit_wood: 'wood',
    kit_plaster: 'plaster',
    kit_fabric: 'fabric',
    kit_metal: 'metal',
    kit_plain: 'plain',
    kit_paper: 'plain',
}
// Linear gains over the baked vertex colours of the unlit parts. Above 1 they stay bright after
// tone mapping, as the aerie lamps do.
const GLOW_GAIN = 1.8
const SCREEN_GAIN = 1.6
// The prints are photos under a little room light, so they sit a step below white.
const PRINT_TINT = 0xd9d3c8
const GLASS = { color: 0x3a4656, opacity: 0.18 }

// The old bedroom things of aerie.glb inside this box leave the scene (glTF frame, Y up). The box
// stops 1 cm inside the front wall, so the balcony outside keeps its things.
const OLD_ROOM = new THREE.Box3(new THREE.Vector3(-6.93, 7.38, -5.23), new THREE.Vector3(-3.5, 10.36, -1.63))

function prepareSolid(mesh, family, soften) {
    const geometry = soften(mesh.geometry)
    const count = geometry.attributes.position.count
    geometry.setAttribute('aoBake', new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1))
    geometry.setAttribute('aSurface', new THREE.Uint8BufferAttribute(new Uint8Array(count).fill(family), 1))
    if (geometry !== mesh.geometry) mesh.geometry.dispose()
    mesh.geometry = geometry
}

function unlitMaterials() {
    const prints = new THREE.TextureLoader().load(printsUrl)
    prints.colorSpace = THREE.SRGBColorSpace
    // The kit UVs follow glTF, with v down from the top of the image.
    prints.flipY = false
    prints.anisotropy = 4
    return {
        kit_glow: new THREE.MeshBasicMaterial({ name: 'room.glow', vertexColors: true, color: new THREE.Color(GLOW_GAIN, GLOW_GAIN, GLOW_GAIN) }),
        kit_screen: new THREE.MeshBasicMaterial({ name: 'room.screen', vertexColors: true, color: new THREE.Color(SCREEN_GAIN, SCREEN_GAIN, SCREEN_GAIN) }),
        kit_print: new THREE.MeshBasicMaterial({ name: 'room.prints', map: prints, color: PRINT_TINT }),
        kit_glass: new THREE.MeshBasicMaterial({ name: 'room.glass', color: GLASS.color, transparent: true, opacity: GLASS.opacity, depthWrite: false }),
    }
}

// gltf: the scene GLTFLoader, which shares the Draco decoder with the aerie. toon: { material,
// surface, soften } from the scene manager. Resolves to the kit root and its own materials.
export async function loadRoomKit(gltf, toon) {
    const kit = await gltf.loadAsync(kitUrl)
    const own = unlitMaterials()
    const root = kit.scene
    root.name = 'AboutRoomKit'
    root.traverse((node) => {
        if (!node.isMesh) return
        const source = node.material
        const family = toon.surface[FAMILY[source.name]]
        if (family !== undefined) {
            prepareSolid(node, family, toon.soften)
            node.material = toon.material
            node.castShadow = true
            node.receiveShadow = true
        } else {
            node.material = own[source.name] ?? own.kit_glow
        }
        source.dispose()
    })
    return { root, materials: Object.values(own) }
}

// Takes every triangle of the aerie's own Interiors and Props meshes whose centre lies in the old
// room out of the scene: an indexed mesh drops it from its index, and a plain mesh folds its three
// corners onto one point. A whole triangle goes, so no stretched face is left at the box edge.
export function hideOldRoom(scene) {
    scene.updateMatrixWorld(true)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const centre = new THREE.Vector3()
    scene.traverse((node) => {
        if (!node.isMesh || !/^(Interiors|Props)/.test(node.name)) return
        const geometry = node.geometry
        const position = geometry.attributes.position
        const corner = (i, v) => v.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld)
        const inside = (i0, i1, i2) => OLD_ROOM.containsPoint(centre.copy(corner(i0, a)).add(corner(i1, b)).add(corner(i2, c)).divideScalar(3))
        if (geometry.index) {
            const index = geometry.index.array
            const kept = []
            for (let t = 0; t < index.length; t += 3) {
                if (!inside(index[t], index[t + 1], index[t + 2])) kept.push(index[t], index[t + 1], index[t + 2])
            }
            if (kept.length !== index.length) geometry.setIndex(kept)
            return
        }
        let changed = false
        for (let i = 0; i < position.count; i += 3) {
            if (!inside(i, i + 1, i + 2)) continue
            const x = position.getX(i)
            const y = position.getY(i)
            const z = position.getZ(i)
            position.setXYZ(i + 1, x, y, z)
            position.setXYZ(i + 2, x, y, z)
            changed = true
        }
        if (changed) position.needsUpdate = true
    })
}
