import * as THREE from 'three'

// The paper faces of the evidence wall: index cards, notes, photo prints, photo captions and
// the group labels. Every face is drawn at its full size (SIZE, in canvas pixels), where a
// card at the maximum zoom on a 2x phone shows about one texel per device pixel.
//
// The wall keeps two kinds of texture. The overview atlas holds every face at ATLAS_SCALE of
// full size, which is sharp up to a mid zoom and costs about a quarter of a full atlas. A
// sharp page holds the faces of one pin at full size. The wall draws one only for the few
// pins on screen at a close zoom (wall.js), so GPU memory stays near 20 MB.

const WIDTH = 4096
const GAP = 12
export const ATLAS_SCALE = 0.5
// The sharp page of one pin: a hero keeps its photo above its caption strip.
export const SHARP = { width: 1024, height: 1024 }
export const SIZE = { card: [1024, 612], note: [640, 640], cover: [704, 704], strip: [768, 200], label: [1024, 176] }
const INK = '#21180f'
const BROWN = '#8a4b2c'
const SERIF = '"Instrument Serif", Georgia, serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'
const SANS = 'Inter, system-ui, sans-serif'
const NOTE_TINTS = ['#ecd690', '#cddcb0', '#efc6b4']
export const GROUP_TINTS = { tools: '#4f7a8c', fun: '#c39236', work: '#b4473c', '3d': '#6f8a5c' }

const loadImage = (src) =>
    new Promise((resolve) => {
        if (!src) return resolve(null)
        const img = new Image()
        img.onload = () => resolve(img)
        // A missing screenshot falls back to the monogram, so one bad file never blanks the wall.
        img.onerror = () => resolve(null)
        img.src = src
    })

function wrap(ctx, text, width, max) {
    const lines = []
    let line = ''
    for (const word of text.split(' ')) {
        const next = line ? `${line} ${word}` : word
        if (line && ctx.measureText(next).width > width) {
            lines.push(line)
            line = word
        } else line = next
    }
    lines.push(line)
    if (lines.length > max) {
        lines.length = max
        lines[max - 1] = lines[max - 1].replace(/\s*\S+$/, '') + '…'
    }
    return lines
}

// Shrinks a font until the text fits, so a long title stays on one line.
function fit(ctx, text, family, size, width) {
    let px = size
    do ctx.font = `${family.weight ?? 400} ${px}px ${family.face}`
    while (ctx.measureText(text).width > width && (px -= 4) > 40)
}

// A soft darker rim, so each sheet reads as paper with an ink edge under the lamp.
function paper(ctx, w, h, color) {
    ctx.fillStyle = color
    ctx.fillRect(-GAP / 2, -GAP / 2, w + GAP, h + GAP)
    const rim = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62)
    rim.addColorStop(0, 'rgba(90,60,30,0)')
    rim.addColorStop(1, 'rgba(90,60,30,0.22)')
    ctx.fillStyle = rim
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(60,40,25,0.45)'
    ctx.lineWidth = 3
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3)
}

function cover(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height)
    const sw = w / scale
    const sh = h / scale
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

// Two letters: the first of each word, or for one word its first letter and its next capital.
const initials = (title) => {
    const words = title.split(/[^A-Za-z0-9]+/).filter(Boolean)
    return (words.length > 1 ? words.map((w) => w[0]).join('') : title[0] + (title.slice(1).match(/[A-Z]/)?.[0] ?? '')).slice(0, 2)
}

// A tinted block with the initials, for a pin with no screenshot yet.
function monogram(ctx, pin, x, y, w, h) {
    ctx.fillStyle = GROUP_TINTS[pin.group] ?? BROWN
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = 'rgba(255,245,225,0.92)'
    ctx.font = `400 ${Math.round(h * 0.62)}px ${SERIF}`
    ctx.textAlign = 'center'
    ctx.fillText(initials(pin.title), x + w / 2, y + h * 0.7)
    ctx.textAlign = 'left'
}

function drawCard(ctx, pin, img, w, h) {
    paper(ctx, w, h, '#ede2ca')
    ctx.fillStyle = 'rgba(70,110,160,0.26)'
    for (let y = 258; y < h - 20; y += 60) ctx.fillRect(0, y, w, 2)
    ctx.fillStyle = 'rgba(190,62,50,0.6)'
    ctx.fillRect(0, 196, w, 3)
    ctx.fillStyle = BROWN
    ctx.font = `500 28px ${MONO}`
    ctx.fillText(pin.year, 60, 74)
    ctx.fillStyle = INK
    fit(ctx, pin.title, { face: SERIF }, 104, w - 120)
    ctx.fillText(pin.title, 58, 178)
    ctx.fillStyle = '#2a2018'
    ctx.font = `400 37px ${SANS}`
    wrap(ctx, pin.line, 550, 5).forEach((line, i) => ctx.fillText(line, 60, 248 + i * 60))
    ctx.fillStyle = '#6b5a48'
    ctx.font = `400 23px ${MONO}`
    ctx.fillText(pin.stack.slice(0, 3).join('  ·  '), 60, h - 30)
    // The small photo sits on the card at a slight angle, as if glued on by hand.
    ctx.save()
    ctx.translate(810, 340)
    ctx.rotate((pin.tilt > 0 ? -1 : 1) * 0.03)
    ctx.shadowColor = 'rgba(40,25,10,0.35)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 4
    ctx.fillStyle = '#fbf6ea'
    ctx.fillRect(-170, -114, 340, 228)
    ctx.shadowColor = 'transparent'
    if (img) cover(ctx, img, -158, -102, 316, 204)
    else monogram(ctx, pin, -158, -102, 316, 204)
    ctx.restore()
}

