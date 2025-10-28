import { onBeforeUnmount, onMounted } from 'vue'

// The plants_in_space blob: a big blurred gradient that drifts after the
// pointer. It eases over a second so it trails behind instead of sticking to
// the cursor. Touch screens and reduced motion leave it where the CSS puts it.
const TRAIL_MS = 1200

export function useBlob(blob) {
    const onMove = (event) => {
        const el = blob.value
        if (!el) return
        el.animate({ left: `${event.clientX}px`, top: `${event.clientY}px` }, { duration: TRAIL_MS, fill: 'forwards', easing: 'ease-out' })
    }

    onMounted(() => {
        const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (fine && !calm) window.addEventListener('pointermove', onMove)
    })

    onBeforeUnmount(() => window.removeEventListener('pointermove', onMove))
}
