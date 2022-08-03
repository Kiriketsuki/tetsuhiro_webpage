<template>
    <div class = "w-screen h-screen flex flex-col items-center justify-center bg-[#051b45] z-100 text-center">
        <div class = "font-slab lg:text-[10rem] text-quaternary px-10 rounded-3xl">
            Lim Zhe Hong, Jovian
        </div>

        <div class="loader relative">
            <div class="spinner-border spinning inline-block lg:w-24 lg:h-24 border-4 rounded-full text-secondary absolute" role="status" id = "spinner" style = "opacity: 1">
                <span class="visually-hidden">Loading...</span>
            </div>
            <div class = "text-secondary text-3xl top-0 left-0 right-0 bottom-0 absolute" style = "opacity: 0;" id = "ready">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-24 w-24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                </svg>
            </div>
        </div>
    </div>
</template>

<script>
    export default {

    }
</script>

<style scoped>
    div {
        pointer-events: none;
    }

    #spinner {
        position: relative;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
    .spinning {
        animation: spin 1s linear infinite;
    }
</style>