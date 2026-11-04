// Kinako at the fireside gate (index.html, #gate-art). Kinako naps by the fire from the first
// paint. Once its frames have loaded it wakes, stretches and runs laps round the fire while the
// aerie loads. When the load is done it finishes its lap at the near side of the fire and sits
// there, facing the visitor, until the visitor goes in.
//
// index.html holds every frame and every lap animation. This module only switches the state
// classes on the art and steps the wake frames. Every motion is a transform or an opacity, so
// the compositor keeps it going while the main thread builds the scene.
//
// The lap keyframes run from the sit point round to the sit point (scripts/gate-fireside.py),
// so a lap that stops at the end of an iteration leaves Kinako on the sit point. The stop is set
// on the animations themselves, so a busy main thread cannot make Kinako overshoot.

// The wake frames and how long each holds, in seconds: the nap, the head up, the stretch and
// the stand. The row is k-wake in public/gate/fireside/.
const WAKE = [0.25, 0.4, 0.5, 0.25]
// The fade between two states, in milliseconds.
const SWAP_MS = 250
// The longest Kinako waits for its sit frames once the load is done, in milliseconds. Past it,
// Kinako stays as it is. The wake has no limit: on a slow line the run frames can arrive late,
// and Kinako still wakes and runs if the load is not done by then.
const SIT_WAIT_MS = 60000

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const within = (promise, ms) => Promise.race([promise.then(() => true), wait(ms).then(() => false)])

/** @param {HTMLElement | null} art The #gate-art element of index.html. */
export function createFiresideKinako(art) {
    let state = 'nap'
    let started = null
    // True once the load is done. A wake that has not begun by then does not begin.
    let done = false
    let waking = false
    const has = (flag) => art?.when?.(flag) ?? Promise.resolve()
    const set = (next) => {
        if (!art) return
        art.classList.toggle('is-waking', next === 'wake')
        art.classList.toggle('is-running', next === 'run')
        art.classList.toggle('is-sat', next === 'sit')
        state = next
    }

    // The CSS animations of the lap. They start together when is-running goes on.
    const lapAnimations = () =>
        [...(art?.querySelectorAll('.ga-lap') ?? [])].flatMap((lap) => lap.getAnimations({ subtree: true })).filter((a) => a.animationName !== 'ga-gait')

    async function wake() {
        const row = art.querySelector('.ga-k-nap .ga-k-row')
        const total = WAKE.reduce((sum, s) => sum + s, 0)
        let at = 0
        const keys = WAKE.map((s, i) => {
            const key = { transform: `translateX(${(-100 * i) / WAKE.length}%)`, offset: at / total, easing: 'step-end' }
            at += s
            return key
        })
        keys.push({ ...keys[keys.length - 1], offset: 1 })
        set('wake')
        await row.animate(keys, { duration: total * 1000, fill: 'forwards' }).finished.catch(() => {})
    }

    return {
        // Wakes Kinako and starts the laps once the frames are in. Under reduced motion
        // Kinako naps on until the load is done.
        start(reduced) {
            if (!art || reduced || started) return
            started = has('has-run').then(async () => {
                if (done || state !== 'nap') return
                waking = true
                await wake()
                if (state === 'wake') set('run')
            })
        },
        // Kinako sits on the near side of the fire. A running Kinako finishes its lap first.
        // Resolves once Kinako sits, or at once if its frames never arrive.
        async sit(reduced) {
            if (!art || state === 'sit') return
            done = true
            if (!(await within(has('has-sit'), SIT_WAIT_MS))) return
            // The sit frames load after the run frames, so a wake has begun by now or never will.
            if (waking) await started
            if (state === 'run' && !reduced) {
                const lap = lapAnimations()
                const spin = lap.find((a) => a.animationName === 'ga-spin')
                if (spin) {
                    const iteration = Math.floor(spin.effect.getComputedTiming().currentIteration ?? 0)
                    lap.forEach((a) => a.effect.updateTiming({ iterations: iteration + 1, fill: 'forwards' }))
                    await spin.finished.catch(() => {})
                }
            }
            set('sit')
            await wait(SWAP_MS)
        },
        // A second greeting finds Kinako sat by the fire at once.
        reset() {
            started = Promise.resolve()
            done = true
            set('sit')
        },
    }
}
