<script setup>
import { projects } from '../data/projects.js'

const rows = (project) => [
    ['Stack', project.stack],
    ['Year', project.year],
    ['Role', project.role],
]
</script>

<template>
    <div class="flex h-full w-screen flex-col justify-center gap-6 pt-8 pb-24">
        <h1 class="projects-title px-6 font-slab text-[clamp(2.5rem,6vw,5rem)] leading-none lg:px-16">
            Projects
        </h1>

        <ul class="cards flex snap-x gap-5 overflow-x-auto px-6 pb-4 lg:px-16">
            <li
                v-for="project in projects"
                :key="project.id"
                class="glass flex w-72 shrink-0 snap-start flex-col overflow-hidden lg:w-80"
            >
                <img
                    v-if="project.image"
                    :src="project.image"
                    :alt="project.title"
                    class="h-40 w-full object-cover"
                />
                <div
                    v-else
                    class="flex h-40 w-full items-end bg-bg-raised p-4 font-slab text-3xl text-text-muted"
                    aria-hidden="true"
                >
                    {{ project.title }}
                </div>

                <div class="flex flex-1 flex-col gap-4 p-5">
                    <div>
                        <h2 class="font-slab text-3xl leading-tight text-text-strong">
                            {{ project.title }}
                        </h2>
                        <p class="mt-1 font-body text-sm text-text-body">{{ project.blurb }}</p>
                    </div>

                    <dl class="mt-auto grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                        <template v-for="[key, value] in rows(project)" :key="key">
                            <dt class="font-label text-xs tracking-wider text-text-faint uppercase">
                                {{ key }}
                            </dt>
                            <dd class="font-body text-text-body">{{ value }}</dd>
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
                    <span v-else class="font-label text-xs tracking-wider text-text-faint uppercase">
                        Not public
                    </span>
                </div>
            </li>
        </ul>

        <router-link to="/projects" class="action mx-6 w-fit lg:mx-16">All projects</router-link>
    </div>
</template>

<style scoped>
.projects-title {
    background-image: var(--gradient);
    background-size: 400%;
    color: transparent;
    background-clip: text;
    background-position: left;
    animation: gradient_animation 5s ease infinite alternate;
}

.glass {
    background: color-mix(in oklch, var(--color-bg-overlay) 80%, transparent);
    backdrop-filter: blur(10px) saturate(170%);
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 16px;
}

.action {
    display: inline-block;
    align-self: flex-start;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    background: var(--color-ruby);
    color: var(--color-bg-base);
    font-family: var(--font-label);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.action:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: 2px;
}

.cards {
    scrollbar-width: thin;
}
</style>
