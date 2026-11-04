<template>
    <div>
        <Name v-if="showGate" @lifted="showGate = false" />
        <div id="home" class="w-screen flex flex-col items-center justify-between" :style="{ visibility: entered ? 'visible' : 'hidden' }">
            <section class="snap-section welcome hero relative h-svh w-full">
                <h1 class="sr-only">Jovian Lim, software engineer in Singapore</h1>

                <div class="hero-inner">
                    <div class="hero-head">
                        <span ref="first" class="hero-word" aria-hidden="true">Jovian</span>
                        <p class="hero-role">software engineer in singapore</p>
                    </div>
                    <div class="hero-foot">
                        <span ref="second" class="hero-word" aria-hidden="true">Lim</span>
                        <div class="hero-readout">
                            <p class="hero-chapter">01 / arrival &middot; 1&deg;17&prime;N 103&deg;51&prime;E</p>
                            <button v-if="canWalk" type="button" class="action hero-scene" @click="startWalk('welcome')">
                                explore on foot
                            </button>
                        </div>
                    </div>
                </div>
            </section>
            <section class="snap-section h-svh w-full projects">
                <Projects />
            </section>
            <section class="snap-section h-svh w-full about">
                <About />
            </section>
            <section class="snap-section h-svh w-full skills">
                <Skills />
            </section>
            <section class="snap-section h-svh w-full contact">
                <Contact />
            </section>
        </div>
        <button v-if="visiting !== null" type="button" class="action view-back" @click="resumeWalk">
            back to walking
        </button>
        <ExplorePad v-if="exploring" />
        <PropTags v-if="propControls" />
    </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Name from '../components/Name.vue'
import About from '../components/About.vue'
import Skills from '../components/Skills.vue'
import Projects from '../components/Projects.vue'
import Contact from '../components/Contact.vue'
import ExplorePad from '../components/ExplorePad.vue'
import { useWaypoints, sections, takeLanding } from '../composables/useWaypoints.js'
import { useExplore } from '../composables/useExplore.js'
import { useWalk } from '../composables/useWalk.js'
import { useWall } from '../composables/useWall.js'
import { useTravel } from '../composables/useTravel.js'
import { waypoints } from '../data/waypoints.js'
import { useScramble } from '../composables/useScramble.js'
import { useProps } from '../composables/useProps.js'

// The labels of the props that open a page load once the scene has its props.
const PropTags = defineAsyncComponent(() => import('../components/PropTags.vue'))
const { controls: propControls } = useProps()

gsap.registerPlugin(ScrollTrigger)
// Phone toolbars grow and shrink the viewport while you scroll. Without this
// ScrollTrigger re-measures mid-scroll and the snap points jump.
ScrollTrigger.config({ ignoreMobileResize: true })

// On touch screens the browser snaps natively (CSS scroll-snap), which works
// with momentum scrolling instead of fighting it. Mouse and trackpad keep the
// GSAP snap.
const touch = window.matchMedia('(pointer: coarse)').matches

const { active, reducedMotion, entered, setActive, goTo } = useWaypoints()
const { scramble } = useScramble()
const { exploring, looking } = useExplore()
const { available: canWalk, walking, visiting, start: startWalk, resume: resumeWalk } = useWalk()
// The look-around and the walk hide the words and leave the aerie on its own. A zone card on
// the walk brings its section back. The words also wait while the iris of the telescope move runs,
// and while the camera comes back from the Projects wall.
const { settling } = useWall()
const wordsHidden = computed(() => exploring.value || looking.value || settling.value || (walking.value && visiting.value === null))
// The gate only shows on the first visit. Coming back from /projects skips it.
const showGate = ref(!entered.value)

const first = ref(null)
const second = ref(null)

let trigger = null

// The two words decode from noise once the gate is out of the way.
const decodeTitle = (delay) => {
    scramble(first.value, 1.4, { chars: 'lowerCase', delay, speed: 0.4 })
    scramble(second.value, 1.1, { chars: 'lowerCase', delay: delay + 0.35, speed: 0.4 })
}

// The title decodes once, the first time the welcome shows after the gate.
let decodePending = false

// Only the section in view shows, and only once the camera rests at its stop, so the words come
// after the move and never over it. Before the scene reports (no WebGL, or still loading) the
// section shows at once.
const { at } = useTravel()
const shownSection = computed(() => {
    const stop = waypoints[active.value]?.stop
    return at.value === undefined || at.value === stop ? active.value : -1
})

// A section fades out fast as its move starts and fades in slower once the camera rests. On
// mount the sections take their state at once, or every section flashed in before it hid.
const showSection = (index, instant = false) => {
    sections.forEach((name, i) => {
        gsap.to(`.${name}`, {
            autoAlpha: i === index ? 1 : 0,
            duration: instant || reducedMotion.value ? 0 : i === index ? 0.6 : 0.35,
        })
    })
}

const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || walking.value) return
    if (e.target.closest('input, textarea, select')) return
    const number = Number(e.key)
    if (number >= 1 && number <= sections.length) goTo(number - 1)
}

