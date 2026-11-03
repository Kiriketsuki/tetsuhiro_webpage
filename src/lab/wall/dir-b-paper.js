import { Vector3 } from 'three'

// The paper of direction b: every card, photo, note and group label is a DOM element. Each
// frame place() gives it a CSS matrix3d from the same camera that draws the board, so the
// paper sits on the board plane and its text stays sharp HTML at every zoom. The red yarn and
// the focus ring are SVG above the paper, projected from the same camera.

// Metres per design pixel. A card is 340 design pixels wide, so it is 0.17 m on the board.
export const PX = 0.0005
const SIZE = { card: [340, 204], hero: [380, 300], note: [230, 230] }
const NOTE = { tools: ['#f1d46e', '#d5b44c'], work: ['#f2bba9', '#d89a88'], '3d': ['#bddcc4', '#98bca1'], fun: ['#f1d46e', '#d5b44c'] }
const LABEL_TILT = [-2, 1.5, 1, -1.5]
const NS = 'http://www.w3.org/2000/svg'

const CSS = `
.wb-p{position:absolute;left:0;top:0;transform-origin:0 0;box-sizing:border-box;color:#2b2118;font:13px/22px Inter,system-ui,sans-serif}
.wb-p::after{content:'';position:absolute;inset:0;background:linear-gradient(rgba(26,12,4,var(--a)),rgba(26,12,4,var(--b)));transition:opacity .3s}
.wb-p.is-on::after,.wb-p.is-hot::after{opacity:.2}
.wb-p h3{margin:0;font:400 31px/1 "Instrument Serif",Georgia,serif;color:#1d1712;white-space:nowrap}
.wb-m{font:500 10.5px/1.3 "JetBrains Mono",ui-monospace,monospace;color:#7a4a2e;letter-spacing:.02em}
.wb-card{width:340px;height:204px;padding:36px 16px 0;box-shadow:0 0 0 1px rgba(60,38,20,.3);
background:linear-gradient(#d86a5e,#d86a5e) 0 72px/100% 1.5px no-repeat,repeating-linear-gradient(transparent 0 21px,#c3d2de 21px 22px) 0 75px/100% 110px no-repeat,#f6efdf}
.wb-card .wb-y{position:absolute;right:16px;bottom:12px}
.wb-card p{position:absolute;left:16px;top:78px;width:170px;margin:0}
.wb-card .wb-s{position:absolute;left:16px;right:112px;bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wb-t{position:absolute;right:13px;top:80px;width:132px;height:86px;box-sizing:border-box;border:4px solid #fffdf8;transform:rotate(2.5deg);
box-shadow:0 2px 5px rgba(40,20,8,.35);object-fit:cover;background:#e2c48e;display:grid;place-items:center;font:400 42px/1 "Instrument Serif",serif;color:#7c3a22}
.wb-hero{width:380px;height:300px;padding:15px 15px 0;background:linear-gradient(165deg,#fffdf7,#ebe2d0);box-shadow:0 0 0 1px rgba(60,38,20,.3)}
.wb-w{display:block;width:350px;height:219px;object-fit:cover;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3);
background:radial-gradient(circle at 74% 28%,#f3e3b8 0 10px,transparent 11px),linear-gradient(#18203a,#3d2d3a)}
div.wb-w{display:grid;place-items:center;font:italic 400 100px/1 "Instrument Serif",serif;color:#f1e4c8}
.wb-c{display:flex;justify-content:space-between;align-items:baseline;margin:15px 5px 0;font:italic 400 35px/1 "Instrument Serif",serif;color:#25306f;transform:rotate(-1.2deg)}
.wb-c small{font-size:21px}
.wb-note{width:230px;height:230px;padding:38px 18px 0;background:linear-gradient(315deg,transparent 20px,var(--c) 20px)}
.wb-note::before{content:'';position:absolute;right:0;bottom:0;width:28px;height:28px;background:linear-gradient(315deg,transparent 50%,var(--d) 50%)}
.wb-note::after{clip-path:polygon(0 0,100% 0,100% calc(100% - 28px),calc(100% - 28px) 100%,0 100%)}
.wb-note h3{font-size:30px}
.wb-note p{margin:10px 0 0;font-size:14px;line-height:20px}
.wb-note .wb-m{position:absolute;left:18px;bottom:16px;color:#5d4630}
.wb-label{padding:16px 34px 11px;white-space:nowrap;background:#efe6d1;font:italic 400 58px/1 "Instrument Serif",serif;color:#1c140f;
clip-path:polygon(0 6%,4% 0,50% 5%,96% 0,100% 8%,98.6% 50%,100% 94%,96% 100%,50% 95%,3% 100%,0 92%,1.4% 50%)}
.wb-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.wb-svg text{font:500 10px "JetBrains Mono",monospace;fill:#f6ead2;stroke:rgba(34,16,6,.7);stroke-width:3px;paint-order:stroke;transition:opacity .3s}
.wb-gl{position:absolute;inset:0;width:100%;height:100%}
.wb-v{position:absolute;inset:0;background:radial-gradient(ellipse 78% 72% at 50% 44%,transparent 55%,rgba(8,4,2,.45))}
`

