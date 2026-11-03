// The lamp switch between two scenes. The light of the room dims to a low level, the scenes
// swap at that dark point, and a lamp in the new scene warms up like an incandescent bulb.
// The way back runs the same track in reverse: the lamp cools with a short afterglow, the
// scenes swap at the dark point, and the room fades back up. scene-manager.js loads this
// module in its own chunk. The wall in the workshop uses it, and any other room can too.
//
// One number p holds the place on the track. 0 is the room at full light, 1 is the dark point
// on both sides of the swap, and 2 is the lamp at its steady state. A new switch starts from
// the place that the last one reached, so a visitor who turns back halfway sees no jump.
//
// Flash safety. Each switch moves p one way only, so it makes one change of light and never a
// flicker, well inside WCAG 2.3.1. Every curve ends on its steady state and never passes it,
// so the lamp never shines brighter than its steady state and the room never comes back
// brighter than it was. The curves start and end with a soft slope, so the mean light of the
// screen changes by a small step per frame.

// Seconds for each phase, and the dark point as a share of the full room light in linear
// light. A share of 0.042 looks like about a quarter of the light, because the eye reads light
// on a curve. blend: the seconds of the still that blends the two dark frames at the swap.
// Reduced motion takes a slower and shallower switch. The lamp probe of November 2026 set
// these: 0.5 s for the dim and 0.6 s for the rise keep every 60 Hz frame within 2 percent of
// the luma range.
export const TIMING = {
    full: { dim: 0.5, warm: 1.1, cool: 0.7, rise: 0.6, dark: 0.042, blend: 0.3 },
    reduced: { dim: 0.9, warm: 1.8, cool: 1.1, rise: 0.9, dark: 0.1, blend: 0.5 },
}
// The filament glow at the dark point, as a share of its steady glow. The screen keeps this
// faint warm point while both scenes are at their darkest.
export const FILAMENT_FLOOR = 0.14
// A deep amber in linear RGB, about the colour of a filament at 1900 K. The lamp starts here
// and warms toward its steady colour.
const AMBER = [1, 0.25, 0.03]

// The longest step one frame takes, in seconds. A long frame, such as the one in which a route
// change mounts its page, then moves the light by a small step and never jumps it.
const MAX_STEP = 1 / 30
// The power that takes linear light to about the light that the eye sees.
const GAMMA = 1 / 2.2

const clamp = (v) => Math.min(1, Math.max(0, v))
// A smoothstep and its inverse, for the dim and the rise.
const SMOOTH = { curve: (u) => u * u * (3 - 2 * u), inverse: (y) => 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3) }
// An ease out and its inverse, for the warm up and the cool down. It ends with a zero slope,
// so the light settles on its steady state with no step.
const EASE_OUT = { curve: (u) => 1 - (1 - u) ** 2, inverse: (y) => 1 - Math.sqrt(1 - y) }

// on: true for the way into the lamp scene, false for the way back to the room.
// at: the place on the track now. before: true while the old scene still shows, so the
// switch has the swap ahead of it. reduced: true for the reduced motion timing.
export function createLightSwitch({ on, at = on ? 0 : 2, before = true, reduced = false }) {
    const time = reduced ? TIMING.reduced : TIMING.full
    const phases = on
        ? [{ a: 0, b: 1, seconds: time.dim, ...SMOOTH }, { a: 1, b: 2, seconds: time.warm, ...EASE_OUT }]
        : [{ a: 2, b: 1, seconds: time.cool, ...EASE_OUT }, { a: 1, b: 0, seconds: time.rise, ...SMOOTH }]
    let index = before ? 0 : 1
    const share = (phase, p) => clamp((p - phase.a) / (phase.b - phase.a))
    let u = phases[index].inverse(share(phases[index], at))
    const place = () => (index < 2 ? phases[index].a + (phases[index].b - phases[index].a) * phases[index].curve(u) : phases[1].b)

    return {
        dark: time.dark,
        blend: time.blend,
        // Moves the switch on by dt seconds. swap is true on the one step that passes the
        // dark point, where the caller shows the other scene. done is true at the end.
        step(dt) {
            let swap = false
            if (index < 2) u += Math.min(dt, MAX_STEP) / phases[index].seconds
            while (index < 2 && u >= 1) {
                const left = (u - 1) * phases[index].seconds
                index += 1
                if (index === 1) swap = true
                u = index < 2 ? left / phases[index].seconds : 1
            }
            return { p: place(), swap, done: index === 2 }
        },
    }
}

// Lays a still of the frame over the canvas and fades it out over `seconds`, in linear steps.
// It blends a swap between two views that do not match, such as the cut that reduced motion
// makes at the dark point. The canvas keeps no drawing buffer, so `draw` renders the frame
// first. The page CSS places every canvas where the scene canvas sits.
export function fadeStill(canvas, draw, seconds) {
    draw()
    const still = Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height, className: canvas.className })
    still.setAttribute('aria-hidden', 'true')
    still.style.cssText = `visibility:visible;opacity:${getComputedStyle(canvas).opacity};pointer-events:none;transition:opacity ${seconds}s linear`
    still.getContext('2d').drawImage(canvas, 0, 0)
    canvas.after(still)
    requestAnimationFrame(() => requestAnimationFrame(() => (still.style.opacity = '0')))
    setTimeout(() => still.remove(), seconds * 1000 + 120)
}

// The share of room light at the place p, for a switch with the dark point `dark`. The level
// eases on the curve of the eye (gamma 2.2), not in linear light, so the screen darkens by
// even steps. A linear dim would drop most of the seen light in its last frames.
export const roomLight = (p, dark) => (1 - (1 - dark ** GAMMA) * clamp(p)) ** (1 / GAMMA)

// The filament glow for a lamp light level from 0 to 1, as a share of the steady glow. The
// curve is concave, so the filament leads the light on the way up and trails it on the way
// down. That trail is the afterglow.
export const filament = (light) => FILAMENT_FLOOR + (1 - FILAMENT_FLOOR) * Math.sqrt(light)

// Sets target to the colour of the lamp at a light level from 0 to 1: deep amber at first,
// the steady colour at full light. target and steady are THREE.Color objects.
export function bulbColor(target, steady, light) {
    const k = Math.sqrt(light)
    return target.setRGB(AMBER[0] + (steady.r - AMBER[0]) * k, AMBER[1] + (steady.g - AMBER[1]) * k, AMBER[2] + (steady.b - AMBER[2]) * k)
}
