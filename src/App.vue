<template>
    <canvas id="webgl" class="w-screen h-screen">
    </canvas>

    <router-view></router-view>
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
        background-color: #203c3d
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
