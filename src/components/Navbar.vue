<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useScramble } from '../composables/useScramble.js'

const router = useRouter()
const { scramble } = useScramble()

const items = [
    { label: 'Welcome', target: '.dodecahedron' },
    { label: 'About', target: '.about' },
    { label: 'Skills', target: '.skills' },
    { label: 'Projects', target: '.projects' },
    { label: 'Contact', target: '.contact' },
]

const active = ref(0)

const go = (item) => {
    const el = document.querySelector(item.target)
    if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
    } else {
        router.push('/')
    }
}

const onScroll = () => {
    const index = Math.round(window.scrollY / window.innerHeight)
    active.value = Math.min(items.length - 1, Math.max(0, index))
}

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
    <nav class="nav-strip nav_stagger" aria-label="Sections" style="visibility: hidden">
        <ul class="flex items-center justify-between gap-1 sm:gap-6">
            <li v-for="(item, i) in items" :key="item.label">
                <button
                    type="button"
                    class="nav-item"
                    :class="{ active: i === active }"
                    :aria-current="i === active ? 'true' : undefined"
                    @click="go(item)"
                    @mouseenter="scramble($event.currentTarget.firstElementChild)"
                    @focus="scramble($event.currentTarget.firstElementChild)"
                >
                    <span>{{ item.label }}</span>
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
