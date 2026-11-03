<template>
    <main v-if="onWall">
        <!-- Escape closes the case folder first (CaseFolder.vue), then leaves the wall. -->
        <ExplorePad :to="id ? null : '/'" back="" :inert="Boolean(id)">
            <template #top>
                <header class="wall-head" :class="{ 'case-open': id }">
                    <p class="label">
                        <span class="text-rose">02 / projects</span>
                        <span class="text-text-muted">&middot; {{ hint }}</span>
                    </p>
                    <h1 class="font-slab text-[clamp(1.9rem,5vw,3.25rem)] leading-none text-text-strong">Things I have made</h1>
                    <!-- The folder tabs sit where the chips are, so the chips step aside while a case is open. -->
                    <div v-show="!id" class="chips" role="group" aria-label="Show one group of projects">
                        <button type="button" class="chip" :aria-pressed="!group" @pointerdown.stop @click="pick(null)">All</button>
                        <button
                            v-for="g in GROUPS"
                            :key="g.id"
                            type="button"
                            class="chip"
                            :aria-pressed="group === g.id"
                            @pointerdown.stop
                            @click="pick(g.id)"
                        >
                            <span class="chip-long">{{ g.title }}</span><span class="chip-short">{{ g.short }}</span>
                        </button>
                    </div>
                    <div v-show="!id" class="wall-actions">
                        <router-link to="/" class="action" @pointerdown.stop>back to the aerie</router-link>
                        <router-link :to="{ path: '/projects', query: { list: null } }" class="action" @pointerdown.stop>list view</router-link>
                    </div>
                </header>
            </template>
        </ExplorePad>

        <!-- The wall is a picture, so the pins are links here too: Tab marks each pin on the
             wall, and Enter opens its case. A link shows on screen only while it has focus. -->
        <nav class="wall-index" aria-label="Projects on the wall" :inert="Boolean(id)">
            <ol>
                <li v-for="pin in ordered" :key="pin.id">
                    <router-link
                        :ref="(el) => (links[pin.id] = el?.$el)"
                        :to="`/projects/${pin.page}`"
                        @focus="keyFocus(pin.id)"
                        @blur="mark(null, 'key')"
                    >
                        {{ pin.title }}, {{ pin.year }}
                    </router-link>
                </li>
            </ol>
        </nav>

        <!-- The tag names the pin under the mouse, the keyboard or a first tap. On touch it is a
             button too, so a tap on the tag opens the case. -->
        <button
            v-if="tag && !id"
            type="button"
            class="pin-tag"
            :class="{ touch: tag.source === 'tap' }"
            :style="{ left: `${tag.x}px`, top: `${tag.y}px` }"
            tabindex="-1"
            aria-hidden="true"
            @click="openTag"
        >
            <span class="ring"></span>{{ tag.title }}<span class="open">open</span>
        </button>

        <CaseFolder v-if="id" :id="id" @close="close" @open="follow" />
    </main>
    <ProjectDetail v-else-if="id" />
    <ProjectList v-else />
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ExplorePad from '../components/ExplorePad.vue'
import ProjectList from '../components/ProjectList.vue'
import CaseFolder from '../components/CaseFolder.vue'
import { GROUPS, PINS } from '../data/wall.js'
import { useWall } from '../composables/useWall.js'

// /projects is the evidence wall in the workshop once it has built, and /projects/<id> is the
// wall with that project's case folder open over it. Without the wall (no WebGL, a failed
// load, or ?list), they are the list page and the project page.
const ProjectDetail = defineAsyncComponent(() => import('./ProjectDetail.vue'))

const route = useRoute()
const router = useRouter()
const wall = useWall()
watch(
    () => 'list' in route.query,
    (list) => {
        if (list) wall.listed.value = true
    },
    { immediate: true },
)
const onWall = computed(() => wall.shown.value && !wall.listed.value)
const id = computed(() => (route.name === 'Project' ? route.params.id : null))
const pinOf = (page) => PINS.find((pin) => pin.page === page) ?? null
const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const hint = coarse ? 'pinch, drag, tap a card twice' : 'drag, scroll, click a card'

// Reading order: group by group as the wall reads, then top row first, left to right.
const groupAt = (pin) => GROUPS.findIndex((g) => g.id === pin.group)
const ordered = [...PINS].sort((a, b) => {
    if (groupAt(a) !== groupAt(b)) return groupAt(a) - groupAt(b)
    return Math.abs(a.at[1] - b.at[1]) < 0.1 ? a.at[0] - b.at[0] : b.at[1] - a.at[1]
})
const links = {}

// One group under the lamp, or the whole board.
const group = ref(null)
const pick = (next) => {
    group.value = next
    wall.filter(next)
}

// The marked pin: lifted on the wall, with its tag on screen. source says what marked it, so
// a mouse that leaves a pin does not clear a mark that the keyboard set.
const marked = ref(null)
const mark = (pinId, source) => {
    if (!pinId) {
        if (marked.value?.source === source) marked.value = null
    } else marked.value = { id: pinId, source }
    if (!id.value) wall.highlight(marked.value?.id ?? null, marked.value?.source === 'key')
}
watch(wall.hovered, (pinId) => mark(pinId, 'mouse'))

// The last input, so focus that returns to a link after a pointer closes a case marks no pin.
let keyboard = false
const onKeyInput = () => (keyboard = true)
const onPointerInput = () => (keyboard = false)
window.addEventListener('keydown', onKeyInput, true)
window.addEventListener('pointerdown', onPointerInput, true)
const keyFocus = (pinId) => {
    if (keyboard) mark(pinId, 'key')
}

