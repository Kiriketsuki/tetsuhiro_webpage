import * as THREE from 'three'
import { waypoints } from '../data/waypoints.js'
import { skills, branchOf, logoColor, PALETTE } from '../data/skills.js'
import { createTreeGrowth, disposeTreeGrowth, hangPoints, nearestBark } from './tree-growth.js'

const FONT = '"JetBrains Mono", ui-monospace, monospace'

// One round pod per skill: a soft halo in the branch colour, a dark disc with a
// thin rim, the real logo and the name under it.
const CANVAS = 256
const DISC = 100
const LOGO = 80
const LOGO_TOP = 50
const NAME_Y = 182
const NAME_WIDTH = 124
const MAX_FONT = 28
const MIN_FONT = 15
const ICON_VIEWBOX = 24

// Metres, for the sprite that holds the halo. The disc is 0.78 of that. The
// slots on a branch sit about two metres apart, so the discs never touch.
const BADGE_SIZE = 1.7
// A portrait phone shows the whole tree in under 400 px, so the plates grow
// there. Without this the names are too small to read at 375 px wide.
const PHONE_SCALE = 1.3
const PHONE = '(orientation: portrait) and (max-width: 767px)'
// Badges fade out when the camera is right on top of them (the projects shot
// passes the tree) and when it is far away (the contact shot).
const FADE_NEAR = [16, 24]
const FADE_FAR = [110, 170]

// Largest font size that keeps the name inside the plate.
function fitFont(ctx, text) {
    for (let size = MAX_FONT; size > MIN_FONT; size -= 2) {
        ctx.font = `500 ${size}px ${FONT}`
        if (ctx.measureText(text).width <= NAME_WIDTH) return size
    }
    return MIN_FONT
}

const withAlpha = (hex, alpha) => {
    const n = parseInt(hex.slice(1), 16)
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function drawBadge(canvas, skill) {
    const ctx = canvas.getContext('2d')
    const accent = PALETTE[branchOf(skill)?.color] ?? PALETTE.teal
    const c = CANVAS / 2
    ctx.clearRect(0, 0, CANVAS, CANVAS)

    const halo = ctx.createRadialGradient(c, c, DISC * 0.85, c, c, c)
    halo.addColorStop(0, withAlpha(accent, 0.5))
    halo.addColorStop(1, withAlpha(accent, 0))
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, CANVAS, CANVAS)

    const body = ctx.createRadialGradient(c, c - 24, 8, c, c, DISC)
    body.addColorStop(0, '#16294a')
    body.addColorStop(1, PALETTE.raised)
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.arc(c, c, DISC, 0, Math.PI * 2)
    ctx.fill()

    ctx.lineWidth = 7
    ctx.strokeStyle = accent
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.strokeStyle = withAlpha(accent, 0.35)
    ctx.beginPath()
    ctx.arc(c, c, DISC - 13, 0, Math.PI * 2)
    ctx.stroke()

    // The logo is a 24 unit SVG path. Scale it into the top of the disc.
    ctx.save()
    ctx.translate((CANVAS - LOGO) / 2, LOGO_TOP)
    ctx.scale(LOGO / ICON_VIEWBOX, LOGO / ICON_VIEWBOX)
    ctx.fillStyle = logoColor(skill)
    ctx.fill(new Path2D(skill.icon.path))
    ctx.restore()

    const size = fitFont(ctx, skill.name)
    ctx.font = `500 ${size}px ${FONT}`
    ctx.fillStyle = PALETTE.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(skill.name, c, NAME_Y)
}

function createBadge(skill, anisotropy) {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS
    canvas.height = CANVAS
    drawBadge(canvas, skill)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = anisotropy

    // No depth test. The branches would hide a badge behind them otherwise.
    // No tone mapping, so the logo keeps its brand colour.
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.setScalar(BADGE_SIZE)
    sprite.name = `skill-${skill.id}`
    sprite.renderOrder = 2

    const redraw = () => {
        drawBadge(canvas, skill)
        texture.needsUpdate = true
    }
    return { sprite, texture, material, redraw }
}

// A pod hangs from the branch tip on a short twig. The twig and the pod sway
// together, a few degrees, so the pod stays attached to the tree.
const SWAY = 0.07
// The camera direction at the skills stop, so the pods spread apart as they
// look on screen.
const skillsShot = waypoints.find((waypoint) => waypoint.section === 'skills').shot
const SKILLS_VIEW = new THREE.Vector3(...skillsShot.target).sub(new THREE.Vector3(...skillsShot.position))
const STEM_COLOR = 0x3a2a22
const X_AXIS = new THREE.Vector3(1, 0, 0)
const DOWN = new THREE.Vector3(0, -1, 0)

