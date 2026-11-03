<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { socials } from '../data/room.js'

// One story note in the About room: the thing, its part of the story, and the way round the
// room. The note takes keyboard focus when it opens, so a screen reader reads it at once.
const props = defineProps({
    point: { type: Object, required: true },
    index: { type: Number, required: true },
    count: { type: Number, required: true },
})
defineEmits(['prev', 'next', 'close'])

const heading = ref(null)
const focusHeading = () => nextTick(() => heading.value?.focus({ preventScroll: true }))
onMounted(focusHeading)
watch(() => props.point.id, focusHeading)
</script>

<template>
    <article class="frame frame-rose room-note" aria-live="polite" @pointerdown.stop>
        <span class="frame-legend">{{ point.label }} &middot; {{ index + 1 }} of {{ count }}</span>
        <p class="label text-text-faint">{{ point.thing }}</p>
        <h2 ref="heading" tabindex="-1" class="note-title">{{ point.title }}</h2>
        <p v-for="line in point.body" :key="line" class="note-body">{{ line }}</p>

        <ul v-if="point.links === 'socials'" class="note-links">
            <li v-for="link in socials" :key="link.href">
                <a :href="link.href" target="_blank" rel="noopener" class="action">{{ link.label }}</a>
            </li>
        </ul>
        <ul v-else-if="point.links === 'projects'" class="note-links">
            <li><router-link to="/projects" class="action">Projects</router-link></li>
        </ul>

        <div class="note-steps">
            <button type="button" class="note-step" @click="$emit('prev')"><span aria-hidden="true">&larr;</span> Prev</button>
            <button type="button" class="note-step" @click="$emit('close')">The room</button>
            <button type="button" class="note-step" @click="$emit('next')">Next <span aria-hidden="true">&rarr;</span></button>
        </div>
    </article>
</template>

<style scoped>
/* A wide screen keeps the note on the left, like the home cards, and the camera moves the thing
   to the right (scene/aerie/room.js NOTE_SHIFT). A phone holds it at the foot of the screen, over
   the nav strip, and the thing rides up above it. */
.room-note {
    position: fixed;
    z-index: 30;
    left: clamp(1rem, 4vw, 4.5rem);
    bottom: 5.5rem;
    display: flex;
    width: min(25rem, 42vw);
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem 1.75rem;
}

.note-title {
    font-family: var(--font-display);
    font-size: clamp(1.9rem, 3.2vw, 2.6rem);
    line-height: 1;
    outline: none;
}

.note-body {
    color: var(--color-text-body);
    font-size: 0.95rem;
    line-height: 1.55;
}

.note-links {
    display: flex;
    gap: 1.5rem;
}

.note-steps {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-line);
}

.note-step {
    min-height: 2.75rem;
    padding: 0 0.6rem;
    border: 0;
    background: none;
    color: var(--color-text-muted);
    font: 600 0.72rem/1 var(--font-label);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
}

.note-step:first-child {
    text-align: left;
}

.note-step:last-child {
    text-align: right;
}

.note-step:hover {
    color: var(--color-text-strong);
}

.note-step:focus-visible {
    outline: 2px solid var(--color-action-text);
    outline-offset: 2px;
}

@media (max-width: 767px) {
    .room-note {
        right: 0.75rem;
        left: 0.75rem;
        bottom: 4.25rem;
        width: auto;
        gap: 0.5rem;
        padding: 1.1rem 1.25rem 0.75rem;
    }

    .note-title {
        font-size: 1.75rem;
    }

    .note-body {
        font-size: 0.9rem;
    }
}
</style>
