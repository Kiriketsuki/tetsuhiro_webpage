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
        <div ref="wall" class="gate-wall" aria-hidden="true"></div>

        <h1 id="gate-name" class="gate-name">Lim Zhe Hong, Jovian</h1>

        <!-- A paper lantern hangs from an autumn branch. Both show the real load share in --p. -->
        <svg class="lamp" viewBox="0 0 320 210" fill="none" stroke-linecap="round" aria-hidden="true">
            <radialGradient id="lamp-glow">
                <stop offset="0" stop-color="#fca942" stop-opacity=".5" />
                <stop offset=".5" stop-color="#fca942" stop-opacity=".12" />
                <stop offset="1" stop-color="#fca942" stop-opacity="0" />
            </radialGradient>
            <circle cx="160" cy="114" r="130" fill="url(#lamp-glow)" class="lamp-glow lamp-fades" />
            <g stroke="#4a3a2e" class="lamp-fades">
                <path d="M-10 46C60 30 120 52 180 50s100-26 150-14" stroke-width="4" />
                <path d="M70 40l14-14M232 42l12-16" stroke-width="2" />
            </g>
            <path
                v-for="([x, y, r], i) in LEAVES"
                :key="i"
                d="M0 0C7 6 9 17 0 26C-9 17-7 6 0 0z"
                class="lamp-leaf"
                :fill="progress >= (i + 1) / LEAVES.length ? AUTUMN[i % 4] : '#3f5e45'"
                :style="{ '--x': `${x}px`, '--y': `${y}px`, '--r': `${r}deg`, animationDelay: `${i / 9}s` }"
            />
            <g class="lamp-fades">
                <path d="M160 50v22M154 158l-2 18M160 158v22M166 158l2 18" stroke="#918473" stroke-width="1.5" />
                <path d="M146 72h28v7h-28zM146 151h28v7h-28z" fill="#2d3e55" />
                <path ref="paper" d="M148 79c-14 10-14 62 0 72h24c14-10 14-62 0-72z" fill="#fca942" stroke="#e8c089" stroke-width="1.5" class="lamp-paper" />
                <path d="M160 79v72M150 79c-6 14-6 58 0 72M170 79c6 14 6 58 0 72" stroke="#03111e" stroke-opacity=".4" />
                <path d="M160 102c7 10 8 22 0 30c-8-8-7-20 0-30z" fill="#f5c252" class="lamp-flame" />
            </g>
        </svg>

        <div class="gate-foot">
            <p class="gate-readout" aria-live="polite">
                <template v-if="loadError">{{ loadError }}</template>
                <template v-else-if="ready">the lamps are lit</template>
                <template v-else>lighting the lamps {{ percent }}%</template>
            </p>

            <button
                ref="enter"
                type="button"
                class="gate-enter"
                :disabled="!ready"
                :aria-label="ready ? 'Step onto the island' : 'Still loading'"
                @click="lift"
            >
                step onto the island
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                </svg>
            </button>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import gsap from 'gsap'
import { useWaypoints } from '../composables/useWaypoints.js'

const emit = defineEmits(['lifted'])
const { ready, progress, entered, loadError, reducedMotion } = useWaypoints()

// Each leaf, as x, y and turn, changes from summer green to an autumn colour once the load
// passes its share. The hex values are campfire, ruby, amber and lava from tokens.css,
// because SVG attributes cannot read CSS variables.
const LEAVES = [[24, 42, 30], [52, 40, -150], [84, 26, 200], [104, 45, 15], [134, 50, -160], [196, 48, 10], [214, 56, -30], [244, 28, 160], [266, 38, -10], [298, 34, 190]]
const AUTUMN = ['#fca942', '#e74d68', '#f5c252', '#ec4e2f']

const gate = ref(null)
const wall = ref(null)
const paper = ref(null)
const enter = ref(null)
const percent = computed(() => Math.round(progress.value * 100))

