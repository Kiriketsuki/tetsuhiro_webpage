import * as THREE from 'three'

// The camera of direction a. The view state is a point on the cork plane at the screen centre
// and a camera distance. The camera never turns: it slides off to the side of that point a
// little as the view pans to an edge, and a lens shift keeps the point at the centre. So the
// cork plane maps to the screen by a plain scale, which keeps pan, zoom and focus exact, and
// the pins, tape and string still show their depth against the cork as the view moves.

const FOV = 30
const T = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
// The board frame half size, and how far past it a zoomed view may pan.
const BW = 0.8
const BH = 0.5
const SLACK = 0.04
// The side view at the board edge, as a share of the camera distance (about 6 degrees).
const TILT = 0.1
const SECONDS = 0.8
// The size of the biggest card, so the maximum zoom shows it at 60 percent of the short side.
const CARD = [0.178, 0.106]

const clamp = THREE.MathUtils.clamp
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export function createView(reducedMotion) {
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 20)
    const state = { x: 0, y: 0, d: 3 }
    let W = 1
    let H = 1
    let home = { ...state }
    let limits = [0.2, 4]
    let atHome = true
    let tween = null

    const kOf = (d) => (2 * d * T) / H
    const small = () => W < 768

    const apply = () => {
        const { x, y, d } = state
        const k = kOf(d)
        const ox = d * TILT * clamp(x / BW, -1, 1)
        const oy = d * TILT * clamp(y / BH, -1, 1)
        camera.position.set(x + ox, y + oy, d)
        camera.setViewOffset(W, H, -ox / k, oy / k, W, H)
    }

    // The board stays on screen: a view wider than the board keeps the whole board in it,
    // and a view narrower than the board stays over the board.
    const clamped = ({ x, y, d }) => {
        const k = kOf(d)
        const rx = Math.abs(BW - (W / 2) * k) + SLACK
        const ry = Math.abs(BH - (H / 2) * k) + SLACK
        return { x: clamp(x, -rx, rx), y: clamp(y, -ry, ry), d }
    }

    const set = (next) => {
        tween = null
        Object.assign(state, clamped(next))
        atHome = false
        apply()
    }

    const go = (to, instant) => {
        if (instant || reducedMotion) {
            tween = null
            Object.assign(state, to)
            return apply()
        }
        tween = { from: { ...state }, to, t: 0 }
    }

    // Returns true while a move runs, so the loop keeps drawing.
    const step = (dt) => {
        if (!tween) return false
        tween.t = Math.min(1, tween.t + dt / SECONDS)
        const e = ease(tween.t)
        const { from, to } = tween
        state.x = from.x + (to.x - from.x) * e
        state.y = from.y + (to.y - from.y) * e
        state.d = Math.exp(Math.log(from.d) + (Math.log(to.d) - Math.log(from.d)) * e)
        if (tween.t >= 1) tween = null
        apply()
        return true
    }

    const resize = (w, h) => {
        W = w
        H = h
        camera.aspect = W / H
        // A phone fits the board width to the screen and keeps the board in the upper half.
        // A wide screen fits the frame and the picture light above it, with a small margin.
        const k = small() ? 1.6 / (0.96 * W) : Math.max(1.74 / W, 1.3 / H)
        const d = (k * H) / (2 * T)
        home = { x: 0, y: small() ? -0.22 * H * k : 0.06, d }
        const near = W >= H ? CARD[1] / 0.6 / H : CARD[0] / 0.6 / W
        limits = [(near * H) / (2 * T), d * 1.08]
        Object.assign(state, atHome ? home : clamped(state))
        tween = null
        apply()
    }

    const toScreen = (wx, wy) => {
        const k = kOf(state.d)
        return [W / 2 + (wx - state.x) / k, H / 2 - (wy - state.y) / k]
    }

    const pan = (dx, dy) => {
        const k = kOf(state.d)
        set({ x: state.x - dx * k, y: state.y + dy * k, d: state.d })
    }

    const zoom = (factor, sx, sy) => {
        const k = kOf(state.d)
        const wx = state.x + (sx - W / 2) * k
        const wy = state.y - (sy - H / 2) * k
        const d = clamp(state.d / factor, ...limits)
        const k2 = kOf(d)
        set({ x: wx - (sx - W / 2) * k2, y: wy + (sy - H / 2) * k2, d })
    }

    // The pin fills the space the detail sheet leaves free: left of the sheet on a wide
    // screen, the top 28 percent on a phone.
    const focusOn = ({ x, y, w, h }, instant) => {
        const sheet = Math.min(420, 0.4 * W) + 32
        const area = small() ? { cx: W / 2, cy: 0.14 * H, w: W * 0.8, h: 0.28 * H * 0.78 } : { cx: (W - sheet) / 2, cy: H / 2, w: (W - sheet) * 0.7, h: H * 0.66 }
        const k = Math.max(w / area.w, h / area.h)
        go({ x: x - (area.cx - W / 2) * k, y: y + (area.cy - H / 2) * k, d: (k * H) / (2 * T) }, instant)
    }

    // A pan that brings a pin inside the screen with a margin, at the same zoom.
    const reveal = ({ x, y }) => {
        const k = kOf(state.d)
        const m = Math.min(110, W * 0.2)
        const [sx, sy] = toScreen(x, y)
        const tx = clamp(sx, m, W - m)
        const ty = clamp(sy, m, H - m)
        if (tx === sx && ty === sy) return
        go(clamped({ x: x - (tx - W / 2) * k, y: y + (ty - H / 2) * k, d: state.d }))
    }

    const snapshot = () => ({ ...(tween ? tween.to : state) })

    return { camera, resize, step, pan, zoom, focusOn, reveal, go, snapshot, get moving() { return Boolean(tween) } }
}
