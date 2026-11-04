<template>
    <main class="about-room" :class="{ waiting: !arrived }">
        <!-- Under the controls: a drag turns the view, a tap opens the lit thing under it. -->
        <div
            v-if="live"
            class="room-pad"
            aria-hidden="true"
            @pointerdown="onDown"
            @pointermove="onMove"
            @pointerup="onUp"
            @pointercancel="onUp"
        ></div>

        <header class="room-head">
            <div class="room-plate">
                <router-link :to="AERIE" class="room-back">
                    <span aria-hidden="true" class="room-arrow">&larr;</span>
                    <span>Back to the aerie</span>
                </router-link>
                <p class="label room-kicker">03 / about</p>
                <h1 class="room-name">Jovian Lim</h1>
                <p class="label room-hint">{{ live ? hint : 'up the tower' }}</p>
            </div>
            <div class="room-chips">
                <button v-if="live && !opened" type="button" class="room-chip" @click="open(points[0].id)">Take the tour</button>
                <button type="button" class="room-chip" :aria-expanded="factsOpen" aria-controls="room-facts" @click="factsOpen = !factsOpen">
                    All facts
                </button>
            </div>
        </header>

        <!-- Each lit thing is a button, so Tab steps round the room in story order and Enter opens
             its note. A thing the view does not show turns into view when it takes focus. -->
        <ol v-if="live && !opened" class="room-tags" aria-label="Things in the room">
            <li v-for="tag in tags" :key="tag.id">
                <button
                    :ref="(el) => (buttons[tag.id] = el)"
                    type="button"
                    class="room-tag"
                    :class="{ away: !tag.shown, flip: tag.flip }"
                    :style="{ left: `${tag.x}px`, top: `${tag.y}px` }"
                    :aria-label="`${tag.thing}: ${tag.title}`"
                    @pointerdown.stop
                    @focus="onTagFocus(tag.id)"
                    @click="open(tag.id)"
                >
                    <span class="dot" aria-hidden="true"></span>
                    <span class="name" aria-hidden="true">{{ tag.thing }}</span>
                </button>
            </li>
        </ol>

        <RoomNote v-if="live && current" :point="current" :index="openIndex" :count="points.length" @prev="step(-1)" @next="step(1)" @close="close" />

        <aside v-if="factsOpen" id="room-facts" class="frame frame-line room-facts" aria-label="All facts" @pointerdown.stop>
            <span class="frame-legend">all facts</span>
            <dl class="rows text-sm">
                <template v-for="[key, value] in facts" :key="key">
                    <dt>{{ key }}</dt>
                    <dd>{{ value }}</dd>
                </template>
            </dl>
            <ul class="facts-links">
                <li v-for="link in socials" :key="link.href">
                    <a :href="link.href" target="_blank" rel="noopener" class="action">{{ link.label }}</a>
                </li>
            </ul>
            <button ref="factsClose" type="button" class="room-chip" @click="factsOpen = false">Close</button>
        </aside>

        <!-- Without the aerie (no WebGL, or a failed load) the room is a page of the same notes. -->
        <section v-if="failed" class="frame frame-rose room-plain">
            <span class="frame-legend">03 / about</span>
            <article v-for="point in points" :key="point.id" class="plain-note">
                <p class="label text-text-faint">{{ point.label }}</p>
                <h2 class="plain-title">{{ point.title }}</h2>
                <p v-for="line in point.body" :key="line" class="text-text-body">{{ line }}</p>
            </article>
            <ul class="facts-links">
                <li v-for="link in socials" :key="link.href">
                    <a :href="link.href" target="_blank" rel="noopener" class="action">{{ link.label }}</a>
                </li>
            </ul>
        </section>
    </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RoomNote from '../components/RoomNote.vue'
import { facts, points, socials } from '../data/room.js'
import { useRoom } from '../composables/useRoom.js'
import { homeAt, useWaypoints } from '../composables/useWaypoints.js'
import { useArrival } from '../composables/useTravel.js'

// /about is the bedroom on the top floor. The camera walks in through the balcony door
// (scene/aerie/room.js), the visitor looks round, and each lit thing opens one part of the
// story. The way back lands on the About section of the home page, outside the same door.
const AERIE = homeAt('about')
// A tap within this many pixels of a lit thing opens it, and a press that moves further is a drag.
const TAP_RADIUS = 56
const TAP_SLOP = 6
// A tag this close to the screen edge, in pixels, hides. A tag closer than FLIP to the right
// edge puts its name on the left of the dot, so the name stays on screen.
const EDGE = 24
const FLIP = 190

