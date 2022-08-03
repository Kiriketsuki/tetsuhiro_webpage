<template>
    <Navbar id="navbar"/>
    <router-view></router-view>
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

    router-view {
        position: fixed;
        top: 0;
        left: 0;
        /* z-index: 20; */
    }
</style>
