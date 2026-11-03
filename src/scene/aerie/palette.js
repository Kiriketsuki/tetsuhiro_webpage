import * as THREE from 'three'
import { srgb, field, along, meanLuma, lumaRatio, paintVertices } from './field-noise.js'
import { connectedParts } from './crowns.js'
import { SURFACE } from './toon-material.js'

// The top-level tables below carry @__PURE__ marks. The scene chunk imports only isLaidRock
// from here, and the look worker runs the paint, so the bundler can drop the tables there.
//
// The albedo palette for the built parts of the island, after the warm colours of Leaf it
// Alone: honey-brown wood, cream plaster, a graphite roof, warm grey stone and brass. The
// families keep clearly different hues, as the reference does, so the house never reads
// as one orange-brown mass. It runs once at load on the baked vertex colours. A slow world noise moves each
// family between its tones in broad patches, and each vertex keeps its baked brightness,
// so the baked gradients stay. The night comes from the light in toon-material.js, not
// from dark albedo. autumn.js paints the trees, the lawn and the planting.

// Round 10 warms the moss a step toward olive-gold, so the cliff under the lip does not read
// as a band of olive green next to the brown rock.
const OLIVE_MOSS = /* @__PURE__ */ srgb(0x5a5a26)
// The stone blotch field, in cycles per metre. One cycle spans about two stones.
const BLOTCH_SCALE = 1.4

// palette: sRGB tones in order. scale: noise cycles per metre. amount: how far each vertex
// moves toward its palette tone. keep: how much of the baked brightness ratio each vertex
// keeps, from 0 (none, a flat field) to 1 (all of it). The baked values made the wood and
// the rock read dark and patchy, so those families keep only part of it.
// The wood is a light honey and the plaster a pale cream, so the two stay apart at night:
// a darker wood read as red-brown chocolate next to tan plaster, and the house lost its
// separate hues. The stone stays a cool warm-grey.
// Round 5 fixed srgb() in field-noise.js, which had converted every tone to linear twice.
// The tones below are the albedo as the eye should see it, in plain sRGB hex.
const FAMILIES = {
    // Round 6 moves the wood from mustard toward honey-brown. The round 5 deck sampled
    // #d9a63a, and the review asked for a mid plank near #b07a3a.
    // Round 7 moves it a step further toward a yellow honey at a lower saturation. The round 6
    // cladding sampled hue 24 at 61 percent saturation in S3, an orange tan, and the review asked
    // for hue 28 to 34 under 60 percent. The warm lamps pull the wood toward orange, so the
    // albedo sits a little more yellow than the target.
    // Round 14 keeps less of the baked value (0.3 to 0.1). The source alternates two wood
    // materials board by board, and the baked difference drew light and dark stripes.
    web_wood: { palette: [0xbc9862, 0xae8a58, 0xa07e50], scale: 0.35, amount: 0.95, keep: 0.1 },
    // Round 16 lifts the bark toward a warm brown-indigo, because the trunks read as neutral
    // black at night.
    web_bark: { palette: [0x54403c, 0x5e4840], scale: 0.3, amount: 0.9 },
    // Round 6 warms the cream a step, because the S2 and S4 walls read cool grey-white.
    web_plaster: { palette: [0xecdcc0, 0xe2d0b2], scale: 0.18, amount: 0.95, keep: 0.15 },
    // Round 12: the flat modern roof and the deck slab fascias take a dark graphite with a trace
    // of warmth, close to one flat value, so they read as one smooth membrane. The user asked for
    // a flat modern look in place of the mauve slate.
    // Round 14 lifts the graphite, because under the night light the roof read black-navy.
    // Round 20 darkens it to a warm charcoal, because the review read a steel-blue cast on the
    // stair tower roof and its underside (S1, S6, S7).
    web_roof: { palette: [0x66615e, 0x5f5b59], scale: 0.2, amount: 1, keep: 0.15 },
    // The cliff under the island.
    // Round 8 moves the tan a step toward yellow (hue about 38), so the night light keeps it
    // inside the hue 25 to 40 band the review asks for, never maroon.
    // Round 10 turns the tan toward a warm brown with a trace of mauve, and drops the baked
    // brightness, so the underside reads warm brown-indigo and its neighbouring facets no
    // longer jump in value. The baked values differed from one facet to the next.
    web_rock: { palette: [0x7c665a, 0x6e5a50], scale: 0.12, amount: 0.95, rising: true, keep: 0.1 },
    // Laid stones: the steps, the stepping stones and the rocks by the pond and the fire.
    // Each stone turns mossy toward its foot (see stoneMoss). Round 6 warms the stones to a
    // grey-tan, because they read cool grey, and gives each one a broad painted blotch.
    // Round 7 warms them again and halves the moss at the foot, because the bridge abutment
    // still read grey-green.
    // Round 11 turns the stones a step lighter and greyer. The bridge-end steps and the stepping
    // stones read as dark maroon blocks in S10.
    web_rock_set: { palette: [0xb4a088, 0xa8947c, 0xbeaa90], scale: 0.5, amount: 0.95, keep: 0.3, mossFoot: 0.2, blotch: true },
    web_flagstone: { palette: [0x8f8676, 0x80786a, 0x9c9282], scale: 0.4, amount: 0.95 },
    web_soil: { palette: [0x4a3626], scale: 0.3, amount: 0.9 },
    // Round 17 lifts the dark iron toward a warm brown-indigo, because the mullions and the
    // thin frame members read near black (S1, S2).
    web_metal_dark: { palette: [0x3a2e2e], scale: 0.3, amount: 1, keep: 0 },
    // A yellow brass. The warm lamp light already pushes it toward orange.
    // Round 9 deepens it to a warm brass at a lower saturation. The review read the round 8
    // telescope tube as a flat saturated yellow, like plastic.
    // Round 20 darkens the brass base, so the sharper sheen and the light bevels carry the metal
    // and the yoke no longer reads as flat yellow plastic (S4).
    web_metal_bright: { palette: [0x7a5a2c], scale: 0.3, amount: 1, keep: 0 },
    web_dark_matte: { palette: [0x1c1a1b], scale: 0.3, amount: 1 },
    // The pad deck: a mauve slate grey, lighter than the dark matte, so the deck reads as a
    // painted surface with its marking and not as a black hole in the lawn.
    // Round 6 widens the two tones, so the broad 2 m patches read as faint painted wear and
    // the deck does not read as one flat fill. island-look.js adds the soil mottle on top.
    // Round 7 turns the deck from a mauve slate to a warm dark slate. Under the cool moon the
    // mauve read as a saturated navy disc, the strongest cool patch in the frame.
    web_pad_deck: { palette: [0x4e4440, 0x5a4f48], scale: 0.45, amount: 1, keep: 0.3 },
    // The pad curb: a clean warm grey stone with no moss, so the deck edge reads tidy.
    // Round 7 warms the curb to a grey-tan. The cool night light turned the round 6 grey into
    // a grey-green. The footing under the curb takes the cliff tones (see paintFamily).
    web_pad_stone: { palette: [0xa88e74, 0x9c846c], scale: 0.6, amount: 0.95, keep: 0.3, foot: true },
}
// The pad footing (seat_pad_route.py builds it as a faceted bank) takes the cliff paint: the
// cliff tones with the same moss under the lip (rockMoss), so the island side reads as one
// surface that runs on under the pad rim. A grey footing, one band of umber or a separate
// moss gradient read as a drum under the curb.

