<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { useExplore } from '../composables/useExplore.js'

const { exploring, pan, zoom } = useExplore()

// One finger drags the view. Two fingers drag and pinch at the same time.
const pointers = new Map()
let last = null

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
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    last = snapshot()
}

const onMove = (e) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const now = snapshot()
    pan(now.x - last.x, now.y - last.y)
    if (now.spread && last.spread) zoom(now.spread / last.spread)
    last = now
}

const onUp = (e) => {
    pointers.delete(e.pointerId)
    last = pointers.size ? snapshot() : null
}

// A trackpad pinch arrives as a wheel event too.
const onWheel = (e) => zoom(Math.exp(-e.deltaY * 0.0015))

const leave = () => {
    exploring.value = false
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
        <p class="label explore-hint">Drag to look around. Pinch or scroll to zoom.</p>
        <button type="button" class="action explore-back" @pointerdown.stop @click="leave">
            back to the skills
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
