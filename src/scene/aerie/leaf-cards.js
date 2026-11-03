import * as THREE from 'three'
import { createToonMaterial } from './toon-material.js'
import { crownColor, plantTone, litterTone, litterLeaf } from './autumn.js'
import { field } from './field-noise.js'

// Leaf cards: small alpha-cut quads that cover the crowns, fringe the shrubs, lie as
// litter on the lawn, and drift down through the air. On the crowns, the cards cover the
// outer shell of each tree densely, so the crown reads as one soft mass of leaves and the
// faceted lumps under it never show at the silhouette, as with the foliage of Leaf it
// Alone. Every card takes its colour from the same banded field as the surface it sits on
// (autumn.js), so the colour stays coherent across areas. Each card is a whole separate
// leaf, so it may sit a little up or down the band from its neighbour, as real leaves do:
// a litter pile mixes gold, orange and red leaves around its own band. No face of a mesh
// ever takes a colour of its own. The cards share the toon light (the AERIE_CARD variant).
// Each crown card shades with the bent normal of its crown, turned a little toward its
// own facing.
//
// The leaf atlas is painted once at load in a 2x2 grid: two single leaves for the litter
// and the drifting leaves, and two leaf clumps for the crowns and the shrubs. Round 9 swaps
// the single star leaves on the crowns for clumps. A crown covered in single star leaves read
// as one repeated stamp with an outline motif. A clump is a round mass with a fringe of small
// pointed leaves, so many clumps overlap into one soft leafy mass with a leafy outline.

