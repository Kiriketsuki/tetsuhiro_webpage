import * as THREE from 'three'
import { createToonMaterial, createToonUniforms, SURFACE } from './toon-material.js'
import { softenGeometry } from './soft-normals.js'
import { applyAutumn } from './autumn.js'
import { applyPalette, isLaidRock } from './palette.js'
import { shapeCrowns, connectedParts } from './crowns.js'
import { createDetailTexture } from './detail-texture.js'
import { createLeafCarpet } from './leaf-carpet.js'
import { createLeafPiles } from './leaf-piles.js'
import { litterBlocked } from './leaf-cards.js'
import { createGlassMaterial, createFrameMaterial } from './glass.js'
import { prepareWater, createWaterMaterial } from './water.js'
import { createContactShadows } from './contact-shadows.js'

// Puts the cozy night look, after the art style of Leaf it Alone, on a loaded island_b GLB.
// Opaque parts share one toon material with half-lambert light, warm hue-keeping shadows
// and a painted world-space detail texture. Each mesh gets an aSurface attribute that
// picks its detail. palette.js and autumn.js repaint the baked vertex colours as smooth
// fields, and crowns.js turns each crown into one soft blob. Glass is clear and unlit,
// water has its own flow material, and emissive parts become flat bright colour with
// their faces turned into glow sprites.

// Glow per emissive web material. `gain` scales the exported emissive strength before the
// tone mapper. `glow` is the sprite colour scale and `size` the sprite size in metres.
// The screen and the ember get no sprite. The ember is the small red lamp on the telescope
// table. Its sprite and a bright core painted a red halo on the plaster wall behind it, so
// it keeps only a dim core. The pad lamps get no sprite either: each lamp is a small lens
// on a dark housing (tidy_pad.py), and a sprite turned it back into a glowing dot. Their
// gain keeps the red lens red, below the white clip. `color` replaces the exported colour.
// The exported pad lens is a near white, which read as a cold white dot, so it takes a
// warm amber, and the edge lamps alternate warm amber and red.
const EMISSIVE = {
    web_emit_warm: { gain: 0.52, glow: 0.045, size: 0.6 },
    web_emit_pad_white: { gain: 0.55, glow: 0, size: 0, color: 0xffa443 },
    web_emit_pad_red: { gain: 0.2, glow: 0, size: 0 },
    // Round 19 dims the monitors and warms them to a soft amber night mode, so the screens are
    // never the brightest saturated element in the workshop (S2, S7).
    web_emit_screen: { gain: 0.2, glow: 0, size: 0, color: 0xc8aa84 },
    web_emit_ember: { gain: 0.4, glow: 0, size: 0 },
}
// The surface family of each web material. Anything absent is plain.
const FAMILY = {
    web_wood: SURFACE.wood,
    web_plaster: SURFACE.plaster,
    web_rock: SURFACE.stone,
    web_flagstone: SURFACE.paving,
    web_roof: SURFACE.roof,
    web_crown: SURFACE.foliage,
    web_plants: SURFACE.foliage,
    web_grass: SURFACE.lawn,
    web_metal_dark: SURFACE.metal,
    web_metal_bright: SURFACE.metal,
    web_soft_goods: SURFACE.fabric,
    web_soil: SURFACE.soil,
    web_bark: SURFACE.bark,
}
// Metal parts keep edges soft up to this angle, so the low-poly telescope tube and the
// railings shade as round forms and show a sheen. The other parts use the default crease.
const METAL_CREASE = (70 * Math.PI) / 180
// Round 9 keeps the cliff smooth across wider bends, so its faces ease into each other and do
// not alternate light and dark from one facet to the next.
const ROCK_CREASE = (78 * Math.PI) / 180
// The telescope: the dark bands and end rings on its brass tube take a light brass, so each
// band reads as a bevel that catches the light, not as a black stripe.
// Round 11 takes the bevel from a pale cream to a light brass. The cream yoke disc on the mount
// caught the matcap ring and read as a blown-out yellow disc in S4.
// Round 13 lifts it again to a pale brass, so each rim reads as a lit bevel on the tube.
// Round 20 lifts it once more, so each ring reads as a crisp lit bevel on the darker tube (S4).
const BEVEL = new THREE.Color(0xdcbc72)
const TELESCOPE = { anchor: 'Anchor_Telescope', reach: 1.5, lift: 0.2 }
const DARK_FAMILIES = ['web_dark_matte', 'web_metal_dark']
// Glow sprites merge the emissive faces in cells of this size, in metres.
const GLOW_CELL = 0.9
const MAX_GLOWS = 600
// The sprite size cap near the entry downlight, so it shows no round pool.
const ENTRY_GLOW = { anchor: 'Anchor_Entry_Light', reach: 1.5, size: 0.5 }
// Lamps closer than this to a room anchor, in metres, count as indoor lamps and get no sprite.
const INDOOR_GLOW = 3.2

