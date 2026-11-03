import '../styles/fonts.css'
import { BOARD, GROUPS, PINS, STRINGS, findPin } from '../data/wall.js'
import { findProject } from '../data/projects.js'
import { withPage } from '../data/project-pages.js'
import { createDetail } from './wall/detail.js'

// Dev-only lab for the projects evidence wall. Open /lab/wall.html?dir=b on the dev server.
// Direction a won, and it lives on the site now (src/scene/aerie/wall.js), so the lab keeps
// only the two directions that lost, as a record.
// The live site does not load this file. Each direction is one module in src/lab/wall/ that
// draws the board, the pins and the strings. This file gives every direction the same input,
// the same keyboard index and the same detail panel, so the captures compare only the look.
//
// Direction contract: export createWall(options) and return
//   { ready: Promise, highlight(id | null), focus(id, { instant }), unfocus({ instant }),
//     pan(dx, dy), zoom(factor, x, y), tap(x, y) -> pin id | null, resize(), dispose() }
// options: { canvas, layer, board, groups, pins, strings, images, small, reducedMotion }
// pan takes screen pixels. zoom takes a factor above 1 to zoom in, about the screen point x, y.

const DIRECTIONS = {
    b: { label: 'b: paper over cork', load: () => import('./wall/dir-b.js') },
    c: { label: 'c: case file', load: () => import('./wall/dir-c.js') },
}

const params = new URLSearchParams(location.search)
const dirId = DIRECTIONS[params.get('dir')] ? params.get('dir') : 'b'
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const small = window.matchMedia('(max-width: 767px)').matches

const shots = import.meta.glob('../assets/projects/*/{thumb,cover}.webp', { eager: true, query: '?url', import: 'default' })
const shot = (id, name) => shots[`../assets/projects/${id}/${name}.webp`] ?? null
// images[pin id] = { thumb, cover } or null when the project has no screenshot yet.
const images = Object.fromEntries(
    PINS.map((pin) => {
        const id = pin.page ?? pin.id
        const thumb = shot(id, 'thumb')
        return [pin.id, thumb ? { thumb, cover: shot(id, 'cover') ?? thumb } : null]
    }),
)

const canvas = document.getElementById('wall-canvas')
const layer = document.getElementById('wall-layer')

const bar = document.getElementById('lab-bar')
if (params.has('nobar')) bar.remove()
else {
    for (const [id, { label }] of Object.entries(DIRECTIONS)) {
        const link = document.createElement('a')
        const next = new URLSearchParams(params)
        next.set('dir', id)
        link.href = `?${next}`
        link.textContent = label
        link.setAttribute('aria-current', String(id === dirId))
        bar.append(link)
    }
}

// The page for a pin: the project page when it has one, or the wall entry alone.
const pageFor = (pin) => {
    const project = pin.page ? findProject(pin.page) : null
    const page = project ? withPage(project) : null
    return { pin, page, image: images[pin.id] }
}

let wall = null
let current = null
const detail = createDetail({
    onClose: () => {
        const id = current
        current = null
        wall?.unfocus({ instant: reducedMotion })
        index.querySelector(`[data-pin="${id}"]`)?.focus()
    },
})

const open = (id) => {
    const pin = findPin(id)
    if (!pin) return
    current = id
    wall.focus(id, { instant: reducedMotion })
    detail.open(pageFor(pin))
}

// The keyboard index: one button per pin, in reading order. The buttons sit off screen until
// one has focus. Then it shows as a small label, and the direction marks its pin.
const index = document.createElement('ol')
index.className = 'wall-index'
index.setAttribute('aria-label', 'Projects on the wall')
const ordered = [...PINS].sort((p, q) => q.at[1] - p.at[1] + (Math.abs(q.at[1] - p.at[1]) < 0.12 ? (p.at[0] - q.at[0]) * 10 : 0))
for (const pin of ordered) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.pin = pin.id
    button.textContent = `${pin.title}, ${pin.year}`
    button.addEventListener('focus', () => wall?.highlight(pin.id))
    button.addEventListener('blur', () => wall?.highlight(null))
    button.addEventListener('click', () => open(pin.id))
    item.append(button)
    index.append(item)
}
document.body.append(index)

const style = document.createElement('style')
style.textContent = `
.wall-index { position: fixed; left: 8px; bottom: 8px; margin: 0; padding: 0; list-style: none; z-index: 15; }
.wall-index button { position: absolute; left: -9999px; font: 600 13px/1.3 "JetBrains Mono", ui-monospace, monospace;
  color: #2b2118; background: #f4e8d2; border: 2px solid #c8463b; border-radius: 4px; padding: 6px 10px; white-space: nowrap; }
.wall-index button:focus-visible { left: 0; bottom: 0; outline: none; }
`
document.head.append(style)

addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) detail.close()
})

// Drag pans, the wheel and a pinch zoom, anywhere outside the panel and the lab links. A tap
// under 6 px asks the direction which pin sits under it (tap returns a pin id or null). The
// pins themselves take no pointer events, so a drag that starts on a card still pans.
const pointers = new Map()
let pinch = 0
let travel = 0
const outside = (e) => !e.target.closest?.('.wall-detail, #lab-bar, .wall-index')
addEventListener('pointerdown', (e) => {
    if (!outside(e)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    travel = 0
})
addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId)
    if (!last) return
    travel += Math.hypot(e.clientX - last.x, e.clientY - last.y)
    if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const [c, f] = [...pointers.values()]
        const next = Math.hypot(c.x - f.x, c.y - f.y)
        if (pinch && d) wall.zoom(next / d, (c.x + f.x) / 2, (c.y + f.y) / 2)
        pinch = next
        return
    }
    wall.pan(e.clientX - last.x, e.clientY - last.y)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
})
const lift = (e) => {
    if (!pointers.has(e.pointerId)) return
    const single = pointers.size === 1
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinch = 0
    if (single && travel < 6 && e.type === 'pointerup') {
        const id = wall.tap(e.clientX, e.clientY)
        if (id) open(id)
    }
}
addEventListener('pointerup', lift)
addEventListener('pointercancel', lift)
addEventListener('wheel', (e) => {
    if (!outside(e)) return
    e.preventDefault()
    wall.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY)
}, { passive: false })
addEventListener('resize', () => wall?.resize())

const { createWall } = await DIRECTIONS[dirId].load()
wall = createWall({ canvas, layer, board: BOARD, groups: GROUPS, pins: PINS, strings: STRINGS, images, small, reducedMotion })
await wall.ready
if (params.get('focus')) open(params.get('focus'))
window.__wall = { wall, open, close: () => detail.close() }
window.__ready = true
