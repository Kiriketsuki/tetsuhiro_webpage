<template>
    <div class="flex h-full w-screen items-end justify-center px-5 pb-24 lg:justify-end lg:px-16">
        <div class="glass flex w-full max-w-md flex-col gap-4 p-6 sm:p-8">
            <p class="label text-teal">Skills</p>
            <h2 class="font-slab text-[clamp(2rem,4vw,3.25rem)] leading-none text-text-strong">
                Skill tree
            </h2>
            <p class="font-body text-[clamp(0.95rem,1.1vw,1.05rem)] text-text-body">
                The badges on the tree are what I work with as of late 2025. Mostly web and 3D,
                with some Python on the side. The tree keeps growing, like any good game.
            </p>
            <ul class="flex flex-wrap gap-2" aria-label="Skill branches">
                <li
                    v-for="branch in branches"
                    :key="branch.id"
                    class="chip"
                    :style="{ '--chip': `var(--color-${branch.color})` }"
                >
                    {{ branch.label }} {{ count(branch.id) }}
                </li>
            </ul>
            <router-link to="/skills" class="action">See the whole tree</router-link>
        </div>
    </div>
</template>

<script setup>
import { branches, skills } from '../data/skills.js'

const count = (id) => skills.filter((skill) => skill.branch === id).length
</script>

<style scoped>
.chip {
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--chip);
    border-radius: 999px;
    color: var(--chip);
    font-family: var(--font-label);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}
</style>