// Warm spill from the lit windows: the anchor name and the reach in metres. The campfire
// takes the last slot (campfire.js).
// Round 10 widens both, so the warm light fills each room to its walls and the room reads as
// clearly as through an open door. The fill on the house is lower now (toon-material.js).
const BOUNCES = [
    ['Anchor_Workshop', 4.6],
    ['Anchor_Bedroom', 3.8],
]

function emissiveColor(material) {
    const strength = material.emissiveIntensity ?? 1
    return material.emissive ? material.emissive.clone().multiplyScalar(strength) : new THREE.Color(0, 0, 0)
}

// Groups the triangles of one emissive mesh into grid cells and returns one spot per cell.
function glowSpots(mesh, color, size, entry) {
    const position = mesh.geometry.attributes.position
    const index = mesh.geometry.index
    const triangles = (index ? index.count : position.count) / 3
    const cells = new Map()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const vertex = (i) => (index ? index.getX(i) : i)
    for (let t = 0; t < triangles; t += 1) {
        a.fromBufferAttribute(position, vertex(t * 3)).applyMatrix4(mesh.matrixWorld)
        b.fromBufferAttribute(position, vertex(t * 3 + 1)).applyMatrix4(mesh.matrixWorld)
        c.fromBufferAttribute(position, vertex(t * 3 + 2)).applyMatrix4(mesh.matrixWorld)
        const centre = a.add(b).add(c).divideScalar(3)
        const key = `${Math.floor(centre.x / GLOW_CELL)},${Math.floor(centre.y / GLOW_CELL)},${Math.floor(centre.z / GLOW_CELL)}`
        const cell = cells.get(key) ?? { sum: new THREE.Vector3(), count: 0 }
        cell.sum.add(centre)
        cell.count += 1
        cells.set(key, cell)
    }
    return [...cells.values()].map((cell) => {
        const position = cell.sum.divideScalar(cell.count)
        const nearEntry = entry && position.distanceTo(entry) < ENTRY_GLOW.reach
        return { position, color, size: nearEntry ? Math.min(size, ENTRY_GLOW.size) : size }
    })
}

// A glow sprite moves toward the camera by 0.6 of its size (glow-sprites.js), so a lamp just
// inside a wall pushed its glow out through the wall: the warm patch on the plaster behind the
// telescope table in S4 was the glow of a bedroom lamp 0.3 m inside. Each sprite now shrinks
// to fit the gap between its lamp and the nearest wall, so its glow stays on its own side.
const WALL_FAMILIES = ['web_plaster', 'web_wood', 'web_roof']
const WALL_DIRECTIONS = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0, 1, 0],
].map((d) => new THREE.Vector3(...d))
const MIN_GLOW = 0.1

function fitGlowsToWalls(spots, meshes) {
    const walls = meshes.filter((mesh) => WALL_FAMILIES.includes(mesh.userData.webMaterial))
    const raycaster = new THREE.Raycaster()
    let shrunk = 0
    const fitted = spots.map((spot) => {
        raycaster.far = spot.size
        const clear = Math.min(
            spot.size,
            ...WALL_DIRECTIONS.map((direction) => {
                raycaster.set(spot.position, direction)
                return raycaster.intersectObjects(walls, false)[0]?.distance ?? spot.size
            })
        )
        if (clear >= spot.size) return spot
        shrunk += 1
        return { ...spot, size: Math.max(MIN_GLOW, clear * 1.1) }
    })
    return { fitted, shrunk }
}

