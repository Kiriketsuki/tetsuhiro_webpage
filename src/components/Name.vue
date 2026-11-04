<template>
    <div
        ref="gate"
        class="gate"
        :class="{ 'is-ready': full, 'has-kinako': walking }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-name"
    >
        <header class="gate-title">
            <h1 id="gate-name">
                <span class="gate-eyebrow">Lim Zhe Hong</span>
                <span class="gate-name">Jovian</span>
            </h1>
            <p class="gate-role">software engineer &middot; singapore</p>
        </header>

        <button
            v-if="lampBox"
            type="button"
            class="gate-lantern"
            :style="lampBox"
            aria-label="Swing the lantern"
            @pointerenter="onHover"
            @click="swing"
        ></button>

        <div class="gate-foot">
            <p class="gate-readout" :class="{ 'has-error': loadError }">
                <!-- One live line carries the state for screen readers. The lines on screen share
                     one cell and only fade, which a screen reader does not announce. -->
                <span class="sr-only" aria-live="polite">{{ loadError || (full ? 'the lamps are lit' : 'lighting the lamps') }}</span>
                <span v-if="loadError" aria-hidden="true">{{ loadError }}</span>
                <template v-else>
                    <span :class="{ 'is-off': full }" aria-hidden="true">
                        lighting the lamps
                        <b><span class="gate-count"><span ref="drum" class="gate-drum"><i v-for="n in 101" :key="n">{{ n - 1 }}</i></span></span>%</b>
                    </span>
                    <span :class="{ 'is-off': !full }" aria-hidden="true">the lamps are lit</span>
                </template>
            </p>

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
import { createKinakoWalk } from './gate-kinako.js'

const emit = defineEmits(['lifted'])
const { ready, progress, entered, loadError, reducedMotion } = useWaypoints()

// The lantern art lives in index.html, so it paints before this bundle loads. Its styles sit
// there too. On a visit that starts on another page it waits there, hidden.
const art = document.getElementById('gate-art')

const gate = ref(null)
const enter = ref(null)
const drum = ref(null)
// True once the meter shows the load done. The lamp is lit and the way in opens.
const full = ref(false)
// True once Kinako sets off on the walk in.
const walking = ref(false)

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
const kinako = createKinakoWalk(art)
const preloadVisit = () => {
    const loads = [
        ...[...document.fonts].map((face) => face.load()),
        // Kinako's walk in, which plays once the load is done.
        kinako.load(),
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

// Each layer's look at share p. Every one is linear in p, so the meter plays one curve on all
// of them. The drum holds 101 numbers, so share p shows the number 100p in the window.
let meter = null
const tracks = () => {
    const pick = (selector) => art?.querySelector(selector) ?? null
    return [
        { el: pick('.ga-paper.ga-lit'), frame: (p) => ({ opacity: p }) },
        { el: pick('.ga-glow'), frame: (p) => ({ opacity: p }) },
        { el: pick('.ga-reveal'), frame: (p) => ({ transform: `translateX(${(p - 1) * 100}%)` }) },
        { el: pick('.ga-autumn'), frame: (p) => ({ transform: `translateX(${(1 - p) * 130}%)` }) },
        { el: pick('.ga-k-lit'), frame: (p) => ({ opacity: p }) },
        { el: pick('.ga-title .is-lit'), frame: (p) => ({ opacity: p }) },
        // The count shows whole numbers only, so it never shows two halves mid-roll.
        { el: drum.value, frame: (p) => ({ transform: `translateY(${(-100 * 100 * p) / 101}%)` }), steps: 100 },
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

// The time the art takes to leave: the lamp bloom, then the fade in index.html.
const LEAVE_MS = { motion: 2000, still: 700 }

// The hit area sits over the lantern in the art. The frames hang the lantern from 21% of the
// art height down to the tassel near 93%, across the middle quarter of the width.
const lampBox = ref(null)
const place = () => {
    const box = art?.querySelector('.ga-art')?.getBoundingClientRect()
    if (!box?.width) return
    lampBox.value = {
        left: `${box.left + box.width * 0.37}px`,
        top: `${box.top + box.height * 0.22}px`,
        width: `${box.width * 0.26}px`,
        height: `${box.height * 0.7}px`,
    }
}

// A hover or a tap gives the lantern a push that dies away, and the flame flares. A push from
// the left swings it right. Reduced motion keeps the flare, which does not move.
let swinging = null
const swing = (event) => {
    if (!art || entered.value) return
    art.querySelector('.ga-flare').animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.25 }, { opacity: 0 }], { duration: 1600, easing: 'ease-out' })
    if (reducedMotion.value || swinging?.playState === 'running') return
    const box = event.currentTarget.getBoundingClientRect()
    // A positive turn swings the body left, about the hook. A key press has no clientX.
    const side = event.clientX && event.clientX < box.left + box.width / 2 ? -1 : 1
    const turn = (deg) => ({ transform: `rotate(${side * deg}deg)` })
    swinging = art.querySelector('.ga-nudge').animate([turn(0), turn(7), turn(-4.5), turn(2.6), turn(-1.2), turn(0.4), turn(0)], {
        duration: 3200,
        easing: 'ease-out',
    })
}
const onHover = (event) => {
    if (event.pointerType === 'mouse') swing(event)
}

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

// The button takes focus as soon as it works, so Enter goes straight in. Once full the lantern
// stays lit until the visitor goes in, and a leaf now and then drifts down (is-lit).
watch(full, async (value) => {
    if (!value) return
    clearTimeout(planTimer)
    clearInterval(refresh)
    art?.classList.add('is-lit')
    await nextTick()
    enter.value?.focus({ preventScroll: true })
    // Kinako wakes and walks down onto the way in. The button already works. After a failed load
    // Kinako sleeps on, so the error stays in view.
    if (!entered.value && enter.value && !loadError.value) kinako.walkIn(enter.value, reducedMotion.value, () => (walking.value = true))
})

// A second greeting, from the nav lantern, finds the art hidden and fades it back in.
onMounted(() => {
    if (!art) return
    if (art.hidden || art.classList.contains('is-open')) {
        art.classList.remove('is-open', 'is-lit')
        art.hidden = false
        // A visit that started on another page has not loaded the art files yet.
        if (!art.classList.contains('is-sharp')) art.load?.()
        kinako.reset()
        art.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion.value ? 0 : 700 })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('resize', onResize)
    // The meter goes on from the dawn in index.html. A second greeting shows it full at once.
    meter = createGateMeter(tracks(), art?.querySelector('.ga-paper.ga-lit'))
    if (ready.value) {
        meter.finish({ instant: true })
        full.value = true
        return
    }
    meter.update(progress.value * (1 - VISIT_SHARE))
    // A plan covers 90 seconds. A load with no news for that long still creeps on.
    refresh = setInterval(plan, PLAN_MS.max)
})

// A resize moves the button, so a Kinako that sits on it moves along.
const onResize = () => {
    if (enter.value) kinako.settle(enter.value)
}

onBeforeUnmount(() => {
    window.removeEventListener('resize', place)
    window.removeEventListener('resize', onResize)
    clearTimeout(planTimer)
    clearInterval(refresh)
    meter?.stop()
})

// The camera starts moving as the lamp light washes over the view, not after it.
const lift = () => {
    if (!full.value || entered.value) return
    entered.value = true
    art?.classList.add('is-open')
    // Kinako trots on ahead into the light.
    kinako.walkOut(reducedMotion.value)
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