const TONES = /* @__PURE__ */ (() => Object.fromEntries(Object.entries(FAMILIES).map(([name, family]) => [name, family.palette.map(srgb)])))()

// The cliff runs from olive moss just under the lawn lip to warm tan lower down, as the
// review asks for S6. Round 7 ran the other way, moss at the bottom, which left the visible
// top of the underside one brown band. The lawn lip sits at about y 0, so the moss spans the
// top MOSS_DEPTH metres and a broad field moves the moss line up and down. The rock steps by
// the house, above the lip, stay warm tan.
const MOSS_DEPTH = [0.4, 4.5]
function rockMoss() {
    return (p) => {
        const depth = -p.y + (field(p, 0.25, 4.4) - 0.5) * 2.4
        return 0.85 * (1 - THREE.MathUtils.smoothstep(depth, ...MOSS_DEPTH)) * THREE.MathUtils.smoothstep(depth, -0.6, 0.2)
    }
}

// Each stone, found as a connected part of its mesh, turns olive moss toward its foot and
// a little lighter toward its top, so a stone reads as a weathered rock with a painted
// gradient, not as a flat fill. Returns the height in the stone, 0 to 1, per vertex. With
// skipLargest, the largest part (the cliff under the island) gets -1 and keeps the
// island-wide moss gradient, and only the boulders on top take the per-stone gradient.
function stoneHeights(mesh, skipLargest = false) {
    const position = mesh.geometry.attributes.position
    const heights = new Float32Array(position.count)
    const stones = connectedParts(position).sort((a, b) => b.triangles.length - a.triangles.length)
    if (skipLargest && stones.length) {
        stones.shift().triangles.forEach((t) => heights.fill(-1, t * 3, t * 3 + 3))
    }
    stones.forEach(({ box, triangles }) => {
        const span = Math.max(box.max.y - box.min.y, 1e-3)
        triangles.forEach((t) => {
            for (let k = 0; k < 3; k += 1) heights[t * 3 + k] = (position.getY(t * 3 + k) - box.min.y) / span
        })
    })
    return heights
}