function anchorPosition(gltf, name) {
    const node = gltf.scene.getObjectByName(name)
    return node ? node.getWorldPosition(new THREE.Vector3()) : null
}

// The surface family of a mesh. The pad deck (dark matte on a mesh named Pad) takes the soil
// mottle, so it shows faint painted wear in patches larger than one facet.
function surfaceOf(mesh) {
    if (isLaidRock(mesh)) return SURFACE.paving
    if (mesh.name.startsWith('Pad') && mesh.userData.webMaterial === 'web_dark_matte') return SURFACE.soil
    return FAMILY[mesh.userData.webMaterial] ?? SURFACE.plain
}

// The footing under the pad curb sits below this height, in metres. It takes the cliff family,
// so it shades with the strata of the cliff it grows out of, and palette.js gives it the
// cliff paint with its moss under the lip.
export const PAD_FOOT_TOP = 0.69

// Every vertex of the mesh gets its surface family, as a byte. The pad stone mesh holds the
// curb and the footing, so its footing vertices take the cliff family. All three corners of
// a footing face sit at or under the curb foot, so no face splits between two families.
function tagSurface(geometry, family, mesh) {
    const count = geometry.attributes.position.count
    const surface = new Uint8Array(count).fill(family)
    if (mesh.name.startsWith('Pad') && mesh.userData.webMaterial === 'web_rock') {
        const position = geometry.attributes.position
        const p = new THREE.Vector3()
        for (let t = 0; t < count / 3; t += 1) {
            let low = true
            for (let k = 0; k < 3; k += 1) low &&= p.fromBufferAttribute(position, t * 3 + k).applyMatrix4(mesh.matrixWorld).y < PAD_FOOT_TOP + 0.02
            if (low) surface.fill(SURFACE.stone, t * 3, t * 3 + 3)
        }
    }
    geometry.setAttribute('aSurface', new THREE.Uint8BufferAttribute(surface, 1))
}

// export_island_b.py bakes ambient occlusion per vertex into the glTF attribute _AO, and
// GLTFLoader names it `_ao`. The toon shader reads it as `aoBake`. One opaque program serves
// every mesh, so a mesh from an older GLB without the bake gets 1.0, which means open sky.
function adoptAoBake(geometry) {
    const baked = geometry.attributes._ao
    if (baked) {
        geometry.deleteAttribute('_ao')
        geometry.setAttribute('aoBake', baked)
        return true
    }
    if (!geometry.attributes.aoBake) {
        const count = geometry.attributes.position.count
        geometry.setAttribute('aoBake', new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1))
    }
    return false
}

// sky: { horizon, zenith } for the glass reflection. detail: a detail texture build from
// createDetailTexture, started early so it overlaps the download. Without one, the build
// runs here.
// Window frames, mullions and slim posts. The S2 review measured the workshop mullions at
// about 18 px and the frame beams at about 30 px wide at 1600 by 900, and asked for thin dark
// lines of at most 6 px. A straight member is a box part whose longest side passes
// MEMBER_LENGTH and whose two short sides stay under MEMBER_WIDTH, in metres. Its two short
// sides shrink to MEMBER_THIN about its own axis, so the joins at its ends still meet.
const MEMBER_LENGTH = 0.6
const MEMBER_WIDTH = 0.14
const MEMBER_THIN = 0.4
const MEMBER_TRIANGLES = 36
// A vertical member taller than MEMBER_COLUMN is a steel column of the glass stair tower. It
// keeps its exported width of about 6 cm, so the columns read as slim steel and not as wire.
const MEMBER_COLUMN = 4
const THIN_FAMILIES = ['web_metal_dark', 'web_glass_edge']

