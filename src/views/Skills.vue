<template>
    <main>
        <ExplorePad to="/" back="">
            <template #top>
                <header class="sky-head">
                    <router-link to="/" class="sky-back" aria-label="Back to the aerie" @pointerdown.stop>
                        <span aria-hidden="true" class="sky-arrow">&larr;</span> back<span class="sky-back-more"> to the aerie</span>
                    </router-link>
                    <p class="label sky-kicker">04 / skills</p>
                    <h1 class="font-slab sky-heading">Star chart</h1>
                    <p class="label sky-hint">Tap a constellation, then a star</p>
                </header>
            </template>
        </ExplorePad>

        <!-- The sky is a picture, so the same skills and notes are here for screen readers. -->
        <section class="sr-only" aria-labelledby="skills-list">
            <h2 id="skills-list">Every skill, by group</h2>
            <p>
                {{ skills.length }} skills in {{ branches.length }} constellations. In the sky, tap a constellation to
                fly to it, then tap a star to read what I built with that skill.
            </p>
            <template v-for="branch in branches" :key="branch.id">
                <h3>{{ branch.label }}</h3>
                <dl>
                    <template v-for="skill in skillsOf(branch.id)" :key="skill.id">
                        <dt>{{ skill.name }}</dt>
                        <dd>{{ notes[skill.id] }}</dd>
                    </template>
                </dl>
            </template>
        </section>
    </main>
</template>

<script setup>
import ExplorePad from '../components/ExplorePad.vue'
import { branches, skills } from '../data/skills.js'
import { notes } from '../data/skill-notes.js'

// /skills is the skill sky itself: the pad takes drags, pinches and taps, and the scene shows
// the constellations at full strength behind it.
const skillsOf = (id) => skills.filter((skill) => skill.branch === id)
</script>

<style scoped>
/* A plate of night glass, like the skill cards in sky-overlay.css, with a brass hairline. The
   back control sits first in it, so it is close and easy to find. The plate takes no pointer
   events, so a drag that starts on it still moves the sky. Each night glass token has the old
   value as a fallback, so the plate keeps its colours on a build without those tokens. */
.sky-head {
    position: relative;
    display: flex;
    width: min(100%, 21rem);
    flex-direction: column;
    align-items: flex-start;
    padding: 0.75rem 1.25rem 1rem 0.75rem;
    border: 1px solid var(--color-brass-dim, rgb(232 192 137 / 0.28));
    border-radius: 1rem;
    background:
        radial-gradient(circle at 86% 24%, rgb(255 255 255 / 0.7) 0 0.6px, transparent 1.2px),
        radial-gradient(circle at 70% 78%, rgb(255 255 255 / 0.45) 0 0.5px, transparent 1px),
        radial-gradient(120% 100% at 100% 0%, rgb(163 131 227 / 0.16), transparent 65%),
        var(--color-glass, rgb(7 10 31 / 0.72));
    box-shadow: 0 0.75rem 2rem rgb(2 4 16 / 0.5), inset 0 1px 0 rgb(255 255 255 / 0.06);
    backdrop-filter: blur(10px);
    pointer-events: none;
}

.sky-back {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.75rem;
    padding: 0 1rem;
    border: 1px solid var(--color-action, #14b8a6);
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-action, #0d9488) 20%, transparent);
    color: var(--color-text-strong);
    font-family: var(--font-label);
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    pointer-events: auto;
    transition: background-color 0.2s;
}

.sky-arrow {
    color: var(--color-action-text, #14b8a6);
    font-size: 1rem;
    letter-spacing: 0;
}

.sky-back:hover {
    background: color-mix(in oklab, var(--color-action, #0d9488) 36%, transparent);
}

.sky-back:focus-visible {
    outline: 2px solid var(--color-action, #14b8a6);
    outline-offset: 3px;
}

.sky-head .sky-kicker {
    padding-left: 0.5rem;
    color: var(--color-violet);
}

.sky-heading {
    padding-left: 0.5rem;
    color: var(--color-text-strong);
    font-size: clamp(2rem, 4vw, 2.75rem);
    line-height: 1.05;
}

.sky-head .sky-hint {
    padding-left: 0.5rem;
    color: var(--color-text-muted);
    font-size: 0.6875rem;
}

/* On a phone the plate spans the top of the screen in two columns, the title on the left and a
   shorter back control on the right, so it covers less of the sky. */
@media (max-width: 40rem) {
    .sky-head {
        display: grid;
        width: 100%;
        grid-template-columns: 1fr auto;
        align-items: center;
        padding: 0.625rem 0.625rem 0.75rem 0.5rem;
    }

    .sky-back {
        grid-column: 2;
        grid-row: 1 / span 2;
        min-height: 3rem;
        margin: 0;
        padding: 0 1.125rem;
    }

    .sky-back-more {
        display: none;
    }

    .sky-head .sky-kicker,
    .sky-heading {
        grid-column: 1;
    }

    .sky-head .sky-hint {
        grid-column: 1 / -1;
        margin-top: 0.25rem;
    }
}
</style>
