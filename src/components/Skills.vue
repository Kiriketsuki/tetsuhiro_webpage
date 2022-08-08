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

            <button type="button" class="px-6 py-2.5 bg-quinary text-white font-medium text-xs leading-tight uppercase rounded shadow-md hover:bg-blue-700 hover:shadow-lg focus:bg-blue-700 focus:shadow-lg focus:outline-none focus:ring-0 active:bg-blue-800 active:shadow-lg transition duration-150 ease-in-out"
                @click=skills_redirect()>
                More
            </button>
        </div>
    </div>
</template>
           

<script>
    export default {
        methods: {
            skills_redirect
        }
    }

    import {main_trigger} from '../views/Home.vue';
    import gsap from 'gsap';
    function skills_redirect() {
        gsap.to(window.document.querySelector("#webgl").style, {opacity: 0, duration: 1});
        setTimeout(() => {;
            this.$router.push('/skills');
        }, 1000);
        document.scrollingElement.scrollTo(0,0);
        main_trigger.kill(); // removes scrolltrigger and its snap
    }
</script>

<style scoped>

</style>