function thinMembers(mesh) {
    // connectedParts reads three vertices per triangle, so an indexed mesh turns plain first.
    if (mesh.geometry.index) {
        const plain = mesh.geometry.toNonIndexed()
        mesh.geometry.dispose()
        mesh.geometry = plain
    }
    const position = mesh.geometry.attributes.position
    const size = new THREE.Vector3()
    let thinned = 0
    connectedParts(position).forEach(({ box, centre, triangles }) => {
        if (triangles.length > MEMBER_TRIANGLES) return
        box.getSize(size)
        const dims = [size.x, size.y, size.z]
        const long = dims.indexOf(Math.max(...dims))
        if (dims[long] < MEMBER_LENGTH || dims.some((d, i) => i !== long && d > MEMBER_WIDTH)) return
        if (long === 1 && dims[1] > MEMBER_COLUMN) return
        const scale = [0, 1, 2].map((i) => (i === long ? 1 : MEMBER_THIN))
        triangles.forEach((t) => {
            for (let k = 0; k < 3; k += 1) {
                const v = t * 3 + k
                position.setXYZ(
                    v,
                    centre.x + (position.getX(v) - centre.x) * scale[0],
                    centre.y + (position.getY(v) - centre.y) * scale[1],
                    centre.z + (position.getZ(v) - centre.z) * scale[2]
                )
            }
        })
        thinned += 1
    })
    if (thinned) {
        position.needsUpdate = true
        mesh.geometry.computeBoundingBox()
        mesh.geometry.computeBoundingSphere()
    }
    return thinned
}

// The roof parts of the stair tower. Round 20 restores the glass stair tower: slim charcoal
// steel columns and thin rails with clear glass screens between them, under the flat dark
// canopy. The timber frame of rounds 11 to 20 is gone, so no post or beam turns to wood here.
// The low roof slab over the stair landing (below ROOF.slab in height) read as an opaque purple
// slab through the glass in S3, so its faces collapse. A flat roof part lower than ROOF.canopy
// is the entry canopy over the workshop door, and it stays. A sloped roof part taller than
// ROOF.pitch is the soffit under the stair flight. It takes the stair wood colour, so it reads
// as the boarded underside of the flight. The fascia bands of the flat roof (above ROOF.fascia,
// longer than ROOF.long) take a warm charcoal, so the roof edge reads as one crisp thin line.
const ROOF = { mesh: 'House', slab: 6, canopy: 3.5, pitch: 1.5, fascia: 12.4, long: 3, wood: new THREE.Color(0xa0703e), edge: new THREE.Color(0x4e4a48) }

function paintParts(mesh, triangles, colour, family) {
    const { color, aSurface } = mesh.geometry.attributes
    triangles.forEach((t) => {
        for (let v = t * 3; v < t * 3 + 3; v += 1) {
            color?.setXYZ(v, colour.r, colour.g, colour.b)
            aSurface.setX(v, family)
        }
    })
}

function towerRoof(meshes) {
    const size = new THREE.Vector3()
    meshes.forEach((mesh) => {
        if (!mesh.name.startsWith(ROOF.mesh)) return
        const family = mesh.userData.webMaterial
        if (family !== 'web_metal_dark' && family !== 'web_roof') return
        const { position, color, aSurface } = mesh.geometry.attributes
        connectedParts(position).forEach(({ box, centre, triangles }) => {
            if (family === 'web_metal_dark') {
                box.getSize(size)
                const high = centre.clone().applyMatrix4(mesh.matrixWorld).y > ROOF.fascia
                if (high && Math.max(size.x, size.y, size.z) > ROOF.long) paintParts(mesh, triangles, ROOF.edge, SURFACE.roof)
                return
            }
            const world = box.clone().applyMatrix4(mesh.matrixWorld)
            const pitched = world.max.y - world.min.y > ROOF.pitch
            if (pitched) paintParts(mesh, triangles, ROOF.wood, SURFACE.wood)
            else if (world.max.y < ROOF.slab && world.max.y > ROOF.canopy) {
                triangles.forEach((t) => {
                    for (let v = t * 3; v < t * 3 + 3; v += 1) position.setXYZ(v, centre.x, centre.y, centre.z)
                })
            }
        })
        position.needsUpdate = true
        if (color) color.needsUpdate = true
        aSurface.needsUpdate = true
        mesh.geometry.computeBoundingBox()
        mesh.geometry.computeBoundingSphere()
    })
}