function createStem(color) {
    const geometry = new THREE.CylinderGeometry(0.04, 0.075, 1, 5)
    geometry.translate(0, -0.5, 0)
    const material = new THREE.MeshStandardMaterial({
        color: STEM_COLOR,
        emissive: color,
        emissiveIntensity: 0.35,
        flatShading: true,
        roughness: 0.9,
    })
    return new THREE.Mesh(geometry, material)
}

// Seats one pod under each SkillSlot empty, on a twig from the branch tip. They
// face the camera. `tree` is the SkillTree mesh, for the twigs and the glow.
export function createSkillBadges(scene, slots, { camera, anisotropy = 4, reducedMotion, tree } = {}) {
    const group = new THREE.Group()
    group.name = 'skills'
    const used = slots.slice(0, skills.length)
    if (used.length < skills.length) console.warn(`island.glb has ${used.length} skill slots for ${skills.length} skills`)
    // The twig starts on the bark, not in the air at the empty.
    const tips = used.map((slot) => (tree ? nearestBark(tree, slot.position) : slot.position.clone()))
    // The pods hang below their tips, then spread apart so none touch.
    const centres = hangPoints(tips, { view: SKILLS_VIEW })
    const badges = used.map((slot, i) => {
        const badge = createBadge(skills[i], anisotropy)
        badge.home = tips[i]
        badge.hang = centres[i].clone().sub(tips[i])
        badge.align = new THREE.Quaternion().setFromUnitVectors(DOWN, badge.hang.clone().normalize())
        badge.color = PALETTE[branchOf(skills[i])?.color] ?? PALETTE.teal
        badge.stem = createStem(badge.color)
        badge.stem.position.copy(badge.home)
        badge.sprite.position.copy(centres[i])
        group.add(badge.stem, badge.sprite)
        return badge
    })
    scene.add(group)
    const growth = tree
        ? createTreeGrowth(
              scene,
              tree,
              badges.map((b) => ({ tip: b.home, centre: b.home.clone().add(b.hang), color: b.color })),
              { reducedMotion }
          )
        : null
    const cameraPosition = new THREE.Vector3()
    const phone = window.matchMedia(PHONE)
    const swinging = new THREE.Quaternion()

    // The canvas may draw before JetBrains Mono arrives. Draw again once it has.
    document.fonts?.load(`500 ${MAX_FONT}px "JetBrains Mono"`)
        .then(() => badges.forEach((badge) => badge.redraw()))
        .catch((error) => console.warn('JetBrains Mono did not load for the skill badges', error))

    const update = (delta, time) => {
        growth?.update(delta, time)
        const size = phone.matches ? BADGE_SIZE * PHONE_SCALE : BADGE_SIZE
        const radius = (size * DISC) / CANVAS
        badges.forEach((badge, i) => {
            const swing = reducedMotion?.value ? 0 : Math.sin(time * 1.2 + i * 0.9) * SWAY
            // The twig turns about the x axis, which is sideways on screen from the skills shot.
            swinging.setFromAxisAngle(X_AXIS, swing)
            badge.stem.quaternion.copy(swinging).multiply(badge.align)
            badge.stem.scale.y = Math.max(0.2, badge.hang.length() - radius * 0.5)
            badge.sprite.scale.setScalar(size)
            badge.sprite.position.copy(badge.hang).applyQuaternion(swinging).add(badge.home)
            if (!camera) return
            const distance = camera.getWorldPosition(cameraPosition).distanceTo(badge.sprite.position)
            const near = THREE.MathUtils.smoothstep(distance, FADE_NEAR[0], FADE_NEAR[1])
            const far = 1 - THREE.MathUtils.smoothstep(distance, FADE_FAR[0], FADE_FAR[1])
            const opacity = near * far
            badge.material.opacity = opacity
            badge.sprite.visible = opacity > 0.01
            badge.stem.visible = opacity > 0.01
        })
    }

    return { group, badges, growth, update }
}

export function disposeSkillBadges(scene, { group, badges, growth }) {
    scene.remove(group)
    if (growth) disposeTreeGrowth(scene, growth)
    badges.forEach(({ texture, material, stem }) => {
        texture.dispose()
        material.dispose()
        stem.geometry.dispose()
        stem.material.dispose()
    })
}
