<template>
    <Navbar id="navbar"/>
    <router-view/>
        <!-- <transition name="fade">
            <component :is="Component"/>
        </transition> -->
    <!-- </router-view> -->
</template>

<script>

import 'tw-elements';
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
        background-color: #051b45;
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

    /* .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
    }

    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.5s;
    } */
</style>
