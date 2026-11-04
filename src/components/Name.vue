<template>
    <div ref="gate" class="gate" :class="{ 'is-ready': full }" role="dialog" aria-modal="true" aria-labelledby="gate-name">
        <header class="gate-title">
            <h1 id="gate-name">
                <span class="gate-eyebrow">Lim Zhe Hong</span>
                <span class="gate-name">Jovian</span>
            </h1>
            <p class="gate-role">software engineer &middot; singapore</p>
        </header>

        <div class="gate-foot">
            <!-- One live line carries the state for screen readers. The count on screen lives in
                 index.html and only fades, which a screen reader does not announce. -->
            <p class="sr-only" aria-live="polite">{{ loadError || (full ? 'the fire is lit' : 'kindling the fire') }}</p>
            <p v-if="loadError" class="gate-error">{{ loadError }}</p>

            <button
                ref="enter"
                type="button"
                class="gate-enter"
                :disabled="!full"
                :aria-label="full ? 'Enter the aerie' : 'Still loading'"
                @click="lift"
            >
                enter the aerie
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            <p class="gate-hint" aria-hidden="true">or press enter</p>
        </div>
    </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import gsap from 'gsap'
import { useWaypoints } from '../composables/useWaypoints.js'
import { createGateMeter } from './gate-meter.js'
import { createFiresideKinako } from './gate-kinako.js'

const emit = defineEmits(['lifted'])
const { ready, progress, entered, loadError, reducedMotion } = useWaypoints()

// The fireside art lives in index.html, so it paints before this bundle loads. Its styles sit
// there too. On a visit that starts on another page it waits there, hidden.
const art = document.getElementById('gate-art')

const gate = ref(null)
const enter = ref(null)
// True once the meter shows the load done. The fire is at full blaze and the way in opens.
const full = ref(false)

// The share of the meter that the fonts and the next pages take. The scene, the wall and
// the camera planner take the rest (src/three.js).
const VISIT_SHARE = 0.05
// The least time between two meter plans, and the longest, in milliseconds.
const PLAN_MS = { min: 200, max: 8000 }

// The fonts and the pages a visitor opens next load behind the gate too. They start once the
// aerie has downloaded (the real share passes DOWNLOADED, half of SCENE_SHARE in src/three.js),
// so the aerie gets the bandwidth first.
const DOWNLOADED = 0.37
// The longest the gate waits for them, in milliseconds.
const VISIT_WAIT_MS = 8000
let visitShare = 0
let visitLoaded = null
const kinako = createFiresideKinako(art)
const preloadVisit = () => {
    const loads = [
        ...[...document.fonts].map((face) => face.load()),
        import('../views/Skills.vue'),
        import('../views/Projects.vue'),
        import('../views/AboutRoom.vue'),
        // The logos on the skill sky cards, which otherwise load when the first card opens.
        import('../data/skill-icons.js'),
    ].map((load) => load.catch(() => {}))
    let left = loads.length
    loads.forEach((load) =>
        load.then(() => {
            visitShare = 1 - --left / loads.length
            plan()
        })
    )
    return Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, VISIT_WAIT_MS))])
}

// Each element's look at share p. scripts/gate-fireside-pack.py writes the dawn keyframes that
// play the same functions before this bundle loads, so the meter takes over with no jump.
const clamp = (v) => Math.min(1, Math.max(0, v))
// The whole number the count shows at share p.
const count = (p) => Math.min(100, Math.floor(p * 100 + 1e-6))
// The fire stages: each peaks at its own share and hands over to the next.
const STAGES = 4
// The pawprints of the ring and the groups of leaves in the updraft.
const PAWS = 24
const RISE = 3
let meter = null
const tracks = () => {
    const pick = (selector) => art?.querySelector(selector) ?? null
    const all = (selector) => [...(art?.querySelectorAll(selector) ?? [])]
    return [
        { el: pick('.ga-glow'), frame: (p) => ({ opacity: p }) },
        { el: pick('.ga-title .is-lit'), frame: (p) => ({ opacity: p }) },
        ...Array.from({ length: STAGES }, (_, s) => ({ el: pick(`.ga-fire-${s}`), frame: (p) => ({ opacity: clamp(1 - Math.abs(p - s / (STAGES - 1)) * (STAGES - 1)) }) })),
        ...all('.ga-paw').map((el, i) => ({ el, frame: (p) => ({ opacity: clamp(p * PAWS - i) }) })),
        ...Array.from({ length: RISE }, (_, g) => ({ el: pick(`.ga-rise-${g}`), frame: (p) => ({ opacity: clamp(p * RISE - g) }) })),
        // The count shows one whole number at a time. Each digit place shows one digit with an
        // opacity step, so it never rests between two numbers.
        ...all('.ga-ones i').map((el, d) => ({ el, steps: 100, frame: (p) => ({ opacity: count(p) % 10 === d ? 1 : 0 }) })),
        ...all('.ga-tens i').map((el, d) => ({ el, steps: 100, frame: (p) => ({ opacity: count(p) >= 10 && Math.floor(count(p) / 10) % 10 === d ? 1 : 0 }) })),
        { el: pick('.ga-hund i'), steps: 100, frame: (p) => ({ opacity: count(p) === 100 ? 1 : 0 }) },
    ]
}