function drawNote(ctx, pin, i, w, h) {
    paper(ctx, w, h, NOTE_TINTS[i % NOTE_TINTS.length])
    ctx.fillStyle = 'rgba(80,50,20,0.06)'
    ctx.fillRect(0, 0, w, 110)
    ctx.fillStyle = INK
    ctx.font = `400 76px ${SERIF}`
    const title = wrap(ctx, pin.title, w - 96, 2)
    title.forEach((line, k) => ctx.fillText(line, 48, 196 + k * 70))
    ctx.fillStyle = '#2a2018'
    ctx.font = `400 33px ${SANS}`
    const top = 196 + title.length * 70 + 4
    wrap(ctx, pin.line, w - 100, 4).forEach((line, k) => ctx.fillText(line, 48, top + k * 46))
    ctx.fillStyle = BROWN
    ctx.font = `500 24px ${MONO}`
    ctx.fillText(pin.year, 48, h - 44)
}

// The island has no screenshot, so its print is a small drawing of the night island.
function drawNight(ctx, w, h) {
    const poly = (color, points) => {
        ctx.fillStyle = color
        ctx.beginPath()
        points.forEach(([x, y], k) => (k ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)))
        ctx.fill()
    }
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#25345e')
    sky.addColorStop(1, '#6b5878')
    ctx.fillStyle = sky
    ctx.fillRect(-GAP / 2, -GAP / 2, w + GAP, h + GAP)
    ctx.fillStyle = '#f3e7c8'
    ctx.beginPath()
    ctx.arc(w * 0.76, h * 0.2, w * 0.06, 0, Math.PI * 2)
    ctx.fill()
    poly('#4b3446', [[0.14, 0.6], [0.86, 0.6], [0.66, 0.8], [0.52, 0.94], [0.36, 0.8]])
    poly('#6f7c44', [[0.12, 0.6], [0.88, 0.6], [0.84, 0.56], [0.16, 0.56]])
    poly('#d0702a', [[0.22, 0.56], [0.24, 0.4], [0.32, 0.33], [0.4, 0.4], [0.41, 0.56]])
    poly('#3b2a2a', [[0.5, 0.56], [0.5, 0.44], [0.6, 0.36], [0.7, 0.44], [0.7, 0.56]])
    ctx.fillStyle = '#ffc56a'
    ctx.fillRect(w * 0.55, h * 0.46, w * 0.04, h * 0.04)
    ctx.fillRect(w * 0.62, h * 0.46, w * 0.04, h * 0.04)
}

function drawCover(ctx, pin, img, w, h) {
    if (!img) return pin.id === 'island' ? drawNight(ctx, w, h) : monogram(ctx, pin, -GAP / 2, -GAP / 2, w + GAP, h + GAP)
    cover(ctx, img, -GAP / 2, -GAP / 2, w + GAP, h + GAP)
    // A faint warm wash, so a bright screenshot sits in the lamp light like a printed photo.
    ctx.fillStyle = 'rgba(120,80,40,0.10)'
    ctx.fillRect(0, 0, w, h)
}

function drawStrip(ctx, pin, w, h) {
    ctx.fillStyle = INK
    fit(ctx, pin.title, { face: SERIF, weight: 'italic 400' }, 104, w - 220)
    ctx.fillText(pin.title, 34, h * 0.68)
    ctx.fillStyle = BROWN
    ctx.font = `500 26px ${MONO}`
    ctx.textAlign = 'right'
    ctx.fillText(pin.year.replace(' to ', '–'), w - 30, h * 0.66)
    ctx.textAlign = 'left'
}

// Masking tape with marker capitals. Each letter tips a little, so the label reads hand made.
function drawLabel(ctx, group, w, h) {
    const tear = (x, dir) => {
        for (let y = 0; y <= h; y += 16) ctx.lineTo(x + dir * ((y / 16) % 2 ? 10 : 0), y)
    }
    ctx.fillStyle = 'rgba(226,207,160,0.94)'
    ctx.beginPath()
    ctx.moveTo(14, 0)
    ctx.lineTo(w - 14, 0)
    tear(w - 14, 1)
    ctx.lineTo(14, h)
    for (let y = h; y >= 0; y -= 16) ctx.lineTo(14 - ((y / 16) % 2 ? 10 : 0), y)
    ctx.fill()
    ctx.fillStyle = '#24180f'
    ctx.font = `600 84px ${SANS}`
    let x = 60
    ;[...group.title.toUpperCase()].forEach((ch, k) => {
        ctx.save()
        ctx.translate(x, h * 0.74 + Math.sin(k * 2.1) * 3)
        ctx.rotate(Math.sin(k * 1.7) * 0.05)
        ctx.fillText(ch, 0, 0)
        ctx.restore()
        x += ctx.measureText(ch).width + 4
    })
}