const ATLAS = 256
const CELL = ATLAS / 2
// The atlas cells in UV. The atlas uploads with no flip, so the top canvas row is v 0.
const CELLS = [
    [0, 0],
    [0.5, 0],
    [0, 0.5],
    [0.5, 0.5],
]
// Round 3 drew 9000 crown cards on a desktop. Most sat under the crowns or on their far
// side, where no stop looks. The crown cards now go only where some camera stop can see
// them (see VIEW_FACING). Round 5 cuts the crown cards again: the faceted lumps under the
// cards carry the same banded colour, so the inner shell needs fewer cards, and the
// smaller rim cards (RIM_DEPTH) make the outline. The spec budget is 2800 on a desktop
// and 800 on a phone. The litter carpet that the reference shows needs more than that.
// The second round 5 pass cuts the total from 5900 to 4100 on a desktop and from 1900 to
// 1450 on a phone. Each card is a little larger, so the crowns and the carpet keep their
// cover with fewer cards.
// Round 6 splits the litter. `under` cards go only where a crown hangs over the lawn, so the
// ground within a crown radius reads as a near-continuous carpet, as in the reference. The
// open-lawn drifts (`litter`) take fewer cards in exchange, so the total stays near round 5.
// Round 7 paints the dense carpet into the lawn (leaf-carpet.js), so the litter cards are
// only the loose leaves on top. The crowns take more, smaller cards instead: large flat
// cards read as cut paper up close. The total is 4,036 cards on a desktop and 1,694 on a
// phone, against 4,036 and 1,474 in round 6.
const COUNTS = {
// Round 8 cuts the open-lawn drift cards by about half, so bare olive-gold lawn shows between
// the drifts, and puts some of them under the crowns, where the leaf piles now stand.
// Round 9 draws the crowns with fewer, larger clump cards (see CROWN_CARD).
// Round 14 adds crown cards, so the crowns close their gaps and read as one leafy mass (S5).
// Round 18 draws the crowns with about two thirds as many larger lobed clumps (CROWN_CARD), so
// each crown reads as a few large rounded lobes and not as many small disc splats.
// Round 20 adds crown cards, so the cards close over the merged crown shell (CARD_PULL).
    desktop: { crown: 1100, shrub: 200, under: 800, litter: 240, drift: 60 },
    phone: { crown: 640, shrub: 0, under: 520, litter: 140, drift: 24 },
}
// A lawn point counts as under a crown where the litter field reaches this value.
const UNDER_LITTER = 0.5
// A crown card sits on the outer shell of its crown: the lump surface where the crown
// depth is below this value. Deeper lump faces stay bare, unseen inside the mass.
const SHELL_DEPTH = 0.5
// Round 6 keeps the face of each crown mostly bare: past RIM_BAND only INNER_KEEP of the
// cards stay. The smooth-shaded lumps then read as one soft rounded mass, and the cards
// make the leafy fringe at its rim. A full cover of cards read as a pile of flat stars.
// Round 7 keeps more of the inner cards, because the cards are smaller now and the bare
// lumps read as large flat polygons in the close shots (S3, S4 phone).
const RIM_BAND = 0.3
const INNER_KEEP = 0.6
// The crown and shrub cards use the two clump cells. The litter and the drifting leaves use
// the two single leaf cells.
const CROWN_CELLS = [1, 3]
const LEAF_CELLS = [0, 2]
// A clump card spans about a metre, so a crown of four or five metres takes a few dozen
// overlapping clumps across its face and reads as one rounded mass.
const CROWN_CARD = [1.4, 2.1]
// Phones carry fewer cards, so each one is larger and the crowns stay covered.
const PHONE_CROWN_CARD = [1.5, 2.2]
// At the rim of a crown (crown depth under RIM_DEPTH) the cards are RIM_SCALE of the size,
// so the outline breaks into smaller leafy bumps and does not read as large round puffs.
// Round 17 makes the rim cards smaller still, so the outline breaks into small leafy bumps
// on one rounded mass and no longer into a row of large round puffs (S1, S5, S6).
// Round 18 makes the rim cards larger again (RIM_SCALE), because the small rim clumps stood
// out from the crown edge as loose droplets.
const RIM_DEPTH = 0.24
const RIM_SCALE = 0.72
// Round 20 pulls each crown card CARD_PULL of the way onto one ellipsoid shell of its crown, at
// CARD_SHELL of the crown half size, so the lobes of a crown merge into one rounded silhouette
// (S1, S5). The shader shades the cards with one sphere of SPHERE_SCALE of the mean half size.
const CARD_PULL = 0.85
const CARD_SHELL = 0.9
const SPHERE_SCALE = 0.95
// The share of crown cards kept on the downward faces of a crown. Only a low camera sees
// the underside, and the bark and the shade hide most of it.
// Round 14 keeps more of them (0.35 to 0.7). The bare lumps under a crown read as floating
// polygons from the high pad view (S5).
const UNDERSIDE_KEEP = 0.7
// Litter leaves are large, so each one reads as a leaf from every stop.
// Round 7 cuts them from about 0.75 m to 0.4 m. A leaf the size of the bench seat read as a
// flat blob near the camera.
const LITTER_CARD = [0.3, 0.48]
const PHONE_LITTER_CARD = [0.36, 0.56]
// Away from the trees, drifts of leaves still lie on the lawn. The reference shows almost
// no bare lawn, so a thin carpet (CARPET) covers the open lawn too, broken into patches
// by a slow field, and SCATTER adds denser drifts.
const SCATTER = 0.22
const CARPET = 0.34
// Litter keeps this clear of the path, the water and the pad, in metres. A large flat
// leaf next to a raised stone reads as a red fleck cut by the stone edge.
const LITTER_CLEAR = 0.38
// A crown card is kept when its crown normal turns at least this far toward one of the
// camera stops (a dot product). A card on the far side of a crown, turned away from every
// stop, hides behind the crown itself. The margin below zero covers the look-around pan.
const VIEW_FACING = -0.25
// How far a crown card may turn from the crown normal. A wider turn shows many cards
// edge-on, as thin slivers that stick out of the crown.
const CROWN_TILT = 0.8
// Anisotropic filtering for the leaf atlas. A card seen at a slant samples a mip blurred
// along one axis, and the sharpened alpha cut then drew it as a long smeared streak.
const ATLAS_ANISOTROPY = 8
const DRIFT_SPEED = 0.4
const DRIFT_TOP = 14
// Round 19 adds drifting leaves and makes each one larger, so a few read near the island in the
// overview (S6). The 0.28 m leaves vanished at that distance.
const DRIFT_SIZE = 0.36
const DRIFT_BOTTOM = -1.5
// Drifting leaves keep this far out of the house, in metres, so none floats indoors.
const HOUSE_MARGIN = 1.5

function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// One leaf outline as a polar radius for each angle. `lobes` sets the lobe count and
// `narrow` squeezes the width. Each lobe ends in a point, as on a maple leaf, so a leaf
// still reads as a leaf, not a round blob, when it covers only a few pixels.
function leafPath(ctx, cx, cy, size, { lobes, depth, narrow }) {
    ctx.beginPath()
    const steps = 160
    for (let i = 0; i <= steps; i += 1) {
        const a = (i / steps) * Math.PI * 2
        // 1 - |sin| has a cusp at each lobe tip, so every lobe ends in a point.
        const lobe = lobes ? 1 - depth + depth * Math.pow(1 - Math.abs(Math.sin(((a - Math.PI / 2) * lobes) / 2)), 1.5) : 1
        // The stem end narrows, so the shape reads as a leaf, not a blob.
        const taper = 0.7 + 0.3 * Math.sin(a)
        const r = size * lobe * taper
        const x = cx + Math.cos(a) * r * narrow
        const y = cy - Math.sin(a) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    }
    ctx.closePath()
}