// Plans the meter toward the real share, at most once per PLAN_MS.min. A long task delays the
// timer, and the running animation carries the meter until then.
let planTimer = 0
let refresh = 0
const plan = () => {
    if (planTimer || !meter) return
    planTimer = setTimeout(() => {
        planTimer = 0
        meter?.update(realShare())
    }, PLAN_MS.min)
}
const realShare = () => progress.value * (1 - VISIT_SHARE) + visitShare * VISIT_SHARE
watch(progress, (value) => {
    if (value >= DOWNLOADED) visitLoaded ??= preloadVisit()
    plan()
})

// The time the art takes to leave: the push into the fire glow, then the fade in index.html.
const LEAVE_MS = { motion: 2000, still: 700 }

// Resolves after the next two frames and an idle moment. A font that arrives last makes the
// scene draw its labels again and upload them in the next frame, a long task on a slow phone.
// That frame lands here, under the creeping meter, and not on the run to 1. A hidden tab has
// no frames, so a timer stands in after SETTLE_MS.
const SETTLE_MS = 3000
const settled = () =>
    new Promise((resolve) => {
        const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(resolve, { timeout: 1500 }) : setTimeout(resolve, 50))
        requestAnimationFrame(() => requestAnimationFrame(idle))
        setTimeout(resolve, SETTLE_MS)
    })

// At ready the meter runs to 1, once the fonts and the next pages are in too. After a failed
// load the meter does not wait for them.
watch(ready, async (value) => {
    if (!value || !meter) return
    if (!loadError.value) {
        await (visitLoaded ??= preloadVisit())
        await settled()
    }
    await meter.finish()
    full.value = true
})

// The button takes focus as soon as it works, so Enter goes straight in. Kinako finishes its
// lap and sits by the fire. After a failed load Kinako naps on, so the error stays the news.
watch(full, async (value) => {
    if (!value) return
    clearTimeout(planTimer)
    clearInterval(refresh)
    art?.classList.add('is-lit')
    await nextTick()
    enter.value?.focus({ preventScroll: true })
    if (!entered.value && !loadError.value) kinako.sit(reducedMotion.value)
})

// The pointer moves the near layers more than the far ones, so the picture reads as deep. Each
// move eases in through a transform transition, which the compositor runs.
const DEPTH = { near: [14, 9], far: [5, 3] }
let tilt = 0
const lean = (event) => {
    if (tilt || !art) return
    tilt = requestAnimationFrame(() => {
        tilt = 0
        const x = event.clientX / window.innerWidth - 0.5
        const y = event.clientY / window.innerHeight - 0.5
        const near = art.querySelector('.ga-view')
        const far = art.querySelector('.ga-far-view')
        if (near) near.style.transform = `translate(${-x * DEPTH.near[0]}px, ${-y * DEPTH.near[1]}px)`
        if (far) far.style.transform = `translate(${-x * DEPTH.far[0]}px, ${-y * DEPTH.far[1]}px)`
    })
}
const finePointer = () => window.matchMedia('(pointer: fine)').matches

// A second greeting, from the nav campfire, finds the art hidden and fades it back in, with
// Kinako sat by a full fire.
onMounted(() => {
    if (!art) return
    if (art.hidden || art.classList.contains('is-open')) {
        art.classList.remove('is-open', 'is-lit')
        art.hidden = false
        // A visit that started on another page has not loaded the art files yet.
        art.load?.()
        kinako.reset()
        art.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion.value ? 0 : 700 })
    }
    if (finePointer() && !reducedMotion.value) window.addEventListener('pointermove', lean, { passive: true })
    // The meter goes on from the dawn in index.html. A second greeting shows it full at once.
    meter = createGateMeter(tracks(), art.querySelector('.ga-glow'))
    if (ready.value) {
        meter.finish({ instant: true })
        full.value = true
        return
    }
    meter.update(progress.value * (1 - VISIT_SHARE))
    // A plan covers 90 seconds. A load with no news for that long still creeps on.
    refresh = setInterval(plan, PLAN_MS.max)
    // The shell has started: Kinako wakes as soon as its frames are in.
    kinako.start(reducedMotion.value)
})

onBeforeUnmount(() => {
    window.removeEventListener('pointermove', lean)
    cancelAnimationFrame(tilt)
    clearTimeout(planTimer)
    clearInterval(refresh)
    meter?.stop()
})

// The camera starts moving as the view pushes into the fire glow, not after it.
const lift = () => {
    if (!full.value || entered.value) return
    entered.value = true
    art?.classList.add('is-open')
    gsap.to(gate.value, { autoAlpha: 0, duration: reducedMotion.value ? 0.3 : 0.8, ease: 'power2.in' })
    setTimeout(
        () => {
            if (art) art.hidden = true
            emit('lifted')
        },
        reducedMotion.value ? LEAVE_MS.still : LEAVE_MS.motion
    )
}
</script>
