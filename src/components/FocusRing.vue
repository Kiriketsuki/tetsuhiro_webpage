<template>
    <div v-if="enabled" ref="ring" class="focus-ring" :class="{ rest, hidden: !visible }" aria-hidden="true"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

// A soft ring around the pointer that marks the spot the lens clears (grade-pass.js). The
// native cursor stays. The ring shows only with a mouse, only over the open scene, and it
// fades with the lens through --aerie-lens, so it is gone during a flight between stops. It
// follows with a short lag and tightens when the pointer rests, like an autofocus bracket.
const props = defineProps({ active: { type: Boolean, default: true } })

// The ring lags the pointer by this time constant, in seconds.
const LAG = 0.06
// The pointer rests this long, in milliseconds, before the ring tightens.
const REST_MS = 200
// The ring hides over anything you can click and over the text panels.
const BUSY = 'a, button, input, textarea, select, label, [role="button"], .frame, #navbar'

const enabled = window.matchMedia('(hover: hover) and (pointer: fine)').matches
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const ring = ref(null)
const visible = ref(false)
const rest = ref(false)
const pointer = { x: 0, y: 0 }
const shown = { x: 0, y: 0 }
let frame = 0
let last = 0
let restTimer = 0

const step = (now) => {
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(0.1, (now - last) / 1000) / LAG)
    last = now
    shown.x += (pointer.x - shown.x) * k
    shown.y += (pointer.y - shown.y) * k
    // The translate property, not transform: CSS applies the scale property after translate but
    // before transform, so a transform translation took the 0.72 rest scale and pulled the ring
    // toward the top left of the page.
    if (ring.value) ring.value.style.translate = `${shown.x}px ${shown.y}px`
    const settled = Math.abs(pointer.x - shown.x) + Math.abs(pointer.y - shown.y) < 0.3
    frame = settled ? 0 : requestAnimationFrame(step)
}

const onMove = (e) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    visible.value = props.active && !e.target.closest?.(BUSY)
    rest.value = false
    clearTimeout(restTimer)
    restTimer = setTimeout(() => (rest.value = true), REST_MS)
    if (!frame) {
        last = performance.now()
        frame = requestAnimationFrame(step)
    }
}
const onLeave = () => (visible.value = false)

onMounted(() => {
    if (!enabled) return
    window.addEventListener('mousemove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
})
onBeforeUnmount(() => {
    window.removeEventListener('mousemove', onMove)
    document.documentElement.removeEventListener('mouseleave', onLeave)
    cancelAnimationFrame(frame)
    clearTimeout(restTimer)
})
</script>

<style scoped>
.focus-ring {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 30;
    width: 34px;
    height: 34px;
    margin: -17px 0 0 -17px;
    border: 1.5px solid #f3e3c3;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgb(20 12 16 / 0.45);
    pointer-events: none;
    opacity: calc(0.5 * var(--aerie-lens, 0));
    scale: 1;
    transition: scale 300ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 300ms ease-out;
    will-change: translate;
}

.focus-ring.rest {
    scale: 0.72;
    opacity: calc(0.85 * var(--aerie-lens, 0));
}

.focus-ring.hidden {
    opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
    .focus-ring {
        transition: opacity 150ms linear;
    }

    .focus-ring.rest {
        scale: 1;
    }
}
</style>
