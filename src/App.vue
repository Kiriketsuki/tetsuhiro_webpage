<template>
    <canvas id="webgl" class="w-screen h-screen">
    </canvas>

    <!-- <router-view></router-view> -->
</template>

<script>

import 'tw-elements';
export default {
    name: 'Tetsuhiro Webpage',
    components: {
    }
}

</script>

<style>

    body {
        background-color: #3C6E71
    }
    canvas {
        position: fixed;
        top: 0;
        left: 0;
        z-index: -1;
    }

    router-view {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 100;
    }
</style>
