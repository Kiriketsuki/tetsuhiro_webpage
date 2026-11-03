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

// plants_in_space had two links on each side. The items follow the walk across the aerie
// (src/data/waypoints.js). About, the bedroom, is the highest room of the house and the
// middle stop of the five, so it takes the middle, under the mark.
const items = ['Welcome', 'Projects', 'About', 'Skills', 'Contact']
const left = [0, 1]
const right = [3, 4]
const middle = 2

const number = (i) => String(i + 1).padStart(2, '0')
// The About room (/about) marks About too.
const isActive = (i) => (onHome.value && i === active.value) || (i === middle && route.name === 'About')

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
        <ul class="nav-side">
            <li v-for="i in left" :key="i">
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
        </ul>

        <div class="nav-middle">
            <button
                type="button"
                class="nav-item"
                :class="{ active: isActive(middle) }"
                :aria-current="isActive(middle) ? 'true' : undefined"
                @click="go(middle)"
                @mouseenter="onHover"
                @focus="onHover"
            >
                <svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2.5 21 9l-3.4 10.5H6.4L3 9Z" />
                    <path d="M12 7.5 16.3 10.6 14.7 15.6H9.3L7.7 10.6Z" />
                </svg>
                <span class="word">{{ items[middle] }}</span>
            </button>
        </div>

        <ul class="nav-side">
            <li v-for="i in right" :key="i">
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
    display: grid;
    grid-template-columns: 1fr auto 1fr;
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
   cut is 0.59px shorter, 1 x (2 - sqrt 2), so the rim stays 1px wide on the 45 degree edges. */
.nav-strip::before {
    --d: calc(var(--c) - 0.59px);
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: var(--color-brass-soft);
    clip-path: polygon(evenodd, var(--c) 0, calc(100% - var(--c)) 0, 100% var(--c), 100% calc(100% - var(--c)), calc(100% - var(--c)) 100%, var(--c) 100%, 0 calc(100% - var(--c)), 0 var(--c), calc(1px + var(--d)) 1px, calc(100% - 1px - var(--d)) 1px, calc(100% - 1px) calc(1px + var(--d)), calc(100% - 1px) calc(100% - 1px - var(--d)), calc(100% - 1px - var(--d)) calc(100% - 1px), calc(1px + var(--d)) calc(100% - 1px), 1px calc(100% - 1px - var(--d)), 1px calc(1px + var(--d)));
}

.nav-side {
    display: flex;
    gap: clamp(0rem, 1.5vw, 1.25rem);
}

.nav-middle {
    display: flex;
    margin: 0 clamp(0.15rem, 1vw - 0.4rem, 0.75rem);
    padding: 0 clamp(0.15rem, 1.5vw - 0.3rem, 1.25rem);
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
