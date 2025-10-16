<template>
    <div class = "lg:w-[25vw] w-[50vw] h-[75vh] bg-transparent flex flex-col items-end justify-end">
        <div class ="w-full lg:h-[20vh] h-[30vh] flex flex-col gap-4 p-4 rounded-xl" style="background:rgba(249, 194, 46, 0.85);">
            <h5 class = "text-center text-secondary lg:text-5xl font-slab">
                Skill Tree
            </h5>

            <p class = "text-tertiary lg:text-2xl font-roboto">
                Here are some of the relavant skills I currently process. As a perfectionist, I fully intend on learning more skills and progressing through my skill tree,
                just like I would when finishing a video game.
            </p>

            <router-link to="/skills" class="px-6 py-2.5 bg-quinary text-bg-base text-center font-label text-xs leading-tight uppercase rounded shadow-md focus-visible:outline-2 focus-visible:outline-teal">
                More
            </router-link>
        </div>
    </div>
</template>
           



<style scoped>

</style>