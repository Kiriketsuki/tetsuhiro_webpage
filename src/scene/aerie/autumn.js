import * as THREE from 'three'
import { srgb, noise3, field, along, meanLuma, lumaRatio, paintVertices } from './field-noise.js'
import { SURFACE } from './toon-material.js'

// Autumn for the island, after the warm palette of Leaf it Alone: amber, rust and gold
// crowns, an olive-gold lawn with bright leaf litter under the trees, and olive-mustard
// planting. It runs once at load on the baked vertex colours. A slow world noise picks
// each region's tone, so a crown turns as one patch, never as single faces. Each crown
// runs from rust at its base to gold at its top (crowns.js measures the height). The
// crowns ignore the baked brightness, which varies lump by lump, so a crown reads as one
// mass. The lawn keeps its baked brightness as a ratio to the family mean. leaf-cards.js
// reads the same fields, so the leaf cards match the surface under them.

// Rust at the base of a crown, through orange and amber, to gold at the top. The stops
// lean to amber and gold, so a crown reads golden orange with rust only at its base, as
// the trees of Leaf it Alone do. The darker rust stops read crimson under the night light.
// Round 6 moves the stops up the hue wheel. The round 5 crowns sampled orange-red with
// crimson and maroon lumps, and the review asked that at least half the crown area sample
// amber or gold (hue 35 to 50 degrees). The base stop is now a burnt orange, not a crimson,
// and three of the four stops sit in the amber and gold band, as the golden trees of the
// reference do.
// Round 7 widens the stops again, from a true rust through pumpkin and amber to gold, and
// each tree takes its own shift along them (crowns.js), because the round 6 crowns all read
// one mustard tone. The night light and the shade pull every stop about ten degrees toward
// red, so the amber and gold stops sit a little yellower than the tone the eye should read.
// Round 8 lifts the base stop from a rust (hue 21) to a burnt amber (hue 26). The S1 left
// crown sampled hue 10 on its underside, a dark red, and the review asked for hue 18 or more.
// Round 9 adds a rust-red stop at the base and pulls the gold to the very top. The review
// read every round 8 crown as gold-yellow, and asked for a rust-red outer and lower canopy,
// amber in the middle and gold only at the sunlit top.
const CROWN = [0xb04a1a, 0xc65e1c, 0xd97e1e, 0xe39c26, 0xecbe3c].map(srgb)
// Olive-gold, never a dark green. Round 5 kept the green channel above the red, and the
// night fill pulled the S1 lawn to an olive green (#5d6920). Round 6 sets the red a little
// above the green, so the lit lawn samples near the olive-gold #7a7030 the review asks for.
// Round 6 sets the red and the green near equal and drops the value, because the S9 lawn
// sampled lime (#9cc23a) and the review asked for an olive-gold near #8a8a3a when lit.
// The warm night light pulls the lawn toward gold, so the green sits a little above the red.
// Round 7 moves the hue down to about 50 degrees. The round 6 lawn still sampled hue 62 in
// S10, a lime, and the review asked for 48 to 60.
// Round 10 moves the lawn to hue about 44 at a higher saturation. The round 9 lawn still read
// olive green and muddy in S7 and S10, and the review asked for olive-gold.
const LAWN = [0x8a7230, 0x947c34, 0x9c8838].map(srgb)
// The island side walls under the lawn lip: olive moss just under the lip, through a damp
// umber, to a warm tan earth further down, where the cliff rock takes over.
// Round 8 keeps the whole bank in olive moss tones. Its umber middle sampled maroon under the
// night fill, and the cliff below now carries the moss to tan gradient (palette.js).
const BANK = [0x5e5428, 0x62562c, 0x6a5a34].map(srgb)
// How far below the local lawn top the bank runs from moss to earth, in metres.
const BANK_DEPTH = 1.6
// A lawn face whose flat normal points less than this far up is a bank, not lawn.
const BANK_SLOPE = 0.55
// The cell size of the lawn top map, in metres.
const TOP_CELL = 1.5
// Litter from gold through amber and orange to red, as the leaf carpets of the reference.
// A broad field picks the band of a pile, and each leaf picks a stop near that band.
// The carpets of the reference are mostly amber and orange with a few red leaves. Round 5
// drops the deep crimson stop and adds a second amber, so red stays the minority.
// Round 6 adds a clear yellow at the gold end, so a carpet reads yellow, orange and red.
const LITTER = [0xeec030, 0xe9a01a, 0xe07a0e, 0xd4560a, 0xbb3408].map(srgb)
// Round 9 gives each shrub one of four tones, base to tip: olive, rust, deep green and ochre.
// crowns.js picks the tone per shrub, so neighbouring shrubs differ. The review read every
// round 8 shrub as the same olive sphere.
const PLANTS = [
    [0x5c5a22, 0x6e6828],
    [0x6a3216, 0x84461e],
    [0x2e4220, 0x3e5628],
    [0x7a5c1a, 0x947428],
].map((tones) => tones.map(srgb))
const RUST = srgb(0x7a2a0c)
const AMOUNT = { web_grass: 0.88 }
// The noise scales in cycles per metre.
const CROWN_SCALE = 0.12
const LAWN_SCALE = 0.06
const PLANT_SCALE = 0.1
const LITTER_SCALE = 0.25
const LITTER_CELL = 1
const LITTER_BLUR = 2
// How far the lawn under the trees turns toward the litter tone. The leaf cards carry the
// orange. A strong tint turned the whole lawn under a tree into one flat orange field.
const LITTER_STRENGTH = 0.35
// The leaf carpet amount (the aLitter attribute, read by toon-material.js): about 1 under a
// crown, and a thinner drift out on the open lawn, in patches several metres across.
// Round 8 keeps the open lawn mostly bare. The round 7 drifts covered almost every lawn
// surface, and every wide shot read as one orange field. Now only about a third of the open
// lawn takes a thin drift, and the full carpet stays inside the drip line of each crown.
const CARPET_UNDER = 1.3
const CARPET_OPEN = 0.34
// The drift field must pass OPEN_FROM before a drift starts, and the litter field must pass
// UNDER_FROM before the carpet under a crown starts.
const OPEN_FROM = [0.56, 0.74]
const UNDER_FROM = [0.5, 0.9]

