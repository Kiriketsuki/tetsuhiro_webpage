<template>
    <div>
        <Name v-if="showGate" @lifted="showGate = false" />
        <div id="home" class="w-screen flex flex-col items-center justify-between" :style="{ visibility: entered ? 'visible' : 'hidden' }">
            <section class="h-screen w-full dodecahedron">
                <div class="h-full lg:w-1/2 bg-transparent z-10 flex flex-col items-center justify-center font-slab lg:text-[clamp(3rem,9vw,9rem)] text-5xl text-secondary px-10 rounded-3xl w-full">
                    Welcome
                    <button type="button" class="view-scene" @click="sceneOnly = true">
                        View Scene
                    </button>
                </div>
            </section>
            <section class="h-screen w-full about">
                <About />
            </section>
            <section class="h-screen w-full skills">
                <Skills />
            </section>
            <section class="h-screen w-full projects">
                <Projects />
            </section>
            <section class="h-screen w-full contact">
                <Contact />
            </section>
        </div>
        <button v-if="sceneOnly" type="button" class="view-scene back" @click="sceneOnly = false">
            Back to page
        </button>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Name from '../components/Name.vue'
import About from '../components/About.vue'
import Skills from '../components/Skills.vue'
import Projects from '../components/Projects.vue'
import Contact from '../components/Contact.vue'
import { useWaypoints, sections } from '../composables/useWaypoints.js'

gsap.registerPlugin(ScrollTrigger)

const { active, reducedMotion, entered, setActive, goTo } = useWaypoints()
const sceneOnly = ref(false)
// The gate only shows on the first visit. Coming back from /projects skips it.
const showGate = ref(!entered.value)

let trigger = null

// Only the section in view shows. The camera moves to match it.
const showSection = (index) => {
    sections.forEach((name, i) => {
        gsap.to(`.${name}`, {
            autoAlpha: i === index ? 1 : 0,
            duration: reducedMotion.value ? 0 : 0.6,
        })
    })
}

const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.target.closest('input, textarea, select')) return
    const number = Number(e.key)
    if (number >= 1 && number <= sections.length) goTo(number - 1)
}

watch(active, showSection)

// Fades the page in under the lifting gate.
watch(entered, (value) => {
    if (!value) return
    gsap.fromTo('#home', { autoAlpha: 0 }, { autoAlpha: 1, duration: reducedMotion.value ? 0 : 1, delay: reducedMotion.value ? 0 : 0.6 })
})

watch(sceneOnly, (value) => {
    gsap.to('#home', {
        autoAlpha: value ? 0 : 1,
        duration: reducedMotion.value ? 0 : 0.4,
    })
})

onMounted(async () => {
    await nextTick()
    window.scrollTo(0, 0)
    setActive(0)
    showSection(0)

    trigger = ScrollTrigger.create({
        trigger: '#home',
        start: 'top top',
        end: 'bottom bottom',
        snap: {
            snapTo: 1 / (sections.length - 1),
            duration: { min: 0.2, max: 0.6 },
            ease: 'power1.inOut',
        },
        onUpdate: (self) => setActive(Math.round(self.progress * (sections.length - 1))),
    })
    window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
    trigger?.kill()
    window.removeEventListener('keydown', onKey)
})
</script>

<style>
body {
    overflow-x: hidden;
    background-color: var(--color-bg-base);
}

.dodecahedron {
    text-shadow: 1px 1px black;
}

.view-scene {
    z-index: 20;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    background: var(--color-ruby);
    color: var(--color-bg-base);
    font-family: var(--font-label);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-shadow: none;
}

.view-scene:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: 2px;
}

.view-scene.back {
    position: fixed;
    top: 1rem;
    right: 1rem;
}
</style>