// A new section ends the look-around. The nav and keys 1 to 5 still work in it.
watch(active, () => {
    exploring.value = false
})

watch(shownSection, (index) => {
    showSection(index)
    if (index === 0 && decodePending) {
        decodePending = false
        decodeTitle(0.1)
    }
})

// Fades the page in under the lifting gate. The nav lantern sets entered back to false, and
// the gate comes back for a second look.
watch(entered, (value) => {
    if (!value) {
        showGate.value = true
        return
    }
    gsap.fromTo('#home', { autoAlpha: 0 }, { autoAlpha: wordsHidden.value ? 0 : 1, duration: reducedMotion.value ? 0 : 1, delay: reducedMotion.value ? 0 : 0.6 })
    decodePending = true
})

watch(wordsHidden, (value) => {
    gsap.to('#home', {
        autoAlpha: value ? 0 : 1,
        duration: reducedMotion.value ? 0 : 0.4,
    })
})

onMounted(async () => {
    await nextTick()
    // A link back from another page can open Home on one section (useWaypoints.js land).
    const start = takeLanding()
    window.scrollTo({ top: start ? document.querySelector(`.${sections[start]}`).offsetTop : 0, behavior: 'instant' })
    setActive(start)
    showSection(shownSection.value, true)
    // Back from the wall or the sky, the words wait for the camera, and the watch on wordsHidden
    // fades them in when it rests.
    if (wordsHidden.value) gsap.set('#home', { autoAlpha: 0 })
    if (entered.value && shownSection.value === 0) decodeTitle(0.2)
    else if (entered.value) decodePending = true

    trigger = ScrollTrigger.create({
        trigger: '#home',
        start: 'top top',
        end: 'bottom bottom',
        snap: touch
            ? false
            : {
                  snapTo: 1 / (sections.length - 1),
                  duration: { min: 0.2, max: 0.6 },
                  ease: 'power1.inOut',
              },
        onUpdate: (self) => setActive(Math.round(self.progress * (sections.length - 1))),
    })
    if (touch) document.documentElement.classList.add('touch-snap')
    window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
    trigger?.kill()
    exploring.value = false
    document.documentElement.classList.remove('touch-snap')
    window.removeEventListener('keydown', onKey)
})
</script>

<style>
html.touch-snap {
    scroll-snap-type: y mandatory;
}

html.touch-snap .snap-section {
    scroll-snap-align: start;
    scroll-snap-stop: always;
}

body {
    overflow-x: hidden;
    background-color: var(--color-bg-base);
}

/*
 * The plants_in_space title: one word top left, one bottom right. The two
 * words frame the aerie instead of sitting on it. The width cap keeps them
 * close to the aerie on a wide screen. The aerie grows with the screen height,
 * so the cap grows with it too: at 92rem, Lim sat on the rock of the aerie on a
 * 2560x1080 screen.
 *
 * Each word carries one brass line. The role sits under Jovian, and the chapter
 * readout and the action sit under Lim, flush with its right edge. The eye
 * reads the name from top left to bottom right and ends on the action. When the
 * action sat in the left column, it floated in the sky beside the aerie on a
 * wide screen, far from the word it belonged to.
 */
.hero-inner {
    position: relative;
    z-index: 10;
    display: flex;
    max-width: max(92rem, 170svh);
    margin-inline: auto;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    padding: clamp(2.5rem, 6vh, 4rem) clamp(1.5rem, 5vw, 4.5rem) clamp(6rem, 13vh, 8rem);
    --hero-size: clamp(5rem, 13vw, 11rem);
}

.hero-head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
}

.hero-foot {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
}

.hero-readout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem 1.25rem;
    margin-top: 1.1rem;
    padding-right: 0.3rem;
}

.hero-word {
    font-family: var(--font-display);
    font-size: var(--hero-size);
    line-height: 0.8;
    color: var(--color-text-strong);
    text-shadow: 1px 1px 0 var(--color-bg-base);
    user-select: none;
}

.hero-role {
    /* The line height of the words cuts off the hook of the J, so the role keeps clear of it. */
    margin-top: calc(var(--hero-size) * 0.2);
    padding-left: 0.3rem;
    color: var(--color-sand);
    font-family: var(--font-label);
    font-size: clamp(0.7rem, 0.75vw, 1rem);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-shadow: 1px 1px 0 var(--color-bg-base);
}

.hero-chapter {
    color: var(--color-brass);
    font-family: var(--font-label);
    font-size: clamp(0.6rem, 0.6vw, 0.8rem);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-shadow: 1px 1px 0 var(--color-bg-base);
}

.hero-scene {
    align-self: center;
    text-shadow: 1px 1px 0 var(--color-bg-base);
}

.view-back {
    position: fixed;
    top: 1.25rem;
    right: 1.5rem;
    z-index: 20;
    text-shadow: 1px 1px 0 var(--color-bg-base);
}
</style>