function veins(ctx, cx, cy, size, lobes) {
    ctx.beginPath()
    ctx.moveTo(cx, cy + size * 0.85)
    ctx.lineTo(cx, cy - size * 0.75)
    const count = lobes || 3
    for (let k = 0; k < count; k += 1) {
        const a = Math.PI / 2 + ((k - (count - 1) / 2) / count) * Math.PI * 1.1
        ctx.moveTo(cx, cy + size * 0.15)
        ctx.lineTo(cx + Math.cos(a) * size * 0.7, cy - Math.sin(a) * size * 0.7)
    }
    ctx.stroke()
}

// One leaf clump: a round core with a ring of large fused lobes and a few short leaf tips on
// the rim, all in one value. Round 18 replaces the round 17 clump, a disc with a ring of small
// bumps and loose leaves. Many of those clumps side by side drew a scalloped disc motif and
// detached droplets along every crown edge (S1, S4, S6). Every lobe and every tip now overlaps
// the core, so no part stands apart, and the crown edge reads as a few soft leafy lobes. The
// crown normal alone shades the clump (toon-material.js).
function paintClump(ctx, cx, cy, size, random) {
    ctx.fillStyle = 'rgb(246,246,246)'
    const disc = (x, y, r) => {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
    }
    disc(cx, cy, size * 0.58)
    const lobes = 7
    const turn = random() * Math.PI * 2
    for (let i = 0; i < lobes; i += 1) {
        const a = turn + ((i + (random() - 0.5) * 0.4) / lobes) * Math.PI * 2
        disc(cx + Math.cos(a) * size * 0.3, cy + Math.sin(a) * size * 0.3, size * (0.32 + random() * 0.04))
    }
    // Round 20 rims the clump with a dense fringe of small pointed leaves, each rooted inside
    // the lobes, so the crown edge reads as a soft leafy fringe and not as a row of round
    // scallops (S1, S5, S4 phone).
    const tips = 18
    for (let i = 0; i < tips; i += 1) {
        const a = turn + ((i + random() * 0.7) / tips) * Math.PI * 2
        const length = size * (0.15 + random() * 0.07)
        const r = size * 0.6
        ctx.save()
        ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        ctx.rotate(a + Math.PI / 2 + (random() - 0.5) * 0.6)
        leafPath(ctx, 0, 0, length, { lobes: 0, depth: 0, narrow: 0.5 })
        // The fringe leaves sit a little darker than the core, so overlapping clumps show soft
        // leaf shapes inside the crown with no dark edge.
        ctx.fillStyle = 'rgb(226,226,226)'
        ctx.fill()
        ctx.restore()
    }
}

// Paints the two single leaves and the two clumps, then gives every clear pixel the mean
// leaf value, so the mips blend a leaf edge toward the leaf colour and never toward black.
// A black fringe turned small, distant leaves into dark specks.
function createAtlas(anisotropy) {
    const canvas = document.createElement('canvas')
    canvas.width = ATLAS
    canvas.height = ATLAS
    const ctx = canvas.getContext('2d')
    const random = mulberry32(97)
    const shapes = [{ lobes: 5, depth: 0.42, narrow: 1 }, null, { lobes: 0, depth: 0, narrow: 0.62 }, null]
    shapes.forEach((shape, i) => {
        const cx = (i % 2) * CELL + CELL / 2
        const cy = Math.floor(i / 2) * CELL + CELL / 2 + 2
        const size = CELL * 0.42
        if (!shape) {
            // Round 13 shrinks the clump inside its cell. Its fringe leaves reached the cell edge,
            // where the atlas cut them off along a straight line at the crown outline (S5).
            paintClump(ctx, cx, cy - 2, CELL * 0.4, random)
            return
        }
        leafPath(ctx, cx, cy, size, shape)
        const gradient = ctx.createRadialGradient(cx, cy - size * 0.2, 1, cx, cy, size)
        // A soft gradient only. A strong light centre on every card drew a pattern of round
        // spots over the crowns.
        gradient.addColorStop(0, '#ffffff')
        gradient.addColorStop(0.7, '#f0f0f0')
        gradient.addColorStop(1, '#d6d6d6')
        ctx.fillStyle = gradient
        ctx.fill()
        // A painted darker rim inside the outline.
        ctx.save()
        ctx.clip()
        // A hard dark rim drew the same outline on every card and stamped a pattern over
        // the crowns, so the rim stays soft.
        ctx.lineWidth = 5
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.45)'
        leafPath(ctx, cx, cy, size, shape)
        ctx.stroke()
        // Light veins, as on the painted leaves of the reference.
        ctx.lineWidth = 2
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
        veins(ctx, cx, cy, size, shape.lobes)
        ctx.restore()
        // The leaves have no stem. A one-pixel stem stuck out of every card at a distance
        // and read as a short line stroke round the crown outline.
    })
    const image = ctx.getImageData(0, 0, ATLAS, ATLAS)
    const data = image.data
    let sum = 0
    let solid = 0
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 127) {
            sum += data[i]
            solid += 1
        }
    }
    const mean = solid ? Math.round(sum / solid) : 220
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) {
            data[i] = mean
            data[i + 1] = mean
            data[i + 2] = mean
        }
    }
    const texture = new THREE.DataTexture(new Uint8Array(data.buffer.slice(0)), ATLAS, ATLAS, THREE.RGBAFormat)
    texture.name = 'aerie.leaf'
    texture.colorSpace = THREE.NoColorSpace
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.anisotropy = anisotropy
    texture.needsUpdate = true
    return texture
}