// Round 12: the outer walls of the house take the half-timbered family (toon-material.js). A
// wall face counts as outer when its normal lies near the horizontal and points away from the
// middle of the house. The large flat wood faces of the front walls join them and take the
// plaster colour, so the front reads as plaster panels in a timber frame, not as plank boxes.
// Window frames, posts and rails stay wood: each face is smaller than WALL.face square metres.
// Round 13: every face of the House meshes is small, so the face test above caught no wood.
// The cladding boards of the outer walls now turn to cream as whole parts: a part counts as a
// board when it runs longer than WALL.board.long along x or z, stays thinner than
// WALL.board.thin in the other, stands WALL.board.low to WALL.board.high tall, stands taller
// than it is thick, and sits within WALL.board.reach of the house body. The window frames,
// posts, rails and the deck boards stay honey wood, so they read as the contrasting trim.
const WALL = {
    mesh: 'House',
    level: 0.35,
    plaster: new THREE.Color().setRGB(0.83, 0.72, 0.53),
    board: { long: 1.0, thin: 0.22, low: 0.08, high: 0.5, reach: 0.45 },
    slab: { run: 2, tall: 2, depth: 0.45, face: 0.08 },
}

function isBoard(box, body) {
    const size = box.getSize(new THREE.Vector3())
    const { long, thin, low, high } = WALL.board
    const run = Math.max(size.x, size.z)
    const depth = Math.min(size.x, size.z)
    return run > long && depth < thin && size.y > low && size.y < high && size.y > depth * 1.2 && body.containsPoint(box.getCenter(new THREE.Vector3()))
}

// A wall slab: one part that runs past WALL.slab.run and stands past WALL.slab.tall, but stays
// thinner than WALL.slab.depth. Only its broad faces along the thin axis turn cream, so the
// window reveals and the small frame faces keep the honey wood.
const isSlab = (size) => Math.max(size.x, size.z) > WALL.slab.run && size.y > WALL.slab.tall && Math.min(size.x, size.z) < WALL.slab.depth

function creamBoards(mesh, body) {
    const { position, color, aSurface } = mesh.geometry.attributes
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const paint = (t) => {
        for (let v = t * 3; v < t * 3 + 3; v += 1) {
            aSurface.setX(v, SURFACE.timbered)
            color?.setXYZ(v, WALL.plaster.r, WALL.plaster.g, WALL.plaster.b)
        }
    }
    connectedParts(position).forEach(({ box, triangles }) => {
        const world = box.clone().applyMatrix4(mesh.matrixWorld)
        if (isBoard(world, body)) {
            triangles.forEach(paint)
            return
        }
        const size = world.getSize(new THREE.Vector3())
        if (!isSlab(size) || !body.containsPoint(world.getCenter(new THREE.Vector3()))) return
        const thin = size.x < size.z ? 'x' : 'z'
        triangles.forEach((t) => {
            a.fromBufferAttribute(position, t * 3).applyMatrix4(mesh.matrixWorld)
            b.fromBufferAttribute(position, t * 3 + 1).applyMatrix4(mesh.matrixWorld)
            c.fromBufferAttribute(position, t * 3 + 2).applyMatrix4(mesh.matrixWorld)
            const normal = b.sub(a).cross(c.sub(a))
            const area = normal.length() / 2
            if (area > WALL.slab.face && Math.abs(normal.normalize()[thin]) > 0.9) paint(t)
        })
    })
}

function timberWalls(meshes) {
    const walls = meshes.filter((mesh) => mesh.name.startsWith(WALL.mesh) && ['web_plaster', 'web_wood'].includes(mesh.userData.webMaterial))
    const body = new THREE.Box3()
    walls.filter((mesh) => mesh.userData.webMaterial === 'web_plaster').forEach((mesh) => body.union(new THREE.Box3().setFromObject(mesh)))
    if (body.isEmpty()) return
    const middle = body.getCenter(new THREE.Vector3())
    const reach = body.clone().expandByScalar(WALL.board.reach)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    walls.forEach((mesh) => {
        const { position, color, aSurface } = mesh.geometry.attributes
        if (mesh.userData.webMaterial === 'web_wood') {
            creamBoards(mesh, reach)
            aSurface.needsUpdate = true
            if (color) color.needsUpdate = true
            return
        }
        for (let t = 0; t < position.count / 3; t += 1) {
            a.fromBufferAttribute(position, t * 3).applyMatrix4(mesh.matrixWorld)
            b.fromBufferAttribute(position, t * 3 + 1).applyMatrix4(mesh.matrixWorld)
            c.fromBufferAttribute(position, t * 3 + 2).applyMatrix4(mesh.matrixWorld)
            const centre = a.clone().add(b).add(c).divideScalar(3)
            const normal = b.sub(a).cross(c.sub(a))
            const area = normal.length() / 2
            normal.normalize()
            if (Math.abs(normal.y) > WALL.level || area < 1e-6) continue
            if (normal.x * (centre.x - middle.x) + normal.z * (centre.z - middle.z) <= 0) continue
            for (let v = t * 3; v < t * 3 + 3; v += 1) {
                aSurface.setX(v, SURFACE.timbered)
                color?.setXYZ(v, WALL.plaster.r, WALL.plaster.g, WALL.plaster.b)
            }
        }
        aSurface.needsUpdate = true
        if (color) color.needsUpdate = true
    })
}

