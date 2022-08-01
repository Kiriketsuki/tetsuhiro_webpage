<template>
    <div class = "w-screen h-screen flex flex-col items-center justify-center bg-[#051b45] z-[100]">
        <div class = "font-slab text-[10rem] text-gray-400 px-10 rounded-3xl">
            Lim Zhe Hong, Jovian
        </div>

        <div class="flex flex-col justify-center items-center">
            <div class="spinner-border animate-spin inline-block w-24 h-24 border-4 rounded-full text-gray-400" role="status" id = "spinner" style = "opacity: 1">
                <span class="visually-hidden">Loading...</span>
            </div>
            <div class = "text-gray-400 text-3xl -mt-12" style = "opacity: 0;" id = "ready">
                Scroll
            </div>
        </div>
    </div>
</template>

<script>
    export default {

    }
</script>

<style>
</style>