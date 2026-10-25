<template>
    <Navbar id="navbar" />
    <canvas id="webgl" class="w-screen h-lvh"></canvas>
    <router-view />
</template>

<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import gsap from 'gsap'
import Navbar from './components/Navbar.vue'
import { useWaypoints } from './composables/useWaypoints.js'
import { useScene } from './composables/useScene.js'

const route = useRoute()
const { ready } = useWaypoints()
useScene()

// The scene shows on every route once it has loaded. A route change moves the camera to
// that route's room. Pages full of text dim it, so the words stay readable.
const PAGE_DIM = 0.32
const opacity = computed(() => {
    if (!ready.value) return 0
    return route.name === 'Home' ? 1 : PAGE_DIM
})

watch(opacity, (value) => {
    const canvas = document.getElementById('webgl')
    if (!canvas) return
    if (value > 0) canvas.style.visibility = 'visible'
    gsap.to(canvas, {
        opacity: value,
        duration: 0.6,
        onComplete: () => {
            if (value === 0) canvas.style.visibility = 'hidden'
        },
    })
})
</script>

<style>
    body {
        font-family: var(--font-body);
        background-color: var(--color-bg-base);
    }
    
    canvas {
        position: fixed;
        top: 0;
        left: 0;
        z-index: -1;
        opacity: 0;
        visibility: hidden;
    }

    /* src/three.js adds this when WebGL fails. A moonlit night sky in CSS
       stands in for the island. */
    canvas.scene-fallback {
        background:
            radial-gradient(circle at 72% 18%, oklch(0.931 0.03 243.4 / 0.35) 0, transparent 9rem),
            radial-gradient(ellipse at 50% 120%, var(--color-sea) 0, transparent 60%),
            linear-gradient(to bottom, var(--color-bg-raised), var(--color-bg-base) 70%);
    }
    
    router-view {
        position: fixed;
        top: 0;
        left: 0;
        /* z-index: 20; */
    }

    ::-webkit-scrollbar {
        width: 0.5rem;
    }

    ::-webkit-scrollbar-track {
        background: var(--color-bg-base);
    }

    ::-webkit-scrollbar-thumb {
        background: var(--color-line);
    }

    @supports (scrollbar-color: red blue) {
        * {
            scrollbar-color: var(--color-line) var(--color-bg-base);
            scrollbar-width: thin;
        }
    }

    :root {
        --gradient: linear-gradient(45deg, var(--color-ruby), var(--color-moss), var(--color-amber), var(--color-teal));
    }

    @keyframes gradient_animation {
        0% {
            background-position: left;
        }
        100% {
            background-position: right;
        }
    }
</style>
