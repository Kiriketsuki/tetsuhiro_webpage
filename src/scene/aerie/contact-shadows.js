import * as THREE from 'three'
import { connectedParts } from './crowns.js'
import { createDropRay } from './drop-ray.js'

// Soft contact shadows under the props: the telescope tripod, the stool and the side table on
// the terrace, the bench on the deck and the path lanterns. round9_route.py places one empty
// named Shadow_* at the foot of each prop, and its x and z scale give the shadow radii. The moon
// shadow map is too coarse to darken the ground under thin legs, so each prop sat on the floor
// with no contact and read as flat plastic. Each shadow is a flat disc with a soft round falloff
// in a warm dark brown, never grey.

const SIZE = 64
const COLOR = 0x1c120a
// The darkness at the centre of a shadow, from 0 to 1.
// Round 10 deepens it, because the bench and the props still read pasted on in S10.
// Round 11 deepens it again, because the bench, the lamps and the shrubs still read pasted on.
// Round 13 lifts each disc over the loose litter leaves (LIFT, in metres). The leaf cards lay on
// top of the discs and hid them, so the shrubs, rocks and lanterns still read pasted on.
const STRENGTH = 0.9
const LIFT = 0.07
// Round 13 widens the placed prop shadows (the bench, the lanterns, the terrace props) by a third.
const PROP_GROW = new THREE.Matrix4().makeScale(1.35, 1, 1.35)
// Round 10 adds a shadow under each shrub and each loose boulder on the lawn, which round 9
// left with no contact (S7). A part counts when its widest side lies in this range, in metres.
const PROP_SPAN = [0.3, 2.6]
// Round 18 lowers the height cut from 0.45 m to 0.3 m. The low round shrub balls on the pad lobe
// stand about 0.44 m tall, so they got no shadow and read pasted on (S9, S10).
const SHRUB_HEIGHT = 0.3
// Round 16 drops a disc whose rim would hang past the lawn edge. A disc at the aerie lip drew
// a dark vertical smudge down the cliff edge on the phone shots (S5, S7). The lawn must lie
// under each of the four rim points, within RIM_DROP metres of the centre height.
const RIM_DROP = 0.25
const RIM_POINTS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
].map(([x, z]) => new THREE.Vector3(x * 0.7, 0, z * 0.7))

function createFalloff() {
    const data = new Uint8Array(SIZE * SIZE * 4)
    // The falloff is round, so one quadrant gives all four. The mirrored distances are exact in
    // double precision and Math.hypot ignores signs, so each mirrored cell holds the same byte
    // as a direct calculation. Each cell is four equal bytes, so one 32-bit store writes it.
    const cells = new Uint32Array(data.buffer)
    const half = SIZE / 2
    for (let y = 0; y < half; y += 1) {
        for (let x = 0; x < half; x += 1) {
            const r = Math.hypot(x - SIZE / 2 + 0.5, y - SIZE / 2 + 0.5) / (SIZE / 2)
            // A smooth falloff that reaches zero before the square edge, so no edge shows. The
            // alpha map reads the green channel, so every channel holds the falloff. Round 9
            // wrote it to alpha alone, and each disc drew as a full dark square.
            // Round 14 keeps the core dark out to a quarter of the radius, so the shadow hugs
            // the foot of a prop. The round 13 falloff faded from the very centre, and most of
            // its dark part hid under the prop itself.
            const cell = Math.round(255 * Math.pow(1 - THREE.MathUtils.smoothstep(r, 0.25, 1), 1.2)) * 0x01010101
            cells[y * SIZE + x] = cell
            cells[y * SIZE + (SIZE - 1 - x)] = cell
            cells[(SIZE - 1 - y) * SIZE + x] = cell
            cells[(SIZE - 1 - y) * SIZE + (SIZE - 1 - x)] = cell
        }
    }
    const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearFilter
    texture.needsUpdate = true
    return texture
}

// One shadow per shrub and per loose boulder: a disc a little wider than the part, laid on the
// lawn under its centre and turned to the lawn slope. A level disc on a slope met the lawn
// along a hard straight line. blocked(x, z) is true on the path, the water and the pad, where
// no disc goes, and a part with no lawn under it gets no disc.
export function propSpots(meshes, isBoulder, blocked) {
    const box = new THREE.Box3()
    const size = new THREE.Vector3()
    const centre = new THREE.Vector3()
    const lawn = meshes.filter((mesh) => mesh.userData.webMaterial === 'web_grass')
    const drop = createDropRay(lawn)
    const up = new THREE.Vector3(0, 1, 0)
    const normal = new THREE.Vector3()
    return meshes
        .filter((mesh) => mesh.userData.webMaterial === 'web_plants' || isBoulder(mesh))
        .flatMap((mesh) => {
            const shrub = mesh.userData.webMaterial === 'web_plants'
            return connectedParts(mesh.geometry.attributes.position).flatMap((part) => {
                box.copy(part.box).applyMatrix4(mesh.matrixWorld).getSize(size)
                box.getCenter(centre)
                const span = Math.max(size.x, size.z)
                if (span < PROP_SPAN[0] || span > PROP_SPAN[1] || (shrub && size.y < SHRUB_HEIGHT)) return []
                if (blocked(centre.x, centre.z)) return []
                const r = span * 0.65 + 0.15
                const far = size.y + 1.5
                const hit = drop.cast(centre.setY(box.max.y + 0.5), far)
                if (!hit?.face) return []
                const level = hit.point.y
                const onLawn = RIM_POINTS.every((offset) => {
                    const rim = drop.cast(new THREE.Vector3(centre.x + offset.x * r, box.max.y + 0.5, centre.z + offset.z * r), far)
                    return rim && Math.abs(rim.point.y - level) < RIM_DROP
                })
                if (!onLawn) return []
                normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
                if (normal.y < 0) normal.negate()
                const turn = new THREE.Quaternion().setFromUnitVectors(up, normal)
                return [new THREE.Matrix4().compose(hit.point.addScaledVector(normal, LIFT), turn, new THREE.Vector3(r, 1, r))]
            })
        })
}

// root: the loaded aerie scene, with world matrices up to date. shrubSpots: the shadows under
// the shrubs and boulders, from propSpots. The look worker runs propSpots, so the page gets
// them as a list. Returns the shadow mesh, or null when it holds no shadow.
export function createContactShadows(root, shrubSpots = []) {
    const spots = [...shrubSpots]
    root.traverse((node) => {
        if (node.name.startsWith('Shadow_')) spots.push(new THREE.Matrix4().makeTranslation(0, LIFT, 0).multiply(node.matrixWorld).multiply(PROP_GROW))
    })
    if (!spots.length) return null
    const geometry = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({
        name: 'aerie.contact_shadow',
        color: COLOR,
        alphaMap: createFalloff(),
        transparent: true,
        opacity: STRENGTH,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, spots.length)
    spots.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
    mesh.name = 'ContactShadows'
    mesh.computeBoundingSphere()
    mesh.userData.dispose = () => {
        geometry.dispose()
        material.alphaMap.dispose()
        material.dispose()
    }
    return mesh
}
