<template>
    <section class="h-screen name fixed top-0 left-0 w-sceen">
        <Name/>
    </section>

    <div id = "home" class="w-screen flex flex-col items-center justify-between -z-10" style = "visibility: hidden">
        <section class = "h-screen w-full dodecahedron">
            <div class="h-full w-full bg-transparent z-10">

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
        scrolling
    },
    setup(){
        // scrolling();
    },
    mounted() {
        scrolling();
    }
    }

    //? GSAP

    function scrolling() {
        gsap.registerPlugin(ScrollTrigger);
        var curr_section, prev_section = 0;

        // Dodecahedron
        var dodec_tween = gsap.to('.dodecahedron', {opacity: 1});
        dodec_tween.pause();
        // About
        var about_tween = gsap.fromTo('.about', {xPercent: -200}, {xPercent: 0, duration: 0.5})
        about_tween.pause();
        // Skills
        var skill_tween = gsap.fromTo('.skills', {xPercent: 400, scale: 0}, {xPercent: 0, scale: 1.5, duration: 0.5});
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
            snap: 1/4,
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
    }
</script>

<style>
    body {
        overflow-x: hidden;
    }
</style>