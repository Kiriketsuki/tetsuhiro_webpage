<template>
    <div class="flex h-screen w-screen items-center justify-center px-5">
        <article class="frame frame-rose flex max-w-md flex-col gap-4 p-8 pt-10">
            <span class="frame-legend">404</span>
            <h1 class="font-slab text-5xl leading-none text-text-strong">Nothing grows here</h1>
            <p class="font-body text-text-body">
                This page does not exist. Maybe it moved, or the link has a typo. The island is
                still where you left it.
            </p>
            <router-link to="/" class="action">Back to the island</router-link>
        </article>
    </div>
</template>
