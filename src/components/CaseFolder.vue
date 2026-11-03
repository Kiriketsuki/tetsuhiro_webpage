<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { findProject } from '../data/projects.js'
import { withPage } from '../data/project-pages.js'
import { PINS, STRINGS } from '../data/wall.js'

// The case folder for one project on the evidence wall. The wall stays in sight behind a
// light dim. The left page holds the screenshots as prints you swipe or step through, and a
// print opens full screen. The right page holds the notes. The cases that this one links to
// stick out as tabs along the top, and a tab opens that case. A phone shows the folder as a
// tall sheet from the bottom. It is plain HTML, so it reads sharp and screen readers read it.
const props = defineProps({ id: { type: String, required: true } })
const emit = defineEmits(['close', 'open'])

const project = computed(() => withPage(findProject(props.id)))
const pin = computed(() => PINS.find((p) => p.page === props.id) ?? null)
const caseNumber = computed(() => String(PINS.findIndex((p) => p.page === props.id) + 1).padStart(2, '0'))
const stack = computed(() => project.value.stack.split(', '))
const prints = computed(() => {
    const p = project.value
    const shots = p.cover ? [{ src: p.cover, alt: p.coverAlt ?? p.title }] : []
    return [...shots, ...p.gallery.filter((shot) => shot.src)]
})
// The linked cases, with the label of the red string that joins them.
const linked = computed(() => {
    if (!pin.value) return []
    return STRINGS.filter((s) => s.from === pin.value.id || s.to === pin.value.id)
        .map((s) => ({ pin: PINS.find((p) => p.id === (s.from === pin.value.id ? s.to : s.from)), label: s.label }))
        .filter((link) => link.pin)
})

const index = ref(0)
const strip = ref(null)
const title = ref(null)
const box = ref(-1)
const boxClose = ref(null)
let opener = null

// The prints scroll with snap points, so a finger swipes them natively. The arrows and the
// thumbnails scroll to one print, and the scroll position names the print on show.
const show = (i) => {
    const n = prints.value.length
    if (!n || !strip.value) return
    const next = (i + n) % n
    strip.value.scrollTo({ left: next * strip.value.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}
const onScroll = () => {
    if (strip.value) index.value = Math.round(strip.value.scrollLeft / Math.max(1, strip.value.clientWidth))
}

const openBox = (i, event) => {
    opener = event?.currentTarget ?? null
    box.value = i
    nextTick(() => boxClose.value?.focus())
}
const closeBox = () => {
    box.value = -1
    nextTick(() => opener?.focus())
}
const step = (d) => {
    const n = prints.value.length
    box.value = (box.value + d + n) % n
}

// A swipe in the lightbox steps the prints.
let swipe = null
const onBoxDown = (e) => (swipe = { x: e.clientX, y: e.clientY })
const onBoxUp = (e) => {
    if (!swipe) return
    const dx = e.clientX - swipe.x
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - swipe.y)) step(dx < 0 ? 1 : -1)
    swipe = null
}

// Esc closes the lightbox first, then the folder. The folder marks the key as handled, so the
// wall does not act on it too.
const onKey = (e) => {
    if (box.value >= 0) {
        if (e.key === 'Escape') closeBox()
        else if (e.key === 'ArrowRight') step(1)
        else if (e.key === 'ArrowLeft') step(-1)
        else return
        e.preventDefault()
        return
    }
    if (e.key === 'Escape') {
        e.preventDefault()
        emit('close')
    }
}

// The tap that opens a case also fires a click where the finger was, and the new folder is
// under it by then. The folder takes no clicks in its first moments, so that click opens nothing.
let born = 0
const guard = (e) => {
    if (performance.now() - born > 400) return
    e.stopPropagation()
    e.preventDefault()
}

