<template>
    <div class="stop" :data-side="sideOf('skills')">
        <article class="frame frame-violet flex w-full max-w-[24rem] flex-col gap-5 p-6 pt-8 sm:p-8 sm:pt-9">
            <span class="frame-legend">03 / skills</span>
            <h2 class="font-slab text-[clamp(2.25rem,4vw,3.25rem)] leading-none text-text-strong">
                Skill tree
            </h2>
            <p class="hidden font-body text-sm text-text-body sm:block sm:text-[0.95rem]">
                What I work with as of late 2025. Mostly web and 3D, with Python on the side.
            </p>
            <dl class="rows text-sm">
                <template v-for="branch in branches" :key="branch.id">
                    <dt class="branch" :style="{ '--branch': `var(--color-${branch.color})` }">
                        {{ branch.label }}
                    </dt>
                    <dd>{{ names(branch.id) }}</dd>
                </template>
            </dl>
            <router-link to="/skills" class="action">See the whole tree</router-link>
        </article>
    </div>
</template>

<script setup>
import { branches, skills } from '../data/skills.js'
import { sideOf } from '../composables/useWaypoints.js'

const names = (id) =>
    skills
        .filter((skill) => skill.branch === id)
        .map((skill) => skill.name)
        .join(', ')
</script>

<style scoped>
/* A coloured tick at the start of each branch row. */
.branch {
    border-left: 3px solid var(--branch);
    padding-left: 0.6rem;
}
</style>