// Picks triangles by area, so the cards spread evenly over a surface.
function areaSampler(meshes) {
    const entries = []
    let total = 0
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    meshes.forEach((mesh) => {
        const position = mesh.geometry.attributes.position
        for (let t = 0; t < position.count / 3; t += 1) {
            a.fromBufferAttribute(position, t * 3).applyMatrix4(mesh.matrixWorld)
            b.fromBufferAttribute(position, t * 3 + 1).applyMatrix4(mesh.matrixWorld)
            c.fromBufferAttribute(position, t * 3 + 2).applyMatrix4(mesh.matrixWorld)
            total += b.sub(a).cross(c.sub(a)).length() * 0.5
            entries.push({ mesh, t, end: total })
        }
    })
    return (r) => {
        const target = r * total
        let lo = 0
        let hi = entries.length - 1
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (entries[mid].end < target) lo = mid + 1
            else hi = mid
        }
        return entries[lo]
    }
}

// A random point on a triangle, with its world normal, its crown height and depth. A crown
// reads its full-size surface (crowns.js keeps it), not the shrunken lumps.
function pointOn({ mesh, t }, random) {
    const surface = mesh.userData.crownSurface
    const position = surface ? new THREE.BufferAttribute(surface, 3) : mesh.geometry.attributes.position
    const normal = mesh.geometry.attributes.normal
    let u = random()
    let v = random()
    if (u + v > 1) {
        u = 1 - u
        v = 1 - v
    }
    const weights = [1 - u - v, u, v]
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    const tmp = new THREE.Vector3()
    let h = 0
    let depth = 0
    let shift = 0
    const centre = new THREE.Vector3()
    const centres = mesh.userData.crownCentre
    const halves = mesh.userData.crownHalf
    const half = new THREE.Vector3()
    const height = mesh.userData.crownHeight
    const depths = mesh.userData.crownDepth
    const shifts = mesh.userData.crownShift
    weights.forEach((weight, k) => {
        const i = t * 3 + k
        p.addScaledVector(tmp.fromBufferAttribute(position, i), weight)
        n.addScaledVector(tmp.fromBufferAttribute(normal, i), weight)
        if (height) h += height[i] * weight
        if (depths) depth += depths[i] * weight
        if (shifts) shift += shifts[i] * weight
        if (centres) centre.addScaledVector(tmp.fromArray(centres, i * 3), weight)
        if (halves) half.addScaledVector(tmp.fromArray(halves, i * 3), weight)
    })
    p.applyMatrix4(mesh.matrixWorld)
    n.transformDirection(mesh.matrixWorld)
    centre.applyMatrix4(mesh.matrixWorld)
    return { p, n, h, depth, shift, centre, half }
}

const Z = new THREE.Vector3(0, 0, 1)

// Builds one card transform that faces along `facing`, with a twist about it. `shape`
// mirrors and stretches the card: x and y scale factors around 1, x negative to mirror.
function cardMatrix(position, facing, twist, size, out, shape = [1, 1]) {
    const q = new THREE.Quaternion().setFromUnitVectors(Z, facing)
    q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, twist))
    return out.compose(position, q, new THREE.Vector3(size * shape[0], size * shape[1], size))
}

