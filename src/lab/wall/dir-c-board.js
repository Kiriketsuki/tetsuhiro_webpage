// Builds the case file wall as DOM and SVG. Inside the board element 1em is 1 cm, so every
// size below is a real size in centimetres. The camera in dir-c.js only changes the font size
// of the board and one transform, so the browser lays the text out again at the true size.

// Paper sizes in metres. Each pin sits on its paper at a distance (top) below the top edge.
export const SIZE = {
    hero: { w: 0.2, h: 0.16, top: 0.0045 },
    card: { w: 0.16, h: 0.1, top: 0.0075 },
    note: { w: 0.09, h: 0.09, top: 0.009 },
}
// The frame is 1.6 x 1.0 m around the 1.48 x 0.88 m cork, as in corkboard_kit.glb.
export const FRAME = { w: 1.6, h: 1 }
const PIN_TINT = { tools: '#d4a23a', fun: '#5f9b66', work: '#4174b0', '3d': '#ece4d0' }
const NOTE_TINT = ['#ecd47e', '#cfe0e3', '#efc8b8']

const INK = '#2a2018'
const CSS = `
.cf{position:absolute;inset:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;
background:radial-gradient(ellipse 75% 70% at 50% 35%,rgba(18,11,6,.3),rgba(6,4,2,.82) 80%)}
.cf-b{position:absolute;left:0;top:0;width:160em;height:100em;transform-origin:0 0;color:${INK}}
.cf.is-moving .cf-b{will-change:transform}
.cf-gl{position:absolute;left:-50em;width:260em;top:-60em;height:150em;pointer-events:none;
background:radial-gradient(ellipse 45% 50% at 50% 42%,rgba(255,178,96,.2),rgba(255,178,96,.06) 55%,transparent 75%)}
.cf.idle .cf-gl{animation:cf-breathe 9s ease-in-out infinite}
@keyframes cf-breathe{50%{opacity:.82}}
.cf-lamp{position:absolute;left:44em;width:72em;top:-9.5em;height:2.6em;border-radius:1.3em .3em;
background:linear-gradient(#f3d79a,#b8893f 45%,#6d4d1f);box-shadow:0 1.6em 2.6em rgba(255,190,110,.35),0 .3em .5em rgba(0,0,0,.6)}
.cf-lamp:before,.cf-lamp:after{content:"";position:absolute;bottom:100%;width:.8em;height:4em;left:11em;background:linear-gradient(90deg,#5a3d17,#c49650,#5a3d17)}
.cf-lamp:after{left:auto;right:11em}
.cf-f{position:absolute;inset:0;border-radius:.7em;background:var(--n) 0 0/70em 1.6em,linear-gradient(#80502d,#5a331b);
box-shadow:0 3em 6em rgba(0,0,0,.65),inset 0 .3em .25em rgba(255,214,160,.28),inset 0 -.4em .4em rgba(0,0,0,.45)}
.cf-c{position:absolute;inset:6em;border-radius:.2em;background:var(--n) 0 0/7em,var(--n) 3em 5em/34em,
radial-gradient(ellipse at 30% 40%,rgba(120,70,28,.35),transparent 60%),#b37c47;
box-shadow:inset 0 .6em 1.4em rgba(0,0,0,.6),inset 0 0 0 .18em rgba(0,0,0,.35)}
.cf-i,.cf-x{position:absolute;box-sizing:border-box;transform:rotate(var(--r));
box-shadow:.25em .7em 1.1em rgba(0,0,0,.42),0 0 .12em rgba(0,0,0,.35);transition:box-shadow .3s}
.cf-i.is-hi,.cf-i.is-on{box-shadow:.5em 1.4em 2.2em rgba(0,0,0,.5),0 0 .12em rgba(0,0,0,.35)}
.cf-r{position:absolute;inset:-2em -2.4em;border:.42em solid #c9271c;border-radius:52% 48% 55% 45%/48% 56% 44% 52%;
opacity:0;transform:rotate(-4deg) scale(.94);transition:opacity .25s,transform .25s;pointer-events:none}
.cf-i.is-hi .cf-r{opacity:.92;transform:rotate(-4deg)}
.cf-t{font-family:"Instrument Serif",Georgia,serif;font-weight:400;line-height:1;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cf-m{font:500 .5em/1.3 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.05em;color:#8a4b2c;text-transform:uppercase}
.cf-p{font:400 .56em/2.232 Inter,system-ui,sans-serif;margin:0}
.cf-h{width:20em;height:16em;padding:.9em .9em 0;background:#f2ecdf}
.cf-w{position:relative;height:11.4em;overflow:hidden;background:radial-gradient(#3b2f25,#1d1611);box-shadow:inset 0 0 .4em rgba(0,0,0,.5)}
.cf-w img,.cf-ph img{display:block;width:100%;height:100%;object-fit:cover}
.cf-mono{display:grid;place-content:center;text-align:center;color:#e6d6b4}
.cf-mono b{font:italic 400 5.4em/.9 "Instrument Serif",serif}
.cf-mono .cf-m{color:#b89668;font-size:.55em;margin-top:.8em}
.cf-cap{display:flex;justify-content:space-between;align-items:baseline;gap:.6em;padding:.75em .2em 0}
.cf-cap .cf-t{font-size:2.1em}
.cf-k{width:16em;height:10em;padding:.5em 1em 0;
background:linear-gradient(#c8574b,#c8574b) 0 3.05em/100% .09em no-repeat,
repeating-linear-gradient(transparent 0 1.19em,#adc2d6 1.19em 1.25em) 0 3.15em/100% 5.9em no-repeat,#f5efe0}
.cf-row{display:flex;justify-content:space-between}
.cf-k .cf-t{font-size:1.5em;margin-top:.33em}
.cf-tx{width:7.7em;margin-top:.62em}
.cf-sk{position:absolute;left:2em;right:2em;bottom:1.1em;font-size:.46em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cf-ph{position:absolute;right:.7em;top:3.55em;width:5.6em;height:3.5em;border:.3em solid #fbf8f0;transform:rotate(4deg);
background:#2b231c;box-shadow:.1em .3em .5em rgba(0,0,0,.35)}
.cf-st{position:absolute;right:1.3em;top:3.4em;width:4.4em;height:4.4em;border-radius:50%;display:grid;place-content:center;
text-align:center;color:#b3281d;border:.2em solid currentColor;box-shadow:inset 0 0 0 .28em #f5efe0,inset 0 0 0 .4em currentColor;
transform:rotate(-14deg);opacity:.8}
.cf-st b{font:italic 400 1.9em/1 "Instrument Serif",serif}
.cf-st .cf-m{color:inherit;font-size:.36em}
.cf-n{width:9em;height:9em;padding:1.7em .8em 0;background:linear-gradient(135deg,transparent 82%,rgba(0,0,0,.1)),var(--c);
border-radius:0 0 1.4em 0/0 0 .5em 0}
.cf-n .cf-t{font-size:1.35em;font-style:italic;white-space:normal;line-height:.95}
.cf-n .cf-p{font-size:.52em;line-height:1.4;margin-top:.5em}
.cf-n .cf-sk{left:1.9em;bottom:1.1em;font-size:.42em}
.cf-tp{position:absolute;width:6em;height:1.9em;background:rgba(236,224,188,.72);box-shadow:0 .1em .2em rgba(0,0,0,.18);
clip-path:polygon(0 8%,4% 0,96% 6%,100% 0,98% 50%,100% 100%,3% 94%,0 100%,2% 50%)}
.cf-y{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.cf-y g{transition:opacity .3s}
.cf-y .is-dim{opacity:.32}
.cf-pin{position:absolute;width:1.5em;height:1.5em;margin:-.75em 0 0 -.75em;border-radius:50%;
background:radial-gradient(circle at 34% 30%,rgba(255,255,255,.8) 0 9%,transparent 30%),radial-gradient(circle at 40% 35%,transparent 35%,rgba(0,0,0,.45)),var(--c);
box-shadow:.32em .55em .38em rgba(0,0,0,.5)}
.cf-s,.cf-dy,.cf-tag,.cf-scrap{position:absolute;transform:translate(-50%,-50%) rotate(var(--r,0deg));white-space:nowrap}
.cf-s{font:italic 400 1.15em/1 "Instrument Serif",serif;background:#efe6d2;padding:.25em .55em;box-shadow:0 .2em .4em rgba(0,0,0,.35);
opacity:0;transition:opacity .3s;pointer-events:none}
.cf-s.is-on{opacity:1}
.cf-dy{font:500 1.3em/1 "JetBrains Mono",monospace;letter-spacing:.16em;text-transform:uppercase;color:#f3ece2;
background:linear-gradient(#3a1513,#22100e);padding:.55em .9em;border-radius:.15em;text-shadow:0 -.06em 0 rgba(0,0,0,.7),0 .06em 0 rgba(255,255,255,.18);
box-shadow:.15em .4em .6em rgba(0,0,0,.45)}
.cf-tag{width:16em;height:6em;box-sizing:border-box;padding:1.3em 1em 0 2em;white-space:normal;background:#d9b779;
clip-path:polygon(1.4em 0,100% 0,100% 100%,1.4em 100%,0 50%);box-shadow:0 .3em .6em rgba(0,0,0,.4)}
.cf-tag .cf-m{display:block;font-size:.62em;color:#4a3320}
.cf-tag b{font:400 2.3em/1.1 "Instrument Serif",serif}
.cf-scrap{font:italic 400 1.9em/1.1 "Instrument Serif",serif;background:#f4eedf;padding:.5em .8em .6em;text-align:center;
clip-path:polygon(0 4%,10% 0,25% 5%,45% 1%,60% 6%,80% 0,100% 5%,98% 100%,0 96%)}
.cf.calm *{transition:none!important}
`

