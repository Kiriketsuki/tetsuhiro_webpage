<template>
    <main class="flex min-h-screen w-screen flex-col items-center gap-10 px-5 pt-16 pb-32">
        <header class="flex w-full max-w-5xl flex-col gap-4">
            <p class="label text-violet">03 / skills</p>
            <h1 class="font-slab text-[clamp(2.75rem,8vw,6rem)] leading-none text-text-strong">
                Skill tree
            </h1>
            <p class="max-w-2xl font-body text-[clamp(0.95rem,1.2vw,1.1rem)] text-text-body">
                These are the {{ skills.length }} skills hanging off the tree on the island. Each
                line shows what a skill grew out of, so Tailwind sits under Vue, and Vue sits under
                JavaScript. I did commit to the tree idea.
            </p>
            <ul class="legend" aria-label="Branches">
                <li v-for="branch in branches" :key="branch.id" :style="{ '--node': `var(--color-${branch.color})` }">
                    {{ branch.label }}
                </li>
            </ul>
        </header>

        <div class="grid w-full max-w-5xl items-start gap-8 sm:grid-cols-2">
            <section v-for="root in trees" :key="root.id" class="frame frame-line p-5 pt-8 sm:p-7 sm:pt-9">
                <span class="frame-legend">{{ root.name }}</span>
                <h2 class="sr-only">{{ root.name }} and what grew from it</h2>
                <ul class="tree">
                    <SkillNode :skill="root" />
                </ul>
            </section>
        </div>

        <router-link to="/" class="action self-center">Back to the island</router-link>
    </main>
</template>

<script setup>
import SkillNode from '../components/SkillNode.vue'
import { branches, skills } from '../data/skills.js'

const size = (skill) => 1 + skills.filter((child) => child.parent === skill.id).reduce((sum, child) => sum + size(child), 0)

// Bigger trees first, so the grid reads from the trunk out.
const trees = skills.filter((skill) => !skill.parent).sort((a, b) => size(b) - size(a))
</script>

<style scoped>
.legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin-top: 0.5rem;
    font-family: var(--font-label);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-text-muted);
}

.legend li {
    padding-left: 0.6rem;
    border-left: 3px solid var(--node);
}
</style>