// A new case starts on its first print, at the top, with its title in focus for screen readers.
const arrive = async () => {
    born = performance.now()
    index.value = 0
    box.value = -1
    await nextTick()
    if (strip.value) strip.value.scrollLeft = 0
    title.value?.focus({ preventScroll: true })
}
onMounted(() => {
    window.addEventListener('keydown', onKey)
    arrive()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(() => props.id, arrive)
</script>

<template>
    <div class="case-dim" aria-hidden="true" @pointerdown="emit('close')"></div>
    <section
        class="case"
        :class="{ single: !prints.length }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-title"
        @pointerdown.stop
        @wheel.stop
        @click.capture="guard"
    >
        <nav class="case-tabs" aria-label="Linked cases">
            <span class="case-tab is-open">Case {{ caseNumber }} &middot; {{ project.title }}</span>
            <button
                v-for="link in linked"
                :key="link.pin.id"
                type="button"
                class="case-tab"
                :title="link.label"
                @click="emit('open', link.pin.page)"
            >
                <span class="yarn" aria-hidden="true"></span>{{ link.pin.title }}
                <span class="sr-only">, linked: {{ link.label }}</span>
            </button>
        </nav>

        <button type="button" class="case-close" @click="emit('close')">
            <span aria-hidden="true">&larr;</span> Back to the wall <kbd aria-hidden="true">Esc</kbd>
        </button>

        <div :key="id" class="case-pages">
            <div v-if="prints.length" class="case-page case-prints">
                <template v-if="prints.length">
                    <div ref="strip" class="prints" tabindex="-1" @scroll.passive="onScroll">
                        <figure v-for="(shot, i) in prints" :key="shot.src" class="print">
                            <button type="button" class="print-open" @click="openBox(i, $event)">
                                <img :src="shot.src" :alt="shot.alt" :loading="i ? 'lazy' : 'eager'" decoding="async" />
                                <span class="sr-only">Open the screenshot full screen</span>
                            </button>
                            <figcaption>{{ shot.alt }}</figcaption>
                        </figure>
                    </div>
                    <div v-if="prints.length > 1" class="print-steps">
                        <button type="button" class="step" aria-label="Previous screenshot" @click="show(index - 1)">&lsaquo;</button>
                        <span class="count" aria-live="polite">{{ index + 1 }} / {{ prints.length }}</span>
                        <button type="button" class="step" aria-label="Next screenshot" @click="show(index + 1)">&rsaquo;</button>
                    </div>
                    <div v-if="prints.length > 1" class="thumbs">
                        <button
                            v-for="(shot, i) in prints"
                            :key="shot.src"
                            type="button"
                            :class="{ on: i === index }"
                            :aria-label="`Screenshot ${i + 1}`"
                            @click="show(i)"
                        >
                            <img :src="shot.src" alt="" loading="lazy" decoding="async" />
                        </button>
                    </div>
                </template>
            </div>

            <div class="case-page case-notes">
                <p class="meta">{{ [project.year, project.role].filter(Boolean).join(' / ') }}</p>
                <h2 id="case-title" ref="title" tabindex="-1">{{ project.title }}</h2>
                <div class="typed">
                    <p v-for="(paragraph, i) in project.body" :key="i">{{ paragraph }}</p>
                    <p v-if="project.note" class="note">{{ project.note }}</p>
                </div>
                <ul class="stack" aria-label="Stack">
                    <li v-for="name in stack" :key="name">{{ name }}</li>
                </ul>
                <div v-if="project.links.length" class="stamps">
                    <a v-for="link in project.links" :key="link.href" :href="link.href" target="_blank" rel="noopener">{{ link.label }}</a>
                </div>
            </div>
        </div>
    </section>

    <div
        v-if="box >= 0"
        class="lightbox"
        role="dialog"
        aria-modal="true"
        :aria-label="`Screenshot ${box + 1} of ${prints.length}`"
        @pointerdown.stop="onBoxDown"
        @pointerup="onBoxUp"
        @wheel.stop
    >
        <img :src="prints[box].src" :alt="prints[box].alt" />
        <p class="lightbox-caption">{{ prints[box].alt }} <span>{{ box + 1 }} / {{ prints.length }}</span></p>
        <button ref="boxClose" type="button" class="lightbox-close" aria-label="Close the screenshot" @click="closeBox">&times;</button>
        <template v-if="prints.length > 1">
            <button type="button" class="lightbox-step prev" aria-label="Previous screenshot" @click="step(-1)">&lsaquo;</button>
            <button type="button" class="lightbox-step next" aria-label="Next screenshot" @click="step(1)">&rsaquo;</button>
        </template>
    </div>
</template>

<style scoped>
/* Manila card stock, typed paper and a red stamp, in the wall's lamp light. */
.case {
    --manila: oklch(0.82 0.07 80);
    --manila-tab: oklch(0.76 0.075 78);
    --paper: oklch(0.96 0.02 85);
    --ink: oklch(0.24 0.02 60);
    --brown: oklch(0.45 0.08 50);
    --red: oklch(0.45 0.15 28);
    --rule: oklch(0.86 0.03 240);
    position: fixed;
    z-index: 30;
    /* Low enough that the top row of pins stays in sight above the folder. */
    top: clamp(8rem, 26vh, 15rem);
    bottom: 4.25rem;
    left: 50%;
    display: flex;
    width: min(70rem, calc(100vw - 2.5rem));
    flex-direction: column;
    translate: -50% 0;
    border-radius: 4px 4px 4px 4px;
    background: var(--manila);
    box-shadow: 0 1.5rem 3.5rem rgb(0 0 0 / 0.55);
    color: var(--ink);
    font: 0.95rem/1.55 var(--font-body);
    animation: case-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes case-in {
    from {
        opacity: 0;
        transform: translateY(1.5rem) rotate(-0.6deg);
    }
}

/* A light dim that fades out toward the top, so the tops of the pins stay readable. */
.case-dim {
    position: fixed;
    z-index: 29;
    inset: 0;
    background: linear-gradient(to bottom, rgb(10 8 12 / 0) 0, rgb(10 8 12 / 0) 20vh, rgb(10 8 12 / 0.3) 45vh);
}

.case-tabs {
    position: absolute;
    bottom: 100%;
    left: 1.5rem;
    right: 12rem;
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    scrollbar-width: none;
}

.case-tab {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.85rem 0.45rem;
    border: 0;
    border-radius: 6px 6px 0 0;
    background: var(--manila-tab);
    color: var(--ink);
    font: 600 0.72rem/1.2 var(--font-label);
    letter-spacing: 0.04em;
    cursor: pointer;
}

.case-tab.is-open {
    background: var(--manila);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: default;
}

.case-tab:not(.is-open):hover {
    background: var(--manila);
}

.yarn {
    width: 0.9rem;
    height: 2px;
    border-radius: 2px;
    background: var(--red);
}

.case-close {
    position: absolute;
    top: -2.6rem;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.5rem 0.8rem;
    border: 0;
    border-radius: 3px;
    background: var(--paper);
    color: var(--ink);
    font: 600 0.72rem/1 var(--font-label);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    box-shadow: 0 0.3rem 0.8rem rgb(0 0 0 / 0.4);
    cursor: pointer;
}

.case-close kbd {
    font: inherit;
    opacity: 0.55;
}

.case-pages {
    display: grid;
    min-height: 0;
    flex: 1;
    grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr);
    animation: case-flip 0.32s ease;
}

@keyframes case-flip {
    from {
        opacity: 0;
        transform: translateX(0.75rem);
    }
}

.case-page {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.6rem;
    overflow-y: auto;
    overscroll-behavior: contain;
}

.case-prints {
    border-right: 2px solid oklch(0.6 0.06 70 / 0.35);
}

.prints {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    outline: none;
}

.print {
    flex: 0 0 100%;
    margin: 0;
    padding: 0 0.25rem 0.5rem;
    scroll-snap-align: center;
}

.print-open {
    display: block;
    width: 100%;
    padding: 0.6rem 0.6rem 2rem;
    border: 0;
    background: oklch(0.98 0.01 85);
    box-shadow: 0 0.4rem 1rem rgb(60 40 20 / 0.35);
    cursor: zoom-in;
    rotate: -0.8deg;
}

.print-open img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    object-fit: cover;
    background: oklch(0.9 0.02 80);
}

.print figcaption {
    margin-top: -1.65rem;
    padding: 0 1rem;
    font: italic 400 1.05rem/1.2 var(--font-display);
    position: relative;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.print-steps {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.9rem;
}

.step {
    display: grid;
    width: 2.25rem;
    height: 2.25rem;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: oklch(0.3 0.03 60);
    color: var(--paper);
    font: 600 1.2rem/1 system-ui;
    cursor: pointer;
}

.count {
    font: 600 0.75rem/1 var(--font-label);
    font-variant-numeric: tabular-nums;
}

.thumbs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
    gap: 0.6rem;
}

.thumbs button {
    padding: 0.25rem;
    border: 0;
    background: oklch(0.98 0.01 85);
    box-shadow: 0 0.2rem 0.5rem rgb(60 40 20 / 0.3);
    opacity: 0.75;
    cursor: pointer;
}

.thumbs button.on {
    outline: 2px solid var(--red);
    outline-offset: 2px;
    opacity: 1;
}

.thumbs img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    object-fit: cover;
}

