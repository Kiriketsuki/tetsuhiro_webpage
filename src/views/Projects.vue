<template>
    <main v-if="onWall">
        <ExplorePad :to="id ? '/projects' : '/'" back="">
            <template #top>
                <header class="wall-head">
                    <p class="label">
                        <span class="text-rose">04 / projects</span>
                        <span class="text-text-muted">&middot; drag, zoom, tap a card</span>
                    </p>
                    <h1 class="font-slab text-[clamp(1.9rem,5vw,3.25rem)] leading-none text-text-strong">Things I have made</h1>
                    <div class="wall-actions">
                        <router-link to="/" class="action" @pointerdown.stop>back to the island</router-link>
                        <router-link :to="{ path: '/projects', query: { list: null } }" class="action" @pointerdown.stop>list view</router-link>
                    </div>
                </header>
            </template>
        </ExplorePad>

        <!-- The wall is a picture, so the pins are links here too: Tab marks each pin on the
             wall, and Enter opens it. A link shows on screen only while it has focus. -->
        <nav class="wall-index" aria-label="Projects on the wall">
            <ol>
                <li v-for="pin in ordered" :key="pin.id">
                    <router-link
                        :ref="(el) => (links[pin.id] = el?.$el)"
                        :to="`/projects/${pin.page}`"
                        @focus="wall.highlight(pin.id)"
                        @blur="wall.highlight(null)"
                    >
                        {{ pin.title }}, {{ pin.year }}
                    </router-link>
                </li>
            </ol>
        </nav>

        <ProjectSheet v-if="id" :id="id" @close="close" />
    </main>
    <ProjectDetail v-else-if="id" />
    <ProjectList v-else />
</template>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ExplorePad from '../components/ExplorePad.vue'
import ProjectList from '../components/ProjectList.vue'
import ProjectSheet from '../components/ProjectSheet.vue'
import { PINS } from '../data/wall.js'
import { useWall } from '../composables/useWall.js'

// /projects is the evidence wall in the workshop once it has built, and /projects/<id> is the
// wall with that pin open in the sheet. Without the wall (no WebGL, a failed load, or ?list),
// they are the list page and the project page.
const ProjectDetail = defineAsyncComponent(() => import('./ProjectDetail.vue'))

const route = useRoute()
const router = useRouter()
const wall = useWall()
const onWall = computed(() => wall.shown.value && !('list' in route.query))
const id = computed(() => (route.name === 'Project' ? route.params.id : null))
const pinOf = (page) => PINS.find((pin) => pin.page === page)?.id ?? null

// Reading order: top row first, left to right within a row.
const ordered = [...PINS].sort((a, b) => (Math.abs(a.at[1] - b.at[1]) < 0.1 ? a.at[0] - b.at[0] : b.at[1] - a.at[1]))
const links = {}

// The open pin moves into the space the sheet leaves free. Closing it moves the wall back and
// returns keyboard focus to the pin's link.
watch(
    [id, onWall],
    ([next, shown], [previous] = []) => {
        if (!shown) return
        if (next) wall.focus(pinOf(next))
        else if (previous) {
            wall.unfocus()
            links[pinOf(previous)]?.focus({ preventScroll: true })
        }
    },
    { immediate: true },
)

// A tap on the wall that lands on a pin opens it.
watch(wall.picked, (pin) => {
    if (!pin) return
    wall.picked.value = null
    const page = PINS.find((p) => p.id === pin)?.page
    if (page && page !== id.value) router.push(`/projects/${page}`)
})

const close = () => router.push('/projects')

onBeforeUnmount(() => wall.highlight(null))
</script>

<style scoped>
.wall-head {
    display: flex;
    max-width: 26rem;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
    text-shadow: 0 0 0.75rem var(--color-bg-base), 1px 1px 0 var(--color-bg-base);
}

.wall-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    pointer-events: auto;
}

.wall-index ol {
    margin: 0;
    padding: 0;
    list-style: none;
}

/* Off screen until it has focus. Then it shows as a small label above the pad. */
.wall-index a {
    position: fixed;
    z-index: 25;
    bottom: 1rem;
    left: -9999px;
    padding: 0.4rem 0.7rem;
    border: 2px solid var(--color-rose);
    border-radius: 4px;
    background: var(--color-bg-raised);
    color: var(--color-text-strong);
    font: 600 0.8rem/1.3 var(--font-label);
    white-space: nowrap;
}

.wall-index a:focus-visible {
    left: 1rem;
    outline: none;
}
</style>