// The world centres of the connected parts of a mesh.
const partCentres = (mesh) => connectedParts(mesh.geometry.attributes.position).map((part) => ({ ...part, world: part.centre.clone().applyMatrix4(mesh.matrixWorld) }))

// Paints the dark parts that sit inside the box of the telescope tube in light brass, in the
// metal family. The tube is the brass above the tripod, within TELESCOPE.reach of the anchor.
function lightenTelescopeBands(meshes, anchor) {
    if (!anchor) return
    const tube = new THREE.Box3()
    meshes
        .filter((mesh) => mesh.userData.webMaterial === 'web_metal_bright')
        .forEach((mesh) =>
            partCentres(mesh).forEach(({ box, world }) => {
                if (world.y > anchor.y + TELESCOPE.lift && world.distanceTo(anchor) < TELESCOPE.reach) tube.union(box.clone().applyMatrix4(mesh.matrixWorld))
            })
        )
    if (tube.isEmpty()) return
    tube.expandByScalar(0.04)
    meshes
        .filter((mesh) => DARK_FAMILIES.includes(mesh.userData.webMaterial))
        .forEach((mesh) => {
            const { color, aSurface } = mesh.geometry.attributes
            partCentres(mesh).forEach(({ triangles, world }) => {
                if (!tube.containsPoint(world)) return
                triangles.forEach((t) => {
                    for (let v = t * 3; v < t * 3 + 3; v += 1) {
                        color?.setXYZ(v, BEVEL.r, BEVEL.g, BEVEL.b)
                        aSurface.setX(v, SURFACE.metal)
                    }
                })
            })
            if (color) color.needsUpdate = true
            aSurface.needsUpdate = true
        })
}