// The crown colour at a world point, for a height h in the crown from 0 (base) to 1 (top)
// and a depth from 0 (rim) to 1 (centre). The height sets most of the band, and a broad
// noise shifts whole patches. Leaves deep inside a crown sit a little in its own shade,
// so the crown reads as a volume. The depth term stays small, so lumps side by side
// never read as dark red against orange.
export function crownColor(p, h, depth, out, shift = 0) {
    // Round 6 starts the band lower, so a crown runs rust, amber and gold, not gold alone.
    const t = 0.04 + shift + (field(p, CROWN_SCALE) - 0.5) * 0.24 + THREE.MathUtils.clamp(h, 0, 1) * 0.82
    along(CROWN, t, out)
    return out.multiplyScalar(1 - 0.08 * THREE.MathUtils.smoothstep(depth, 0.3, 0.9))
}

// The litter tone: a broad field picks the band, and a finer field moves it a little
// within the band. The bands centre between amber and orange, below the middle stop,
// because the night light already pulls orange toward red. `shift` moves along the stops.
export function litterTone(p, out, shift = 0) {
    const t = noise3(p.x * LITTER_SCALE, 1.7, p.z * LITTER_SCALE) * 0.75 + noise3(p.x * 0.9, 4.2, p.z * 0.9) * 0.25
    return along(LITTER, t - 0.16 + shift, out)
}

// One litter leaf: the band of its pile, moved up to a stop and a half either way by r in
// 0..1, so a pile mixes gold, orange and red leaves around its own band, as real litter
// does. The shift is per leaf card, a whole separate leaf, never a face of the lawn.
export function litterLeaf(p, r, out) {
    return litterTone(p, out, (r - 0.5) * 0.7)
}

// The planting tone of one shrub variant (PLANTS), from its base to its tip, with some
// patches toward rust.
export function plantTone(p, h, out, variant = 0) {
    along(PLANTS[variant % PLANTS.length], field(p, PLANT_SCALE, 5.3), out)
    out.lerp(RUST, THREE.MathUtils.smoothstep(field(p, 0.08, 9.1), 0.6, 0.72) * 0.2)
    // Round 19 widens the base-to-tip ramp, so each shrub reads as one soft mass with a lit top.
    return out.multiplyScalar(0.62 + 0.48 * THREE.MathUtils.smoothstep(h, 0, 1))
}

