<template>
    <div
        ref="gate"
        class="gate"
        :class="{ 'is-ready': ready }"
        :style="{ '--p': progress }"
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
import { computed, nextTick, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import gsap from 'gsap'
import { useWaypoints } from '../composables/useWaypoints.js'

const emit = defineEmits(['lifted'])
const { ready, progress, entered, loadError, reducedMotion } = useWaypoints()

// The lantern art lives in index.html, so it paints before this bundle loads. It is
// missing when the visit started on another route. Its styles sit in index.html too.
const art = document.getElementById('gate-art')
watchEffect(() => art?.style.setProperty('--p', progress.value))

const gate = ref(null)
const enter = ref(null)
const percent = computed(() => Math.round(progress.value * 100))

// Once the island is ready, the leaves fall and the lamp light opens the art as an iris onto
// it. Reduced motion fades the art instead.
const open = () => {
    if (!art) return
    const box = art.querySelector('.ga-core').getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    gsap.set(art, { '--x': `${x}px`, '--y': `${y}px`, '--hole': '0px' })
    art.classList.add('is-ready')
    if (reducedMotion.value) {
        gsap.to(art, { autoAlpha: 0, duration: 0.6 })
        return
    }
    const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    gsap.to(art, { '--hole': `${reach}px`, duration: 2.4, delay: 0.5, ease: 'power2.in' })
}

// The button takes focus as soon as it works, so Enter goes straight in. The scene can be
// ready before the gate mounts, after a first visit to another route, so this runs at once.
watch(
    ready,
    async (value) => {
        if (!value) return
        await nextTick()
        enter.value?.focus({ preventScroll: true })
        open()
    },
    { immediate: true }
)

onBeforeUnmount(() => art?.remove())

// The camera starts moving with the lift, not after it.
const lift = () => {
    if (!ready.value || entered.value) return
    entered.value = true
    gsap.to([gate.value, art].filter(Boolean), {
        autoAlpha: 0,
        duration: reducedMotion.value ? 0.3 : 0.9,
        ease: 'power2.in',
        onComplete: () => emit('lifted'),
    })
}
</script>
