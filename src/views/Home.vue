<template>
    <canvas id="webgl" class="w-screen h-screen">
    </canvas>
    <section class="h-screen name fixed top-0 left-0 w-screen">
        <Name class = "z-100"/>
    </section>

    <div id = "home" class="w-screen flex flex-col items-center justify-between -z-10" style = "visibility: hidden">
        <section class = "h-screen w-full dodecahedron">
            <div class="h-full lg:w-1/2 bg-transparent z-10 flex flex-col items-center justify-center font-slab lg:text-[10rem] text-secondary px-10 rounded-3xl">
                Welcome
                <button type="button" class="z-20 inline-block px-6 py-2.5 bg-quinary text-white font-medium text-xs leading-tight uppercase rounded shadow-md hover:bg-blue-700 hover:shadow-lg focus:bg-blue-700 focus:shadow-lg focus:outline-none focus:ring-0 active:bg-blue-800 active:shadow-lg transition duration-150 ease-in-out"
                    @click=clear_html()>
                    View Scene
                </button>
            </div>
        </section>
        <section class="h-screen about">
            <About/>
        </section>
        <section class="h-screen skills">
            <Skills/>
        </section>
        <section class="h-screen projects">
            <Projects/>
        </section>
        <section class="h-screen contact">
            <Contact/>
        </section>
    </div>
</template>

<script>
    import Name from '../components/Name.vue';
    import About from '../components/About.vue';
    import Skills from '../components/Skills.vue';
    import Projects from '../components/Projects.vue';
    import Contact from '../components/Contact.vue';
    import { gsap } from 'gsap';
    import { ScrollTrigger } from 'gsap/ScrollTrigger';
    export default  {
        name: 'Tetsuhiro Webpage',
        components: {
    Name,
    About,
    Skills,
    Projects,
    Contact,
    },
    methods: {
        scrolling,
        clear_html
    },
    setup(){
        setTimeout(() => {
            document.querySelector(".name").style.visibility = "hidden";
            if (document.querySelector("#webgl").style.opacity != 1) {
                location.reload();
            } else {
                console.log("threejs shldve loaded properly")
            }
        }, 30000);
    },
    mounted() {
        scrolling();
        // var script = document.createElement("script");
        // script.src = "/src/three.js";
        // script.type = "module";
        // script.defer = true;
        // document.body.appendChild(script);
    }}

    //? GSAP

    function scrolling() {
        gsap.registerPlugin(ScrollTrigger);
        var curr_section, prev_section = 0;

        // Dodecahedron
        var dodec_tween = gsap.fromTo('.dodecahedron', {opacity: 0}, {opacity: 1, duration: 1, ease: 'power2.out'});
        // dodec_tween.pause();
        // About
        var about_tween = gsap.fromTo('.about', {xPercent: -200}, {xPercent: 0, duration: 1})
        about_tween.pause();
        // Skills
        var skill_tween = gsap.fromTo('.skills', {xPercent: 400, scale: 0}, {xPercent: 0, scale: 1.5, duration: 1});
        skill_tween.pause();
        // Projects
        var proj_tween = gsap.fromTo('.projects', {opacity: 0}, {opacity: 1, duration: 0.5});
        proj_tween.pause();
        // Contacts
        var contact_tween = gsap.fromTo('.stagger_anim', {opacity: 0}, {opacity: 1, stagger: 0.2});
        contact_tween.pause();

        // tween arrays
        var tweens = [dodec_tween ,about_tween, skill_tween, proj_tween, contact_tween];
        // ScrollTrigger
        ScrollTrigger.create({
            snap: window.innerWidth >= 1000 ? 1/4 : false,
            duration: 0.1,
            // scrub: 0.1,
            trigger: document.querySelector('.webgl'),
            onUpdate: (self) => {
                var ratio = self.progress;
                prev_section = curr_section;

                //? out of all 5 positions in array, check which section, then move
                var section = ratio * tweens.length; // from 0 to 1 becomes 0 to 5
                var section = Math.floor(section) // clamps down to nearest integer
                section == 5 ? section = 4 : section = section; // prevent out of index
                curr_section = section;
                
                //? if section changed, pause all tweens and play the new one
                if (prev_section != curr_section) {
                    tweens[prev_section].reverse();
                    setTimeout(() => {
                        tweens[curr_section].play();
                    }, 100); // allow threejs to play first
                }

            }
        });

        window.onpopstate = function () {
            location.reload()
        };
    }

    // ? View Scene
    function clear_html() {
        document.querySelector("#home").style.visibility = "hidden";
    }
</script>

<style>
    body {
        overflow-x: hidden;
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

    .dodecahedron {
        text-shadow: 1px 1px black;
    }
</style>