// A coarse map of where the crowns hang, blurred and read with bilinear filtering, so
// litter fades out smoothly from under each tree with no grid steps. It reads the crown
// lumps and the leaf card positions, so the litter covers the whole spread of each tree.
function litterMap(crowns) {
    const cells = new Map()
    const p = new THREE.Vector3()
    const mark = (point) => cells.set(`${Math.floor(point.x / LITTER_CELL)},${Math.floor(point.z / LITTER_CELL)}`, 1)
    crowns.forEach((mesh) => {
        const position = mesh.geometry.attributes.position
        for (let i = 0; i < position.count; i += 3) mark(p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld))
        const leaves = mesh.userData.crownLeaves ?? []
        leaves.forEach((leaf) => mark(leaf.position))
    })
    const blurred = new Map()
    cells.forEach((_, key) => {
        const [cx, cz] = key.split(',').map(Number)
        for (let dx = -LITTER_BLUR; dx <= LITTER_BLUR; dx += 1) {
            for (let dz = -LITTER_BLUR; dz <= LITTER_BLUR; dz += 1) {
                const weight = Math.max(0, 1 - Math.hypot(dx, dz) / (LITTER_BLUR + 1))
                const k = `${cx + dx},${cz + dz}`
                blurred.set(k, Math.min(1, (blurred.get(k) ?? 0) + weight * 0.35))
            }
        }
    })
    return litterLookup(blurred)
}

// The litter amount at a point, read from the blurred cells of litterMap with bilinear
// filtering. The cells ride along as `cells`, so the look worker can send them back to the
// page, and the page builds the same lookup from them.
export function litterLookup(blurred) {
    const at = (x, z) => blurred.get(`${x},${z}`) ?? 0
    const litterAt = (x, z) => {
        const gx = x / LITTER_CELL - 0.5
        const gz = z / LITTER_CELL - 0.5
        const x0 = Math.floor(gx)
        const z0 = Math.floor(gz)
        const fx = gx - x0
        const fz = gz - z0
        const top = at(x0, z0) * (1 - fx) + at(x0 + 1, z0) * fx
        const bottom = at(x0, z0 + 1) * (1 - fx) + at(x0 + 1, z0 + 1) * fx
        return top * (1 - fz) + bottom * fz
    }
    litterAt.cells = blurred
    return litterAt
}

function paintCrowns(meshes) {
    meshes.forEach((mesh) => {
        const shift = mesh.userData.crownShift
        // Round 11 paints the lumps with the colour of the middle of the crown band, as the leaf
        // cards take it (leaf-cards.js), and the shader runs the band per pixel from the crown
        // normal. Lumps painted by height showed between the cards as flat patches of another tone.
        paintVertices(mesh, (p, c, i) => {
            crownColor(p, 0.5, 0, c, shift ? shift[i] : 0)
        })
    })
}

// Shrubs take the planting tone. Grass tufts take the lawn tone, a little lighter at the
// tip, with the litter under the crowns, so they read as part of the lawn and never as
// dark specks.
function paintPlants(meshes, litterAt) {
    const target = new THREE.Color()
    const spot = new THREE.Color()
    meshes.forEach((mesh) => {
        const height = mesh.userData.crownHeight
        const tuft = mesh.userData.plantTuft
        const variant = mesh.userData.plantVariant
        paintVertices(mesh, (p, c, i) => {
            const h = height ? height[i] : 0.5
            if (tuft && tuft[i]) {
                along(LAWN, field(p, LAWN_SCALE), target).multiplyScalar(0.9 + 0.3 * h)
                const litter = litterAt(p.x, p.z)
                if (litter > 0) target.lerp(litterTone(p, spot), litter * LITTER_STRENGTH * 0.6)
                c.copy(target)
                return
            }
            // Round 19 drops the baked value of each face. It drew a camouflage spot pattern on
            // the shrubs (S5, S9), so each shrub now takes one tone with a soft base-to-tip ramp.
            c.copy(plantTone(p, h, target, variant ? variant[i] : 0))
        })
    })
}

// The highest up-facing lawn point in each TOP_CELL cell, read as the highest of a cell and
// its eight neighbours, so a bank face can tell its depth below the lip it hangs from.
function lawnTop(meshes) {
    const cells = new Map()
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    meshes.forEach((mesh) => {
        const position = mesh.geometry.attributes.position
        const flat = mesh.geometry.attributes.flatNormal ?? mesh.geometry.attributes.normal
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
        for (let i = 0; i < position.count; i += 1) {
            if (n.fromBufferAttribute(flat, i).applyMatrix3(normalMatrix).normalize().y < BANK_SLOPE) continue
            p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
            const key = `${Math.floor(p.x / TOP_CELL)},${Math.floor(p.z / TOP_CELL)}`
            cells.set(key, Math.max(cells.get(key) ?? -Infinity, p.y))
        }
    })
    return (x, z) => {
        const cx = Math.floor(x / TOP_CELL)
        const cz = Math.floor(z / TOP_CELL)
        let top = -Infinity
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dz = -1; dz <= 1; dz += 1) top = Math.max(top, cells.get(`${cx + dx},${cz + dz}`) ?? -Infinity)
        }
        return top
    }
}