// Once the island is ready, the lamp light opens the wall as an iris onto it, while the
// leaves fall. Reduced motion fades the wall instead.
const open = () => {
    const box = paper.value?.getBoundingClientRect()
    if (reducedMotion.value || !box) {
        gsap.to(wall.value, { opacity: 0, duration: reducedMotion.value ? 0.6 : 1.2 })
        return
    }
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    gsap.set(wall.value, { '--x': `${x}px`, '--y': `${y}px` })
    gsap.to(wall.value, { '--hole': `${reach}px`, duration: 2.2, delay: 0.3, ease: 'power2.in' })
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

// The camera starts moving with the lift, not after it.
const lift = () => {
    if (!ready.value || entered.value) return
    entered.value = true
    gsap.to(gate.value, {
        autoAlpha: 0,
        y: reducedMotion.value ? 0 : -40,
        duration: reducedMotion.value ? 0.3 : 0.9,
        ease: 'power2.in',
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
    justify-content: space-between;
    padding: clamp(2rem, 6vh, 4rem) 1.5rem clamp(2rem, 7vh, 4rem);
    text-align: center;
}

/* Keeps the name and the button readable over the island. */
.gate::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(#03111ecc, transparent 30% 65%, #03111ecc);
}

/* A starry night until the island is ready. --hole is the iris radius. */
.gate-wall {
    --hole: 0px;
    position: absolute;
    inset: 0;
    background:
        radial-gradient(1px 1px at 20% 30%, var(--color-moon), transparent) 0 0 / 17rem 13rem,
        radial-gradient(1.5px 1.5px at 70% 60%, var(--color-text-muted), transparent) 0 0 / 23rem 19rem,
        linear-gradient(var(--color-bg-raised), var(--color-bg-base) 70%);
    mask: radial-gradient(circle at var(--x, 50%) var(--y, 50%), transparent var(--hole), #000 calc(var(--hole) + 6rem));
}

.gate > :not(.gate-wall) {
    position: relative;
}

.gate-name {
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 6vw, 5rem);
    line-height: 1;
    color: var(--color-amber);
}

.lamp {
    width: min(34rem, 92vw);
    overflow: visible;
}

.lamp-glow,
.lamp-flame {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    transform: scale(calc(0.3 + 0.7 * var(--p)));
}

.lamp-glow {
    transform-origin: center;
    opacity: calc(0.2 + 0.8 * var(--p));
}

.lamp-paper {
    fill-opacity: calc(0.12 + 0.75 * var(--p));
}

.lamp-flame {
    animation: flicker 2.2s ease-in-out infinite;
}

.lamp-leaf {
    transform: translate(var(--x), var(--y)) rotate(var(--r));
    transition: fill 0.7s;
}

@keyframes flicker {
    50% {
        transform: scale(calc(0.27 + 0.7 * var(--p)), calc(0.33 + 0.7 * var(--p)));
    }
}

/* Ready: the leaves let go and drift down over the island, and the lamp light takes the screen. */
.is-ready .lamp-leaf {
    animation: fall 3.2s cubic-bezier(0.45, 0, 0.7, 1) backwards;
}

.is-ready .lamp-leaf,
.is-ready .lamp-fades {
    opacity: 0;
    transition: opacity 1s 0.4s;
}

@keyframes fall {
    0% {
        opacity: 1;
    }
    40% {
        transform: translate(calc(var(--x) + 26px), calc(var(--y) + 140px)) rotate(calc(var(--r) + 120deg));
    }
    100% {
        transform: translate(calc(var(--x) - 14px), calc(var(--y) + 420px)) rotate(calc(var(--r) + 260deg));
    }
}

.gate-foot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
}

.gate-readout {
    max-width: 22rem;
    min-height: 1.5em;
    font-family: var(--font-label);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
}

.gate-enter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 1.5rem;
    border: 1px solid #e74d6866;
    border-radius: 999px;
    font-family: var(--font-label);
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    color: var(--color-ruby);
    transition: opacity 0.6s 1.2s;
}

.gate-enter svg {
    width: 1.5rem;
}

.gate-enter:disabled {
    opacity: 0;
    transition: none;
}

.gate-enter:not(:disabled) {
    cursor: pointer;
}

.gate-enter:not(:disabled) svg {
    animation: nudge 1.6s ease-in-out infinite;
}

.gate-enter:hover:not(:disabled),
.gate-enter:focus-visible {
    color: var(--color-rose);
}

.gate-enter:focus-visible {
    outline: 2px solid var(--color-teal-action-hover);
    outline-offset: 4px;
}

@keyframes nudge {
    50% {
        transform: translateY(5px);
    }
}

@media (prefers-reduced-motion: reduce) {
    .lamp-flame,
    .is-ready .lamp-leaf,
    .gate-enter:not(:disabled) svg {
        animation: none;
    }
}
</style>
