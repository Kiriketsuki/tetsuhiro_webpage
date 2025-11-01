<template>
    <main class="flex min-h-screen w-screen flex-col items-center gap-10 px-5 pt-16 pb-32">
        <header class="flex w-full max-w-6xl flex-col gap-4">
            <p class="label text-rose">04 / projects</p>
            <h1 class="font-slab text-[clamp(2.75rem,8vw,6rem)] leading-none text-text-strong">
                Things I have made
            </h1>
            <p class="max-w-2xl font-body text-[clamp(0.95rem,1.2vw,1.1rem)] text-text-body">
                Work first, then school and side projects, then the older stuff. Some of it is not
                public, so those rows only say what it was.
            </p>
        </header>

        <div class="grid w-full max-w-6xl items-start gap-8 lg:grid-cols-[1fr_20rem]">
            <section class="frame frame-rose p-4 pt-7 sm:p-7 sm:pt-9">
                <span class="frame-legend">index</span>
                <h2 class="sr-only">All projects</h2>
                <ol class="border-t border-line">
                    <ProjectRow
                        v-for="(project, i) in projects"
                        :key="project.id"
                        :project="project"
                        :number="i + 1"
                        detail
                        @peek="peekedIndex = i"
                    />
                </ol>
            </section>

            <!-- The hovered row, as a spec sheet. Wide screens only. -->
            <aside class="frame sticky top-10 hidden flex-col gap-4 p-5 pt-8 lg:flex" aria-hidden="true">
                <span class="frame-legend">{{ String(peekedIndex + 1).padStart(2, '0') }}</span>
                <div class="plate">
                    <img v-if="peeked.image" :src="peeked.image" alt="" decoding="async" />
                    <span v-else>{{ monogram(peeked.title) }}</span>
                </div>
                <p class="font-slab text-3xl leading-tight text-text-strong">{{ peeked.title }}</p>
                <dl class="rows text-sm">
                    <template v-for="[key, value] in rows(peeked)" :key="key">
                        <dt>{{ key }}</dt>
                        <dd>{{ value }}</dd>
                    </template>
                </dl>
            </aside>
        </div>

        <router-link to="/" class="action self-center">Back to the island</router-link>
    </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import ProjectRow from '../components/ProjectRow.vue'
import { monogram, projects } from '../data/projects.js'

// Kept as an index: the legend shows the row number.
const peekedIndex = ref(0)
const peeked = computed(() => projects[peekedIndex.value])

const rows = (project) => [
    ['Stack', project.stack],
    ['Year', project.year],
    ['Role', project.role],
]
</script>

<style scoped>
.plate {
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 10;
    padding: 4px;
    background: var(--color-bg-base);
    border: 1px solid var(--color-line);
    color: var(--color-line);
    font-family: var(--font-display);
    font-size: 4rem;
    line-height: 1;
}

.plate img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>