const h = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
}
const svg = (tag, attrs) => {
    const node = document.createElementNS(NS, tag)
    for (const key in attrs) node.setAttribute(key, attrs[key])
    return node
}
const rotate = (t, x, y) => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)]
// Two letters stand in for a missing screenshot, so a pin never shows an empty grey box.
const monogram = (title) => {
    const words = title.split(' ')
    return words.length > 1 ? words[0][0] + words[1][0] : title[0] + (title.slice(1).match(/[A-Z]/)?.[0] ?? title[1])
}
const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
}
// The same pool as the picture light in the scene: bright near the top centre, dark at the
// corners. The DOM paper cannot take the three.js light, so it darkens itself to match.
const shade = (x, y) => 0.05 + 0.5 * smooth(0.3, 1.1, Math.hypot(x / 0.95, (y - 0.2) / 0.78))

// One item per pin and per group label, in metres on the cork, with the pin head and the tape.
export function layout(pins, groups) {
    const items = pins.map((pin) => {
        const [pw, ph] = SIZE[pin.kind]
        const t = (pin.tilt * Math.PI) / 180
        const [x, y] = pin.at
        const [hx, hy] = rotate(t, 0, (ph * PX) / 2 - 0.007)
        const [tx, ty] = rotate(t, (-pw * PX) / 2 + 0.014, (ph * PX) / 2 - 0.012)
        return { id: pin.id, pin, kind: pin.kind, x, y, z: 0.0015, t, pw, ph, head: [x + hx, y + hy], tapes: pin.kind === 'hero' ? [[x + tx, y + ty, t + 0.75, 0.8]] : [] }
    })
    const labels = groups.map((group, i) => ({ id: `group-${group.id}`, group, kind: 'label', x: group.at[0], y: group.at[1], z: 0.001, t: (LABEL_TILT[i % 4] * Math.PI) / 180, pw: 400, ph: 62, head: null, tapes: [] }))
    return [...labels, ...items]
}

function build(item, image, small) {
    const { pin, kind } = item
    const node = h('div', `wb-p wb-${kind}`)
    if (kind === 'label') {
        node.textContent = item.group.title
        return node
    }
    if (kind === 'hero') {
        const src = image && (small ? image.thumb : image.cover)
        const shot = src ? Object.assign(h('img', 'wb-w'), { src, alt: '', decoding: 'async' }) : h('div', 'wb-w', monogram(pin.title))
        const caption = h('div', 'wb-c', pin.title)
        caption.append(h('small', '', pin.year.replace(/^\d\d(\d\d) to \d\d(\d\d)$/, '’$1 to ’$2')))
        node.append(shot, caption)
        return node
    }
    if (kind === 'note') {
        const [c, d] = NOTE[pin.group] ?? NOTE.tools
        node.style.setProperty('--c', c)
        node.style.setProperty('--d', d)
        node.append(h('h3', '', pin.title), h('p', '', pin.line), h('span', 'wb-m', `${pin.year} / ${pin.stack.join(', ')}`))
        return node
    }
    const thumb = image ? Object.assign(h('img', 'wb-t'), { src: image.thumb, alt: '', decoding: 'async' }) : h('div', 'wb-t', monogram(pin.title))
    node.append(h('h3', '', pin.title), h('span', 'wb-m wb-y', pin.year), h('p', '', pin.line), thumb, h('span', 'wb-m wb-s', pin.stack.join(' · ')))
    return node
}