const router = useRouter()
const room = useRoom()
// The page waits for the camera to walk in through the balcony door.
const arrived = useArrival()
const { loadError } = useWaypoints()
const live = computed(() => room.shown.value)
const failed = computed(() => Boolean(loadError.value))
const opened = computed(() => room.opened.value)
const openIndex = computed(() => points.findIndex((point) => point.id === opened.value))
const current = computed(() => points[openIndex.value] ?? null)
const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const hint = coarse ? 'drag to look round, tap a lit thing' : 'drag or use the arrows to look round, click a lit thing'
const factsOpen = ref(false)
const factsClose = ref(null)
const buttons = {}

// The tags follow their things while the view moves, once per frame.
const tags = ref([])
let frame = 0
const place = () => {
    tags.value = points.map((point) => {
        const at = room.screenOf(point.id)
        const shown = Boolean(at?.ahead) && at.x > EDGE && at.x < window.innerWidth - EDGE && at.y > EDGE && at.y < window.innerHeight - EDGE
        return { ...point, x: at?.x ?? -999, y: at?.y ?? -999, shown, flip: shown && at.x > window.innerWidth - FLIP }
    })
    frame = requestAnimationFrame(place)
}

const open = (id) => {
    factsOpen.value = false
    room.opened.value = id
    room.visit(id)
}

// Back to the view from the stand. Keyboard focus goes back to the thing's tag.
const close = () => {
    const id = opened.value
    room.opened.value = null
    room.visit(null)
    nextTick(() => buttons[id]?.focus({ preventScroll: true }))
}

const step = (delta) => open(points[(openIndex.value + delta + points.length) % points.length].id)

// A tag that takes focus from the keyboard turns the view toward its thing.
let keyboard = false
const onTagFocus = (id) => {
    if (keyboard) room.face(id)
}

// One finger or the mouse drags the view. A press that lifts close to where it went down is a tap.
let press = null
const onDown = (e) => {
    try {
        e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
        // The drag still works without capture.
    }
    if (press) return
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false }
}
const onMove = (e) => {
    if (press?.id !== e.pointerId) return
    room.look(e.clientX - press.x, e.clientY - press.y)
    press.x = e.clientX
    press.y = e.clientY
    if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) > TAP_SLOP) press.moved = true
}
const onUp = (e) => {
    if (press?.id !== e.pointerId) return
    const tap = !press.moved && e.type === 'pointerup'
    press = null
    if (!tap) return
    if (opened.value) return close()
    const near = tags.value
        .filter((tag) => tag.shown)
        .map((tag) => ({ id: tag.id, d: Math.hypot(tag.x - e.clientX, tag.y - e.clientY) }))
        .sort((a, b) => a.d - b.d)[0]
    if (near && near.d < TAP_RADIUS) open(near.id)
}

// Escape closes the facts, then the note, then leaves the room. The arrows look round, or step
// from note to note while one is open.
const LOOK_KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
const onKey = (e) => {
    keyboard = true
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Escape') {
        if (factsOpen.value) factsOpen.value = false
        else if (opened.value) close()
        else router.push(AERIE)
        return
    }
    const turn = LOOK_KEYS[e.key]
    if (!turn || !live.value) return
    e.preventDefault()
    if (opened.value) {
        if (turn[0]) step(turn[0])
    } else room.nudge(...turn)
}
const onPointer = () => (keyboard = false)

watch(factsOpen, (value) => {
    if (value) nextTick(() => factsClose.value?.focus({ preventScroll: true }))
})

onMounted(() => {
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    place()
})

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('pointerdown', onPointer, true)
    cancelAnimationFrame(frame)
})
</script>

<style scoped>
.about-room {
    transition: opacity 0.6s ease;
}

/* The page waits while the camera moves into the view, then fades in (useArrival). */
.waiting {
    visibility: hidden;
    opacity: 0;
}

/* Covers the scene, so a drag turns the view instead of scrolling the page. */
.room-pad {
    position: fixed;
    inset: 0;
    z-index: 20;
    touch-action: none;
    cursor: grab;
}

.room-pad:active {
    cursor: grabbing;
}

.room-head {
    position: fixed;
    z-index: 30;
    top: 0;
    right: 0;
    left: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.75rem 1.25rem;
    padding: clamp(0.75rem, 2.5vh, 1.5rem) clamp(0.75rem, 4vw, 4.5rem);
    pointer-events: none;
}

.room-head > * {
    pointer-events: auto;
}

