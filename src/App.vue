<template>
    <Navbar id="navbar" />
    <canvas id="webgl" class="w-screen h-screen"></canvas>
    <router-view />
</template>

<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import gsap from 'gsap'
import Navbar from './components/Navbar.vue'
import { useWaypoints } from './composables/useWaypoints.js'

const route = useRoute()
const { ready } = useWaypoints()

// The scene only shows on the home page, once it has loaded.
const showScene = computed(() => ready.value && route.name === 'Home')

watch(
    showScene,
    (visible) => {
        const canvas = document.getElementById('webgl')
        if (!canvas) return
        if (visible) canvas.style.visibility = 'visible'
        gsap.to(canvas, {
            opacity: visible ? 1 : 0,
            duration: 0.6,
            onComplete: () => {
                if (!visible) canvas.style.visibility = 'hidden'
            },
        })
    }
)
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
        background: hsla(0, 0%, 100%, 0.1);
    }

    ::-webkit-scrollbar-thumb {
        background: hsla(0, 0%, 100%, 0.2);
    }

    @supports (scrollbar-color: red blue) {
        * {
            scrollbar-color: hsla(0, 0%, 100%, 0.1), hsla(0, 0%, 100%, 0.1);
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
