import * as THREE from 'three'
import { skills, branchOf, PALETTE } from '../../data/skills.js'
import { notes } from '../../data/skill-notes.js'
import './sky-overlay.css'

// The words over the skill sky: a button per skill name, a title per constellation and the
// card that tells what I did with a skill. They are HTML, so they stay sharp at any zoom and
// a screen reader can reach them. constellation.js moves them each frame to the stars they
// belong to. They only show while the explore pad is up (see sky-overlay.css).

const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
}
// A tap counts as a hit on a star within this many pixels of it.
const HIT = 24
// The logos load the first time a card opens, so they stay out of the sky chunk.
let icons = null
const loadIcons = () => (icons ??= import('../../data/skill-icons.js'))

const colorOf = (skill) => PALETTE[branchOf(skill)?.color] ?? PALETTE.ink
const element = (tag, className, text) => {
    const el = document.createElement(tag)
    if (className) el.className = className
    if (text) el.textContent = text
    return el
}

const SVG = 'http://www.w3.org/2000/svg'
const svgOf = (tag, attributes) => {
    const el = document.createElementNS(SVG, tag)
    Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, value))
    return el
}

function logo(icon, color) {
    const svg = svgOf('svg', { viewBox: '0 0 24 24', fill: color })
    svg.append(svgOf('path', { d: icon.path }))
    return svg
}

// The constellation as a tiny star chart, with the card's own star lit.
function miniChart({ art, stars, lines }) {
    const svg = svgOf('svg', { viewBox: '0 0 1 1', class: 'sky-chart' })
    art.forEach((d) => svg.append(svgOf('path', { d })))
    lines.forEach(([x1, y1, x2, y2]) => svg.append(svgOf('line', { x1, y1, x2, y2 })))
    stars.forEach(([cx, cy, mine]) => {
        if (mine) svg.append(svgOf('circle', { cx, cy, r: 0.07, class: 'halo' }))
        svg.append(svgOf('circle', { cx, cy, r: mine ? 0.03 : 0.018, class: mine ? 'mine' : '' }))
    })
    return svg
}

// titles: one { name, label, color } per constellation. chartOf(id) gives the constellation
// name and star chart for a skill. onPick(id, fromKeyboard) runs when a name is clicked.
export function createSkyOverlay({ parent, titles, chartOf, onPick }) {
    const root = element('div', 'sky-overlay')
    root.hidden = true
    root.setAttribute('role', 'region')
    root.setAttribute('aria-label', 'Skill constellations')
    if (parent) parent.after(root)
    else document.body.append(root)

    const names = new Map(
        skills.map((skill) => {
            const button = element('button', 'sky-name', skill.name)
            button.type = 'button'
            button.style.setProperty('--c', colorOf(skill))
            button.addEventListener('click', (e) => onPick(skill.id, e.detail === 0))
            root.append(button)
            return [skill.id, button]
        })
    )
    const titleEls = titles.map(({ name, label, color }) => {
        const title = element('p', 'sky-title')
        title.style.setProperty('--c', color)
        title.append(element('span', '', name), element('small', '', label))
        root.append(title)
        return title
    })
    const card = element('section', 'sky-card frame')
    card.hidden = true
    card.setAttribute('role', 'dialog')
    root.append(card)

    let labels = []
    let open = null
    const stars = new Map()
    const projected = new THREE.Vector3()

    const placeCard = () => {
        const star = stars.get(open)
        if (!star) return
        card.style.setProperty('--x', `${star.x}px`)
        card.style.setProperty('--y', `${star.y}px`)
        card.classList.toggle('flip', star.x > window.innerWidth - 360)
    }

    // Moves every word to its point. view holds the camera, the reveal value, the figure in
    // focus and its dimming, the screen pixels per degree of sky and the text zoom.
    const place = ({ camera, reveal, focus, dim, pixelsPerDegree, zoom }) => {
        const width = window.innerWidth
        const height = window.innerHeight
        const legible = smooth(10.5, 12.5, pixelsPerDegree)
        root.style.setProperty('--zoom', zoom.toFixed(3))
        labels.forEach((label) => {
            const el = label.id ? names.get(label.id) : titleEls[label.title]
            projected.copy(label.position).project(camera)
            const x = (projected.x + 1) * 0.5 * width
            const y = (1 - projected.y) * 0.5 * height
            const lit = projected.z < 1 ? smooth(label.order, label.order + 0.8, reveal) : 0
            const fade = focus < 0 || label.figure === focus ? 1 : 1 - dim * 0.75
            const shown = lit * fade * (label.id ? legible : 1)
            el.style.opacity = shown.toFixed(3)
            el.style.visibility = shown > 0.05 ? '' : 'hidden'
            el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
            if (label.id) stars.set(label.id, { x, y, lit: lit * fade })
        })
        if (open) placeCard()
    }

    // The skill whose star sits under a tap at client pixels x, y, or null.
    const hitStar = (x, y) => {
        let best = null
        let nearest = HIT
        stars.forEach((star, id) => {
            const distance = Math.hypot(star.x - x, star.y - y)
            if (star.lit > 0.5 && distance < nearest) {
                best = id
                nearest = distance
            }
        })
        return best
    }

    const closeCard = () => {
        card.hidden = true
        open = null
    }

    const openCard = (id, fromKeyboard = false) => {
        const skill = skills.find((s) => s.id === id)
        if (!skill) return
        open = id
        const color = colorOf(skill)
        const chart = chartOf(id)
        const badge = element('span', 'sky-logo')
        badge.setAttribute('aria-hidden', 'true')
        const heading = element('h3', 'sky-card-name', skill.name)
        heading.id = 'sky-card-name'
        const close = element('button', 'sky-close', '×')
        close.type = 'button'
        close.setAttribute('aria-label', `Close ${skill.name}`)
        close.addEventListener('click', closeCard)
        const head = element('div', 'sky-card-head')
        head.append(badge, heading, miniChart(chart))
        const legend = element('span', 'frame-legend', `${chart.name} · ${branchOf(skill)?.label ?? ''}`)
        const parentSkill = skills.find((s) => s.id === skill.parent)
        card.replaceChildren(legend, close, head, element('p', 'sky-card-note', notes[id] ?? ''))
        if (parentSkill) card.append(element('p', 'sky-card-parent', `✦ Grew out of ${parentSkill.name}`))
        card.style.setProperty('--frame', color)
        // Restarts the entrance, so a second star's card arrives the same way.
        card.classList.remove('arrive')
        void card.offsetWidth
        card.classList.add('arrive')
        card.setAttribute('aria-labelledby', heading.id)
        card.hidden = false
        placeCard()
        if (fromKeyboard) close.focus({ preventScroll: true })
        loadIcons()
            .then(({ iconOf, logoColor }) => {
                if (open === id) badge.append(logo(iconOf(skill), logoColor(skill)))
            })
            .catch(() => {
                // The card reads fine without its logo.
            })
    }

    // Escape closes the card first. The explore pad only sees the key when no card is open.
    const onKey = (e) => {
        if (e.key !== 'Escape' || !open) return
        e.stopPropagation()
        closeCard()
    }
    window.addEventListener('keydown', onKey, true)

    return {
        setLabels: (next) => {
            labels = next
            stars.clear()
        },
        place,
        hitStar,
        openCard,
        closeCard,
        show: () => {
            root.hidden = false
        },
        hide: () => {
            root.hidden = true
            closeCard()
        },
        dispose: () => {
            window.removeEventListener('keydown', onKey, true)
            root.remove()
        },
    }
}
