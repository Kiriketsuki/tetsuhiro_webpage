import './explore.css'

// The walk's few words on screen: the leave button, the zone prompt, the touch pad and a short
// hint of the controls. On a touch screen the pad always shows in the lower left, so the thumb
// knows where to go. Plain DOM in the explore chunk, so the shell stays small. The
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
    ring.className = 'walk-stick walk-pad'
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
        ring.hidden = !touch()
        hint.textContent = touch()
            ? 'push the pad to walk, push far to run, drag anywhere to look round'
            : 'WASD to walk, Shift to run, drag to look round, Esc to stop'
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

    // stick: the pad state from controls.js. The knob rests in the middle of the fixed pad.
    const setStick = (stick, reach) => {
        knob.style.transform = stick.shown ? `translate(${stick.x * reach}px, ${-stick.y * reach}px)` : ''
    }

    // The centre of the pad on screen, in client pixels, or null when no pad shows.
    const padCentre = () => {
        if (root.hidden || ring.hidden) return null
        const box = ring.getBoundingClientRect()
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    }

    const dispose = () => {
        clearTimeout(hintTimer)
        root.remove()
    }

    return { show, setPrompt, setStick, padCentre, dispose }
}
