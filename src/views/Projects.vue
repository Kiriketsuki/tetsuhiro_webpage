<template>
    <main class="flex min-h-screen w-screen flex-col items-center gap-10 px-5 pt-16 pb-32">
        <header class="flex max-w-2xl flex-col items-center gap-4 text-center">
            <p class="label text-teal">Projects</p>
            <h1 class="font-slab text-[clamp(2.75rem,8vw,6rem)] leading-none text-text-strong">
                Things I have made
            </h1>
            <p class="font-body text-[clamp(0.95rem,1.2vw,1.1rem)] text-text-body">
                Work first, then school and side projects, then the older stuff. Some of it is not
                public, so those cards only say what it was.
            </p>
        </header>

        <ul class="grid w-full max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <li
                v-for="project in projects"
                :key="project.id"
                ref="cards"
                class="frame frame-line flex min-w-0 flex-col overflow-hidden"
            >
                <img
                    v-if="project.image"
                    :src="project.image"
                    :alt="project.title"
                    loading="lazy"
                    class="aspect-[16/9] w-full object-cover"
                />
                <div
                    v-else
                    class="flex aspect-[16/9] w-full items-center justify-center bg-bg-raised font-slab text-[clamp(3rem,6vw,4.5rem)] leading-none text-line"
                    aria-hidden="true"
                >
                    {{ monogram(project.title) }}
                </div>

                <div class="flex flex-1 flex-col gap-4 p-5">
                    <div>
                        <h2 class="font-slab text-[clamp(1.6rem,2.4vw,2rem)] leading-tight text-text-strong">
                            {{ project.title }}
                        </h2>
                        <p class="mt-1 font-body text-sm text-text-body">{{ project.blurb }}</p>
                    </div>

                    <dl class="mt-auto grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                        <template v-for="[key, value] in rows(project)" :key="key">
                            <dt class="label pt-0.5 text-text-faint">{{ key }}</dt>
                            <dd class="min-w-0 font-body text-text-body">{{ value }}</dd>
                        </template>
                    </dl>

                    <router-link v-if="project.action?.to" :to="project.action.to" class="action">
                        {{ project.action.label }}
                    </router-link>
                    <a
                        v-else-if="project.action?.href"
                        :href="project.action.href"
                        target="_blank"
                        rel="noopener"
                        class="action"
                    >
                        {{ project.action.label }}
                    </a>
                    <span v-else class="label text-text-faint">Not public</span>
                </div>
            </li>
        </ul>

        <router-link to="/" class="action self-center">Back to the island</router-link>
    </main>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import VanillaTilt from 'vanilla-tilt'
import { projects } from '../data/projects.js'

const cards = ref([])

// Cards without a screenshot get the project's initials instead.
const monogram = (title) =>
    title
        .split(' ')
        .filter((word) => /^[A-Z0-9]/.test(word))
        .map((word) => word[0])
        .join('')
        .slice(0, 3)

const rows = (project) => [
    ['Stack', project.stack],
    ['Year', project.year],
    ['Role', project.role],
]

// A small tilt on mouse only. Touch and reduced motion get flat cards.
onMounted(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || calm) return
    VanillaTilt.init(cards.value, { max: 6, speed: 600, glare: false, scale: 1 })
})

onBeforeUnmount(() => {
    cards.value.forEach((card) => card.vanillaTilt?.destroy())
})
</script>
