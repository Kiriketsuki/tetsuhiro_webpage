<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useExplore } from '../composables/useExplore.js'

// `to` sends the back control to that route. Without it the control ends look-around mode
// on Home. An empty `back` hides the control. The `top` slot replaces the gesture hint.
const props = defineProps({
    to: { type: String, default: null },
    back: { type: String, default: 'back to the skills' },
})
const router = useRouter()
const { exploring, pan, zoom, tap, hover } = useExplore()

// One finger drags the view. Two fingers drag and pinch at the same time. One finger
// that lifts within TAP_SLOP pixels of where it went down is a tap.
const TAP_SLOP = 6
const pointers = new Map()
let last = null
let press = null

const snapshot = () => {
    const points = [...pointers.values()]
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length
    const spread = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0
    return { x, y, spread }
}

const onDown = (e) => {
    // Capture keeps the drag going if the finger slides off the pad. A pointer
    // that has already lifted cannot be captured, so that case is skipped.
    try {
        e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
        // The drag still works without capture.
    }
    press = pointers.size ? null : { x: e.clientX, y: e.clientY, type: e.pointerType }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    last = snapshot()
}

const onMove = (e) => {
    if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') hover(e.clientX, e.clientY)
        return
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) press = null
    const now = snapshot()
    pan(now.x - last.x, now.y - last.y)
    if (now.spread && last.spread) zoom(now.spread / last.spread, now.x, now.y)
    last = now
}

const onUp = (e) => {
    pointers.delete(e.pointerId)
    last = pointers.size ? snapshot() : null
    if (press && !pointers.size && e.type === 'pointerup') tap(press.x, press.y, press.type)
    press = null
}

// A trackpad pinch arrives as a wheel event too.
const onWheel = (e) => zoom(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY)

const leave = () => {
    if (props.to) router.push(props.to)
    else exploring.value = false
}

const onKey = (e) => {
    if (e.key === 'Escape') leave()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
    <div
        class="explore-pad"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @wheel.prevent="onWheel"
    >
        <slot name="top">
            <p class="label explore-hint">Drag to look around. Pinch or scroll to zoom. Tap a constellation to fly to it.</p>
        </slot>
        <button v-if="back" type="button" class="action explore-back" @pointerdown.stop @click="leave">
            {{ back }}
        </button>
    </div>
</template>

<style scoped>
/* Covers the scene so a drag moves the camera instead of the page. */
.explore-pad {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.25rem 1.5rem 4.25rem;
    touch-action: none;
    cursor: grab;
}

.explore-pad:active {
    cursor: grabbing;
}

.explore-hint {
    color: var(--color-text-muted);
    text-shadow: 1px 1px 0 var(--color-bg-base);
    pointer-events: none;
}

.explore-back {
    text-shadow: 1px 1px 0 var(--color-bg-base);
}
</style>