/* A case with no screenshots is one page of notes, so the folder narrows to fit it. */
.case.single {
    width: min(42rem, calc(100vw - 2.5rem));
}

.case.single .case-pages {
    grid-template-columns: minmax(0, 1fr);
}

.meta {
    margin: 0;
    color: var(--brown);
    font: 600 0.75rem/1.4 var(--font-label);
}

.case-notes h2 {
    margin: 0;
    outline: none;
    font: 400 2.4rem/1 var(--font-display);
}

.typed {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 1rem 1.15rem;
    background: repeating-linear-gradient(var(--paper) 0 1.5rem, var(--rule) 1.5rem calc(1.5rem + 1px));
    box-shadow: 0 0.25rem 0.6rem rgb(60 40 20 / 0.25);
}

.typed p {
    margin: 0;
}

.typed .note {
    color: var(--brown);
    font-size: 0.85rem;
}

.stack {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
}

.stack li {
    padding: 0.35rem 0.55rem;
    border: 1px solid oklch(0.55 0.05 60 / 0.6);
    border-radius: 3px;
    font: 600 0.72rem/1 var(--font-label);
}

.stamps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
}

.stamps a {
    padding: 0.45rem 0.8rem;
    border: 2px solid var(--red);
    color: var(--red);
    font: 600 0.78rem/1 var(--font-label);
    letter-spacing: 0.06em;
    text-decoration: none;
    text-transform: uppercase;
    rotate: -2deg;
}