const cliffMoss = /* @__PURE__ */ rockMoss()

function paintFamily(meshes, name) {
    const family = FAMILIES[name]
    const tones = TONES[name]
    const mean = meanLuma(meshes)
    const target = new THREE.Color()
    const moss = family.rising ? rockMoss() : null
    meshes.forEach((mesh) => {
        const foot = family.mossFoot || family.rising ? stoneHeights(mesh, family.rising) : null
        const surface = family.foot ? mesh.geometry.attributes.aSurface : null
        paintVertices(mesh, (p, c, i) => {
            if (surface && surface.getX(i) === SURFACE.stone) {
                along(TONES.web_rock, field(p, FAMILIES.web_rock.scale, 3.1), target)
                c.copy(target.lerp(OLIVE_MOSS, cliffMoss(p)))
                return
            }
            // Round 11: the loose stones in the cliff mesh (the bridge-end steps and the stepping
            // stones) take the laid stone tones. The cliff brown read as dark maroon blocks in S10.
            along(family.rising && foot && foot[i] >= 0 ? TONES.web_rock_set : tones, field(p, family.scale, 3.1), target)
            if (moss && !(foot && foot[i] >= 0)) target.lerp(OLIVE_MOSS, moss(p))
            if (foot && foot[i] >= 0) {
                target.lerp(OLIVE_MOSS, (family.mossFoot === true ? 0.55 : family.mossFoot ?? 0.55) * (1 - THREE.MathUtils.smoothstep(foot[i], 0.05, 0.5)))
                target.multiplyScalar(0.9 + 0.18 * foot[i])
            }
            // A broad value blotch about one stone across, so each stone shows a painted light
            // side and a darker patch, not one flat grey with a smudge.
            if (family.blotch) target.multiplyScalar(0.78 + 0.36 * field(p, BLOTCH_SCALE, 6.4))
            target.multiplyScalar(THREE.MathUtils.lerp(1, lumaRatio(c, mean), family.keep ?? 1))
            c.lerp(target, family.amount)
        })
    })
}

const PAD_PAINT = /* @__PURE__ */ srgb(0xa6853f)

// Fabric keeps its baked hue, at a set saturation and a mid value, in sRGB HSV.
function paintFabric(meshes) {
    const hsv = (c) => {
        const max = Math.max(c.r, c.g, c.b)
        const min = Math.min(c.r, c.g, c.b)
        const d = max - min
        let h = 0
        if (d > 1e-5) {
            if (max === c.r) h = ((c.g - c.b) / d) % 6
            else if (max === c.g) h = (c.b - c.r) / d + 2
            else h = (c.r - c.g) / d + 4
        }
        return { h: (h * 60 + 360) % 360, v: max }
    }
    const fromHsv = (h, s, v, out) => {
        const f = (n) => {
            const k = (n + h / 60) % 6
            return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
        }
        return out.setRGB(f(5), f(3), f(1), THREE.SRGBColorSpace)
    }
    const display = new THREE.Color()
    meshes.forEach((mesh) => {
        // The pad marking: the ring and the H take one muted amber, so they read as worn
        // paint on the warm slate and not as a bright game marker.
        if (onPad(mesh)) {
            paintVertices(mesh, (p, c) => c.copy(PAD_PAINT))
            return
        }
        paintVertices(mesh, (p, c) => {
            display.copy(c).convertLinearToSRGB()
            const { h, v } = hsv(display)
            fromHsv(h, 0.55, THREE.MathUtils.clamp(v, 0.45, 0.7), c)
        })
    })
}

// The cliff is the only rock mesh named Rock. The other rock meshes are laid stones.
export const isLaidRock = (mesh) => mesh.userData.webMaterial === 'web_rock' && !mesh.name.startsWith('Rock')
// The arrival pad meshes are named Pad. Its dark matte faces are the deck and the plinth,
// and its stone faces are the curb.
const onPad = (mesh) => mesh.name.startsWith('Pad')
function familyOf(mesh) {
    if (onPad(mesh) && mesh.userData.webMaterial === 'web_dark_matte') return 'web_pad_deck'
    if (onPad(mesh) && mesh.userData.webMaterial === 'web_rock') return 'web_pad_stone'
    return isLaidRock(mesh) ? 'web_rock_set' : mesh.userData.webMaterial
}

// meshes: island meshes tagged with userData.webMaterial by island-look.js.
export function applyPalette(meshes) {
    const byFamily = (name) => meshes.filter((mesh) => familyOf(mesh) === name)
    Object.keys(FAMILIES).forEach((name) => {
        const group = byFamily(name)
        if (group.length) paintFamily(group, name)
    })
    paintFabric(byFamily('web_soft_goods'))
}
