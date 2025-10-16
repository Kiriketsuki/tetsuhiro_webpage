import { ref } from 'vue'

// Class names of the five h-screen sections on the home page, in camera order.
export const sections = ['dodecahedron', 'about', 'skills', 'projects', 'contact']

const active = ref(0)
const ready = ref(false)
const reducedMotion = ref(false)

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

    return { active, ready, reducedMotion, setActive, goTo }
}