.case :focus-visible,
.lightbox :focus-visible {
    outline: 3px solid oklch(0.75 0.13 70);
    outline-offset: 2px;
}

/* The screenshot over everything, on near black. */
.lightbox {
    position: fixed;
    z-index: 60;
    inset: 0;
    display: grid;
    grid-template-rows: 1fr auto;
    place-items: center;
    padding: max(3.5rem, env(safe-area-inset-top)) 4.5rem 1rem;
    background: rgb(8 7 10 / 0.94);
    touch-action: pan-y;
}

.lightbox img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.6);
}

.lightbox-caption {
    margin: 0.75rem 0 0;
    color: oklch(0.9 0.02 80);
    font: 0.9rem/1.4 var(--font-body);
    text-align: center;
}

.lightbox-caption span {
    margin-left: 0.6rem;
    font: 600 0.75rem/1 var(--font-label);
    opacity: 0.7;
}

.lightbox-close,
.lightbox-step {
    position: absolute;
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: oklch(0.95 0.02 85 / 0.92);
    color: oklch(0.24 0.02 60);
    font: 600 1.5rem/1 system-ui;
    cursor: pointer;
}

.lightbox-close {
    top: max(0.75rem, env(safe-area-inset-top));
    right: 0.75rem;
}

.lightbox-step {
    top: 50%;
    translate: 0 -50%;
}

.lightbox-step.prev {
    left: 0.75rem;
}

.lightbox-step.next {
    right: 0.75rem;
}

/* A phone: a tall sheet from the bottom, the prints on top, the tabs in one swipeable row. */
@media (max-width: 767px) {
    .case {
        top: auto;
        bottom: 2.7rem;
        left: 0;
        width: 100%;
        height: calc(100dvh - 2.7rem - 4.5rem);
        translate: none;
        border-radius: 14px 14px 0 0;
        animation-name: case-up;
    }

    @keyframes case-up {
        from {
            transform: translateY(100%);
        }
    }

    .case.single {
        width: 100%;
    }

    .case-tabs {
        position: static;
        order: 2;
        padding: 0 1rem 0.6rem;
    }

    .case-tab {
        border-radius: 999px;
    }

    .case-tab.is-open {
        display: none;
    }

    .case-close {
        position: static;
        order: 1;
        align-self: flex-end;
        margin: 0.6rem 0.75rem 0.5rem;
        box-shadow: none;
    }

    .case-close kbd {
        display: none;
    }

    .case-pages {
        order: 3;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        overscroll-behavior: contain;
    }

    .case-page {
        overflow: visible;
        padding: 0.9rem 1rem;
    }

    .case-prints {
        border-right: 0;
        border-bottom: 2px solid oklch(0.6 0.06 70 / 0.35);
    }

    .thumbs {
        display: none;
    }

    .case-notes h2 {
        font-size: 2rem;
    }

    .lightbox {
        padding: 3.5rem 0.75rem 4.5rem;
    }

    .lightbox-step {
        top: auto;
        bottom: 1rem;
        translate: none;
    }
}

@media (prefers-reduced-motion: reduce) {
    .case,
    .case-pages {
        animation: none;
    }
}
</style>
