<template>
    <div class="prop-tags">
        <button
            v-for="prop in here"
            :key="prop.id"
            type="button"
            class="prop-tag"
            :aria-label="`${prop.name}, ${prop.verb}`"
            :class="{ shown: tag?.id === prop.id, touch: tag?.id === prop.id && tag.source === 'tap' }"
            :style="spots[prop.id] ? { left: `${spots[prop.id].x}px`, top: `${spots[prop.id].y}px` } : null"
            @focus="mark(prop.id, 'key')"
            @blur="mark(null, 'key')"
            @click="openTag(prop)"
        >
            <span class="prop-name">{{ prop.name }}</span>
            <span class="prop-verb">{{ prop.verb }}</span>
        </button>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { PROPS } from '../data/props.js'
import { waypoints } from '../data/waypoints.js'
import { useProps } from '../composables/useProps.js'
import { useWaypoints } from '../composables/useWaypoints.js'
import { useExplore } from '../composables/useExplore.js'
import { useWalk } from '../composables/useWalk.js'

// The labels of the props on the home walk (src/data/props.js) and the input that reaches
// them. A mouse that rests over a prop lights it and names it, and a click opens it. On touch
// the first tap names the prop and the second tap, on the prop or its label, opens it, as
// the pins on the wall do. Each prop of the section in view is a button too, so the keyboard
// and a screen reader reach it: focus names the prop and Enter opens it.

// The pointer rests this long, in milliseconds, before the hit test runs. The camera drifts
// after the pointer for about half a second, so the prop under a still pointer can move. A
// second test runs once the drift has settled.
const REST_MS = 60
const DRIFT_MS = 450
// The click that a finger tap fires can land on the label that the same tap just showed, so
// a label takes clicks only after a moment.
const TAG_GUARD_MS = 350
// Page parts over the scene. A pointer on them is not on a prop.
const OVER_SCENE = 'a, button, input, select, textarea, label, nav, .frame, .explore-pad, .hero-word, .hero-role, .hero-chapter'

const router = useRouter()
const { controls } = useProps()
const { active, entered } = useWaypoints()
const { exploring, looking } = useExplore()
const { walking, visiting } = useWalk()

const stop = computed(() => waypoints[active.value]?.stop)
// The walk on foot turns the props off, so a tap for the joystick never opens a page. A zone
// card on the walk brings its section and its props back.
const open = computed(() => entered.value && !exploring.value && !looking.value && !(walking.value && visiting.value === null))
const here = computed(() => (open.value ? PROPS.filter((prop) => prop.stop === stop.value) : []))

// The marked prop: lit in the scene, with its label on screen. source says what marked it, so
// a mouse that leaves a prop does not clear a mark that the keyboard or a tap set.
const marked = ref(null)
const mark = (id, source) => {
    if (!id) {
        if (marked.value?.source === source) marked.value = null
    } else marked.value = { id, source }
}
watch(marked, (next) => {
    controls.value.mark(next?.id ?? null)
    document.documentElement.classList.toggle('prop-hover', next?.source === 'mouse')
})
// A new section or a look-around ends the mark. The props are live only while Home is open.
watch([stop, open], () => (marked.value = null))
watch(open, (on) => controls.value.enable(on), { immediate: true })

// Each label follows its prop while the camera drifts, once per frame while one shows. The
// other buttons keep their last place, so focus finds them there.
const spots = ref({})
const tag = ref(null)
let frame = 0
const place = () => {
    frame = 0
    const at = marked.value && controls.value.screenOf(marked.value.id)
    if (at) spots.value = { ...spots.value, [marked.value.id]: at }
    tag.value = at ? marked.value : null
    if (tag.value) frame = requestAnimationFrame(place)
}
watch(marked, () => {
    cancelAnimationFrame(frame)
    place()
})
let tagAt = 0
watch(() => tag.value?.id, (next) => (tagAt = next ? performance.now() : 0))

const go = (prop) => {
    marked.value = null
    router.push(prop.to)
}
const openTag = (prop) => {
    // A keyboard click has no pointer, so it never waits.
    if (marked.value?.source === 'key' || performance.now() - tagAt > TAG_GUARD_MS) go(prop)
}

const overScene = (target) => !(target instanceof Element) || !target.closest(OVER_SCENE)
const hit = (x, y) => (open.value ? controls.value.at(x, y) : null)
const propOf = (id) => PROPS.find((prop) => prop.id === id)

// The hit test runs once the mouse rests, never on every move.
// A mouse that came to rest during a flight tests again once the camera reaches the stop.
let rest = 0
let mouse = null
const test = () => mouse && mark(overScene(mouse.target) ? hit(mouse.x, mouse.y) : null, 'mouse')
const onMove = (e) => {
    if (e.pointerType !== 'mouse') return
    clearTimeout(rest)
    mouse = { x: e.clientX, y: e.clientY, target: e.target }
    rest = setTimeout(() => {
        test()
        rest = setTimeout(test, DRIFT_MS)
    }, REST_MS)
}
const onLeave = () => {
    clearTimeout(rest)
    mouse = null
    mark(null, 'mouse')
}

let pointerType = 'mouse'
const onDown = (e) => (pointerType = e.pointerType)
const onClick = (e) => {
    if (!overScene(e.target)) return
    const id = hit(e.clientX, e.clientY)
    if (pointerType === 'mouse') {
        if (id) go(propOf(id))
        return
    }
    if (!id) mark(null, marked.value?.source)
    else if (marked.value?.id === id) go(propOf(id))
    else mark(id, 'tap')
}

onMounted(() => {
    controls.value.onLive(test)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true, capture: true })
    window.addEventListener('click', onClick)
    document.documentElement.addEventListener('mouseleave', onLeave)
})
onBeforeUnmount(() => {
    clearTimeout(rest)
    cancelAnimationFrame(frame)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerdown', onDown, { capture: true })
    window.removeEventListener('click', onClick)
    document.documentElement.removeEventListener('mouseleave', onLeave)
    document.documentElement.classList.remove('prop-hover')
    controls.value.onLive(null)
    controls.value.enable(false)
    controls.value.mark(null)
})
</script>

<style>
html.prop-hover body {
    cursor: pointer;
}

/* A small night glass label in a brass ring, over the prop it names. Out of view it stays
   focusable, so the keyboard reaches each prop. */
.prop-tag {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 15;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.4rem 0.7rem 0.45rem;
    border: 1px solid var(--color-brass-soft);
    background: var(--color-glass-deep);
    backdrop-filter: blur(8px);
    white-space: nowrap;
    opacity: 0;
    transform: translate(-50%, calc(-100% - 0.9rem));
    transition: opacity 0.2s;
    pointer-events: none;
}

/* A short brass leader from the label down to the prop. */
.prop-tag::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    width: 1px;
    height: 0.9rem;
    background: var(--color-brass-soft);
}

.prop-tag.shown,
.prop-tag:focus-visible {
    opacity: 1;
}

.prop-tag.touch {
    padding: 0.6rem 0.9rem;
    pointer-events: auto;
}

.prop-tag:focus-visible {
    outline: 2px solid var(--color-action-text);
    outline-offset: 2px;
}

.prop-name {
    color: var(--color-gold);
    font: italic 1.05rem/1 var(--font-display);
}

.prop-verb {
    color: var(--color-action-text);
    font: 600 0.66rem/1 var(--font-label);
    letter-spacing: 0.14em;
    text-transform: uppercase;
}

.prop-verb::after {
    content: ' \2192';
}

@media (prefers-reduced-motion: reduce) {
    .prop-tag {
        transition: none;
    }
}
</style>