// A random mirror and stretch for one card.
const cardShape = (random) => {
    const stretch = 0.85 + random() * 0.3
    return [(random() < 0.5 ? -1 : 1) * stretch, 2 - stretch]
}

// Each card folds along its midrib: the plane splits in two down the middle, and the two
// outer edges lift by FOLD of the card size, so a leaf on the lawn curls up at its rims and
// throws a shade on one half (toon-material.js). Crown cards face the camera and ignore the
// lift, so only the loose leaves curl.
const FOLD = 0.16
function foldedPlane() {
    const geometry = new THREE.PlaneGeometry(1, 1, 2, 1)
    const position = geometry.attributes.position
    for (let i = 0; i < position.count; i += 1) position.setZ(i, Math.abs(position.getX(i)) > 0.25 ? FOLD : 0)
    geometry.computeVertexNormals()
    return geometry
}

function createCardMesh(material, count) {
    const geometry = foldedPlane()
    geometry.setAttribute('aBent', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3))
    geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2))
    geometry.setAttribute('aSprite', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4))
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.receiveShadow = true
    mesh.castShadow = false
    return mesh
}

// sprite: [1, spin, width, height] for a card that faces the camera (toon-material.js),
// or null for a card with a fixed facing.
// radius: the crown sphere radius in decimetres, packed into the whole part of the cell offset.
function writeCard(mesh, index, { matrix, bent, color, cell, sprite = null, radius = 0 }) {
    mesh.setMatrixAt(index, matrix)
    mesh.setColorAt(index, color)
    bent.toArray(mesh.geometry.attributes.aBent.array, index * 3)
    mesh.geometry.attributes.aCell.array.set([CELLS[cell][0] + radius, CELLS[cell][1]], index * 2)
    mesh.geometry.attributes.aSprite.array.set(sprite ?? [0, 0, 0, 0], index * 4)
}

const jitter = (random, amount) => new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(amount)

// The fringe on the shrubs. It skips the undersides.
function fringe(meshes, count, tone, random, emit) {
    if (!meshes.length || !count) return
    const pick = areaSampler(meshes)
    const facing = new THREE.Vector3()
    const color = new THREE.Color()
    let placed = 0
    for (let tries = 0; placed < count && tries < count * 6; tries += 1) {
        const entry = pick(random())
        // Grass tufts stay bare. They read as lawn.
        if (entry.mesh.userData.plantTuft?.[entry.t * 3]) continue
        const { p, n, h } = pointOn(entry, random)
        n.normalize()
        if (n.y < -0.25) continue
        facing.copy(n).add(jitter(random, 0.7)).normalize()
        p.addScaledVector(n, 0.06)
        emit({
            matrix: cardMatrix(p, facing, random() * Math.PI * 2, 0.3 + random() * 0.16, new THREE.Matrix4()),
            bent: n,
            color: tone(p, h, color, entry.mesh.userData.plantVariant?.[entry.t * 3] ?? 0),
            cell: CROWN_CELLS[Math.floor(random() * CROWN_CELLS.length)],
        })
        placed += 1
    }
}

// True when the crown normal n at p turns toward at least one viewpoint. The cards keep
// their own random facing: turning them toward one stop lined them all up, and another
// stop then saw every card on that crown edge-on as parallel streaks.
function seen(p, n, viewpoints) {
    if (!viewpoints.length) return true
    const toward = new THREE.Vector3()
    return viewpoints.some((eye) => toward.copy(eye).sub(p).normalize().dot(n) > VIEW_FACING)
}

