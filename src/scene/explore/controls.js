// The walk's input (spec, Controls): keys, the mouse, touch and a gamepad, all read into one
// intent. The session reads the intent once a frame and takes the one-shot actions.
//
// - Keys: WASD or the arrows walk, Shift runs, Q and E turn by 45 degrees, E or Enter uses a
//   zone, Escape leaves. While a zone prompt shows, E uses it instead of turning.
// - Mouse: the wheel zooms, a drag with either button orbits the camera round Kinako.
// - Touch: a fixed touch pad in the lower left (overlay.js) walks, and a far push runs. One
//   finger dragged anywhere else orbits the camera. Two fingers pinch to zoom.
// - Gamepad: the left stick walks and a far push runs, the right stick turns, the triggers zoom,
//   A uses a zone and B leaves.

const KEYS = {
    KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
}
// A push past this share of the full stick or joystick reach runs.
const RUN_PUSH = 0.85
const DEAD = 0.15
// The touch pad reach in CSS pixels. A touch within `grab` reaches of its centre takes the pad.
const STICK = { reach: 56, grab: 1.6 }
// Radians a pixel of drag turns and tilts, and radians a second of the right stick.
const DRAG_TURN = 0.006
const DRAG_TILT = 0.004
const STICK_TURN = 2.4
// Zoom per wheel step, and per second of a full trigger.
const WHEEL_ZOOM = 1.1
const TRIGGER_ZOOM = 1.8

// True for page controls that keep their own clicks and touches. The touch pad sits in the walk
// overlay but belongs to the controls.
const onControl = (target) => Boolean(target?.closest?.('a, button, input, nav, header, [data-walk-ui]')) && !target.closest('.walk-pad')