const el = (tag, cls, text) => {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
}
const at = (node, x, y) => {
    // Percent of the board, because an em offset would follow the font size of the node itself.
    node.style.left = `${((x + FRAME.w / 2) / FRAME.w) * 100}%`
    node.style.top = `${((FRAME.h / 2 - y) / FRAME.h) * 100}%`
    return node
}

// The pin head in metres: the paper turns about its centre, so the head turns with it.
export const headOf = (pin) => {
    const size = SIZE[pin.kind]
    const d = size.h / 2 - size.top
    const t = (pin.tilt * Math.PI) / 180
    return [pin.at[0] - d * Math.sin(t), pin.at[1] + d * Math.cos(t)]
}

const initials = (title) => {
    const words = title.split(/[\s-]+/)
    return words.length > 1 ? words[0][0] + words[1][0].toUpperCase() : title[0].toUpperCase() + title[1]
}

// One cork tile of speckle. Each grain is drawn at nine offsets so the tile repeats with no seam.
function noiseTile() {
    const n = 128
    const canvas = Object.assign(document.createElement('canvas'), { width: n, height: n })
    const g = canvas.getContext('2d')
    for (let i = 0; i < 1500; i++) {
        const x = Math.random() * n
        const y = Math.random() * n
        const r = 0.5 + Math.random() ** 2 * 2
        g.fillStyle = Math.random() < 0.55 ? `rgba(70,36,12,${0.15 + Math.random() * 0.4})` : `rgba(245,205,150,${0.1 + Math.random() * 0.3})`
        for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {
            g.beginPath()
            g.arc(x + dx, y + dy, r, 0, 7)
            g.fill()
        }
    }
    return canvas.toDataURL()
}