// The tag follows its pin while the view moves, once per frame.
const tag = ref(null)
let frame = 0
const place = () => {
    frame = 0
    const m = marked.value
    const pin = m && PINS.find((p) => p.id === m.id)
    const at = pin && wall.screenOf(m.id)
    tag.value = at ? { id: m.id, title: pin.title, source: m.source, x: at.x, y: at.y } : null
    if (tag.value) frame = requestAnimationFrame(place)
}
watch(marked, () => {
    cancelAnimationFrame(frame)
    place()
})

// The click that a finger tap fires lands on the tag that this same tap just showed, so the
// tag takes clicks only after a moment.
let tagAt = 0
watch(() => tag.value?.id, (next) => (tagAt = next ? performance.now() : 0))
const openTag = () => {
    if (tag.value && performance.now() - tagAt > 350) open(tag.value.id)
}

const open = (pinId) => {
    const page = PINS.find((p) => p.id === pinId)?.page
    if (page && page !== id.value) router.push(`/projects/${page}`)
}

// A mouse click opens a pin at once. On touch the first tap names the pin and the second
// tap, on the pin or its tag, opens it. A tap on bare cork clears the mark.
watch(wall.picked, (tap) => {
    if (!tap || id.value) return
    if (!tap.id) {
        mark(null, marked.value?.source)
        return
    }
    if (tap.touch && marked.value?.id !== tap.id) mark(tap.id, 'tap')
    else open(tap.id)
})

// The case folder: its pin stays lifted on the wall behind the dim. Closing it returns
// keyboard focus to the pin's link.
watch(
    [id, onWall],
    ([next, shown], [previous, wasShown] = []) => {
        if (!shown) return
        if (next) {
            marked.value = null
            wall.highlight(pinOf(next)?.id ?? null, false)
            // A first case, or a case that was open before the wall had built (a direct visit).
            if (!previous || !wasShown) wall.peek()
        } else if (previous) {
            wall.highlight(null)
            wall.unfocus()
            // The links leave inert and the wall links show again only after the next render.
            nextTick(() => {
                const target = links[pinOf(previous)?.id] ?? document.querySelector('.wall-actions a')
                target?.focus({ preventScroll: true })
            })
        }
    },
    { immediate: true },
)

// A folder opened from the wall closes by going back, so Back never reopens it. A folder from
// a deep link has no wall entry behind it, so it swaps to the wall. A tab to a linked case
// replaces the open one, so Back still returns to the wall in one step.
const close = () => {
    if (window.history.state?.back === '/projects') router.back()
    else router.replace('/projects')
}
const follow = (page) => router.replace(`/projects/${page}`)

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyInput, true)
    window.removeEventListener('pointerdown', onPointerInput, true)
    cancelAnimationFrame(frame)
    wall.highlight(null)
    if (group.value) wall.filter(null)
})
</script>

<style scoped>
.wall-head {
    display: flex;
    max-width: 34rem;
    flex-direction: column;
    gap: 0.55rem;
    pointer-events: none;
    text-shadow: 0 0 0.75rem var(--color-bg-base), 1px 1px 0 var(--color-bg-base);
}

/* A phone folder covers the header, so the header steps out of the way under an open case. */
@media (max-width: 767px) {
    .wall-head.case-open {
        visibility: hidden;
    }
}

.wall-actions,
.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.5rem;
    pointer-events: auto;
}

.chip {
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--color-brass-dim);
    background: var(--color-glass-deep);
    color: var(--color-text-strong);
    font: 600 0.72rem/1 var(--font-label);
    letter-spacing: 0.03em;
    text-shadow: none;
    cursor: pointer;
}

.chip[aria-pressed='true'] {
    border-color: var(--color-action);
    background: var(--color-action);
    color: var(--color-bg-base);
}

.chip:focus-visible {
    outline: 2px solid var(--color-action-text);
    outline-offset: 2px;
}

.chip-short {
    display: none;
}

/* A phone keeps the chips on one row: short names, scrolling sideways if it must. */
@media (max-width: 767px) {
    .chips {
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
        max-width: calc(100vw - 3rem);
    }

    .chip-long {
        display: none;
    }

    .chip-short {
        display: inline;
    }
}

.wall-index ol {
    margin: 0;
    padding: 0;
    list-style: none;
}

/* Off screen until it has focus. Then it shows as a small label above the pad and the navbar. */
.wall-index a {
    position: fixed;
    z-index: 25;
    bottom: 4.25rem;
    left: -9999px;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--color-brass);
    background: var(--color-glass-deep);
    color: var(--color-text-strong);
    font: 600 0.8rem/1.3 var(--font-label);
    white-space: nowrap;
}

.wall-index a:focus-visible {
    left: 1rem;
    outline: none;
}

/* A paper tag that hangs just under the pin head. */
.pin-tag {
    position: fixed;
    z-index: 24;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.6rem;
    border: 0;
    border-radius: 999px;
    background: oklch(0.94 0.025 80);
    color: oklch(0.24 0.02 60);
    font: 600 0.74rem/1 var(--font-label);
    white-space: nowrap;
    box-shadow: 0 0.3rem 0.8rem rgb(0 0 0 / 0.45);
    transform: translate(-50%, 0.9rem);
    pointer-events: none;
}

.pin-tag.touch {
    padding: 0.55rem 0.8rem;
    pointer-events: auto;
}

.pin-tag .ring {
    width: 0.6rem;
    height: 0.6rem;
    border: 2px solid oklch(0.48 0.16 28);
    border-radius: 50%;
}

.pin-tag .open {
    padding-left: 0.4rem;
    border-left: 1px solid oklch(0.6 0.04 60 / 0.5);
    color: oklch(0.45 0.15 28);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}
</style>