// The crown cards cover the outer shell of every crown. Each card stands a little out from
// the lump under it, faces mostly outward with a random tilt and twist, and takes the
// crown colour at its point, so the cards and the crown read as one mass.
function crownCards(crowns, count, sizes, viewpoints, random, emit) {
    if (!crowns.length || !count) return
    const pick = areaSampler(crowns)
    const facing = new THREE.Vector3()
    const shade = new THREE.Vector3()
    const color = new THREE.Color()
    let placed = 0
    for (let tries = 0; placed < count && tries < count * 12; tries += 1) {
        const { p, n, h, depth, shift, centre, half } = pointOn(pick(random()), random)
        if (depth > SHELL_DEPTH) continue
        if (depth > RIM_BAND && random() > INNER_KEEP) continue
        n.normalize()
        if (n.y < -0.4 && random() > UNDERSIDE_KEEP) continue
        if (!seen(p, n, viewpoints)) continue
        facing.copy(n).add(jitter(random, CROWN_TILT)).normalize()
        p.addScaledVector(n, random() * 0.12)
        const reach = shade.copy(p).sub(centre).divide(half).length()
        if (reach > 1e-3) p.sub(centre).multiplyScalar(THREE.MathUtils.lerp(1, CARD_SHELL / reach, CARD_PULL)).add(centre)
        const radius = Math.round(((half.x + half.y + half.z) / 3) * SPHERE_SCALE * 10)
        // Every card shades with the line from the crown centre to the card, in metres. The
        // shader adds the offset of each card corner to it (toon-material.js), so every point
        // of every card takes the normal of the one crown at that point, and the light runs
        // across the overlapping cards with no step at a card edge. Round 9 used the unit crown
        // normal with a fixed 2.2 m radius, which left a step at each card edge on a larger
        // crown and drew the cards as bands.
        shade.copy(p).sub(centre)
        const rim = depth < RIM_DEPTH ? RIM_SCALE : 1
        const size = THREE.MathUtils.lerp(sizes[0], sizes[1], random()) * rim
        // Each leaf sits a little up or down the crown band and a little lighter or darker,
        // so the leaves read one by one up close and as one band from afar. The value step
        // stays small, so neighbouring cards never read as separate cut-paper pieces.
        // Round 6 drops the per-card shift along the band: neighbouring cards in a cluster
        // jumped between crimson and amber. Every card in a cluster takes the crown band at its
        // point, so the hue changes only with height and across broad patches.
        // Round 9 lowers the band on the faces that turn down or out, so the outer and lower
        // canopy runs rust-red and only the sunlit top reaches gold.
        // Round 10 drops the per-card value jitter of 3 percent and the lean of the band with the
        // card normal. A near card and a far card that overlap on screen sit at about the same
        // height, so they now take the same colour, and the crown shows no card outline. The
        // shader darkens the faces that turn down (toon-material.js), per pixel.
        // Round 11 gives every card of a crown the colour of the middle of its band, with the
        // tree shift and the broad patches. The shader runs the band from a rust underside to a
        // gold top per pixel, from the crown normal (toon-material.js). A colour per card by its
        // height drew stacked flat tone patches where cards at two heights overlapped on screen.
        crownColor(p, 0.5, 0, color, shift)
        // Round 12 darkened the deeper cards. Round 17 drops that: in the gaps between the
        // outer clumps they drew a darker rim round every lobe, which read as watercolour dabs.
        const spin = random() * Math.PI * 2
        const shape = cardShape(random)
        emit({
            matrix: cardMatrix(p, facing, spin, size, new THREE.Matrix4(), shape),
            bent: shade.clone(),
            color,
            cell: CROWN_CELLS[Math.floor(random() * CROWN_CELLS.length)],
            radius,
            sprite: [1, spin, size * shape[0], size * shape[1]],
        })
        placed += 1
    }
}

// Litter piles up under the crowns: the denser the litter field, the more cards it takes.
// Away from the trees a slow field leaves a few loose drifts on the lawn. The path stays
// clear: its stones stand proud of the bed and cut the flat leaves into red flecks.
// under: true places cards only under the crowns, every one kept, so the carpet there is
// dense. false places the open-lawn drifts and skips the ground under the crowns, which the
// under pass already covers.
function litter(grounds, count, litterAt, sizes, random, emit, blocked = () => false, under = false) {
    if (!grounds.length || !count) return
    const pick = areaSampler(grounds)
    const up = new THREE.Vector3(0, 1, 0)
    const facing = new THREE.Vector3()
    const color = new THREE.Color()
    let placed = 0
    for (let tries = 0; placed < count && tries < count * 60; tries += 1) {
        const entry = pick(random())
        // Bank faces under the lawn lip (autumn.js) stay bare.
        if (entry.mesh.userData.bank?.[entry.t * 3] >= 0) continue
        const { p, n } = pointOn(entry, random)
        n.normalize()
        if (n.y < 0.6 || blocked(p.x, p.z)) continue
        const crown = litterAt(p.x, p.z)
        if (under) {
            if (crown < UNDER_LITTER) continue
        } else {
            if (crown >= UNDER_LITTER) continue
            const drift = SCATTER * THREE.MathUtils.smoothstep(field(p, 0.18, 2.3), 0.4, 0.7)
            // The same drift field and threshold as the painted carpet (autumn.js), so the loose
            // leaves lie on the drifts and the bare lawn between them stays bare.
            const carpet = CARPET * THREE.MathUtils.smoothstep(field(p, 0.3, 5.9), 0.56, 0.74)
            const amount = Math.max(crown, drift, carpet)
            if (amount < 0.08 || random() > Math.pow(amount, 0.6)) continue
        }
        // A leaf lies almost flat, a little tilted, so the pile does not read as decals.
        facing.copy(n).add(jitter(random, 0.35)).normalize()
        p.addScaledVector(n, 0.015 + random() * 0.025)
        const size = THREE.MathUtils.lerp(sizes[0], sizes[1], random())
        emit({
            matrix: cardMatrix(p, facing, random() * Math.PI * 2, size, new THREE.Matrix4(), cardShape(random)),
            bent: up,
            color: litterLeaf(p, random(), color),
            cell: LEAF_CELLS[Math.floor(random() * LEAF_CELLS.length)],
        })
        placed += 1
    }
}

