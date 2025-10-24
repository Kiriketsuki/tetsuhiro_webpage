import * as THREE from 'three'
import { skills, branchOf } from '../data/skills.js'

// Same colours as tokens.css. The canvas cannot read CSS variables.
const COLORS = {
    teal: '#54bbd2',
    violet: '#a383e3',
    amber: '#f5c252',
    rose: '#ee8d9f',
    moss: '#66a983',
}
const INK = '#f6f1e9'
const FILL = 'rgba(11, 26, 49, 0.82)'
const FONT = '"Fira Code", ui-monospace, monospace'

const CANVAS = 256
const HEX_RADIUS = 120
const TEXT_WIDTH = 196
const MAX_FONT = 46
const MIN_FONT = 18
// Metres. Big enough to read from the skills shot, about 45 m out.
const BADGE_SIZE = 3.4
const BOB = 0.12
// Badges closer than this, as a share of their size, get pushed apart.
const SPACING = 1.0
const SPREAD_STEPS = 80
const UP = new THREE.Vector3(0, 1, 0)
// Badges fade out when the camera is right on top of them (the projects shot
// passes the tree) and when it is far away (the contact shot).
const FADE_NEAR = [14, 26]
const FADE_FAR = [110, 170]

function hexPath(ctx, radius) {
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 6 + (i * Math.PI) / 3
        const x = CANVAS / 2 + Math.cos(angle) * radius
        const y = CANVAS / 2 + Math.sin(angle) * radius
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
    }
    ctx.closePath()
}

// Largest font size that keeps the longest line inside the hex.
function fitFont(ctx, lines) {
    for (let size = MAX_FONT; size > MIN_FONT; size -= 2) {
        ctx.font = `500 ${size}px ${FONT}`
        if (lines.every((line) => ctx.measureText(line).width <= TEXT_WIDTH)) return size
    }
    return MIN_FONT
}

function drawBadge(canvas, skill) {
    const ctx = canvas.getContext('2d')
    const accent = COLORS[branchOf(skill)?.color] ?? COLORS.teal
    ctx.clearRect(0, 0, CANVAS, CANVAS)

    // Outer glow first, then the panel, then a crisp edge on top.
    ctx.save()
    ctx.shadowColor = accent
    ctx.shadowBlur = 22
    hexPath(ctx, HEX_RADIUS)
    ctx.fillStyle = FILL
    ctx.fill()
    ctx.restore()

    hexPath(ctx, HEX_RADIUS)
    ctx.lineWidth = 6
    ctx.strokeStyle = accent
    ctx.stroke()

    const lines = skill.name.split(' ')
    const size = fitFont(ctx, lines)
    ctx.font = `500 ${size}px ${FONT}`
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const top = CANVAS / 2 - ((lines.length - 1) * size * 1.1) / 2
    lines.forEach((line, i) => ctx.fillText(line, CANVAS / 2, top + i * size * 1.1))
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
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false })
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

// Several slots sit on a branch that points at the skills camera, so their
// badges stack up on screen. This pushes them apart in that camera's view plane
// until none overlap, then turns the moves back into world offsets.
function spreadForView(homes, view) {
    if (!view) return homes
    const forward = view.target.clone().sub(view.position).normalize()
    const right = new THREE.Vector3().crossVectors(forward, UP).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward)
    const points = homes.map((home) => {
        const offset = home.clone().sub(view.position)
        const depth = offset.dot(forward)
        return { depth, x: offset.dot(right) / depth, y: offset.dot(up) / depth }
    })
    const moved = points.map((point) => ({ ...point }))

    for (let step = 0; step < SPREAD_STEPS; step++) {
        for (let i = 0; i < moved.length; i++) {
            for (let j = i + 1; j < moved.length; j++) {
                const a = moved[i]
                const b = moved[j]
                const need = (BADGE_SIZE * SPACING) / Math.min(a.depth, b.depth)
                let dx = b.x - a.x
                let dy = b.y - a.y
                const gap = Math.hypot(dx, dy)
                if (gap >= need) continue
                if (gap < 1e-6) {
                    dx = 1
                    dy = 0
                }
                const push = (need - gap) / 2 / Math.max(gap, 1e-6)
                a.x -= dx * push
                a.y -= dy * push
                b.x += dx * push
                b.y += dy * push
            }
        }
    }

    return homes.map((home, i) => home.clone()
        .addScaledVector(right, (moved[i].x - points[i].x) * points[i].depth)
        .addScaledVector(up, (moved[i].y - points[i].y) * points[i].depth))
}

// Hangs one badge on each SkillSlot empty. They face the camera and bob a little.
export function createSkillBadges(scene, slots, { camera, view, anisotropy = 4, reducedMotion } = {}) {
    const group = new THREE.Group()
    group.name = 'skills'
    const used = slots.slice(0, skills.length)
    const homes = spreadForView(used.map((slot) => slot.position), view)
    const badges = used.map((slot, i) => {
        const badge = createBadge(skills[i], anisotropy)
        badge.home = homes[i]
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
