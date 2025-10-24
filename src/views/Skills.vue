<template>
    <div class="flex min-h-screen w-screen flex-col items-center gap-10 px-6 pt-16 pb-28 text-center">
        <h1 class="font-slab text-[clamp(3rem,8vw,6rem)] leading-none text-quaternary">Skills</h1>

        <div class="flex w-full max-w-4xl flex-col gap-8">
            <section v-for="group in groups" :key="group.id" class="flex flex-col gap-3">
                <h2 class="font-label text-xs tracking-widest text-text-muted uppercase">{{ group.label }}</h2>
                <ul class="flex flex-wrap justify-center gap-3">
                    <li
                        v-for="skill in group.skills"
                        :key="skill.id"
                        class="rounded-lg border border-line px-4 py-2 font-label text-sm text-text-body"
                    >
                        {{ skill.name }}
                    </li>
                </ul>
            </section>
        </div>
    </div>
</template>

<script setup>
import { branches, skills } from '../data/skills.js'

// Same list as the badges on the island's skill tree.
const groups = branches.map((branch) => ({
    ...branch,
    skills: skills.filter((skill) => skill.branch === branch.id),
}))
</script>
