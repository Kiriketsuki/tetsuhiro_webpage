<script setup>
import photo from '../assets/photo.jpg'
import { sideOf } from '../composables/useWaypoints.js'

const facts = [
    ['Now', 'Software Engineer, Aurrigo'],
    ['Since', 'February 2025'],
    ['Before', 'NTU, Computer Science'],
    ['Also', 'Blender and Three.js'],
]
</script>

<template>
    <div class="stop" :data-side="sideOf('about')">
        <article class="frame frame-rose flex w-full max-w-[25rem] flex-col gap-5 p-6 pt-8 sm:p-8 sm:pt-9">
            <span class="frame-legend">02 / about</span>

            <div class="flex items-end gap-5">
                <img
                    :src="photo"
                    alt="Portrait of Jovian Lim"
                    class="portrait h-20 w-16 shrink-0 object-cover object-top sm:h-28 sm:w-24"
                />
                <h2 class="font-slab text-[clamp(2.25rem,4vw,3.25rem)] leading-[0.9] text-text-strong">
                    Jovian Lim
                </h2>
            </div>

            <p class="font-body text-sm text-text-body sm:text-[0.95rem]">
                Hello! I finished Computer Science at NTU in December 2024 and joined Aurrigo in
                February 2025. There I build the screens people use to run driverless vehicles at
                airports. Outside work I make 3D things, and this island is the biggest one so far.
            </p>

            <dl class="rows hidden text-sm sm:grid">
                <template v-for="[key, value] in facts" :key="key">
                    <dt>{{ key }}</dt>
                    <dd>{{ value }}</dd>
                </template>
            </dl>

            <ul class="flex gap-6">
                <li>
                    <a
                        href="https://www.linkedin.com/in/jovian-lim-tetsuhiro"
                        target="_blank"
                        rel="noopener"
                        class="action"
                        >LinkedIn</a
                    >
                </li>
                <li>
                    <a href="https://github.com/Kiriketsuki" target="_blank" rel="noopener" class="action"
                        >GitHub</a
                    >
                </li>
            </ul>
        </article>
    </div>
</template>

<style scoped>
.portrait {
    border: 1px solid var(--color-rose);
    padding: 3px;
    background: var(--color-bg-base);
}
</style>
