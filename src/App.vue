<template>
    <Navbar id="navbar"/>
    <canvas id="webgl" class="w-screen h-screen"> 
        <!-- causes a problem for build if removed, need to -->
    </canvas>
    <router-view/>
        <!-- <transition name="fade">
            <component :is="Component"/>
        </transition> -->
    <!-- </router-view> -->
</template>

<script>

import Navbar from './components/Navbar.vue';
export default {
    name: 'Tetsuhiro Webpage',
    components: {
        Navbar,
    },
}

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
