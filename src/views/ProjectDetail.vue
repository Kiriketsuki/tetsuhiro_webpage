<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { findProject } from '../data/projects.js'

// The router only lets known ids through, so project is always set here.
const route = useRoute()
const project = computed(() => findProject(route.params.id))

const rows = computed(() => [
    ['Year', project.value.year],
    ['Stack', project.value.stack],
    ['Role', project.value.role],
])
</script>

<template>
    <main class="case">
        <header class="case-head">
            <p class="label text-rose">04 / projects</p>
            <h1 class="case-title">{{ project.title }}</h1>
        </header>

        <div class="case-top">
            <figure class="case-cover frame frame-line">
                <img :src="project.cover" :alt="project.coverAlt" decoding="async" fetchpriority="high" />
            </figure>

            <aside class="frame flex flex-col gap-4 p-5 pt-8">
                <span class="frame-legend">spec</span>
                <dl class="rows text-sm">
                    <template v-for="[key, value] in rows" :key="key">
                        <dt>{{ key }}</dt>
                        <dd>{{ value }}</dd>
                    </template>
                </dl>
                <a
                    v-for="link in project.links"
                    :key="link.href"
                    :href="link.href"
                    target="_blank"
                    rel="noopener"
                    class="action self-start"
                >
                    {{ link.label }}
                </a>
            </aside>
        </div>

        <section class="case-body">
            <p v-for="(paragraph, i) in project.body" :key="i">{{ paragraph }}</p>
            <p v-if="project.note" class="case-note">{{ project.note }}</p>
        </section>

        <section v-if="project.gallery.length" class="case-gallery" aria-label="Gallery">
            <figure v-for="item in project.gallery" :key="item.src" class="frame frame-line">
                <img :src="item.src" :alt="item.alt" loading="lazy" decoding="async" />
                <figcaption>{{ item.alt }}</figcaption>
            </figure>
        </section>

        <router-link to="/projects" class="action self-center">All projects</router-link>
    </main>
</template>

<style scoped>
/*
 * One layout for every featured project: the title over a rose rule, the
 * cover next to a spec sheet, a few paragraphs, then the gallery. The frames
 * match the index page.
 */
.case {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(2.5rem, 6vw, 4.5rem);
    width: 100vw;
    padding: 4rem 1.25rem 8rem;
}

.case-head,
.case-top,
.case-body,
.case-gallery {
    width: min(70rem, 100%);
}

.case-head {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.case-title {
    padding-bottom: 1.25rem;
    border-bottom: 2px solid var(--color-rose);
    color: var(--color-text-strong);
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 7vw, 5.5rem);
    line-height: 1;
}

.case-top {
    display: grid;
    gap: 2rem;
    align-items: start;
}

@media (min-width: 900px) {
    .case-top {
        grid-template-columns: 1fr 20rem;
    }
}

.case-cover {
    padding: 6px;
    background: var(--color-bg-base);
}

.case-cover img {
    width: 100%;
    max-height: 70vh;
    object-fit: contain;
}

.case-body {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}

.case-body > p {
    max-width: 65ch;
    color: var(--color-text-body);
    font-size: 1.05rem;
    line-height: 1.7;
}

.case-body > .case-note {
    color: var(--color-text-faint);
    font-family: var(--font-label);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.case-gallery {
    display: grid;
    gap: 1.5rem;
}

@media (min-width: 900px) {
    .case-gallery {
        grid-template-columns: 1fr 1fr;
    }
}

.case-gallery figure {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 6px 6px 0.75rem;
    background: var(--color-bg-base);
}

.case-gallery img {
    width: 100%;
    height: auto;
}

.case-gallery figcaption {
    padding: 0 0.5rem;
    color: var(--color-text-muted);
    font-size: 0.85rem;
}
</style>
