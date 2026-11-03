// The gate meter: the load share the lantern shows. Name.vue feeds it the real share, and it
// drives the art with Web Animations on transform and opacity only. The compositor runs those,
// so the meter keeps moving while the main thread downloads, parses, builds or compiles.
//
// Each plan replaces the running animations with one long animation that starts at the value
// and the speed shown now. The value follows a goal like a critically damped spring, so a new
// share changes the speed and never the value. The goal never falls below the real share, and
// while work is pending it creeps on past it, toward CAP and no further, so the lamp keeps
// brightening through a long download or compile. The goal carries over from plan to plan:
// a plan that started the creep again from the value made a meter that planned often crawl.
// The value never moves backwards. Only finish() takes it to 1.

// The most the meter shows before the load is done.
const CAP = 0.96
// How far past the real share the goal heads, and the time constant of its creep in seconds.
const LEAD = 0.15
const CREEP_S = 14
// The goal heads at least this share of the way from itself to CAP, so a goal ahead of the
// real share still creeps. With CREEP_S this makes a time constant of about 90 seconds.
const MIN_CREEP = 0.15
// The spring stiffness, 1/s. A larger value follows the goal more closely.
const STIFFNESS = 1.8
// One plan covers this long. A new share or the refresh in Name.vue plans again long before.
const HORIZON_S = 90
// Keyframes per plan. They crowd at the start, where the speed changes most.
const KEYS = 72
const STEP_S = 1 / 240
// The final run to 1, in milliseconds, longer from further back.
const FINISH_MS = { base: 450, range: 900 }

// The value, its speed per second and the goal of a plan at a time on the document timeline.
const sample = (plan, time) => {
    const tau = Math.max(0, (time - plan.start) / 1000)
    const { times, values, goals = values } = plan
    const last = times.length - 1
    if (tau >= times[last]) return { value: values[last], speed: 0, goal: goals[last] }
    let i = 1
    while (times[i] < tau) i++
    const k = (tau - times[i - 1]) / (times[i] - times[i - 1])
    const speed = (values[i] - values[i - 1]) / (times[i] - times[i - 1])
    return { value: values[i - 1] + k * (values[i] - values[i - 1]), speed, goal: goals[i - 1] + k * (goals[i] - goals[i - 1]) }
}

// Key times from 0 to the horizon, close together at the start.
const keyTimes = (horizon) => Array.from({ length: KEYS + 1 }, (_, i) => horizon * (i / KEYS) ** 2)

// Integrates the creeping goal and the spring that follows it, and keeps the value monotonic
// and under CAP. The goal moves by its own rule at each step, so how often the meter plans
// does not change how fast it creeps.
function follow(from, speed, goalNow, real) {
    const start = Math.max(from, goalNow, Math.min(real, CAP))
    const times = keyTimes(HORIZON_S)
    const values = [from]
    const goals = [start]
    let x = from
    let v = Math.max(0, speed)
    let tau = 0
    let g = start
    for (let i = 1; i < times.length; i++) {
        while (tau < times[i]) {
            const heading = Math.max(Math.min(CAP, real + LEAD), g + MIN_CREEP * (CAP - g))
            g += ((heading - g) / CREEP_S) * STEP_S
            // The value cannot go back, so the speed stays at zero or above. A value past the
            // goal then waits for the goal, and starts again from rest.
            v = Math.max(0, v + (STIFFNESS * STIFFNESS * (g - x) - 2 * STIFFNESS * v) * STEP_S)
            x = Math.min(CAP, x + v * STEP_S)
            tau += STEP_S
        }
        values.push(x)
        goals.push(g)
    }
    return { times, values, goals }
}

