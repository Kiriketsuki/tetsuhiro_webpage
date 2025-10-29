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

// plants_in_space had two links on each side. Skills is the middle stop of
// the five, so it takes the middle, under the dodecahedron mark.
const items = ['Welcome', 'About', 'Skills', 'Projects', 'Contact']
const left = [0, 1]
const right = [3, 4]
const middle = 2

const number = (i) => String(i + 1).padStart(2, '0')
const isActive = (i) => onHome.value && i === active.value

const go = async (index) => {
    if (goTo(index)) return
    await router.push('/')
    await nextTick()
    goTo(index)
}

const onHover = (event) => scramble(event.currentTarget.querySelector('.word'))
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

        <ul class="nav-side end">
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
        </ul>
    </nav>
</template>

<style scoped>
/* A solid strip with one rule on top. No blur, no rounded box. */
.nav-strip {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 50;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: stretch;
    padding: 0 clamp(0.5rem, 4vw, 4.5rem) env(safe-area-inset-bottom);
    background: var(--color-bg-base);
    border-top: 1px solid var(--color-line);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.8s 0.6s, visibility 0s 1.4s;
}

.nav-strip.shown {
    opacity: 1;
    visibility: visible;
    transition: opacity 0.8s 0.6s, visibility 0s;
}

@media (prefers-reduced-motion: reduce) {
    .nav-strip,
    .nav-strip.shown {
        transition: none;
    }
}

.nav-side {
    display: flex;
    gap: clamp(0rem, 3vw, 3rem);
}

.nav-side.end {
    justify-content: flex-end;
}

/* Vertical rules either side of the middle, like the 2022 wynmonde nav. */
.nav-middle {
    display: flex;
    padding: 0 clamp(0.1rem, 2.5vw, 2.5rem);
    border-right: 1px solid var(--color-line);
    border-left: 1px solid var(--color-line);
}

.nav-item {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    height: 100%;
    padding: 0.85rem 0.3rem 0.7rem;
    border-bottom: 2px solid transparent;
    color: var(--color-text-muted);
    font-family: var(--font-label);
    font-size: 0.64rem;
    letter-spacing: 0.06em;
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
        padding: 1rem 0.5rem 0.85rem;
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
    border-bottom-color: var(--color-text-strong);
}

.nav-item.active {
    color: var(--color-text-strong);
    border-bottom-color: var(--color-rose);
}

.nav-item:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: -2px;
}
</style>
