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
const shown = computed(() => entered.value || (route.name && route.name !== 'Home'))

const items = ['Welcome', 'About', 'Skills', 'Projects', 'Contact']

const go = async (index) => {
    if (goTo(index)) return
    await router.push('/')
    await nextTick()
    goTo(index)
}
</script>

<template>
    <nav class="nav-strip" :class="{ shown }" aria-label="Sections" :aria-hidden="shown ? undefined : 'true'">
        <ul class="flex items-center justify-between gap-1 sm:gap-6">
            <li v-for="(item, i) in items" :key="item">
                <button
                    type="button"
                    class="nav-item"
                    :class="{ active: i === active }"
                    :aria-current="i === active ? 'true' : undefined"
                    @click="go(i)"
                    @mouseenter="scramble($event.currentTarget.firstElementChild)"
                    @focus="scramble($event.currentTarget.firstElementChild)"
                >
                    <span>{{ item }}</span>
                </button>
            </li>
        </ul>
    </nav>
</template>

<style scoped>
.nav-strip {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    z-index: 50;
    transform: translateX(-50%);
    max-width: calc(100vw - 2rem);
    padding: 0.25rem 0.75rem;
    background: color-mix(in oklch, var(--color-bg-overlay) 80%, transparent);
    backdrop-filter: blur(10px) saturate(170%);
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 12px;
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

.nav-item {
    padding: 0.6rem 0.5rem;
    border-bottom: 2px solid transparent;
    color: var(--color-text-muted);
    font-family: var(--font-label);
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    transition: color 0.2s, border-color 0.2s;
}

@media (min-width: 640px) {
    .nav-item {
        padding: 0.6rem 0.75rem;
        font-size: 0.8rem;
    }
}

.nav-item:hover,
.nav-item.active {
    color: var(--color-text-strong);
}

.nav-item.active {
    border-bottom-color: var(--color-teal);
}

.nav-item:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: 2px;
}
</style>
