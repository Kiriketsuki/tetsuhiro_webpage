<template>
    <main>
        <ExplorePad to="/" back="">
            <template #top>
                <header class="sky-head">
                    <p class="label">
                        <span class="text-violet">04 / skills</span>
                        <span class="text-text-muted">&middot; tap a constellation, then a star</span>
                    </p>
                    <h1 class="font-slab text-[clamp(1.9rem,5vw,3.25rem)] leading-none text-text-strong">Skill tree</h1>
                    <router-link to="/" class="action back" @pointerdown.stop>back to the aerie</router-link>
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
.sky-head {
    display: flex;
    max-width: 26rem;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
    text-shadow: 0 0 0.75rem var(--color-bg-base), 1px 1px 0 var(--color-bg-base);
}

.back {
    pointer-events: auto;
}
</style>
