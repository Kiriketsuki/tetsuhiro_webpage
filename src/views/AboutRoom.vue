<template>
    <main class="about-room" :class="{ waiting: !arrived }">
        <!-- Under the controls: a drag sways the view a little, and it settles back on release. -->
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
            <router-link :to="AERIE" class="room-back">
                <span aria-hidden="true" class="room-arrow">&larr;</span>
                <span>Back to the aerie</span>
            </router-link>
            <nav v-if="live" class="room-dots" aria-label="Tour stops">
                <button
                    v-for="(item, index) in stops"
                    :key="item.id"
                    type="button"
                    class="room-dot"
                    :class="{ seen: index <= stop, here: index === stop }"
                    :aria-label="`Stop ${index + 1}: ${item.thing}`"
                    :aria-current="index === stop ? 'step' : undefined"
                    @click="room.go(index)"
                ></button>
            </nav>
        </header>

        <p v-if="live && !arrived" class="label room-moving" aria-hidden="true">{{ stop === 0 ? 'coming in' : stops[stop].thing }}</p>

        <RoomNote
            v-if="live && arrived"
            :stop="stops[stop]"
            :index="stop"
            :count="stops.length"
            @next="room.go(stop + 1)"
            @prev="room.go(stop - 1)"
            @skip="room.go(stops.length - 1)"
            @restart="room.go(0)"
        />

        <!-- Without the aerie (no WebGL, or a failed load) the room is a page of the same notes. -->
        <section v-if="failed" class="frame frame-rose room-plain">
            <span class="frame-legend">about</span>
            <article v-for="item in stops" :key="item.id" class="plain-note">
                <p class="label text-text-faint">{{ item.label }}</p>
                <h2 class="plain-title">{{ item.title }}</h2>
                <p v-for="line in item.body" :key="line" class="text-text-body">{{ line }}</p>
            </article>
            <dl class="rows text-sm">
                <template v-for="[key, value] in facts" :key="key">
                    <dt>{{ key }}</dt>
                    <dd>{{ value }}</dd>
                </template>
            </dl>
            <ul class="plain-links">
                <li v-for="link in [...socials, steam]" :key="link.href">
                    <a :href="link.href" target="_blank" rel="noopener" class="action">{{ link.label }}</a>
                </li>
            </ul>
        </section>
    </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import RoomNote from '../components/RoomNote.vue'
import { facts, socials, steam, stops } from '../data/room.js'
import { useRoom } from '../composables/useRoom.js'
import { homeAt, useWaypoints } from '../composables/useWaypoints.js'
import { useArrival } from '../composables/useTravel.js'

// /about is the bedroom on the top floor, as a guided tour. The camera flies in through the
// balcony door (scene/aerie/room.js) and stops at one thing at a time. Each stop shows one note
// with one clear next step, and the last stop is the call to action. The way back lands on the
// About section of the home page, outside the same door.
const AERIE = homeAt('about')

const router = useRouter()
const room = useRoom()
// The page waits for the camera to walk in through the balcony door.
const arrived = useArrival()
const { loadError } = useWaypoints()
const live = computed(() => room.shown.value)
const failed = computed(() => Boolean(loadError.value))
const stop = computed(() => room.stop.value)
const arrived = computed(() => room.arrived.value)

// One finger or the mouse sways the view while it rests at a stop.
let press = null
const onDown = (e) => {
    try {
        e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
        // The sway still works without capture.
    }
    if (!press) press = { id: e.pointerId, x: e.clientX, y: e.clientY }
}
const onMove = (e) => {
    if (press?.id !== e.pointerId) return
    room.pan(e.clientX - press.x, e.clientY - press.y)
    press.x = e.clientX
    press.y = e.clientY
}
const onUp = (e) => {
    if (press?.id !== e.pointerId) return
    press = null
    room.release()
}

// The right arrow goes on and the left arrow goes back, Escape leaves the room. Enter and Space
// go on too, unless a link or a button has focus, which takes them itself.
const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Escape') {
        router.push(AERIE)
        return
    }
    if (!live.value) return
    const control = e.target instanceof Element && e.target.closest('a, button, input, textarea')
    const forward = e.key === 'ArrowRight' || (!control && (e.key === 'Enter' || e.key === ' '))
    if (forward || e.key === 'ArrowLeft') {
        e.preventDefault()
        room.go(stop.value + (forward ? 1 : -1))
    }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
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

/* Covers the scene, so a drag sways the view instead of scrolling the page. */
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
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
    padding: clamp(0.75rem, 2.5vh, 1.5rem) clamp(0.75rem, 4vw, 4.5rem);
    pointer-events: none;
}

.room-head > * {
    pointer-events: auto;
}

/* The way out: a blonde ring on night glass, 48 px tall for a thumb, always on screen. Glass and
   brass only, with no gradient (docs/design-system.md). */
.room-back {
    display: inline-flex;
    min-height: 3rem;
    align-items: center;
    gap: 0.6rem;
    padding: 0 1.1rem;
    border: 1px solid var(--color-action);
    background: var(--color-glass);
    backdrop-filter: blur(10px);
    color: var(--color-text-strong);
    font: 600 0.75rem/1 var(--font-label);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    transition: background-color 0.2s;
}

.room-back:hover {
    background: color-mix(in oklab, var(--color-action) 30%, var(--color-glass));
}

.room-arrow {
    color: var(--color-action-text);
    font-size: 1rem;
    letter-spacing: 0;
}

/* The stops as brass dots on a glass strip. A dot is a lamp, so it stays round. */
.room-dots {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--color-brass-dim);
    background: var(--color-glass);
    backdrop-filter: blur(10px);
}

.room-dot {
    display: grid;
    width: 1.75rem;
    height: 2.25rem;
    place-items: center;
    border: 0;
    background: none;
    cursor: pointer;
}

.room-dot::before {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--color-text-faint);
    content: '';
    transition:
        transform 0.2s,
        background-color 0.2s;
}

.room-dot.seen::before {
    background: var(--color-brass);
}

.room-dot.here::before {
    background: var(--color-action);
    transform: scale(1.5);
}

.room-dot:hover::before {
    background: var(--color-text-strong);
}

.room-back:focus-visible,
.room-dot:focus-visible {
    outline: 2px solid var(--color-action-text);
    outline-offset: 3px;
}

/* While the camera flies, a quiet line names where it goes. */
.room-moving {
    position: fixed;
    z-index: 25;
    left: clamp(1rem, 4vw, 4.5rem);
    bottom: 5.5rem;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--color-brass-dim);
    background: var(--color-glass);
    color: var(--color-text-muted);
    font-size: 0.7rem;
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

.plain-links {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
}

@media (max-width: 767px) {
    .room-dot {
        width: 1.35rem;
    }

    .room-moving {
        left: 0.75rem;
        bottom: 4.75rem;
    }
}
</style>
