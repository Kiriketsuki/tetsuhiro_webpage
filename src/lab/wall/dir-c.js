import { buildBoard, SIZE, FRAME } from './dir-c-board.js'

// Direction c, the case file. The wall is DOM and SVG only, with no WebGL, so it adds nothing
// to the scene chunk. The camera is a world point at the screen centre plus a scale in px per
// metre. A gesture moves one transform on a promoted layer. When the gesture ends, the board
// takes the new scale as its font size, so the browser lays the text out sharp again.

// The view keeps the brass light above the frame in the picture, so the top edge sits higher.
const EDGE = { left: -0.8, right: 0.8, top: 0.62, bottom: -0.5 }
// Below this scale the board lays out at this size and the transform shrinks it. This keeps the
// smallest text above the 6 px floor that some browsers apply to small fonts.
const LAYOUT_MIN = 1400
const SETTLE_MS = 180
const phone = () => innerWidth <= 767
const sheetWidth = () => Math.min(420, 0.4 * innerWidth) + 32
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const frames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
const smooth = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

function fit() {
    const W = innerWidth
    const H = innerHeight
    const cy = (EDGE.top + EDGE.bottom) / 2
    if (phone()) {
        const s = (W - 16) / FRAME.w
        // The phone view puts the board in the upper half, above where the sheet rises.
        return { s, x: 0, y: cy - (0.25 * H) / s }
    }
    return { s: Math.min((W - 64) / FRAME.w, (H - 64) / (EDGE.top - EDGE.bottom)), x: 0, y: cy }
}

// The closest zoom shows one index card at about 60 percent of the short side of the screen.
const maxScale = () => {
    const short = Math.min(innerWidth, innerHeight)
    return Math.max(fit().s * 1.5, (0.6 * short) / (innerWidth > innerHeight ? SIZE.card.h : SIZE.card.w))
}

// A soft clamp: a move can never take the board further out than the limit or than where it
// already is. A focus view can sit past the limit, and a pan from there does not jump.
function clamp(next, prev) {
    const s = Math.min(maxScale(), Math.max(fit().s, next.s))
    const m = (phone() ? 8 : 32) / s
    const hw = innerWidth / 2 / s
    const hh = innerHeight / 2 / s
    const soft = (v, a, b, p) => Math.min(Math.max(v, Math.min(a, b, p)), Math.max(a, b, p))
    return {
        s,
        x: soft(next.x, EDGE.right - hw + m, EDGE.left + hw - m, prev.x),
        y: soft(next.y, EDGE.top - hh + m, EDGE.bottom + hh - m, prev.y),
    }
}

// The box a tilted paper fills on the wall, in metres.
function boxOf(pin) {
    const { w, h } = SIZE[pin.kind]
    const t = (Math.abs(pin.tilt) * Math.PI) / 180
    return { x: pin.at[0], y: pin.at[1], w: w * Math.cos(t) + h * Math.sin(t), h: w * Math.sin(t) + h * Math.cos(t) }
}

// The backdrop stands in for the dimmed aerie behind the view: a dark wall and a few warm
// lamps out of focus. It draws once at a quarter of the size, because the blur hides the pixels.
function backdrop(canvas) {
    const g = canvas?.getContext('2d')
    if (!g) return
    const W = (canvas.width = Math.ceil(innerWidth / 4))
    const H = (canvas.height = Math.ceil(innerHeight / 4))
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#191421')
    sky.addColorStop(1, '#0c0806')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    for (const [x, y, r, c] of [[0.1, 0.3, 0.12, '255,178,100'], [0.88, 0.22, 0.1, '255,190,120'], [0.75, 0.85, 0.16, '255,150,80'], [0.18, 0.88, 0.14, '255,170,90'], [0.95, 0.6, 0.09, '130,150,210']]) {
        const blob = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * Math.max(W, H))
        blob.addColorStop(0, `rgba(${c},.35)`)
        blob.addColorStop(1, `rgba(${c},0)`)
        g.fillStyle = blob
        g.fillRect(0, 0, W, H)
    }
}

