// Kinako at the gate. Kinako naps on the branch while the aerie loads (index.html, .ga-kinako).
// Once the load is done, Kinako wakes, hops down onto the way in, trots along its top and sits
// at the far end. When the visitor goes in, Kinako trots on ahead and out of view.
//
// The walk uses the frame row public/gate/kinako-walk.webp (scripts/gate-kinako.py) in the
// .ga-walker box, which takes the size of the nap box. Two Web Animations run it, both on
// transform: one moves the box along the path, and one steps a window along the frame row.
// The compositor runs both, so the walk stays smooth while the main thread builds the scene.

const ROW_URL = '/gate/kinako-walk.webp'
// The frames of the row, in the order of WALK in scripts/gate-kinako.py.
const FRAME = { wake1: 0, wake2: 1, stand: 2, up: 3, down: 4, walk: 5, sit: 13 }
const COUNT = 14
const TROT_FRAMES = [5, 6, 7, 8, 9, 10, 11, 12]
// The paw line, as a share of the frame height, and the middle of the paws in the stand and
// the sit, as a share of the frame width. scripts/gate-kinako.py prints the frame box.
const FEET = 0.94
const PAWS = { stand: 0.53, sit: 0.68 }
// Seconds: each wake frame, the stand before the hop, the rise of the hop, the stand after the
// landing, one trot frame, and one trot frame on the way out.
const TIME = { wake: 0.15, stand: 0.25, rise: 0.18, land: 0.12, step: 0.075, outStep: 0.05 }
// The hop rises by this share of the frame height before it falls.
const RISE = 0.15
// The trot covers this many frame widths a second. The walk stride (0.42 m a cycle of 0.6 s,
// src/scene/explore/pose.js) over the frame width (1.03 m in lab/gate-kinako.html) gives 0.68.
// On the way out Kinako trots OUT_PACE times faster.
const TROT = 0.68
const OUT_PACE = 1.5
// Where Kinako lands on the button and where it sits, as shares of the button width.
const LAND_AT = 0.06
const SIT_AT = 0.88
// The fade between the nap and the walk, and the fades under reduced motion, in seconds.
const FADE = 0.12
const STILL_FADE = 0.4
// The longest the walk waits for its frames, in milliseconds.
const LOAD_WAIT_MS = 3000

const frameKey = (index, offset) => ({ transform: `translateX(${(-100 * index) / COUNT}%)`, offset: Math.min(1, offset), easing: 'step-end' })
const at = ([x, y]) => `translate(${x}px, ${y}px)`

// Turns segments into the two keyframe lists. A segment has a time in seconds, a path from
// 0 to 1 to a point, the samples taken along that path, and one frame or a frame cycle.
function timeline(segments) {
    const total = segments.reduce((sum, segment) => sum + segment.time, 0)
    const moves = []
    const frames = []
    let start = 0
    for (const segment of segments) {
        const samples = segment.samples ?? 1
        for (let i = moves.length ? 1 : 0; i <= samples; i++) {
            const k = i / samples
            moves.push({ transform: at(segment.path(k)), offset: Math.min(1, (start + k * segment.time) / total) })
        }
        if (segment.step) {
            for (let t = 0, j = 0; t < segment.time - 1e-6; t += segment.step, j++) {
                frames.push(frameKey(segment.frames[j % segment.frames.length], (start + t) / total))
            }
        } else {
            frames.push(frameKey(segment.frame, start / total))
        }
        start += segment.time
    }
    frames.push({ ...frames[frames.length - 1], offset: 1 })
    return { total, moves, frames }
}

// A trot from one point to another along a level line, at pace frame widths a second.
const trot = (from, to, width, pace, step) => ({
    time: Math.max(step, Math.abs(to[0] - from[0]) / (TROT * pace * width)),
    path: (k) => [from[0] + (to[0] - from[0]) * k, from[1]],
    frames: TROT_FRAMES,
    step,
})
const hold = (point, frame, time) => ({ time, path: () => point, frame })

