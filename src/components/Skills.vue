<template>
    <div class="flex flex-col h-full justify-center items-center">
        <div class="block lg:p-6 rounded-lg shadow-lg lg:max-w-sm lg:mt-[20rem] w-[30vw] h-[20vh]" style="background-color: rgba(249, 194, 46, 0.85)">
            <h5 class="text-secondary lg:text-xl leading-tight font-medium mb-2">Skill Tree</h5>
            <p class="text-tertiary lg:text-base mb-4">
                Here are some of the skills I have, displayed in a tree of progression. Using these skills, I have worked on many different projects. Scroll on to learn more, or click to go indepth!
            </p>
            <button type="button" class=" inline-block px-6 py-2.5 bg-quinary text-white font-medium text-xs leading-tight uppercase rounded shadow-md hover:bg-blue-700 hover:shadow-lg focus:bg-blue-700 focus:shadow-lg focus:outline-none focus:ring-0 active:bg-blue-800 active:shadow-lg transition duration-150 ease-in-out"
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