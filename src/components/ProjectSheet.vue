<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { findProject } from '../data/projects.js'
import { withPage } from '../data/project-pages.js'

// The sheet for one pin on the evidence wall: what it is, the stack, the screenshots and the
// links out. A wide screen shows it as a paper sheet on the right, and the wall moves the pin
// into the space on its left. A phone shows it as a sheet from the bottom. It is plain HTML,
// so the text stays sharp and screen readers read it.
const props = defineProps({ id: { type: String, required: true } })
const emit = defineEmits(['close'])

const project = computed(() => withPage(findProject(props.id)))
const stack = computed(() => project.value.stack.split(', '))
const title = ref(null)
const sheet = ref(null)

// The title takes focus, so a screen reader starts at the top of the new sheet.
const arrive = async () => {
    await nextTick()
    if (sheet.value) sheet.value.scrollTop = 0
    title.value?.focus({ preventScroll: true })
}
onMounted(arrive)
watch(() => props.id, arrive)
</script>

<template>
    <section ref="sheet" class="sheet" role="dialog" aria-labelledby="sheet-title" @pointerdown.stop @wheel.stop>
        <button type="button" class="sheet-close" aria-label="Close" @click="emit('close')">&times;</button>
        <p class="sheet-meta">{{ [project.year, project.role].filter(Boolean).join(' / ') }}</p>
        <h2 id="sheet-title" ref="title" class="sheet-title" tabindex="-1">{{ project.title }}</h2>
        <img v-if="project.cover" class="sheet-cover" :src="project.cover" :alt="project.coverAlt ?? ''" decoding="async" />
        <p v-for="(paragraph, i) in project.body" :key="i">{{ paragraph }}</p>
        <p v-if="project.note" class="sheet-note">{{ project.note }}</p>
        <ul class="sheet-stack" aria-label="Stack">
            <li v-for="name in stack" :key="name">{{ name }}</li>
        </ul>
        <div v-if="project.gallery.length" class="sheet-gallery">
            <img v-for="shot in project.gallery" :key="shot.src" :src="shot.src" :alt="shot.alt" loading="lazy" decoding="async" />
        </div>
        <div v-if="project.links.length" class="sheet-links">
            <a v-for="link in project.links" :key="link.href" :href="link.href" target="_blank" rel="noopener">{{ link.label }}</a>
        </div>
    </section>
</template>

<style scoped>
/* Paper under the lamp: warm, with the wall's red for the links. */
.sheet {
    --paper: oklch(0.94 0.025 80);
    --ink: oklch(0.24 0.02 60);
    --brown: oklch(0.48 0.09 45);
    --red: oklch(0.42 0.13 28);
    position: fixed;
    z-index: 30;
    top: 1rem;
    right: 1rem;
    /* The site navbar (about 51 px, 43 px on a phone) stays on top of the page, so the sheet ends above it. */
    bottom: 4.25rem;
    display: flex;
    width: min(26.25rem, 40vw);
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.4rem 1.4rem 1.2rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-radius: 3px;
    background: var(--paper);
    box-shadow: 0 18px 40px rgb(0 0 0 / 0.45);
    color: var(--ink);
    font: 0.95rem/1.55 var(--font-body);
    animation: sheet-in 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes sheet-in {
    from {
        transform: translateX(calc(100% + 2rem));
    }
}

@media (max-width: 767px) {
    .sheet {
        top: auto;
        right: 0;
        bottom: 2.7rem;
        left: 0;
        width: auto;
        max-height: calc(72vh - 2.7rem);
        border-radius: 14px 14px 0 0;
        animation-name: sheet-up;
    }

    @keyframes sheet-up {
        from {
            transform: translateY(105%);
        }
    }
}

@media (prefers-reduced-motion: reduce) {
    .sheet {
        animation: none;
    }
}

.sheet p {
    margin: 0;
}

.sheet-meta {
    padding-right: 2.5rem;
    color: var(--brown);
    font: 600 0.75rem/1.4 var(--font-label);
    letter-spacing: 0.02em;
}

.sheet-title {
    margin: 0;
    outline: none;
    color: var(--ink);
    font: 400 2.1rem/1.05 var(--font-display);
}

.sheet-cover,
.sheet-gallery img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 2px;
}

.sheet-note {
    color: var(--brown);
    font-size: 0.85rem;
}

.sheet-stack {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
}

.sheet-stack li {
    padding: 0.35rem 0.5rem;
    border: 1px solid oklch(0.7 0.05 70);
    border-radius: 3px;
    font: 600 0.75rem/1 var(--font-label);
}

.sheet-gallery {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
}

.sheet-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.sheet-links a {
    padding: 0.55rem 0.9rem;
    border-radius: 3px;
    background: var(--red);
    color: var(--paper);
    font-weight: 600;
    text-decoration: none;
}

.sheet-links a:focus-visible,
.sheet-close:focus-visible {
    outline: 3px solid oklch(0.75 0.13 70);
    outline-offset: 2px;
}

.sheet-close {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    width: 2.25rem;
    height: 2.25rem;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ink);
    font: 1.4rem/1 system-ui;
    cursor: pointer;
}
</style>