export const labelWidth = (ctx, group) => {
    ctx.font = `600 84px ${SANS}`
    return Math.min(WIDTH, Math.ceil(ctx.measureText(group.title.toUpperCase()).width + group.title.length * 4 + 120))
}

// Shelf packing: tallest cells first, left to right, a new shelf when a row is full.
function pack(items, width) {
    const sorted = [...items].sort((a, b) => b.h - a.h)
    let x = 0
    let y = 0
    let row = 0
    for (const item of sorted) {
        if (x + item.w > width) {
            x = 0
            y += row + GAP
            row = 0
        }
        Object.assign(item, { x, y })
        x += item.w + GAP
        row = Math.max(row, item.h)
    }
    return y + row
}

export const loadFonts = () =>
    Promise.all(
        [`400 100px ${SERIF}`, `italic 400 100px ${SERIF}`, `400 32px ${SANS}`, `600 32px ${SANS}`, `500 24px ${MONO}`, `400 24px ${MONO}`].map((f) =>
            document.fonts.load(f)),
    ).catch(() => {})

// The pictures of every pin, in pin order: the cover for a hero, the thumb for a card.
export const loadPictures = (pins, images) =>
    Promise.all(pins.map((pin) => loadImage(pin.kind === 'hero' ? images[pin.id]?.cover : pin.kind === 'card' ? images[pin.id]?.thumb : null)))

// The faces of one pin, each with its full size and a draw call. A note takes its tint by
// its place among the notes.
function facesOf(pin, pic, note) {
    if (pin.kind === 'card') return [{ key: pin.id, size: SIZE.card, draw: (ctx, w, h) => drawCard(ctx, pin, pic, w, h) }]
    if (pin.kind === 'note') return [{ key: pin.id, size: SIZE.note, draw: (ctx, w, h) => drawNote(ctx, pin, note, w, h) }]
    return [
        { key: pin.id, size: SIZE.cover, draw: (ctx, w, h) => drawCover(ctx, pin, pic, w, h) },
        { key: `${pin.id}:strip`, size: SIZE.strip, draw: (ctx, w, h) => drawStrip(ctx, pin, w, h) },
    ]
}

const cellOf = (item, width, height) => ({
    u: item.x / width,
    v: 1 - (item.y + item.h) / height,
    du: item.w / width,
    dv: item.h / height,
    aspect: item.w / item.h,
})

// Draws one face into its cell at a scale of its full size. Each draw sets its own fonts, so
// the scale only maps the full-size coordinates onto the cell.
function paint(ctx, item, scale) {
    ctx.save()
    ctx.translate(item.x, item.y)
    ctx.scale(scale, scale)
    item.draw(ctx, item.w / scale, item.h / scale)
    ctx.restore()
}

// The overview atlas. Returns the texture and the cell of every face by key.
export function drawAtlas({ pins, groups, pictures, anisotropy }) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const width = WIDTH * ATLAS_SCALE
    const items = []
    let notes = 0
    pins.forEach((pin, i) => {
        for (const face of facesOf(pin, pictures[i], pin.kind === 'note' ? notes++ : 0)) {
            items.push({ ...face, w: Math.round(face.size[0] * ATLAS_SCALE), h: Math.round(face.size[1] * ATLAS_SCALE) })
        }
    })
    groups.forEach((group) => {
        const size = [labelWidth(ctx, group), SIZE.label[1]]
        items.push({ key: `group:${group.id}`, draw: (c, w, h) => drawLabel(c, group, w, h), w: Math.round(size[0] * ATLAS_SCALE), h: Math.round(size[1] * ATLAS_SCALE) })
    })
    canvas.width = width
    canvas.height = pack(items, width) + GAP
    const cells = new Map()
    for (const item of items) {
        paint(ctx, item, ATLAS_SCALE)
        cells.set(item.key, cellOf(item, width, canvas.height))
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = anisotropy
    return { texture, cells }
}

// A sharp page: draws the faces of one pin at full size into the page canvas and returns the
// cell of each face by key. The page keeps no mipmaps, because it only shows close up.
export function drawSharp(canvas, pin, pic, note) {
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const cells = new Map()
    let y = 0
    for (const face of facesOf(pin, pic, note)) {
        const item = { ...face, x: 0, y, w: face.size[0], h: face.size[1] }
        paint(ctx, item, 1)
        cells.set(item.key, cellOf(item, canvas.width, canvas.height))
        y += item.h + GAP
    }
    return cells
}
