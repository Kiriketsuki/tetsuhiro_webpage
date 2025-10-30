import { ref } from 'vue'
import { waypoints } from '../data/waypoints.js'

// Class names of the five h-screen sections on the home page, in camera order.
export const sections = waypoints.map((waypoint) => waypoint.section)

// Which side of the screen a section's text sits on. The camera keeps the
// subject on the other side.
export const sideOf = (section) => waypoints.find((waypoint) => waypoint.section === section)?.side ?? 'none'

const active = ref(0)
const ready = ref(false)
const reducedMotion = ref(false)
// Loading state for the gate. progress runs 0 to 1, entered flips once the
// visitor goes through the gate, loadError holds a message if a file failed.
const progress = ref(0)
const entered = ref(false)
const loadError = ref('')

if (typeof window !== 'undefined' && window.matchMedia) {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = query.matches
    query.addEventListener('change', (e) => {
        reducedMotion.value = e.matches
    })
}

const clamp = (index) => Math.min(sections.length - 1, Math.max(0, index))

// Shared state for the page and the scene. Home.vue writes `active` from the scroll,
// three.js reads it to move the camera.
export function useWaypoints() {
    const setActive = (index) => {
        active.value = clamp(index)
    }

    const goTo = (index) => {
        const el = document.querySelector(`.${sections[clamp(index)]}`)
        if (!el) return false
        el.scrollIntoView({ behavior: reducedMotion.value ? 'auto' : 'smooth' })
        return true
    }

    return { active, ready, reducedMotion, progress, entered, loadError, setActive, goTo }
}