export function createPaper({ layer, items, strings, images, small }) {
    const style = h('style', '', CSS)
    document.head.append(style)
    // The lab gives the children of the layer pointer events. The harness reads taps on the
    // window, so the paper takes none and a drag that starts on a card still pans.
    const root = h('div')
    root.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none'
    for (const item of items) {
        item.el = build(item, images[item.id] ?? null, small)
        root.append(item.el)
    }
    const byId = new Map(items.map((item) => [item.id, item]))
    const art = svg('svg', { class: 'wb-svg', 'aria-hidden': 'true' })
    const groupsOf = ['g', 'g', 'g'].map(() => art.appendChild(svg('g', {})))
    const yarn = strings
        .map((s, i) => {
            let [a, b] = [byId.get(s.from), byId.get(s.to)]
            if (!a || !b) return null
            // The path runs left to right, so a label on it never reads upside down.
            if (a.head[0] > b.head[0]) [a, b] = [b, a]
            const shadow = groupsOf[0].appendChild(svg('path', { fill: 'none', stroke: 'rgba(18,7,2,.34)', 'stroke-linecap': 'round' }))
            const line = groupsOf[1].appendChild(svg('path', { id: `wb-s${i}`, fill: 'none', stroke: '#a8231c', 'stroke-linecap': 'round' }))
            const strand = groupsOf[1].appendChild(svg('path', { fill: 'none', stroke: '#e0604e', 'stroke-opacity': '.4' }))
            const text = groupsOf[2].appendChild(svg('text', { 'text-anchor': 'middle', style: 'opacity:0' }))
            const span = text.appendChild(svg('textPath', { href: `#wb-s${i}`, startOffset: '50%' }))
            span.textContent = s.label
            return { ends: [a.id, b.id], a: a.head, b: b.head, shadow, line, strand, text }
        })
        .filter(Boolean)
    const glow = art.appendChild(svg('polygon', { fill: 'none', stroke: 'rgba(255,186,96,.32)', 'stroke-width': 12, 'stroke-linejoin': 'round', visibility: 'hidden' }))
    const ring = art.appendChild(svg('polygon', { fill: 'none', stroke: '#ffd08c', 'stroke-width': 3, 'stroke-linejoin': 'round', visibility: 'hidden' }))
    root.append(art)
    layer.append(root)

    const v3 = new Vector3()
    let size = [1, 1]
    const project = (x, y, z) => {
        v3.set(x, y, z).project(camera)
        return [((v3.x + 1) / 2) * size[0], ((1 - v3.y) / 2) * size[1]]
    }
    let camera = null
    let hot = null
    let on = null

    // Sizes come from layout once the fonts load, so a label fits its text.
    const measure = () => {
        for (const item of items) {
            item.el.style.setProperty('--a', shade(item.x, item.y + (item.ph * PX) / 2).toFixed(3))
            item.el.style.setProperty('--b', shade(item.x, item.y - (item.ph * PX) / 2).toFixed(3))
            if (item.kind !== 'label') continue
            item.pw = item.el.offsetWidth
            item.ph = item.el.offsetHeight
            const reach = (item.pw * PX) / 2
            item.tapes = [-1, 1].map((side) => {
                const [x, y] = rotate(item.t, side * (reach - 0.002), 0)
                return [item.x + x, item.y + y, item.t + Math.PI / 2 + side * 0.18, 0.5]
            })
        }
    }

    const elements = new Float64Array(16)
    const writeMatrix = (vp, item) => {
        const c = Math.cos(item.t) * PX
        const n = Math.sin(item.t) * PX
        // The element maps design pixels (u right, v down) onto the cork at its centre and tilt.
        const m = [c, n, 0, 0, n, -c, 0, 0, 0, 0, 1, 0, item.x - (c * item.pw) / 2 - (n * item.ph) / 2, item.y - (n * item.pw) / 2 + (c * item.ph) / 2, item.z, 1]
        for (let col = 0; col < 4; col++)
            for (let row = 0; row < 4; row++) {
                let sum = 0
                for (let k = 0; k < 4; k++) sum += vp[k * 4 + row] * m[col * 4 + k]
                elements[col * 4 + row] = sum
            }
        const e = elements
        const w = e[15]
        for (let i = 0; i < 16; i++) e[i] /= w
        // The paper is flat, so its depth carries nothing. A flat depth row keeps the matrix
        // invertible and lets the browser treat a head-on view as a plain 2D transform.
        e[2] = e[6] = e[14] = e[8] = e[9] = e[11] = 0
        e[10] = 1
        item.el.style.transform = `matrix3d(${e.join()})`
        item.quad = [[0, 0], [item.pw, 0], [item.pw, item.ph], [0, item.ph]].map(([u, v]) => {
            const d = e[3] * u + e[7] * v + e[15]
            return [(e[0] * u + e[4] * v + e[12]) / d, (e[1] * u + e[5] * v + e[13]) / d]
        })
    }

    const curve = (a, b, z, dx, dy) => {
        const span = Math.hypot(b[0] - a[0], b[1] - a[1])
        const sag = 0.01 + 0.055 * span
        let d = ''
        for (let i = 0; i <= 14; i++) {
            const t = i / 14
            const bow = 4 * t * (1 - t)
            const [x, y] = project(a[0] + (b[0] - a[0]) * t + dx, a[1] + (b[1] - a[1]) * t - sag * bow + dy, z - 0.005 * bow)
            d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
        }
        return d
    }

    const place = (cam, vp, width, height, k) => {
        camera = cam
        size = [width, height]
        for (const item of items) writeMatrix(vp, item)
        const width3 = Math.max(1.4, 0.0026 * k)
        const twist = width3 > 2.6
        const label = 0.0085 * k
        for (const s of yarn) {
            s.shadow.setAttribute('d', curve(s.a, s.b, 0.006, 0.0015, -0.0055))
            s.shadow.setAttribute('stroke-width', (width3 * 1.3).toFixed(2))
            s.line.setAttribute('d', curve(s.a, s.b, 0.012, 0, 0))
            s.line.setAttribute('stroke-width', width3.toFixed(2))
            s.strand.setAttribute('d', twist ? s.line.getAttribute('d') : '')
            s.strand.setAttribute('stroke-width', (width3 * 0.38).toFixed(2))
            s.strand.setAttribute('stroke-dasharray', `${(width3 * 1.1).toFixed(1)} ${(width3 * 1.5).toFixed(1)}`)
            // Only the strings of the marked pin carry their words, so the wall stays quiet.
            const said = label >= 8 && (s.ends.includes(hot) || s.ends.includes(on))
            s.text.style.opacity = said ? 0.85 : 0
            s.text.setAttribute('font-size', Math.min(label, 14).toFixed(1))
            s.text.setAttribute('dy', (-width3 - 3).toFixed(1))
        }
        drawRing(k)
    }

    const drawRing = (k) => {
        const item = hot && byId.get(hot)
        for (const node of [ring, glow]) node.setAttribute('visibility', item ? 'visible' : 'hidden')
        if (!item || !camera) return
        const gap = 7 / k
        const hw = (item.pw * PX) / 2 + gap
        const hh = (item.ph * PX) / 2 + gap
        const points = [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]].map(([x, y]) => {
            const [rx, ry] = rotate(item.t, x, y)
            return project(item.x + rx, item.y + ry, item.z).map((v) => v.toFixed(1)).join(',')
        })
        ring.setAttribute('points', points.join(' '))
        glow.setAttribute('points', points.join(' '))
    }

    const inside = (quad, x, y) => {
        let sign = 0
        for (let i = 0; i < 4; i++) {
            const [ax, ay] = quad[i]
            const [bx, by] = quad[(i + 1) % 4]
            const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
            if (cross && sign && Math.sign(cross) !== sign) return false
            sign = Math.sign(cross) || sign
        }
        return true
    }
    // The last item in the DOM draws on top, so the search runs from the end.
    const hit = (x, y) => {
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i]
            if (item.kind !== 'label' && item.quad && inside(item.quad, x, y)) return item.id
        }
        return null
    }

    const mark = (id, className) => {
        for (const item of items) item.el.classList.toggle(className, item.id === id)
    }

    // The screenshots decode before the first frame, so the reveal shows no empty frames.
    const decoded = Promise.all([...root.querySelectorAll('img')].map((img) => img.decode().catch(() => {})))

    return {
        decoded,
        measure,
        place,
        hit,
        setHot(id) {
            hot = id
            mark(id, 'is-hot')
        },
        setOn(id) {
            on = id
            mark(id, 'is-on')
        },
        dispose() {
            root.remove()
            style.remove()
        },
    }
}