function hero(pin, image, node) {
    const win = el('div', 'cf-w')
    if (image) {
        const img = el('img')
        Object.assign(img, { src: image.thumb, alt: '', draggable: false, decoding: 'async' })
        img.dataset.cover = image.cover
        win.append(img)
    } else {
        win.classList.add('cf-mono')
        win.append(el('b', '', initials(pin.title)), el('span', 'cf-m', 'print pending'))
    }
    const cap = el('div', 'cf-cap')
    cap.append(el('p', 'cf-t', pin.title), el('span', 'cf-m', pin.year))
    const tapes = [['-2.2em', '-38deg'], ['auto', '38deg']].map(([left, r]) => {
        const tape = el('i', 'cf-tp')
        Object.assign(tape.style, { left, right: left === 'auto' ? '-2.2em' : '', top: '.5em', transform: `rotate(${r})` })
        return tape
    })
    node.append(win, cap, ...tapes)
}

function card(pin, image, node, no) {
    const row = el('div', 'cf-row')
    row.append(el('span', 'cf-m', `exhibit ${no}`), el('span', 'cf-m', pin.year))
    const tx = el('div', 'cf-tx')
    tx.append(el('p', 'cf-p', pin.line))
    let mark
    if (image) {
        mark = el('div', 'cf-ph')
        const img = el('img')
        Object.assign(img, { src: image.thumb, alt: '', draggable: false, decoding: 'async' })
        mark.append(img)
    } else {
        mark = el('div', 'cf-st')
        mark.append(el('b', '', initials(pin.title)), el('span', 'cf-m', 'no print'))
    }
    node.append(row, el('p', 'cf-t', pin.title), tx, mark, el('span', 'cf-m cf-sk', pin.stack.join(' / ')))
}

function note(pin, node, i) {
    node.style.setProperty('--c', NOTE_TINT[i % NOTE_TINT.length])
    node.append(el('p', 'cf-t', pin.title), el('p', 'cf-p', pin.line), el('span', 'cf-m cf-sk', pin.year))
}

