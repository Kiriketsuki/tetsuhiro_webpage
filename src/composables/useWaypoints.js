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
// The section index that a nav click or a number key scrolls to, or null. The scroll passes
// the sections between, and the camera waits for the last one, so a jump of two or more
// stops takes one arc and no chain of legs.
const jumping = ref(null)
// A scroll that never reaches its section (the visitor scrolls away) ends the jump.
const JUMP_TIMEOUT_MS = 1500
let jumpTimer = null

if (typeof window !== 'undefined' && window.matchMedia) {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = query.matches
    query.addEventListener('change', (e) => {
        reducedMotion.value = e.matches
    })
}

const clamp = (index) => Math.min(sections.length - 1, Math.max(0, index))

// A link from another page back to one home section, such as "back to the aerie" from the
// Projects wall, which goes to /#projects. The router hands the hash to land(), and Home opens
// on that section instead of the welcome.
export const homeAt = (section) => `/#${section}`
let landing = 0

// Called by the router before Home enters. It sets the section first, so the scene picks the
// section's stop for the move home. A visitor who has seen the aerie skips the gate. Returns
// false for a hash that names no section.
export function land(hash) {
    const index = sections.indexOf(hash.replace(/^#/, ''))
    if (index < 0) return false
    landing = index
    active.value = index
    if (ready.value) entered.value = true
    return true
}

// The section Home opens on, once. Every later visit to Home opens on the welcome again.
export function takeLanding() {
    const index = landing
    landing = 0
    return index
}

// Shared state for the page and the scene. Home.vue writes `active` from the scroll,
// three.js reads it to move the camera.
export function useWaypoints() {
    const setActive = (index) => {
        active.value = clamp(index)
    }

    const goTo = (index) => {
        const el = document.querySelector(`.${sections[clamp(index)]}`)
        if (!el) return false
        if (clamp(index) !== active.value) {
            jumping.value = clamp(index)
            clearTimeout(jumpTimer)
            jumpTimer = setTimeout(() => {
                jumping.value = null
            }, JUMP_TIMEOUT_MS)
        }
        el.scrollIntoView({ behavior: reducedMotion.value ? 'auto' : 'smooth' })
        return true
    }

    return { active, ready, reducedMotion, progress, entered, loadError, jumping, setActive, goTo }
}
