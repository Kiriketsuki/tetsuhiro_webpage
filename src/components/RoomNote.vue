<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { socials, steam } from '../data/room.js'
import { homeAt } from '../composables/useWaypoints.js'

// One stop of the About room tour: what the camera frames, the note, and one clear next step.
// The last stop is the call to action. The note takes keyboard focus when it opens, so a screen
// reader reads it at once. Glass and brass only, no gradient (docs/design-system.md).
const props = defineProps({
    stop: { type: Object, required: true },
    index: { type: Number, required: true },
    count: { type: Number, required: true },
})
defineEmits(['prev', 'next', 'skip', 'restart'])

const CONTACT = homeAt('contact')
const heading = ref(null)
const focusHeading = () => nextTick(() => heading.value?.focus({ preventScroll: true }))
onMounted(focusHeading)
watch(() => props.stop.id, focusHeading)
</script>

<template>
    <article class="frame frame-rose room-note" :class="{ cta: stop.cta }" aria-live="polite" @pointerdown.stop>
        <span class="frame-legend">{{ stop.label }}<template v-if="!stop.cta"> &middot; {{ index + 1 }} of {{ count - 1 }}</template></span>
        <p class="label text-text-faint">{{ stop.thing }}</p>
        <h2 ref="heading" tabindex="-1" class="note-title">{{ stop.title }}</h2>
        <p v-for="line in stop.body" :key="line" class="note-body">{{ line }}</p>

        <ul v-if="stop.links === 'projects'" class="note-links">
            <li><router-link to="/projects" class="action">See my projects</router-link></li>
        </ul>
        <ul v-else-if="stop.links === 'steam'" class="note-links">
            <li><a :href="steam.href" target="_blank" rel="noopener" class="action">{{ steam.label }}</a></li>
        </ul>

        <template v-if="stop.cta">
            <ul class="note-cta">
                <li><router-link :to="CONTACT" class="note-key primary">Contact me</router-link></li>
                <li v-for="link in socials" :key="link.href">
                    <a :href="link.href" target="_blank" rel="noopener" class="note-key">{{ link.label }}</a>
                </li>
                <li><router-link to="/projects" class="note-key">See my projects</router-link></li>
            </ul>
            <div class="note-steps">
                <button type="button" class="note-quiet" @click="$emit('prev')"><span aria-hidden="true">&larr;</span> Back</button>
                <button type="button" class="note-quiet" @click="$emit('restart')">Start the tour again</button>
            </div>
        </template>
        <div v-else class="note-steps">
            <button type="button" class="note-key primary" @click="$emit('next')">
                Next: {{ stop.next }} <span aria-hidden="true">&rarr;</span>
            </button>
            <button v-if="index > 0" type="button" class="note-quiet" @click="$emit('prev')"><span aria-hidden="true">&larr;</span> Back</button>
            <button v-if="index < count - 2" type="button" class="note-quiet" @click="$emit('skip')">Skip to the end</button>
        </div>
    </article>
</template>

<style scoped>
/* A wide screen keeps the note on the left, like the home cards, and the camera moves the thing
   to the right (scene/aerie/room.js NOTE_SHIFT), and the note clears the nav strip below it. A
   phone holds it at the foot of the screen, just above the nav strip, and the thing rides up above it. */
.room-note {
    position: fixed;
    z-index: 30;
    left: clamp(1rem, 4vw, 4.5rem);
    bottom: 5.5rem;
    display: flex;
    width: min(26rem, 42vw);
    max-height: calc(100dvh - 12rem);
    flex-direction: column;
    gap: 0.7rem;
    padding: 1.5rem 1.75rem;
    overflow-y: auto;
}

.room-note.cta {
    width: min(30rem, 46vw);
}

.note-title {
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 3vw, 2.5rem);
    line-height: 1.05;
    outline: none;
}

.note-body {
    color: var(--color-text-body);
    font-size: 0.95rem;
    line-height: 1.55;
}

.note-links,
.note-cta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 1.5rem;
}

.note-cta {
    gap: 0.6rem;
    margin-top: 0.4rem;
}

.note-steps {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1.1rem;
    margin-top: 0.5rem;
}

/* The keys have square corners, so a plain 1 px border draws each ring. The primary key is a
   flat brass fill, the others a brass ring on glass. */
.note-key {
    display: inline-flex;
    min-height: 2.9rem;
    align-items: center;
    gap: 0.5rem;
    padding: 0 1.1rem;
    border: 1px solid var(--color-brass-soft);
    background: var(--color-glass-deep);
    color: var(--color-text-strong);
    font: 600 0.74rem/1 var(--font-label);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color 0.2s;
}

.note-key:hover {
    background: color-mix(in oklab, var(--color-action) 24%, var(--color-glass-deep));
}

.note-key.primary {
    border-color: var(--color-action);
    background: var(--color-action);
    color: var(--color-bg-base);
}

.note-key.primary:hover {
    background: var(--color-action-text);
}

.note-quiet {
    min-height: 2.75rem;
    padding: 0 0.25rem;
    border: 0;
    background: none;
    color: var(--color-text-muted);
    font: 600 0.7rem/1 var(--font-label);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
}

.note-quiet:hover {
    color: var(--color-text-strong);
}

.note-key:focus-visible,
.note-quiet:focus-visible {
    outline: 2px solid var(--color-action-text);
    outline-offset: 3px;
}

@media (max-width: 767px) {
    .room-note,
    .room-note.cta {
        right: 0.75rem;
        left: 0.75rem;
        bottom: 4.75rem;
        width: auto;
        max-height: 48dvh;
        padding: 1.1rem 1.25rem;
    }

    .note-title {
        font-size: 1.6rem;
    }

    .note-body {
        font-size: 0.9rem;
    }
}
</style>