export function createWall({ canvas, layer, groups, pins, strings, images, reducedMotion }) {
    const { root, board, items, lines, labels } = buildBoard({ groups, pins, strings, images })
    root.classList.toggle('idle', !reducedMotion)
    root.classList.toggle('calm', reducedMotion)
    layer.append(root)
    backdrop(canvas)

    const byId = Object.fromEntries(pins.map((pin) => [pin.id, pin]))
    let cam = fit()
    let base = cam.s
    let layout = 0
    let raf = 0
    let settleTimer = 0
    let saved = null
    let focused = null
    let marked = null
    let covers = false
    let goal = null

    const apply = () => {
        const sx = innerWidth / 2 + (EDGE.left - cam.x) * cam.s
        const sy = innerHeight / 2 - (FRAME.h / 2 - cam.y) * cam.s
        board.style.transform = `translate(${sx}px,${sy}px) scale(${cam.s / layout})`
    }

    // The end of a gesture: lay out at the true scale and drop the promoted layer.
    const settle = () => {
        clearTimeout(settleTimer)
        layout = Math.max(cam.s, LAYOUT_MIN)
        board.style.fontSize = `${layout / 100}px`
        apply()
        root.classList.remove('is-moving')
        // Heroes swap to the cover file only once a thumb would show its pixels.
        if (!covers && layout * SIZE.hero.w * devicePixelRatio > 700) {
            covers = true
            for (const img of board.querySelectorAll('.cf-w img')) img.src = img.dataset.cover
        }
    }
    const moving = () => {
        root.classList.add('is-moving')
        clearTimeout(settleTimer)
        settleTimer = setTimeout(settle, SETTLE_MS)
        apply()
    }
    const stop = () => {
        cancelAnimationFrame(raf)
        raf = 0
    }

    // The path keeps the zoom point still on the screen, so a far pin does not leave the view.
    const ease = (to, ms, instant) => {
        stop()
        goal = to
        if (instant || reducedMotion) {
            cam = to
            settle()
            return
        }
        const from = cam
        const t0 = performance.now()
        root.classList.add('is-moving')
        const step = (now) => {
            const k = smooth(Math.min(1, (now - t0) / ms))
            const s = from.s * (to.s / from.s) ** k
            const w = Math.abs(to.s / from.s - 1) < 0.01 ? k : (1 / from.s - 1 / s) / (1 / from.s - 1 / to.s)
            cam = { s, x: from.x + (to.x - from.x) * w, y: from.y + (to.y - from.y) * w }
            apply()
            if (k < 1) raf = requestAnimationFrame(step)
            else {
                raf = 0
                settle()
            }
        }
        raf = requestAnimationFrame(step)
    }

    // The strings and labels of the marked pins stay bright. The rest of the yarn fades back.
    const mark = () => {
        const ids = new Set([focused, marked].filter(Boolean))
        strings.forEach((string, i) => {
            const on = ids.has(string.from) || ids.has(string.to)
            lines[i].classList.toggle('is-dim', ids.size > 0 && !on)
            labels[i].classList.toggle('is-on', on)
        })
        for (const [id, node] of Object.entries(items)) {
            node.classList.toggle('is-hi', id === marked)
            node.classList.toggle('is-on', id === focused)
        }
    }

    // The target view puts the pin large in the middle of the space the detail sheet leaves.
    const focusView = (pin) => {
        const box = boxOf(pin)
        const W = innerWidth
        const H = innerHeight
        const free = phone() ? { x0: 0, x1: W, y0: 0, y1: 0.28 * H } : { x0: 0, x1: W - sheetWidth(), y0: 0, y1: H }
        const fw = free.x1 - free.x0
        const fh = free.y1 - free.y0
        const s = Math.min(maxScale(), (0.7 * fw) / box.w, (0.7 * fh) / box.h)
        return { s, x: box.x - ((free.x0 + free.x1) / 2 - W / 2) / s, y: box.y + ((free.y0 + free.y1) / 2 - H / 2) / s }
    }

    const highlight = (id) => {
        marked = byId[id] ? id : null
        mark()
        if (!marked || focused) return
        // A pan brings the marked paper fully on screen when it sits outside. It measures from
        // the end of a move in flight, so it does not stop an unfocus half way.
        const view = raf ? goal : cam
        const box = boxOf(byId[id])
        const pad = 40 / view.s
        const hw = innerWidth / 2 / view.s
        const hh = innerHeight / 2 / view.s
        const shift = (c, half, lo, hi) => Math.max(0, hi + pad - (c + half)) + Math.min(0, lo - pad - (c - half))
        const dx = shift(view.x, hw, box.x - box.w / 2, box.x + box.w / 2)
        const dy = shift(view.y, hh, box.y - box.h / 2, box.y + box.h / 2)
        if (dx || dy) ease(clamp({ ...view, x: view.x + dx, y: view.y + dy }, view), 380)
    }

    const focus = (id, { instant } = {}) => {
        const pin = byId[id]
        if (!pin) return
        if (!saved) saved = cam
        focused = id
        mark()
        ease(focusView(pin), 720, instant)
    }

    const unfocus = ({ instant } = {}) => {
        focused = null
        mark()
        if (saved) ease(clamp(saved, saved), 620, instant)
        saved = null
    }

    const pan = (dx, dy) => {
        stop()
        cam = clamp({ s: cam.s, x: cam.x - dx / cam.s, y: cam.y + dy / cam.s }, cam)
        moving()
    }

    const zoom = (factor, px, py) => {
        stop()
        const s = Math.min(maxScale(), Math.max(fit().s, cam.s * factor))
        const ox = px - innerWidth / 2
        const oy = py - innerHeight / 2
        const wx = cam.x + ox / cam.s
        const wy = cam.y - oy / cam.s
        cam = clamp({ s, x: wx - ox / s, y: wy + oy / s }, cam)
        moving()
    }

    // The papers and pin heads take hits. The yarn, the light and the labels do not.
    const tap = (x, y) => {
        const hit = document.elementFromPoint(x, y)?.closest?.('[data-pin]')
        return hit && root.contains(hit) ? hit.dataset.pin : null
    }

    const resize = () => {
        backdrop(canvas)
        const next = fit()
        if (focused) cam = focusView(byId[focused])
        else cam = clamp({ ...cam, s: (cam.s / base) * next.s }, next)
        base = next.s
        settle()
    }

    const dispose = () => {
        stop()
        clearTimeout(settleTimer)
        root.remove()
        canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    }

    settle()
    const ready = (async () => {
        const faces = ['400 1em "Instrument Serif"', 'italic 400 1em "Instrument Serif"', '400 1em Inter', '500 1em "JetBrains Mono"']
        await Promise.all(faces.map((face) => document.fonts.load(face).catch(() => null)))
        const decodes = [...board.querySelectorAll('img')].map((img) => img.decode().catch(() => null))
        await Promise.race([Promise.all(decodes), wait(3000)])
        await frames()
    })()

    return { ready, highlight, focus, unfocus, pan, zoom, tap, resize, dispose }
}