// padCentre(): the centre of the touch pad on screen, in client pixels, or null with no pad.
export function createControls({ onInput, padCentre = () => null }) {
    const held = new Set()
    const intent = { x: 0, y: 0, run: false, turn: 0, tilt: 0, turnSteps: 0, zoom: 1, use: false, leave: false }
    const stick = { id: null, x0: 0, y0: 0, x: 0, y: 0, shown: false }
    const pinch = new Map()
    let pinchSpan = 0
    let pinchMid = 0
    // A mouse drag or a one-finger camera drag: its pointer and its last position.
    let orbit = null
    let promptOpen = false
    const pad = { a: false, b: false }

    const key = (event, down) => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.target?.closest?.('input, textarea')) return
        const code = event.code
        if (KEYS[code] || code === 'ShiftLeft' || code === 'ShiftRight') {
            if (down) held.add(code)
            else held.delete(code)
        } else if (!down) {
            return
        } else if (code === 'KeyE' && promptOpen) {
            intent.use = true
        } else if (code === 'KeyE') {
            intent.turnSteps += 1
        } else if (code === 'KeyQ') {
            intent.turnSteps -= 1
        } else if (code === 'Enter') {
            intent.use = true
        } else if (code === 'Escape') {
            intent.leave = true
        } else {
            return
        }
        event.preventDefault()
        onInput()
    }
    const keyDown = (event) => key(event, true)
    const keyUp = (event) => key(event, false)
    const blur = () => held.clear()

    const wheel = (event) => {
        if (onControl(event.target)) return
        event.preventDefault()
        intent.zoom *= event.deltaY > 0 ? 1 / WHEEL_ZOOM : WHEEL_ZOOM
        onInput()
    }

    const spanOf = () => {
        const [a, b] = [...pinch.values()]
        return { span: Math.hypot(a.x - b.x, a.y - b.y), mid: (a.x + b.x) / 2 }
    }

    const orbitBy = (event) => {
        intent.turn -= (event.clientX - orbit.x) * DRAG_TURN
        intent.tilt += (event.clientY - orbit.y) * DRAG_TILT
        orbit.x = event.clientX
        orbit.y = event.clientY
    }

    const steer = (event) => {
        const dx = event.clientX - stick.x0
        const dy = event.clientY - stick.y0
        const length = Math.hypot(dx, dy)
        const k = length > STICK.reach ? STICK.reach / length : 1
        stick.x = (dx * k) / STICK.reach
        stick.y = (-dy * k) / STICK.reach
    }

    const down = (event) => {
        if (onControl(event.target)) return
        if (event.pointerType === 'mouse') {
            if (event.button === 0 || event.button === 2) orbit = { id: event.pointerId, x: event.clientX, y: event.clientY }
            return
        }
        const centre = padCentre()
        const onPad = centre && Math.hypot(event.clientX - centre.x, event.clientY - centre.y) < STICK.reach * STICK.grab
        if (onPad && stick.id === null) {
            Object.assign(stick, { id: event.pointerId, x0: centre.x, y0: centre.y, x: 0, y: 0, shown: true })
            steer(event)
            onInput()
            return
        }
        pinch.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (pinch.size === 2) {
            orbit = null
            ;({ span: pinchSpan, mid: pinchMid } = spanOf())
        } else if (pinch.size === 1) {
            orbit = { id: event.pointerId, x: event.clientX, y: event.clientY }
        }
        onInput()
    }

    const move = (event) => {
        if (event.pointerType === 'mouse') {
            if (orbit === null) return
            orbitBy(event)
            onInput()
            return
        }
        if (event.pointerId === stick.id) {
            steer(event)
            event.preventDefault()
            onInput()
            return
        }
        if (!pinch.has(event.pointerId)) return
        pinch.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (orbit && event.pointerId === orbit.id && pinch.size === 1) {
            orbitBy(event)
        } else if (pinch.size === 2) {
            const { span, mid } = spanOf()
            if (pinchSpan > 0) intent.zoom *= span / pinchSpan
            intent.turn -= (mid - pinchMid) * DRAG_TURN
            pinchSpan = span
            pinchMid = mid
        }
        event.preventDefault()
        onInput()
    }

    const up = (event) => {
        if (event.pointerType === 'mouse') {
            if (orbit && orbit.id === event.pointerId) orbit = null
            return
        }
        pinch.delete(event.pointerId)
        if (event.pointerId === stick.id) Object.assign(stick, { id: null, x: 0, y: 0, shown: false })
        if (orbit && orbit.id === event.pointerId) orbit = null
        if (pinch.size < 2) pinchSpan = 0
        onInput()
    }

    const menu = (event) => {
        if (!onControl(event.target)) event.preventDefault()
    }

    const listeners = [
        ['keydown', keyDown], ['keyup', keyUp], ['blur', blur], ['wheel', wheel, { passive: false }],
        ['pointerdown', down], ['pointermove', move, { passive: false }], ['pointerup', up], ['pointercancel', up], ['contextmenu', menu],
    ]
    let on = false
    const enable = (value) => {
        if (value === on) return
        on = value
        for (const [type, fn, options] of listeners) {
            if (value) window.addEventListener(type, fn, options)
            else window.removeEventListener(type, fn, options)
        }
        if (!value) {
            held.clear()
            pinch.clear()
            Object.assign(stick, { id: null, x: 0, y: 0, shown: false })
            orbit = null
        }
        document.documentElement.classList.toggle('walking', value)
    }

    // The first connected gamepad, read once a frame. Returns the stick walk, or null.
    const readPad = () => {
        const gamepad = navigator.getGamepads?.().find(Boolean)
        if (!gamepad) return null
        const axis = (i) => (Math.abs(gamepad.axes[i] ?? 0) > DEAD ? gamepad.axes[i] : 0)
        const button = (i) => gamepad.buttons[i]?.pressed ?? false
        const value = (i) => gamepad.buttons[i]?.value ?? 0
        if (button(0) && !pad.a) intent.use = true
        if (button(1) && !pad.b) intent.leave = true
        pad.a = button(0)
        pad.b = button(1)
        return { x: axis(0), y: -axis(1), turn: axis(2), zoom: value(7) - value(6) }
    }

    // Reads the intent for one frame of dt seconds, and clears its one-shot parts.
    const read = (dt) => {
        let x = 0
        let y = 0
        for (const code of held) {
            if (!KEYS[code]) continue
            x += KEYS[code][0]
            y += KEYS[code][1]
        }
        const keyRun = held.has('ShiftLeft') || held.has('ShiftRight')
        let push = Math.hypot(x, y) > 0 ? 1 : 0
        if (push) {
            const n = Math.hypot(x, y)
            x /= n
            y /= n
        }
        let run = keyRun
        const pads = readPad()
        if (stick.shown) {
            x = stick.x
            y = stick.y
            push = Math.hypot(x, y)
            run = push > RUN_PUSH
        } else if (pads && Math.hypot(pads.x, pads.y) > 0) {
            x = pads.x
            y = pads.y
            push = Math.min(1, Math.hypot(x, y))
            run = push > RUN_PUSH
        }
        if (pads) {
            intent.turn -= pads.turn * STICK_TURN * dt
            if (pads.zoom) intent.zoom *= TRIGGER_ZOOM ** (pads.zoom * dt)
        }
        const out = { ...intent, x, y, push, run, dragging: orbit !== null || pinch.size === 2 }
        Object.assign(intent, { turn: 0, tilt: 0, turnSteps: 0, zoom: 1, use: false, leave: false })
        return out
    }

    const setPrompt = (open) => {
        promptOpen = open
    }

    return { enable, read, setPrompt, stick, use: () => (intent.use = true), leave: () => (intent.leave = true) }
}
