<template>
    <div class="flex h-screen w-screen items-center justify-center px-5">
        <div class="glass flex max-w-md flex-col gap-4 p-8">
            <p class="font-label text-xs tracking-widest text-teal uppercase">404</p>
            <h1 class="font-slab text-5xl leading-none text-text-strong">Nothing here</h1>
            <p class="font-body text-text-body">
                This page does not exist. It may have moved, or the link is wrong.
            </p>
            <router-link to="/" class="home-link">Back home</router-link>
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

.home-link {
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

.home-link:focus-visible {
    outline: 2px solid var(--color-teal);
    outline-offset: 2px;
}
</style>