// The ground the litter keeps clear of: the flagstone path, the water and the arrival pad.
// Returns a test on a grid of cells LITTER_CLEAR wide. Every triangle marks the cells it
// covers and their neighbours.
// A cell index packs into one number key. The offset keeps the key of a negative cell positive.
const CELL_SHIFT = 1e6
const cellKey = (cx, cz) => (cx + CELL_SHIFT) * 2 * CELL_SHIFT + (cz + CELL_SHIFT)

// The cells within one cell of a sample count as blocked. The samples go into one set first,
// and the ring of cells round each one is added at the end. That is the same set of cells as
// a ring added at each sample, for a ninth of the set writes, and the number keys skip the
// string building that took most of the time.
function clearZones(meshes) {
    const cell = LITTER_CLEAR
    const samples = new Set()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const q = new THREE.Vector3()
    meshes.forEach((mesh) => {
        const position = mesh.geometry.attributes.position
        for (let t = 0; t < position.count / 3; t += 1) {
            a.fromBufferAttribute(position, t * 3).applyMatrix4(mesh.matrixWorld)
            b.fromBufferAttribute(position, t * 3 + 1).applyMatrix4(mesh.matrixWorld)
            c.fromBufferAttribute(position, t * 3 + 2).applyMatrix4(mesh.matrixWorld)
            const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a))
            const steps = Math.max(1, Math.min(40, Math.ceil(longest / (cell * 0.5))))
            for (let i = 0; i <= steps; i += 1) {
                for (let j = 0; j <= steps - i; j += 1) {
                    q.copy(a).multiplyScalar(1 - (i + j) / steps).addScaledVector(b, i / steps).addScaledVector(c, j / steps)
                    samples.add(cellKey(Math.floor(q.x / cell), Math.floor(q.z / cell)))
                }
            }
        }
    })
    const cells = new Set()
    samples.forEach((key) => {
        const cx = Math.floor(key / (2 * CELL_SHIFT)) - CELL_SHIFT
        const cz = (key % (2 * CELL_SHIFT)) - CELL_SHIFT
        for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) cells.add(cellKey(cx + dx, cz + dz))
    })
    return (x, z) => cells.has(cellKey(Math.floor(x / cell), Math.floor(z / cell)))
}
const CLEAR_OF = ['web_flagstone', 'web_water']
// The pad and the walkway meshes (Paths: the bridge, the lookout deck, its step and its
// ramp). Litter under the lookout deck showed through the gaps between its boards as thin
// yellow lines, so the litter keeps clear of every walkway part too.
const isPad = (mesh) => mesh.name.startsWith('Pad') || mesh.name.startsWith('Paths')

// The test for the ground that litter keeps clear of. leaf-piles.js reads it too.
export function litterBlocked(meshes) {
    return clearZones(meshes.filter((mesh) => CLEAR_OF.includes(mesh.userData.webMaterial) || isPad(mesh)))
}

// The house boxes in the xz plane, grown by HOUSE_MARGIN, from the walls, roofs and glass.
function houseBoxes(meshes) {
    const box = new THREE.Box3()
    meshes
        .filter((mesh) => ['web_plaster', 'web_roof', 'web_glass_clear'].includes(mesh.userData.webMaterial))
        .forEach((mesh) => box.expandByObject(mesh))
    return box.isEmpty() ? [] : [box.expandByScalar(HOUSE_MARGIN)]
}

