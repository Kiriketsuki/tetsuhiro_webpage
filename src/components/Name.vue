<template>
    <div ref="gate" class="gate" role="dialog" aria-modal="true" aria-labelledby="gate-name">
        <h1 id="gate-name" class="gate-name">Lim Zhe Hong, Jovian</h1>

        <p class="gate-readout" aria-live="polite">
            <template v-if="loadError">{{ loadError }}</template>
            <template v-else-if="ready">island ready</template>
            <template v-else>loading the island {{ percent }}%</template>
        </p>

        <div class="gate-bar" aria-hidden="true">
            <span :style="{ transform: `scaleX(${ready ? 1 : progress})` }"></span>
        </div>

        <button
            ref="enter"
            type="button"
            class="gate-enter"
            :disabled="!ready"
            :aria-label="ready ? 'Enter the site' : 'Still loading'"
            @click="lift"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
            </svg>
        </button>
    </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import gsap from 'gsap'
import { useWaypoints } from '../composables/useWaypoints.js'

const emit = defineEmits(['lifted'])
const { ready, progress, entered, loadError, reducedMotion } = useWaypoints()

const gate = ref(null)
const enter = ref(null)
const percent = computed(() => Math.round(progress.value * 100))

// The chevron takes focus as soon as it works, so Enter goes straight in.
watch(
    ready,
    async (value) => {
        if (!value) return
        await nextTick()
        enter.value?.focus({ preventScroll: true })
    },
    { immediate: true }
)

// The camera starts moving with the lift, not after it.
const lift = () => {
    if (!ready.value || entered.value) return
    entered.value = true
    gsap.to(gate.value, {
        yPercent: -100,
        duration: reducedMotion.value ? 0 : 1.1,
        ease: 'power2.inOut',
        onComplete: () => emit('lifted'),
    })
}
</script>

<style scoped>
.gate {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    padding: 0 1.5rem;
    background: var(--color-bg-base);
    text-align: center;
}

.gate-name {
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 7vw, 6rem);
    line-height: 1;
    color: var(--color-amber);
}

.gate-readout {
    min-height: 1.5em;
    font-family: var(--font-label);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
}

.gate-bar {
    width: min(16rem, 60vw);
    height: 2px;
    overflow: hidden;
    background: var(--color-line);
}

.gate-bar span {
    display: block;
    height: 100%;
    background: var(--color-teal);
    transform-origin: left;
    transition: transform 0.2s linear;
}

.gate-enter {
    width: 4rem;
    height: 4rem;
    padding: 0.75rem;
    border-radius: 999px;
    color: var(--color-ruby);
    opacity: 1;
    transition: opacity 0.4s;
}

.gate-enter:disabled {
    opacity: 0.2;
    cursor: progress;
}

.gate-enter:not(:disabled) {
    cursor: pointer;
    animation: nudge 1.6s ease-in-out infinite;
}

.gate-enter:hover:not(:disabled),
.gate-enter:focus-visible {
    color: var(--color-rose);
}

.gate-enter:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: 4px;
}

@keyframes nudge {
    0%,
    100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(6px);
    }
}

@media (prefers-reduced-motion: reduce) {
    .gate-enter:not(:disabled) {
        animation: none;
    }

    .gate-bar span {
        transition: none;
    }
}
</style>
