import * as THREE from 'three'
import { skills, branchOf, logoColor, PALETTE } from '../data/skills.js'

const FONT = '"Fira Code", ui-monospace, monospace'

// One square plate per skill: the real logo, the name under it, a solid rule in
// the branch colour and a hairline inside it. Same look as the .frame panels.
const CANVAS = 256
const EDGE = 8
const INNER = 20
const LOGO = 112
const LOGO_TOP = 40
const NAME_Y = 206
const NAME_WIDTH = 196
const MAX_FONT = 34
const MIN_FONT = 18
const ICON_VIEWBOX = 24

// Metres. The slots on a branch sit about two metres apart. From the skills
// shot the closest pair is 1.5 m apart on screen, so 1.35 m plates never touch.
const BADGE_SIZE = 1.35
// A small sway, so the plates stay on their branch tips.
const BOB = 0.04
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

function drawBadge(canvas, skill) {
    const ctx = canvas.getContext('2d')
    const accent = PALETTE[branchOf(skill)?.color] ?? PALETTE.teal
    ctx.clearRect(0, 0, CANVAS, CANVAS)

    // The plate and its two rules.
    ctx.fillStyle = PALETTE.raised
    ctx.fillRect(0, 0, CANVAS, CANVAS)
    ctx.lineWidth = EDGE
    ctx.strokeStyle = accent
    ctx.strokeRect(EDGE / 2, EDGE / 2, CANVAS - EDGE, CANVAS - EDGE)
    ctx.lineWidth = 2
    ctx.strokeStyle = PALETTE.line
    ctx.strokeRect(INNER, INNER, CANVAS - INNER * 2, CANVAS - INNER * 2)

    // The logo is a 24 unit SVG path. Scale it into the top of the plate.
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
    ctx.fillText(skill.name, CANVAS / 2, NAME_Y)
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

// Seats one badge on each SkillSlot empty, right on the branch tip. They face
// the camera and sway a few centimetres.
export function createSkillBadges(scene, slots, { camera, anisotropy = 4, reducedMotion } = {}) {
    const group = new THREE.Group()
    group.name = 'skills'
    const used = slots.slice(0, skills.length)
    if (used.length < skills.length) console.warn(`island.glb has ${used.length} skill slots for ${skills.length} skills`)
    const badges = used.map((slot, i) => {
        const badge = createBadge(skills[i], anisotropy)
        badge.home = slot.position.clone()
        badge.sprite.position.copy(badge.home)
        group.add(badge.sprite)
        return badge
    })
    scene.add(group)
    const cameraPosition = new THREE.Vector3()

    // The canvas may draw before Fira Code arrives. Draw again once it has.
    document.fonts?.load(`500 ${MAX_FONT}px "Fira Code"`)
        .then(() => badges.forEach((badge) => badge.redraw()))
        .catch((error) => console.warn('Fira Code did not load for the skill badges', error))

    const update = (delta, time) => {
        badges.forEach((badge, i) => {
            if (!reducedMotion?.value) badge.sprite.position.y = badge.home.y + Math.sin(time * 1.2 + i * 0.9) * BOB
            if (!camera) return
            const distance = camera.getWorldPosition(cameraPosition).distanceTo(badge.sprite.position)
            const near = THREE.MathUtils.smoothstep(distance, FADE_NEAR[0], FADE_NEAR[1])
            const far = 1 - THREE.MathUtils.smoothstep(distance, FADE_FAR[0], FADE_FAR[1])
            badge.material.opacity = near * far
            badge.sprite.visible = badge.material.opacity > 0.01
        })
    }

    return { group, badges, update }
}

export function disposeSkillBadges(scene, { group, badges }) {
    scene.remove(group)
    badges.forEach(({ texture, material }) => {
        texture.dispose()
        material.dispose()
    })
}