// A string sags under its own weight. The sag grows with the length, as a real yarn does.
function yarn(strings, heads) {
    const mm = (p) => [(p[0] + FRAME.w / 2) * 1000, (FRAME.h / 2 - p[1]) * 1000]
    const mids = []
    const groups = strings.map(({ from, to }) => {
        const [ax, ay] = mm(heads[from])
        const [bx, by] = mm(heads[to])
        const sag = 25 + 0.09 * Math.hypot(bx - ax, by - ay)
        const cx = (ax + bx) / 2
        const cy = (ay + by) / 2 + sag * 2
        mids.push([cx / 1000 - FRAME.w / 2, FRAME.h / 2 - ((ay + by) / 2 + sag) / 1000])
        const d = `M${ax} ${ay}Q${cx} ${cy} ${bx} ${by}`
        return `<g><path d="${d}" stroke="rgba(20,8,2,.28)" stroke-width="3.4" transform="translate(3 7)"/><path d="${d}" stroke="#b5221a" stroke-width="3.4"/><path d="${d}" stroke="#e8645a" stroke-width="1" stroke-dasharray="5 4" opacity=".6"/></g>`
    })
    return { svg: `<svg class="cf-y" viewBox="0 0 1600 1000" fill="none" stroke-linecap="round" aria-hidden="true">${groups.join('')}</svg>`, mids }
}

// Returns the root node and the parts the camera and the marks need.
export function buildBoard({ groups, pins, strings, images }) {
    if (!document.getElementById('cf-css')) document.head.append(Object.assign(el('style'), { id: 'cf-css', textContent: CSS }))
    const root = el('div', 'cf')
    root.setAttribute('aria-hidden', 'true')
    const board = el('div', 'cf-b')
    board.style.setProperty('--n', `url(${noiseTile()})`)
    const cork = el('div', 'cf-c')
    const frame = el('div', 'cf-f')
    board.append(el('div', 'cf-gl'), el('div', 'cf-lamp'), frame, cork)

    for (const [i, group] of groups.entries()) {
        const label = at(el('span', 'cf-dy', group.title), ...group.at)
        label.style.setProperty('--r', `${[-1.5, 1.2, 0.8, -1][i % 4]}deg`)
        board.append(label)
    }
    const tag = at(el('div', 'cf-tag'), -0.625, 0.375)
    tag.style.setProperty('--r', '-2deg')
    tag.append(el('span', 'cf-m', `file no. ${pins.length} / 2022 to 2026`), el('b', '', 'Projects'))
    const scrap = at(el('div', 'cf-scrap', 'follow the red string'), 0.02, 0.36)
    scrap.style.setProperty('--r', '2.5deg')
    board.append(tag, scrap)

    const items = {}
    const heads = {}
    const headLayer = []
    let notes = 0
    for (const [i, pin] of pins.entries()) {
        const size = SIZE[pin.kind]
        const node = el('div', `cf-i cf-${{ hero: "h", card: "k", note: "n" }[pin.kind]}`)
        node.dataset.pin = pin.id
        node.style.left = `${(pin.at[0] - size.w / 2 + FRAME.w / 2) * 100}em`
        node.style.top = `${(FRAME.h / 2 - pin.at[1] - size.h / 2) * 100}em`
        node.style.setProperty('--r', `${-pin.tilt}deg`)
        node.append(el('i', 'cf-r'))
        if (pin.kind === 'hero') hero(pin, images[pin.id], node)
        else if (pin.kind === 'card') card(pin, images[pin.id], node, String(i + 1).padStart(2, '0'))
        else note(pin, node, notes++)
        items[pin.id] = node
        heads[pin.id] = headOf(pin)
        const head = at(el('i', 'cf-pin'), ...heads[pin.id])
        head.dataset.pin = pin.id
        head.style.setProperty('--c', PIN_TINT[pin.group] ?? '#c9271c')
        headLayer.push(head)
    }
    board.append(...Object.values(items))
    // The yarn lies over the paper, and the pin heads hold it down, so the heads go last.
    const { svg, mids } = yarn(strings, heads)
    board.insertAdjacentHTML('beforeend', svg)
    const labels = strings.map((string, i) => {
        const label = at(el('span', 'cf-s', string.label), ...mids[i])
        label.style.setProperty('--r', `${(i % 3) - 1}deg`)
        return label
    })
    board.append(...headLayer, ...labels)
    // A warm wash from the picture light at the top, falling to dark at the lower corners.
    const light = el('div')
    light.style.cssText = 'position:absolute;inset:0;pointer-events:none;border-radius:.7em;background:radial-gradient(ellipse 55% 70% at 50% 0,rgba(255,200,125,.26),transparent 70%),radial-gradient(ellipse 120% 115% at 50% 8%,transparent 45%,rgba(14,7,2,.62))'
    board.append(light)
    root.append(board)
    return { root, board, items, lines: [...board.querySelectorAll('.cf-y g')], labels }
}
