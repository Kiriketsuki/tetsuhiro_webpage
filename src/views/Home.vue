<template>
    <div>
        <Name v-if="showGate" @lifted="showGate = false" />
        <div ref="blob" class="blob" :class="{ shown: blobShown }" aria-hidden="true"></div>
        <div id="home" class="w-screen flex flex-col items-center justify-between" :style="{ visibility: entered ? 'visible' : 'hidden' }">
            <section class="snap-section dodecahedron hero relative h-svh w-full">
                <h1 class="sr-only">Jovian Lim, software engineer in Singapore</h1>

                <div class="hero-inner">
                    <div class="flex flex-col items-start gap-4">
                        <span ref="first" class="hero-word" aria-hidden="true">Jovian</span>
                        <p class="hero-role">software engineer in singapore</p>
                        <button type="button" class="action hero-scene" @click="sceneOnly = true">
                            just the island
                        </button>
                    </div>
                    <div class="flex flex-row-reverse">
                        <span ref="second" class="hero-word" aria-hidden="true">Lim</span>
                    </div>
                </div>
            </section>
            <section class="snap-section h-svh w-full about">
                <About />
            </section>
            <section class="snap-section h-svh w-full skills">
                <Skills />
            </section>
            <section class="snap-section h-svh w-full projects">
                <Projects />
            </section>
            <section class="snap-section h-svh w-full contact">
                <Contact />
            </section>
        </div>
        <button v-if="sceneOnly" type="button" class="action view-back" @click="sceneOnly = false">
            bring the words back
        </button>
        <ExplorePad v-if="exploring" />
    </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Name from '../components/Name.vue'
import About from '../components/About.vue'
import Skills from '../components/Skills.vue'
import Projects from '../components/Projects.vue'
import Contact from '../components/Contact.vue'
import ExplorePad from '../components/ExplorePad.vue'
import { useWaypoints, sections } from '../composables/useWaypoints.js'
import { useExplore } from '../composables/useExplore.js'
import { useScramble } from '../composables/useScramble.js'
import { useBlob } from '../composables/useBlob.js'

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
const sceneOnly = ref(false)
const { exploring } = useExplore()
// Both modes hide the words and leave the island on its own.
const wordsHidden = computed(() => sceneOnly.value || exploring.value)
// The gate only shows on the first visit. Coming back from /projects skips it.
const showGate = ref(!entered.value)

const blob = ref(null)
const first = ref(null)
const second = ref(null)
useBlob(blob)

// The blob belongs to the title. It leaves with it.
const blobShown = computed(() => entered.value && active.value === 0 && !wordsHidden.value)

let trigger = null

// The two words decode from noise once the gate is out of the way.
const decodeTitle = (delay) => {
    scramble(first.value, 1.4, { chars: 'lowerCase', delay, speed: 0.4 })
    scramble(second.value, 1.1, { chars: 'lowerCase', delay: delay + 0.35, speed: 0.4 })
}

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

// A new section ends the look-around. The nav and keys 1 to 5 still work in it.
watch(active, (index) => {
    exploring.value = false
    showSection(index)
})

// Fades the page in under the lifting gate.
watch(entered, (value) => {
    if (!value) return
    gsap.fromTo('#home', { autoAlpha: 0 }, { autoAlpha: wordsHidden.value ? 0 : 1, duration: reducedMotion.value ? 0 : 1, delay: reducedMotion.value ? 0 : 0.6 })
    decodeTitle(0.7)
})

watch(wordsHidden, (value) => {
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
    if (entered.value) decodeTitle(0.2)

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
 * words frame the portal and the dodecahedron instead of sitting on them.
 */
.hero-inner {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    padding: clamp(2.5rem, 6vh, 4rem) clamp(1.5rem, 5vw, 4.5rem) clamp(6rem, 13vh, 8rem);
}

.hero-word {
    font-family: var(--font-display);
    font-size: clamp(5rem, 13vw, 11rem);
    line-height: 0.8;
    color: var(--color-text-strong);
    text-shadow: 1px 1px 0 var(--color-bg-base);
    user-select: none;
}

.hero-role {
    margin-top: 0.9rem;
    padding-left: 0.3rem;
    color: var(--color-sand);
    font-family: var(--font-label);
    font-size: clamp(0.7rem, 0.9vw, 0.85rem);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-shadow: 1px 1px 0 var(--color-bg-base);
}

.hero-scene {
    margin-left: 0.3rem;
    text-shadow: 1px 1px 0 var(--color-bg-base);
}

/* rose, violet and sand, low and slow. */
.blob {
    position: fixed;
    left: 30%;
    top: 40%;
    z-index: 0;
    width: 36vmax;
    aspect-ratio: 1;
    translate: -50% -50%;
    border-radius: 50%;
    background: linear-gradient(to right, var(--color-rose), var(--color-violet), var(--color-sand));
    filter: blur(90px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.8s;
    animation: blob-turn 24s linear infinite;
}

.blob.shown {
    opacity: 0.22;
}

@keyframes blob-turn {
    from {
        rotate: 0deg;
    }
    50% {
        scale: 1 1.4;
    }
    to {
        rotate: 360deg;
    }
}

@media (prefers-reduced-motion: reduce) {
    .blob {
        animation: none;
    }
}

.view-back {
    position: fixed;
    top: 1.25rem;
    right: 1.5rem;
    z-index: 20;
    text-shadow: 1px 1px 0 var(--color-bg-base);
}
</style>
