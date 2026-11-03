<template>
    <div
        ref="gate"
        class="gate"
        :class="{ 'is-ready': ready }"
        :style="{ '--p': shown }"
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
            <p class="gate-readout" aria-live="polite">
                <template v-if="loadError">{{ loadError }}</template>
                <template v-else-if="ready">the lamps are lit</template>
                <template v-else>lighting the lamps <b>{{ percent }}%</b></template>
            </p>

            <button
                ref="enter"
                type="button"
                class="gate-enter"
                :disabled="!ready"
                :aria-label="ready ? 'Enter the aerie' : 'Still loading'"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import gsap from 'gsap'
import { useWaypoints } from '../composables/useWaypoints.js'

const emit = defineEmits(['lifted'])
const { ready, progress, entered, loadError, reducedMotion } = useWaypoints()

// The lantern art lives in index.html, so it paints before this bundle loads. Its styles sit
// there too. On a visit that starts on another page it waits there, hidden.
const art = document.getElementById('gate-art')
// Whole percent steps, so the art restyles at most a hundred times in a load.
const shown = computed(() => Math.round(progress.value * 100) / 100)
watchEffect(() => art?.style.setProperty('--p', shown.value))

const gate = ref(null)
const enter = ref(null)
const percent = computed(() => Math.round(shown.value * 100))

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

// The button takes focus as soon as it works, so Enter goes straight in. At ready the lantern
// stays lit until the visitor goes in, and a leaf now and then drifts down (is-lit).
watch(
    ready,
    async (value) => {
        if (!value) return
        art?.classList.add('is-lit')
        await nextTick()
        enter.value?.focus({ preventScroll: true })
    },
    { immediate: true }
)

// A second greeting, from the nav lantern, finds the art hidden and fades it back in.
onMounted(() => {
    if (!art) return
    if (art.hidden || art.classList.contains('is-open')) {
        art.classList.remove('is-open')
        art.hidden = false
        art.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion.value ? 0 : 700 })
    }
    place()
    window.addEventListener('resize', place)
})

onBeforeUnmount(() => window.removeEventListener('resize', place))

// The camera starts moving as the lamp light washes over the view, not after it.
const lift = () => {
    if (!ready.value || entered.value) return
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