/** @param {HTMLElement | null} art The #gate-art element of index.html. */
export function createKinakoWalk(art) {
    const nap = art?.querySelector('.ga-kinako') ?? null
    const walker = art?.querySelector('.ga-walker') ?? null
    const row = art?.querySelector('.ga-w-row') ?? null
    let loading = null
    let loaded = false
    // idle: napping. walking: on the way to the button. sitting: on it. out: gone in, or the
    // visitor went in first, so no walk starts.
    let state = 'idle'
    let running = []
    // The button of the last walk in, and whether a resize moved it during the walk.
    let lastButton = null
    let moved = false

    const stop = () => {
        running.forEach((animation) => animation.cancel())
        running = []
    }

    // Sizes the walker box to the nap box and returns the nap box.
    const fit = () => {
        const box = nap.getBoundingClientRect()
        Object.assign(walker.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` })
        return box
    }

    // The points of the walk in, relative to the nap box, for the button where it is now.
    const points = (box, button) => {
        const b = button.getBoundingClientRect()
        // The button rises into place as it shows (gate-in in index.html). Kinako lands where
        // the button comes to rest.
        const rise = new DOMMatrix(getComputedStyle(button).transform).m42
        const y = b.top - rise - (box.top + FEET * box.height)
        const land = [b.left + LAND_AT * b.width - (box.left + PAWS.stand * box.width), y]
        const sit = [b.left + SIT_AT * b.width - (box.left + PAWS.sit * box.width), y]
        // The trot ends where the sit frame puts its paws, so the sit does not jump.
        const trotEnd = [Math.max(land[0], sit[0] + (PAWS.sit - PAWS.stand) * box.width), y]
        return { land, sit: [trotEnd[0] - (PAWS.sit - PAWS.stand) * box.width, y], trotEnd }
    }

    const play = (moves, frames, total, shown) => {
        const timing = { duration: Math.max(1, total * 1000), fill: 'forwards' }
        running = [walker.animate(moves, timing), row.animate(frames, timing)]
        if (shown) {
            const fade = { duration: FADE * 1000, fill: 'forwards' }
            running.push(walker.animate([{ opacity: 0 }, { opacity: 1 }], fade), nap.animate([{ opacity: 1 }, { opacity: 0 }], fade))
        }
        return running[0].finished.catch(() => {})
    }

    // Shows Kinako sitting on the button, at once or with a short fade.
    const sitStill = (button, fade) => {
        stop()
        const box = fit()
        const { sit } = points(box, button)
        const timing = { duration: fade * 1000 || 1, fill: 'forwards' }
        running = [
            walker.animate([{ transform: at(sit), opacity: fade ? 0 : 1 }, { transform: at(sit), opacity: 1 }], timing),
            row.animate([frameKey(FRAME.sit, 0), frameKey(FRAME.sit, 1)], timing),
            nap.animate([{ opacity: 0 }, { opacity: 0 }], timing),
        ]
        state = 'sitting'
    }

    return {
        // Loads and decodes the frame row. The gate waits for it with the next pages.
        load() {
            loading ??= new Promise((resolve) => {
                if (!art) return resolve()
                const image = new Image()
                image.src = ROW_URL
                image
                    .decode()
                    .then(() => {
                        loaded = true
                        art.classList.add('has-walk')
                    })
                    .catch(() => {})
                    .finally(resolve)
            })
            return loading
        },

        // started runs once Kinako sets off, or at once under reduced motion.
        async walkIn(button, reduced, started = () => {}) {
            if (!walker || !nap || state !== 'idle') return
            if (!loaded) await Promise.race([this.load(), new Promise((resolve) => setTimeout(resolve, LOAD_WAIT_MS))])
            // Without its frames Kinako sleeps on. The button works either way.
            if (!loaded || state !== 'idle') return
            lastButton = button
            moved = false
            started()
            if (reduced) return sitStill(button, STILL_FADE)
            const box = fit()
            const { land, trotEnd, sit } = points(box, button)
            // The hop: a rise, then a fall under the same pull down to the button.
            const g = (2 * RISE * box.height) / TIME.rise ** 2
            const fall = Math.sqrt((2 * (RISE * box.height + Math.max(0, land[1]))) / g)
            const air = TIME.rise + fall
            const arc = (t) => [(land[0] * t) / air, -g * TIME.rise * t + (g * t * t) / 2]
            const { total, moves, frames } = timeline([
                hold([0, 0], FRAME.wake1, TIME.wake),
                hold([0, 0], FRAME.wake2, TIME.wake),
                hold([0, 0], FRAME.stand, TIME.stand),
                { time: TIME.rise, path: (k) => arc(k * TIME.rise), samples: 6, frame: FRAME.up },
                { time: fall, path: (k) => arc(TIME.rise + k * fall), samples: 12, frame: FRAME.down },
                hold(land, FRAME.stand, TIME.land),
                trot(land, trotEnd, box.width, 1, TIME.step),
                hold(sit, FRAME.sit, 0.01),
            ])
            state = 'walking'
            stop()
            await play(moves, frames, total, true)
            if (state !== 'walking') return
            state = 'sitting'
            // The walk ran on the points of its start. After a resize Kinako sits where the
            // button is now.
            if (moved) sitStill(button, 0)
        },

        // Trots on ahead and out of view, from wherever Kinako is.
        walkOut(reduced) {
            // A visitor who goes in before Kinako sets off leaves Kinako asleep.
            if (state === 'idle') state = 'out'
            if (!walker || reduced || (state !== 'walking' && state !== 'sitting')) return
            const now = new DOMMatrix(getComputedStyle(walker).transform)
            const box = walker.getBoundingClientRect()
            // The stand puts its paws left of the sit, so the stand moves right to match.
            const from = [now.m41 + (state === 'sitting' ? (PAWS.sit - PAWS.stand) * box.width : 0), now.m42]
            const out = [window.innerWidth - parseFloat(walker.style.left) + box.width * 0.1, from[1]]
            const { total, moves, frames } = timeline([hold(from, FRAME.stand, TIME.land), trot(from, out, box.width, OUT_PACE, TIME.outStep)])
            stop()
            state = 'out'
            running = [walker.animate(moves, { duration: total * 1000, fill: 'forwards' }), row.animate(frames, { duration: total * 1000, fill: 'forwards' })]
            // The cancel above dropped the fades, so the walker stays shown and the nap hidden.
            running.push(walker.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1, fill: 'forwards' }), nap.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' }))
        },

        // Puts a sitting Kinako back on the button after a resize.
        settle(button) {
            if (state === 'sitting') sitStill(button, 0)
            if (state === 'walking' && button === lastButton) moved = true
        },

        // Back to the nap, for a second greeting from the nav lantern.
        // The last greeting's walk may still hold its fill, so every animation on the walker,
        // the row and the nap goes, not only this instance's.
        reset() {
            stop()
            for (const el of [walker, row, nap]) el?.getAnimations().forEach((animation) => animation.cancel())
            state = 'idle'
        },
    }
}
