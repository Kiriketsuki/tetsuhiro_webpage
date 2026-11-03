import * as THREE from 'three'
import { createPaper, layout, PX } from './dir-b-paper.js'
import { createStage } from './dir-b-scene.js'

// Direction b, paper over cork. WebGL draws the board, the lamp, the pins and the tape. The
// cards, photos and notes are DOM paper on a CSS matrix3d from the same camera, so their
// text stays sharp at every zoom. The camera faces the board square on and only moves in x,
// y and distance, so a pan, a zoom and a fit are plain sums in metres and pixels.
//
// The view is { x, y, k }: the board point at the screen centre, and k pixels per metre on
// the cork. The camera stands at distance f / k, where f is the focal length in pixels.

const FOV = 30
const FRAME = [1.6, 1.0]
// The overview also shows the brass picture light above the frame, so it fits a taller box.
const VIEW_H = 1.16
const VIEW_Y = 0.05
const CARD_W = 0.17
const EASE = 0.85
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export function createWall({ canvas, layer, groups, pins, strings, images, small, reducedMotion }) {
    const items = layout(pins, groups)
    const byId = new Map(items.map((item) => [item.id, item]))
    const paper = createPaper({ layer, items, strings, images, small })
    const overlay = document.createElement('canvas')
    overlay.className = 'wb-gl'
    const vignette = document.createElement('div')
    vignette.className = 'wb-v'
    // The paper root holds the cards and the yarn. The pin canvas and the vignette go above it.
    layer.lastElementChild.append(overlay, vignette)

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 30)
    const vp = new THREE.Matrix4()
    const view = { x: 0, y: 0, k: 1 }
    let W = 1
    let H = 1
    let f = 1
    let fit = 1
    let kmax = 1
    let tween = null
    let saved = null
    let focused = null
    let dirty = true
    let raf = 0
    let stage = null
    let resolveReady
    const ready = new Promise((resolve) => (resolveReady = resolve))

    // The free part of the screen: all of it, or the part the detail sheet leaves open.
    const free = () => {
        if (!focused) return [0, 0, W, H]
        return small ? [0, 0, W, H * 0.28] : [0, 0, W - Math.min(420, W * 0.4) - 32, H]
    }
    // A phone fits the board to its width and keeps it in the upper half of the screen.
    const overview = () => ({ x: 0, y: small ? (-0.23 * H) / fit : VIEW_Y, k: fit })

    // The board may not leave the screen. A focus view may sit outside that limit, so while a
    // pin has focus the view may still move back toward the limit and never jumps to it.
    const limit = (prev) => {
        const k = clamp(view.k, Math.min(fit, prev.k), Math.max(kmax, prev.k))
        const [x0, y0, x1, y1] = free()
        const ox = ((x0 + x1) / 2 - W / 2) / k
        const oy = -((y0 + y1) / 2 - H / 2) / k
        const lx = Math.abs(FRAME[0] / 2 - (x1 - x0) / 2 / k)
        const ly = Math.abs(FRAME[1] / 2 - (y1 - y0) / 2 / k)
        const soft = (v, p, l) => (focused ? clamp(v, Math.min(-l, p), Math.max(l, p)) : clamp(v, -l, l))
        view.k = k
        view.x = soft(view.x + ox, prev.x + ox, lx) - ox
        view.y = soft(view.y + oy, prev.y + oy, ly) - oy
    }

    const go = (target, instant, seconds = EASE) => {
        if (instant || reducedMotion) {
            Object.assign(view, target)
            tween = null
        } else tween = { from: { ...view }, to: target, start: performance.now(), seconds }
        dirty = true
    }
    const step = (now) => {
        const p = Math.min(1, (now - tween.start) / 1000 / tween.seconds)
        const e = ease(p)
        const { from, to } = tween
        view.x = from.x + (to.x - from.x) * e
        view.y = from.y + (to.y - from.y) * e
        view.k = Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e)
        if (p >= 1) tween = null
    }

    // The rotated bounds of an item in metres: [left, bottom, right, top].
    const bounds = (item) => {
        const w = (item.pw * PX) / 2
        const h = (item.ph * PX) / 2
        const c = Math.abs(Math.cos(item.t))
        const s = Math.abs(Math.sin(item.t))
        const bw = w * c + h * s
        const bh = w * s + h * c
        return [item.x - bw, item.y - bh, item.x + bw, item.y + bh]
    }

    const focusView = (item) => {
        const [x0, y0, x1, y1] = free()
        const [l, b, r, t] = bounds(item)
        // A phone has only a strip above the sheet, so the pin fills more of it there.
        const fill = small ? 0.8 : 0.6
        const k = Math.min(kmax * 1.35, (fill * (x1 - x0)) / (r - l), (fill * (y1 - y0)) / (t - b))
        return { x: item.x - ((x0 + x1) / 2 - W / 2) / k, y: item.y + ((y0 + y1) / 2 - H / 2) / k, k }
    }

    // A highlighted pin that sits off screen pulls the view just far enough to show it.
    const reveal = (item) => {
        const base = tween?.to ?? view
        const [x0, y0, x1, y1] = free()
        const m = 28 / base.k
        const [l, b, r, t] = bounds(item)
        const left = base.x + (x0 - W / 2) / base.k + m
        const right = base.x + (x1 - W / 2) / base.k - m
        const top = base.y - (y0 - H / 2) / base.k - m
        const bottom = base.y - (y1 - H / 2) / base.k + m
        const dx = r - l > right - left ? item.x - (left + right) / 2 : l < left ? l - left : r > right ? r - right : 0
        const dy = t - b > top - bottom ? item.y - (top + bottom) / 2 : b < bottom ? b - bottom : t > top ? t - top : 0
        if (dx || dy) go({ ...base, x: base.x + dx, y: base.y + dy }, false, 0.5)
    }

    const resize = () => {
        const ratio = view.k / fit
        W = innerWidth
        H = innerHeight
        small = matchMedia('(max-width: 767px)').matches
        camera.aspect = W / H
        camera.updateProjectionMatrix()
        f = H / 2 / Math.tan((FOV * Math.PI) / 360)
        fit = small ? (W - 16) / FRAME[0] : Math.min((W - 64) / FRAME[0], (H - 24) / VIEW_H)
        kmax = Math.max(fit * 1.5, (0.6 * Math.min(W, H)) / CARD_W)
        stage?.resize(W, H)
        tween = null
        if (focused) Object.assign(view, focusView(byId.get(focused)))
        else if (ratio < 1.02 || !Number.isFinite(ratio)) Object.assign(view, overview())
        else {
            const before = { ...view }
            view.k = fit * ratio
            limit(before)
        }
        dirty = true
    }

    const frame = (now) => {
        raf = requestAnimationFrame(frame)
        if (tween) step(now)
        if (!dirty || !stage) return
        dirty = Boolean(tween)
        camera.position.set(view.x, view.y, f / view.k)
        camera.updateMatrixWorld()
        vp.set(W / 2, 0, 0, W / 2, 0, -H / 2, 0, H / 2, 0, 0, 1, 0, 0, 0, 0, 1).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse)
        stage.render(camera)
        paper.place(camera, vp.elements, W, H, view.k)
        if (resolveReady) {
            resolveReady()
            resolveReady = null
        }
    }

    resize()
    ;(async () => {
        await document.fonts.ready
        paper.measure()
        stage = await createStage({ canvas, overlay, items, small })
        await paper.decoded
        resize()
        raf = requestAnimationFrame(frame)
    })().catch((error) => {
        console.error('Wall b: the wall did not start.', error)
        resolveReady?.()
    })

    const setLift = (id, z) => {
        const item = byId.get(id)
        if (!item) return
        item.z = z
        stage?.placeItem(item)
    }
    let hot = null

    return {
        ready,
        highlight(id) {
            if (hot) setLift(hot, hot === focused ? 0.006 : item0(hot))
            hot = byId.has(id) ? id : null
            paper.setHot(hot)
            if (hot) {
                setLift(hot, 0.012)
                reveal(byId.get(hot))
            }
            dirty = true
        },
        focus(id, { instant = false } = {}) {
            const item = byId.get(id)
            if (!item) return
            if (!focused) saved = { ...(tween?.to ?? view) }
            if (focused && focused !== hot) setLift(focused, item0(focused))
            focused = id
            paper.setOn(id)
            if (id !== hot) setLift(id, 0.006)
            go(focusView(item), instant)
        },
        unfocus({ instant = false } = {}) {
            if (!focused) return
            if (focused !== hot) setLift(focused, item0(focused))
            focused = null
            paper.setOn(null)
            go(saved ?? overview(), instant)
            saved = null
        },
        pan(dx, dy) {
            tween = null
            const before = { ...view }
            view.x -= dx / view.k
            view.y += dy / view.k
            limit(before)
            dirty = true
        },
        zoom(factor, x, y) {
            tween = null
            const before = { ...view }
            const bx = view.x + (x - W / 2) / view.k
            const by = view.y - (y - H / 2) / view.k
            view.k = clamp(view.k * factor, Math.min(fit, before.k), Math.max(kmax, before.k))
            view.x = bx - (x - W / 2) / view.k
            view.y = by + (y - H / 2) / view.k
            limit(before)
            dirty = true
        },
        tap: (x, y) => paper.hit(x, y),
        resize,
        dispose() {
            cancelAnimationFrame(raf)
            stage?.dispose()
            paper.dispose()
        },
    }
}

// The resting height of the paper above the cork: labels lie flatter than the cards.
const item0 = (id) => (id.startsWith('group-') ? 0.001 : 0.0015)
