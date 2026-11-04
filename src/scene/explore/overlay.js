import './explore.css'

// The walk's few words on screen: the leave button, the zone prompt, the touch joystick and a
// short hint of the controls. Plain DOM in the explore chunk, so the shell stays small. The
// glass and brass rules hold (docs/design-system.md): flat fills, no gradients.

const touch = () => window.matchMedia('(pointer: coarse)').matches
// The hint fades after this many milliseconds.
const HINT_MS = 6000

export function createOverlay({ onUse, onLeave }) {
    const root = document.createElement('div')
    root.className = 'walk-ui'
    root.dataset.walkUi = ''
    root.hidden = true

    const leave = document.createElement('button')
    leave.type = 'button'
    leave.className = 'action walk-leave'
    leave.textContent = 'stop walking'
    leave.addEventListener('click', onLeave)

    const prompt = document.createElement('button')
    prompt.type = 'button'
    prompt.className = 'frame walk-prompt'
    prompt.hidden = true
    prompt.addEventListener('click', onUse)

    const hint = document.createElement('p')
    hint.className = 'walk-hint'

    const ring = document.createElement('div')
    ring.className = 'walk-stick'
    ring.hidden = true
    const knob = document.createElement('div')
    knob.className = 'walk-knob'
    ring.append(knob)

    root.append(leave, prompt, hint, ring)
    document.body.append(root)

    let hintTimer = 0
    let shownLabel = null

    const show = (on) => {
        root.hidden = !on
        clearTimeout(hintTimer)
        if (!on) return
        hint.textContent = touch()
            ? 'drag on the left to walk, push far to run, two fingers to turn'
            : 'WASD to walk, Shift to run, Q and E to turn, Esc to stop'
        hint.classList.remove('walk-hint-gone')
        hintTimer = setTimeout(() => hint.classList.add('walk-hint-gone'), HINT_MS)
    }

    // label: the zone's action, or null for no prompt.
    const setPrompt = (label) => {
        if (label === shownLabel) return
        shownLabel = label
        prompt.hidden = !label
        if (!label) return
        prompt.replaceChildren()
        if (!touch()) {
            const key = document.createElement('kbd')
            key.textContent = 'E'
            prompt.append(key, ' ')
        }
        prompt.append(label)
    }

    // stick: the joystick state from controls.js.
    const setStick = (stick, reach) => {
        ring.hidden = !stick.shown
        if (!stick.shown) return
        ring.style.transform = `translate(${stick.x0}px, ${stick.y0}px)`
        knob.style.transform = `translate(${stick.x * reach}px, ${-stick.y * reach}px)`
    }

    const dispose = () => {
        clearTimeout(hintTimer)
        root.remove()
    }

    return { show, setPrompt, setStick, dispose }
}