export function applyIslandLook(gltf, { sky, detail: detailBuild = null, anisotropy = 1 } = {}) {
    gltf.scene.updateMatrixWorld(true)
    const moon = anchorPosition(gltf, 'Anchor_Moon') ?? new THREE.Vector3(-28, 71, 24)
    const lip = anchorPosition(gltf, 'Anchor_Waterfall_Top')
    const entry = anchorPosition(gltf, ENTRY_GLOW.anchor)
    const bounces = BOUNCES.map(([name, radius]) => {
        const p = anchorPosition(gltf, name)
        return p ? { x: p.x, y: p.y, z: p.z, radius } : null
    }).filter(Boolean)

    const detail = (detailBuild ?? createDetailTexture({ anisotropy, sliced: false })).finish()
    const carpet = createLeafCarpet({ anisotropy })
    const uniforms = createToonUniforms({ moonDirection: moon, bounces, detail, carpet })
    const opaque = createToonMaterial(uniforms, {}, { key: 'aerie-toon-v3-ao', defines: { AERIE_AO: '' } })
    opaque.name = 'aerie.toon'
    let aoMeshes = 0
    const time = { value: 0 }
    const replaced = new Map()
    const spots = []
    const old = new Set()
    const water = []

    const swap = (mesh, source) => {
        old.add(source)
        mesh.userData.webMaterial = source.name
        const glow = EMISSIVE[source.name]
        if (glow) {
            if (!replaced.has(source.name)) {
                replaced.set(
                    source.name,
                    new THREE.MeshBasicMaterial({
                        name: `aerie.${source.name}`,
                        color: (glow.color === undefined ? emissiveColor(source) : new THREE.Color(glow.color)).multiplyScalar(glow.gain),
                        side: THREE.DoubleSide,
                    })
                )
            }
            if (glow.glow > 0) spots.push(...glowSpots(mesh, emissiveColor(source).multiplyScalar(glow.glow), glow.size, entry))
            return replaced.get(source.name)
        }
        if (source.name === 'web_glass_clear' || source.name === 'web_glass_edge') {
            if (!replaced.has(source.name)) {
                const glass = source.name === 'web_glass_edge' ? createFrameMaterial() : createGlassMaterial(sky)
                replaced.set(source.name, glass)
            }
            return replaced.get(source.name)
        }
        if (source.name === 'web_water' && lip) {
            water.push(mesh)
            return source
        }
        return opaque
    }

    gltf.scene.traverse((child) => {
        if (!child.isMesh) return
        child.material = Array.isArray(child.material)
            ? child.material.map((m) => swap(child, m))
            : swap(child, child.material)
        if (child.material === opaque) {
            const metal = FAMILY[child.userData.webMaterial] === SURFACE.metal
            // The rename comes first. softenGeometry and crowns.js copy every attribute, so aoBake rides along.
            if (adoptAoBake(child.geometry)) aoMeshes += 1
            const crease = metal ? METAL_CREASE : child.userData.webMaterial === 'web_rock' && !isLaidRock(child) || child.name.startsWith('Pad') ? ROCK_CREASE : undefined
            const soft = softenGeometry(child.geometry, crease)
            if (soft !== child.geometry) child.geometry.dispose()
            child.geometry = soft
            tagSurface(soft, surfaceOf(child), child)
        }
    })

    if (water.length) {
        const pond = Math.max(...water.map((mesh) => prepareWater(mesh, lip)))
        const material = createWaterMaterial({ pond, time, moonDirection: moon, moon: uniforms.uToonMoon.value, sky: sky.horizon })
        water.forEach((mesh) => {
            mesh.material = material
        })
        replaced.set('web_water', material)
    }
    old.forEach((material) => {
        if (!water.some((mesh) => mesh.material === material)) material.dispose()
    })

    const meshes = []
    gltf.scene.traverse((child) => {
        if (child.isMesh) meshes.push(child)
    })
    meshes.forEach((mesh) => {
        const family = mesh.userData.webMaterial
        if (family === 'web_crown') shapeCrowns(mesh, { bend: true })
        else if (family === 'web_plants') shapeCrowns(mesh)
        else if (THIN_FAMILIES.includes(family)) thinMembers(mesh)
    })
    applyPalette(meshes)
    towerRoof(meshes)
    timberWalls(meshes)
    lightenTelescopeBands(meshes, anchorPosition(gltf, TELESCOPE.anchor))
    // Round 13 drops the sprites of the lamps inside the lit rooms (within INDOOR_GLOW of a room
    // anchor). The desk lamp sprite drew a round halo over the monitor in S2, and the room light
    // already reads through the window spill.
    const outdoor = spots.filter((spot) => !bounces.some((room) => spot.position.distanceTo(room) < INDOOR_GLOW))
    const glows = fitGlowsToWalls(outdoor.slice(0, MAX_GLOWS), meshes)
    const litterAt = applyAutumn(meshes)
    // The leaf piles join the island meshes after the paint, so the litter cards fall on them.
    const blocked = litterBlocked(meshes)
    const piles = createLeafPiles({ meshes, material: opaque, litterAt, blocked })
    if (piles) {
        gltf.scene.add(piles)
        meshes.push(piles)
    }
    const shadows = createContactShadows(gltf.scene, meshes, isLaidRock, blocked)
    if (shadows) gltf.scene.add(shadows)

    const materials = [opaque, ...replaced.values()]
    const update = (seconds) => {
        time.value = seconds
    }
    const dispose = () => {
        materials.forEach((material) => material.dispose())
        detail.dispose()
        carpet.dispose()
        shadows?.userData.dispose()
    }
    return { uniforms, materials, meshes, litterAt, glowSpots: glows.fitted, glowsShrunk: glows.shrunk, aoMeshes, update, dispose }
}
