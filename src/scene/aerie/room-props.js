import * as THREE from 'three'
import photoUrl from '../../assets/about-2025.webp'

// The things the About story needs that the bedroom in aerie.glb does not have: a desk with
// a chair, a monitor, a laptop and a teaching notebook under the east window, and the
// graduation photo on the west wall above the nightstand. Each prop is a few boxes, built at
// runtime, so the aerie GLB needs no new export. They take the materials of the aerie's own
// Interiors meshes, so the toon light, the glow and the grade treat them as the room.
//
// Positions and sizes are metres in the GLB frame (Y up). rot is in degrees about x, y and z.
// Colours are sRGB hex. THREE.Color turns them into the linear vertex colours the aerie uses.
const WOOD = 0x8a5a36
const OAK = 0xb07a48
const DARK = 0x2e3036
const BOXES = {
    web_wood: [
        // The desk top and its four legs, 0.75 m high against the east wall.
        { at: [-3.8, 8.14, -3.45], size: [0.6, 0.04, 1.1], color: WOOD },
        ...[-4.06, -3.54].flatMap((x) => [-2.94, -3.96].map((z) => ({ at: [x, 7.77, z], size: [0.04, 0.72, 0.04], color: WOOD }))),
        // The chair faces the desk.
        { at: [-4.42, 7.86, -3.4], size: [0.42, 0.05, 0.42], color: OAK },
        { at: [-4.62, 8.12, -3.4], size: [0.04, 0.44, 0.4], color: OAK },
        ...[-4.6, -4.24].flatMap((x) => [-3.22, -3.58].map((z) => ({ at: [x, 7.635, z], size: [0.035, 0.45, 0.035], color: OAK }))),
        // The photo frame.
        { at: [-6.915, 8.85, -2.2], size: [0.025, 0.43, 0.37], color: 0x5a3a26 },
    ],
    web_soft_goods: [
        { at: [-4.42, 7.895, -3.4], size: [0.38, 0.03, 0.38], color: 0x6f8f6a },
        // The notebook covers, with the pages between them.
        { at: [-3.92, 8.163, -3.88], size: [0.21, 0.006, 0.28], color: 0x2f6f73, rot: [0, 12, 0] },
        { at: [-3.92, 8.181, -3.88], size: [0.21, 0.006, 0.28], color: 0x2f6f73, rot: [0, 12, 0] },
    ],
    web_plaster: [{ at: [-3.922, 8.172, -3.88], size: [0.2, 0.012, 0.27], color: 0xefe6d2, rot: [0, 12, 0] }],
    web_metal_bright: [{ at: [-3.8, 8.19, -3.95], size: [0.012, 0.012, 0.15], color: 0xc9a24a, rot: [0, -20, 0] }],
    web_metal_dark: [
        // The monitor: foot, neck and body. It faces the room.
        { at: [-3.64, 8.168, -3.6], size: [0.16, 0.016, 0.2], color: DARK },
        { at: [-3.62, 8.3, -3.6], size: [0.03, 0.26, 0.04], color: DARK },
        { at: [-3.65, 8.47, -3.6], size: [0.03, 0.3, 0.52], color: DARK },
        // The laptop: base, and the lid tipped back 15 degrees from upright.
        { at: [-3.86, 8.168, -3.02], size: [0.24, 0.016, 0.32], color: 0x3a3d44 },
        { at: [-3.712, 8.282, -3.02], size: [0.01, 0.22, 0.32], color: 0x3a3d44, rot: [0, 0, -15] },
    ],
    web_emit_screen: [
        { at: [-3.668, 8.47, -3.6], size: [0.006, 0.27, 0.49], color: 0xffffff },
        { at: [-3.72, 8.28, -3.02], size: [0.004, 0.2, 0.29], color: 0xffffff, rot: [0, 0, -15] },
    ],
}
// The photo inside the frame: 0.3 by 0.35 m, the shape of the 240 by 280 portrait.
const PHOTO = { at: [-6.9, 8.85, -2.2], size: [0.3, 0.35] }
// The guitar on its stand in the back right corner. The owner does not play, so its vertices
// collapse to one point (cozy_rooms.py builds it at Blender x -4.14 to -3.68, y 4.85 to 5.2).
const GUITAR = new THREE.Box3(new THREE.Vector3(-4.16, 7.4, -5.2), new THREE.Vector3(-3.66, 8.86, -4.84))

const degrees = (rot = [0, 0, 0]) => new THREE.Euler(...rot.map((d) => THREE.MathUtils.degToRad(d)))

// One geometry for a list of boxes, with the attributes the aerie toon material reads.
// surface is the aSurface family of the aerie mesh the material comes from.
function boxGeometry(boxes, surface) {
    const positions = []
    const normals = []
    const colors = []
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    boxes.forEach(({ at, size, color: hex, rot }) => {
        const box = new THREE.BoxGeometry(...size).toNonIndexed()
        box.applyMatrix4(matrix.compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(degrees(rot)), new THREE.Vector3(1, 1, 1)))
        positions.push(...box.attributes.position.array)
        normals.push(...box.attributes.normal.array)
        color.setHex(hex)
        for (let i = 0; i < box.attributes.position.count; i += 1) colors.push(color.r, color.g, color.b)
        box.dispose()
    })
    const count = positions.length / 3
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('aSurface', new THREE.Uint8BufferAttribute(new Uint8Array(count).fill(surface), 1))
    geometry.setAttribute('aoBake', new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1))
    return geometry
}

// The Interiors mesh of each aerie material, by its web material name.
function interiors(scene) {
    const found = {}
    scene.traverse((node) => {
        if (node.isMesh && node.name.startsWith('Interiors') && node.userData.webMaterial) found[node.userData.webMaterial] ??= node
    })
    return found
}

// Collapses every vertex of the aerie meshes that lies in `box` to the box centre, so the
// thing there no longer draws.
function hide(scene, box) {
    const centre = box.getCenter(new THREE.Vector3())
    const point = new THREE.Vector3()
    scene.traverse((node) => {
        if (!node.isMesh || !node.name.startsWith('Interiors')) return
        const position = node.geometry.attributes.position
        const toLocal = node.matrixWorld.clone().invert()
        const local = centre.clone().applyMatrix4(toLocal)
        let changed = false
        for (let i = 0; i < position.count; i += 1) {
            point.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld)
            if (!box.containsPoint(point)) continue
            position.setXYZ(i, local.x, local.y, local.z)
            changed = true
        }
        if (changed) position.needsUpdate = true
    })
}

// Adds the props to the aerie scene and returns them as one group. A material the GLB lacks
// skips its boxes, so a later GLB that renames a material loses a prop, not the room.
export function addRoomProps(scene) {
    scene.updateMatrixWorld(true)
    hide(scene, GUITAR)
    const sources = interiors(scene)
    const group = new THREE.Group()
    group.name = 'AboutRoomProps'
    Object.entries(BOXES).forEach(([name, boxes]) => {
        const source = sources[name]
        if (!source) return
        const surface = source.geometry.attributes.aSurface?.array[0] ?? 0
        group.add(new THREE.Mesh(boxGeometry(boxes, surface), source.material))
    })
    const texture = new THREE.TextureLoader().load(photoUrl)
    texture.colorSpace = THREE.SRGBColorSpace
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(PHOTO.size[0], PHOTO.size[1]), new THREE.MeshBasicMaterial({ map: texture }))
    photo.position.set(...PHOTO.at)
    photo.rotation.y = Math.PI / 2
    group.add(photo)
    scene.add(group)
    return group
}
