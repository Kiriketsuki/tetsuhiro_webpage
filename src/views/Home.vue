<template>
    <three class = "fixed w-screen h-screen"></three>
    <!-- <div id = "main_div" class = "text-9xl absolute top-0 left-0 w-[500vw]" > -->
        <!-- hello world -->
    <!-- </div> -->
</template>

<script>
    import three from '../components/three_canvas.vue'
    export default {
        components: {
            three
        },
        mounted() {
            const div_item = document.getElementById('main_div');
            window.addEventListener("wheel", (e) => {
                e.preventDefault();
                e.deltaY > 0 ? document.scrollingElement.scrollLeft += 100 : document.scrollingElement.scrollLeft -= 100;
            }, {passive: false});
        }
    }
</script>

<style>

</style>