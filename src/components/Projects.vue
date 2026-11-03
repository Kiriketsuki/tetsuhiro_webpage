<script setup>
import { computed, ref, watch } from 'vue'
import ProjectRow from './ProjectRow.vue'
import { homeProjects, monogram, projects } from '../data/projects.js'
import { sections, sideOf, useWaypoints } from '../composables/useWaypoints.js'

// The pictures wait until the visitor is through the gate and one section before
// this one, so the island gets the bandwidth first.
const PRELOAD_FROM = sections.indexOf('projects') - 1
const { active, entered } = useWaypoints()
const showImages = ref(false)
watch(
    [active, entered],
    ([section, through]) => {
        if (through && section >= PRELOAD_FROM) showImages.value = true
    },
    { immediate: true }
)

const featured = homeProjects
// The row under the pointer shows its picture in the corner of the frame.
const peeked = ref(featured[0])
const picture = computed(() => (showImages.value ? peeked.value.image : null))
</script>

<template>
    <div class="stop" :data-side="sideOf('projects')">
        <article class="frame frame-rose flex w-full max-w-[34rem] flex-col gap-4 p-5 sm:p-8">
            <span class="frame-legend">02 / over the bridge</span>

            <div class="flex items-end justify-between gap-6">
                <h2 class="font-slab text-[clamp(2.25rem,4vw,3.25rem)] leading-none text-text-strong">
                    Projects
                </h2>
                <div class="peek hidden sm:grid" aria-hidden="true">
                    <img v-if="picture" :src="picture" alt="" decoding="async" />
                    <span v-else>{{ monogram(peeked.title) }}</span>
                </div>
            </div>

            <ol class="border-t border-line">
                <ProjectRow
                    v-for="(project, i) in featured"
                    :key="project.id"
                    :project="project"
                    :number="i + 1"
                    @peek="peeked = project"
                />
            </ol>

            <router-link to="/projects" class="action">All {{ projects.length }} projects</router-link>
        </article>
    </div>
</template>

<style scoped>
/* A phone shows four rows, so the card stays short and the workshop stays in view. */
@media (max-width: 639px) {
    ol > :nth-child(n + 5) {
        display: none;
    }
}

/* A small framed plate for the hovered project's picture. */
.peek {
    place-items: center;
    width: 8.5rem;
    aspect-ratio: 16 / 10;
    padding: 3px;
    background: var(--color-bg-base);
    border: 1px solid var(--color-rose);
    color: var(--color-line);
    font-family: var(--font-display);
    font-size: 2.25rem;
    line-height: 1;
}

.peek img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>