// A cubic from the value and speed now to 1 at rest.
function finishCurve(from, speed) {
    const duration = (FINISH_MS.base + FINISH_MS.range * (1 - from)) / 1000
    const times = Array.from({ length: 25 }, (_, i) => (duration * i) / 24)
    const m = Math.max(0, speed) * duration
    let last = from
    const values = times.map((t) => {
        const s = t / duration
        const h = (2 * s ** 3 - 3 * s ** 2 + 1) * from + (s ** 3 - 2 * s ** 2 + s) * m + (-2 * s ** 3 + 3 * s ** 2)
        last = Math.min(1, Math.max(last, h))
        return last
    })
    return { times, values }
}

// Reads the plan that the art's own CSS animation runs before this bundle loads, from its
// keyframes. Those keyframes are linear, as a plan's are.
function cssPlan(probe) {
    const css = probe?.getAnimations().find((a) => a.animationName === 'ga-dawn-lit')
    const timing = css?.effect?.getTiming()
    if (!css || css.startTime === null || !timing?.duration) return null
    const seconds = timing.duration / 1000
    const frames = css.effect.getKeyframes()
    return {
        start: css.startTime + (timing.delay ?? 0),
        times: frames.map((f) => f.computedOffset * seconds),
        values: frames.map((f) => Number(f.opacity)),
    }
}

/**
 * @param {{ el: Element, frame: (p: number) => Keyframe }[]} tracks Each element and its look at share p.
 * @param {Element | null} probe The element whose dawn animation index.html starts.
 */
export function createGateMeter(tracks, probe = null) {
    const live = tracks.filter((track) => track.el)
    let plan = cssPlan(probe) ?? { start: 0, times: [0], values: [0] }
    let running = []
    let done = false

    // The time now, on the document timeline's clock. The timeline itself holds the time of the
    // last frame, which a long task leaves far behind: a plan made late in a long task then
    // started in the past, and the run to 1 was over before its first frame. A plan that starts
    // now lies a little ahead of the timeline, and fills backwards until the timeline gets there.
    const now = () => performance.now()

    // Starts every track on the same plan, then drops the old animations in the same task, so
    // no frame shows the base style between them. The first plan also drops the dawn: Chrome
    // keeps a script animation off the compositor while a CSS animation runs on the same
    // property of the same element, and the meter then froze in every long task.
    const play = (next) => {
        const duration = next.times[next.times.length - 1] * 1000
        const old = running
        running = live.map(({ el, frame }) => {
            const keys = next.values.map((value, i) => ({ ...frame(value), offset: duration ? (next.times[i] * 1000) / duration : 1 }))
            const animation = el.animate(keys.length > 1 ? keys : [keys[0], keys[0]], { duration: Math.max(1, duration), fill: 'both' })
            animation.startTime = next.start
            return animation
        })
        old.forEach((animation) => animation.cancel())
        if (!old.length) live.forEach(({ el }) => el.getAnimations().forEach((a) => a.animationName?.startsWith('ga-dawn') && a.cancel()))
        plan = next
    }

    return {
        // The value the meter shows now, 0 to 1.
        shown: () => sample(plan, now()).value,
        // Plans from the value shown now toward the real share.
        update(real) {
            if (done) return
            const time = now()
            const { value, speed, goal } = sample(plan, time)
            play({ start: time, ...follow(value, speed, goal, real) })
        },
        // Runs to 1 and resolves when the meter shows it. Instant when nothing shows yet, as on a
        // second greeting.
        finish({ instant = false } = {}) {
            done = true
            const run = () => {
                const time = now()
                const { value, speed } = sample(plan, time)
                play({ start: time, ...(instant ? { times: [0], values: [1] } : finishCurve(value, speed)) })
                return Promise.all(running.map((animation) => animation.finished.catch(() => {}))).then(() => {})
            }
            if (instant) return run()
            // The run to 1 starts in a task of its own. New animations reach the compositor only
            // when the task that made them ends, so work that went on in the caller's task kept
            // the run off the screen until it was over, and the meter jumped to 1.
            return new Promise((resolve) => setTimeout(() => run().then(resolve), 0))
        },
        stop() {
            done = true
        },
    }
}