/* The header is one plate of flat night glass with a brass hairline, as on /skills, and the way
   out sits first in it, so it is close and easy to find. Glass and brass only, with no gradient
   (docs/design-system.md). The plate and its keys have square corners, so a plain 1 px border
   draws each ring. The plate takes no pointer events, so a drag that starts on it still turns
   the view. */
.room-plate {
    display: flex;
    width: min(100%, 21rem);
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
    padding: 0.75rem 1.25rem 1rem 0.75rem;
    border: 1px solid var(--color-brass-soft);
    background: var(--color-glass);
    backdrop-filter: blur(10px);
    pointer-events: none;
}

/* The back key: a blonde ring with a faint blonde fill, 48 px tall for a thumb. */
.room-back {
    display: inline-flex;
    min-height: 3rem;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.5rem;
    padding: 0 1.1rem;
    border: 1px solid var(--color-action);
    background: color-mix(in oklab, var(--color-action) 20%, transparent);
    color: var(--color-text-strong);
    font: 600 0.75rem/1 var(--font-label);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    pointer-events: auto;
    transition: background-color 0.2s;
}

.room-back:hover {
    background: color-mix(in oklab, var(--color-action) 36%, transparent);
}

.room-arrow {
    color: var(--color-action-text);
    font-size: 1rem;
    letter-spacing: 0;
}

.room-back:focus-visible,
.room-chip:focus-visible,
.room-tag:focus-visible {
    outline: 2px solid var(--color-action-text);
    outline-offset: 3px;
}

.room-kicker {
    padding-left: 0.5rem;
    color: var(--color-rose);
}

.room-name {
    padding-left: 0.5rem;
    font-family: var(--font-display);
    font-size: clamp(2rem, 4vw, 2.75rem);
    line-height: 1.05;
    color: var(--color-text-strong);
}

.room-hint {
    padding-left: 0.5rem;
    color: var(--color-text-muted);
    font-size: 0.6875rem;
}

.room-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-left: auto;
}

.room-chip {
    min-height: 2.75rem;
    padding: 0 1rem;
    border: 1px solid var(--color-brass-dim);
    background: var(--color-glass-deep);
    color: var(--color-text-strong);
    font: 600 0.72rem/1 var(--font-label);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
}

.room-tags {
    margin: 0;
    padding: 0;
    list-style: none;
}

/* A lit dot on the thing, with its name beside it. The dot is a lamp, so it stays round. */
.room-tag {
    --lamp: var(--color-action);
    position: fixed;
    z-index: 25;
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.5rem;
    border: 0;
    background: none;
    transform: translate(-1.1rem, -50%);
    cursor: pointer;
}

/* A thing out of view keeps its tag in the Tab order, so the keyboard can still reach it and
   turn the view to it. Only the picture of the tag goes. */
.room-tag.flip {
    flex-direction: row-reverse;
    transform: translate(calc(-100% + 1.1rem), -50%);
}

.room-tag.away {
    opacity: 0;
    pointer-events: none;
}

.room-tag:focus-visible {
    opacity: 1;
}

.room-tag .dot {
    width: 0.85rem;
    height: 0.85rem;
    flex: none;
    border-radius: 50%;
    background: var(--lamp);
    /* A flat ring round the lamp, not a glow: no gradient (docs/design-system.md). */
    box-shadow: 0 0 0 0.3rem color-mix(in oklch, var(--lamp) 35%, transparent);
}

.room-tag .name {
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--color-brass-dim);
    background: var(--color-glass-deep);
    color: var(--color-text-strong);
    font: 600 0.68rem/1 var(--font-label);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
}

.room-tag:hover .dot {
    background: var(--color-text-strong);
}

.room-facts {
    position: fixed;
    z-index: 35;
    top: 5.5rem;
    right: clamp(0.75rem, 4vw, 4.5rem);
    display: flex;
    width: min(22rem, calc(100vw - 1.5rem));
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
}

.room-facts .room-chip {
    align-self: flex-end;
}

.facts-links {
    display: flex;
    gap: 1.5rem;
}

.room-plain {
    display: flex;
    max-width: 34rem;
    flex-direction: column;
    gap: 1.25rem;
    margin: 9rem auto 6rem;
    padding: 1.75rem;
}

.plain-title {
    font-family: var(--font-display);
    font-size: 1.6rem;
}

@media (max-width: 767px) {
    .room-name {
        display: none;
    }

    .room-facts {
        top: auto;
        bottom: 4.25rem;
    }
}
</style>