// Drifting leaves fall slowly around the island and sway. They keep out of the house.
// Returns the mesh and an update.
function drifting(material, count, box, avoid, random) {
    const mesh = createCardMesh(material, count)
    mesh.frustumCulled = false
    const color = new THREE.Color()
    const inside = (x, z) => avoid.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z)
    const leaves = Array.from({ length: count }, (_, i) => {
        let x = 0
        let z = 0
        for (let k = 0; k < 20; k += 1) {
            x = THREE.MathUtils.lerp(box.min.x, box.max.x, random())
            z = THREE.MathUtils.lerp(box.min.z, box.max.z, random())
            if (!inside(x, z)) break
        }
        return {
            x,
            z,
            y: THREE.MathUtils.lerp(DRIFT_BOTTOM, DRIFT_TOP, random()),
            phase: random() * Math.PI * 2,
            spin: 0.6 + random() * 0.8,
            cell: LEAF_CELLS[i % LEAF_CELLS.length],
        }
    })
    const matrix = new THREE.Matrix4()
    const facing = new THREE.Vector3()
    const place = (time) => {
        leaves.forEach((leaf, i) => {
            const height = DRIFT_TOP - DRIFT_BOTTOM
            const y = DRIFT_BOTTOM + ((((leaf.y - DRIFT_BOTTOM - time * DRIFT_SPEED) % height) + height) % height)
            const sway = Math.sin(time * 0.9 + leaf.phase)
            const p = new THREE.Vector3(leaf.x + sway * 0.6, y, leaf.z + Math.cos(time * 0.7 + leaf.phase) * 0.4)
            facing.set(Math.sin(time * leaf.spin + leaf.phase), 0.8, Math.cos(time * leaf.spin)).normalize()
            mesh.setMatrixAt(i, cardMatrix(p, facing, sway, DRIFT_SIZE, matrix))
        })
        mesh.instanceMatrix.needsUpdate = true
    }
    leaves.forEach((leaf, i) => {
        const p = new THREE.Vector3(leaf.x, leaf.y, leaf.z)
        writeCard(mesh, i, { matrix, bent: new THREE.Vector3(0, 1, 0), color: litterTone(p, color), cell: leaf.cell })
    })
    place(0)
    return { mesh, update: place }
}

// meshes: the island meshes tagged with userData.webMaterial. litterAt: the litter field.
// viewpoints: the camera stop positions, so crown cards go only where a stop can see them.
export function createLeafCards({ meshes, litterAt, uniforms, small = false, viewpoints = [], maxAnisotropy = 1, seed = 4711 }) {
    const counts = small ? COUNTS.phone : COUNTS.desktop
    const random = mulberry32(seed)
    const atlas = createAtlas(Math.min(ATLAS_ANISOTROPY, maxAnisotropy))
    // Round 19 turns on alpha to coverage, so on the MSAA tiers each leaf edge takes a soft
    // coverage blend. The plain alpha cut drew pixel steps along the far crown outlines (S6).
    const material = createToonMaterial(
        uniforms,
        { map: atlas, alphaTest: 0.5, alphaToCoverage: true, vertexColors: false, side: THREE.DoubleSide },
        { key: 'aerie-toon-v3-card', defines: { AERIE_CARD: '' } }
    )
    material.name = 'aerie.leaf'
    const byFamily = (name) => meshes.filter((mesh) => mesh.userData.webMaterial === name)
    const crowns = byFamily('web_crown')
    const total = counts.crown + counts.shrub + counts.under + counts.litter
    const cards = createCardMesh(material, total)
    cards.name = 'LeafCards'
    let index = 0
    const emit = (card) => {
        writeCard(cards, index, card)
        index += 1
    }
    crownCards(crowns, counts.crown, small ? PHONE_CROWN_CARD : CROWN_CARD, viewpoints, random, emit)
    fringe(byFamily('web_plants'), counts.shrub, plantTone, random, emit)
    const blocked = litterBlocked(meshes)
    const litterSizes = small ? PHONE_LITTER_CARD : LITTER_CARD
    litter(byFamily('web_grass'), counts.under, litterAt, litterSizes, random, emit, blocked, true)
    litter(byFamily('web_grass'), counts.litter, litterAt, litterSizes, random, emit, blocked)
    cards.count = index
    cards.computeBoundingSphere()

    const box = new THREE.Box3()
    crowns.forEach((mesh) => box.expandByObject(mesh))
    if (box.isEmpty()) box.set(new THREE.Vector3(-12, 0, -12), new THREE.Vector3(12, 0, 12))
    const drift = drifting(material, counts.drift, box, houseBoxes(meshes), random)
    drift.mesh.name = 'DriftingLeaves'

    const group = new THREE.Group()
    group.name = 'Leaves'
    group.add(cards, drift.mesh)
    const dispose = () => {
        cards.geometry.dispose()
        drift.mesh.geometry.dispose()
        material.dispose()
        atlas.dispose()
    }
    return { group, update: drift.update, count: index + counts.drift, dispose }
}