// Per vertex: the depth below the lawn top where the face is a bank under the lip, and -1 on
// the lawn. A face counts as bank when its flat normal is steep. A test on the depth below
// the local top also caught the low side of every rolling hill and turned the lawn brown,
// so only the slope decides. The grass ledge under the pad is soil in the GLB since pad
// revision r6. All three corners of a triangle agree, so the bank and the lawn part along
// face edges and the surface family never splits a face.
function bankDepths(mesh, topAt) {
    const position = mesh.geometry.attributes.position
    const flat = mesh.geometry.attributes.flatNormal ?? mesh.geometry.attributes.normal
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    const depths = new Float32Array(position.count).fill(-1)
    const n = new THREE.Vector3()
    const p = new THREE.Vector3()
    const below = [0, 0, 0]
    for (let t = 0; t < position.count / 3; t += 1) {
        n.fromBufferAttribute(flat, t * 3).applyMatrix3(normalMatrix).normalize()
        for (let k = 0; k < 3; k += 1) {
            p.fromBufferAttribute(position, t * 3 + k).applyMatrix4(mesh.matrixWorld)
            below[k] = Math.max(0, topAt(p.x, p.z) - p.y)
        }
        if (n.y >= BANK_SLOPE) continue
        below.forEach((depth, k) => (depths[t * 3 + k] = depth))
    }
    return depths
}

// The bank colour at a depth below the lip. A broad field of a few metres moves the band up
// or down, so the moss line wanders and the wall never reads as one flat slab.
export function bankTone(p, depth, out) {
    const t = THREE.MathUtils.clamp(depth / BANK_DEPTH + (field(p, 0.35, 8.1) - 0.5) * 0.7, 0, 1)
    return along(BANK, t, out).multiplyScalar(0.9 + 0.2 * field(p, 0.6, 3.7))
}

// The lawn: olive-gold, with litter under the crowns and a soft contact darkening where
// the litter cards lie. The banks under the lip take the moss to earth gradient and the
// soil surface family, so the lawn detail never streaks down a wall.
function paintLawn(meshes, litterAt) {
    const mean = meanLuma(meshes)
    const target = new THREE.Color()
    const spot = new THREE.Color()
    const topAt = lawnTop(meshes)
    meshes.forEach((mesh) => {
        const banks = bankDepths(mesh, topAt)
        const surface = mesh.geometry.attributes.aSurface
        if (surface) {
            for (let i = 0; i < banks.length; i += 1) if (banks[i] >= 0) surface.setX(i, SURFACE.soil)
            surface.needsUpdate = true
        }
        mesh.userData.bank = banks
        const carpet = new Float32Array(banks.length)
        paintVertices(mesh, (p, c, i) => {
            if (banks[i] < 0) {
                const open = CARPET_OPEN * THREE.MathUtils.smoothstep(field(p, 0.3, 5.9), ...OPEN_FROM)
                const under = litterAt ? THREE.MathUtils.smoothstep(litterAt(p.x, p.z), ...UNDER_FROM) * CARPET_UNDER : 0
                carpet[i] = Math.min(1, Math.max(under, open))
            }
            if (banks[i] >= 0) {
                c.copy(bankTone(p, banks[i], target))
                return
            }
            along(LAWN, field(p, LAWN_SCALE), target)
            const litter = litterAt ? litterAt(p.x, p.z) : 0
            if (litter > 0) target.lerp(litterTone(p, spot), THREE.MathUtils.smoothstep(litter, 0.35, 0.9) * LITTER_STRENGTH)
            target.multiplyScalar((1 - 0.1 * THREE.MathUtils.smoothstep(litter, 0.3, 0.6)) * lumaRatio(c, mean))
            c.lerp(target, AMOUNT.web_grass)
        })
        mesh.geometry.setAttribute('aLitter', new THREE.BufferAttribute(carpet, 1))
    })
}

// meshes: island meshes tagged with userData.webMaterial by island-look.js. Returns the
// litter field, for the litter cards.
export function applyAutumn(meshes) {
    const byFamily = (name) => meshes.filter((mesh) => mesh.userData.webMaterial === name)
    const crowns = byFamily('web_crown')
    const litterAt = crowns.length ? litterMap(crowns) : () => 0
    paintCrowns(crowns)
    paintPlants(byFamily('web_plants'), litterAt)
    paintLawn(byFamily('web_grass'), litterAt)
    return litterAt
}
