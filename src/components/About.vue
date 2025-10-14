<script setup>
import photo from '../assets/photo.jpg'
</script>

<template>
    <div class="flex h-full w-screen items-center justify-center px-5 pb-20">
        <div class="glass flex w-full max-w-5xl flex-col overflow-hidden lg:flex-row">
            <div class="lg:w-72 lg:shrink-0">
                <img
                    :src="photo"
                    alt="Portrait of Jovian Lim"
                    class="h-48 w-full object-cover object-top lg:h-full"
                />
            </div>

            <div class="flex flex-col gap-4 p-6 lg:p-10">
                <p class="font-label text-xs tracking-widest text-teal uppercase">About</p>
                <h2 class="font-slab text-[clamp(2.25rem,5vw,4rem)] leading-none text-text-strong">
                    Jovian Lim
                </h2>
                <p class="font-body text-sm text-text-body sm:text-base">
                    Hi, I am Jovian. I graduated from NTU in January 2025 with a degree in Computer
                    Science.
                </p>
                <p class="font-body text-sm text-text-body sm:text-base">
                    Since February 2025 I have been a Software Engineer at Aurrigo. I build the
                    interfaces that operators use to work with autonomous airside vehicles.
                </p>
                <p class="font-body text-sm text-text-body sm:text-base">
                    On the side I make 3D things in Blender and Three.js, and this site is where they
                    end up. Scroll down to see some of it.
                </p>
                <ul class="mt-2 flex gap-5 font-label text-xs tracking-wider uppercase">
                    <li>
                        <a
                            href="https://www.linkedin.com/in/jovian-lim-tetsuhiro"
                            target="_blank"
                            rel="noopener"
                            class="link"
                            >LinkedIn</a
                        >
                    </li>
                    <li>
                        <a
                            href="https://github.com/Kiriketsuki"
                            target="_blank"
                            rel="noopener"
                            class="link"
                            >GitHub</a
                        >
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>

<style scoped>
.glass {
    background: color-mix(in oklch, var(--color-bg-overlay) 80%, transparent);
    backdrop-filter: blur(10px) saturate(170%);
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 16px;
}

.link {
    color: var(--color-sand);
    border-bottom: 1px solid transparent;
}

.link:hover,
.link:focus-visible {
    border-bottom-color: var(--color-teal);
    outline: none;
}
</style>
