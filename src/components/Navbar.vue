<script setup>
import { computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useScramble } from '../composables/useScramble.js'
import { useWaypoints } from '../composables/useWaypoints.js'

const router = useRouter()
const route = useRoute()
const { scramble } = useScramble()
const { active, entered, goTo } = useWaypoints()

// Hidden behind the loading gate, always there on the other pages.
const onHome = computed(() => route.name === 'Home')
const shown = computed(() => entered.value || (route.name && !onHome.value))

// The items follow the walk across the aerie (src/data/waypoints.js). Every stop is numbered
// the same way, About too, and a brass rule separates the tabs.
const items = ['Welcome', 'Projects', 'About', 'Skills', 'Contact']
const ABOUT = 2

const number = (i) => String(i + 1).padStart(2, '0')
// The About room (/about) marks About too.
const isActive = (i) => (onHome.value && i === active.value) || (i === ABOUT && route.name === 'About')

const go = async (index) => {
    if (goTo(index)) return
    await router.push('/')
    await nextTick()
    goTo(index)
}

const onHover = (event) => scramble(event.currentTarget.querySelector('.word'))

// The lantern brings back the greeting, for one more look at the lamp. Off the home page it goes
// home first.
const greet = async () => {
    if (!onHome.value) await router.push('/')
    entered.value = false
}
</script>

<template>
    <nav class="nav-strip" :class="{ shown }" aria-label="Sections" :aria-hidden="shown ? undefined : 'true'">
        <ul class="nav-row">
            <li v-for="(item, i) in items" :key="item">
                <button
                    type="button"
                    class="nav-item"
                    :class="{ active: isActive(i) }"
                    :aria-current="isActive(i) ? 'true' : undefined"
                    @click="go(i)"
                    @mouseenter="onHover"
                    @focus="onHover"
                >
                    <span class="number" aria-hidden="true">{{ number(i) }}</span>
                    <span class="word">{{ items[i] }}</span>
                </button>
            </li>
            <li>
                <button type="button" class="nav-item" aria-label="Back to the lantern" title="Back to the lantern" @click="greet">
                    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 1.5v2.8M9.2 4.3h5.6M12 19.7v2.8" />
                        <path d="M9 5.6C5.2 8 5.2 16 9 18.4h6c3.8-2.4 3.8-10.4 0-12.8Z" />
                    </svg>
                </button>
            </li>
        </ul>
    </nav>
</template>

<style scoped>
/* A glass octagon with a brass rim that floats over the aerie (docs/design-system.md).
   The strip top stays under 4.25rem from the bottom, and under 4rem below 768px wide,
   where the project sheets and folders end. */
.nav-strip {
    --c: 0.65rem;
    position: fixed;
    bottom: calc(clamp(0.5rem, 1vw, 0.75rem) + env(safe-area-inset-bottom));
    left: 50%;
    z-index: 50;
    width: max-content;
    /* A percentage of the viewport box leaves out the scrollbar, unlike vw. */
    max-width: calc(100% - 1rem);
    padding: 0 1.1rem;
    background: var(--color-glass);
    backdrop-filter: blur(14px);
    clip-path: polygon(var(--c) 0, calc(100% - var(--c)) 0, 100% var(--c), 100% calc(100% - var(--c)), calc(100% - var(--c)) 100%, var(--c) 100%, 0 calc(100% - var(--c)), 0 var(--c));
    /* Centred, and on its own layer, so it stays put while the phone toolbar slides. */
    transform: translate3d(-50%, 0, 0);
    opacity: 0;
    visibility: hidden;
    /* Only a fade, with no movement, so reduced motion needs no override. */
    transition: opacity 0.8s 0.6s, visibility 0s 1.4s;
}

.nav-strip.shown {
    opacity: 1;
    visibility: visible;
    transition-delay: 0.6s, 0s;
}

/* The brass rim is one evenodd polygon: the octagon, then the same octagon 1px inside it.
   A clip-path cuts a CSS border away, and a box-shadow cannot turn at a corner. The inner
   cut is 0.59px shorter, 1 x (2 - sqrt 2), so the rim stays 1px wide on the 45 degree edges.
   Each octagon repeats its first point to close itself. Without that, the path ran from the
   outer octagon straight into the inner one, and the top left diagonal rendered about 0.1px
   wide. The seam between the two closing points has no area. */
.nav-strip::before {
    --d: calc(var(--c) - 0.59px);
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: var(--color-brass-soft);
    clip-path: polygon(evenodd, var(--c) 0, calc(100% - var(--c)) 0, 100% var(--c), 100% calc(100% - var(--c)), calc(100% - var(--c)) 100%, var(--c) 100%, 0 calc(100% - var(--c)), 0 var(--c), var(--c) 0, calc(1px + var(--d)) 1px, calc(100% - 1px - var(--d)) 1px, calc(100% - 1px) calc(1px + var(--d)), calc(100% - 1px) calc(100% - 1px - var(--d)), calc(100% - 1px - var(--d)) calc(100% - 1px), calc(1px + var(--d)) calc(100% - 1px), 1px calc(100% - 1px - var(--d)), 1px calc(1px + var(--d)), calc(1px + var(--d)) 1px);
}

.nav-row {
    display: flex;
}

/* A short brass rule between the tabs, half the strip height. */
.nav-row > li {
    position: relative;
    display: flex;
    padding: 0 clamp(0.3rem, 1vw - 0.1rem, 0.7rem);
}

.nav-row > li + li::before {
    content: "";
    position: absolute;
    top: 30%;
    bottom: 30%;
    left: 0;
    width: 1px;
    background: var(--color-brass-soft);
}

.nav-item {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    height: 100%;
    /* Tight enough for the five words and the lantern on a 360px phone, and 48px tall. */
    padding: 1.05rem 0.1rem;
    color: var(--color-text-muted);
    font-family: var(--font-label);
    font-size: 0.64rem;
    text-transform: uppercase;
    transition: color 0.2s, border-color 0.2s;
}

.number {
    display: none;
    color: var(--color-text-faint);
}

.mark {
    width: 0.8rem;
    height: 0.8rem;
    fill: none;
    stroke: var(--color-sand);
    stroke-width: 1.4;
    stroke-linejoin: round;
}

@media (min-width: 640px) {
    .nav-item {
        padding: 1.05rem 0.5rem;
        font-size: 0.78rem;
        letter-spacing: 0.12em;
    }

    .number {
        display: inline;
    }

    .mark {
        width: 1rem;
        height: 1rem;
    }
}

.nav-item:hover {
    color: var(--color-text-strong);
}

/* The stop in view takes a small blonde hex, the same mark as the pane legends. */
.nav-item.active {
    color: var(--color-text-strong);
}

.nav-item.active::before {
    content: "";
    width: 0.45rem;
    aspect-ratio: 0.866;
    background: var(--color-action);
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
}

.nav-item:focus-visible {
    outline: 2px solid var(--color-action-text);
    outline-offset: -2px;
}
</style>
