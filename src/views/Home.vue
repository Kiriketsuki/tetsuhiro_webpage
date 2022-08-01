<template>
    <section class="h-screen name fixed top-0 left-0 w-sceen">
        <Name/>
    </section>

    <div id = "home" class="w-[99vw] flex flex-col items-center justify-between -z-10" style = "visibility: hidden">
        <div class = "h-[25vh]">

        </div>
        <section class="h-screen about">
            <!-- <About/> -->
        </section>
        <section class="h-screen skills">
            <!-- <Skills/> -->
        </section>
        <section class="h-[125vh] projects">
            <!-- <Projects/> -->
        </section>
        <section class="h-screen contact">
            <!-- <Contact/> -->
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
            Contact
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

        // About
        var about_tween = gsap.fromTo('.about', {xPercent: -200}, {xPercent: 0, duration: 0.5})
        about_tween.pause();
        ScrollTrigger.create({
            trigger: ".about",
            start: "top bottom",
            end: "bottom center",
            // markers: true,
            onEnter: () => {
                about_tween.play();
            },
            onLeave: () => {
                about_tween.reverse();
            },
            onEnterBack: () => {
                about_tween.restart();
            },
            onLeaveBack: () => {
                about_tween.reverse();
            }
        })

        // Skills
        var skill_tween = gsap.fromTo('.skills', {xPercent: 400, scale: 0}, {xPercent: 0, scale: 1.5, duration: 0.5});
        skill_tween.pause();
        ScrollTrigger.create({
            trigger: '.skills',
            start: 'center 80%',
            end: 'center 20%',
            onEnter: function() {
                skill_tween.play();
            },
            onLeave: function() {
                skill_tween.reverse();
            },
            onEnterBack: function() {
                skill_tween.play();
            },
            onLeaveBack: function() {
                skill_tween.reverse();
            }
        })

        // Projects
        var proj_tween = gsap.fromTo('.projects', {opacity: 0}, {opacity: 1, duration: 1});
        proj_tween.pause();
        ScrollTrigger.create({
            trigger: '.projects',
            start: 'center 90%',
            end: 'center 10%',
            // markers: true,
            onEnter: function() {
                proj_tween.play();
            },
            onLeave: function() {
                proj_tween.reverse();
            },
            onEnterBack: function() {
                proj_tween.play();
            },
            onLeaveBack: function() {
                proj_tween.reverse();
            }
        })

        // Contacts
        var contact_tween = gsap.fromTo('.stagger_anim', {opacity: 0}, {opacity: 1, duration: 1, stagger: 0.2});
        contact_tween.pause();
        ScrollTrigger.create({
            trigger: '.contact',
            start: 'center 90%',
            end: 'center 10%',
            // markers: true,
            onEnter: function() {
                contact_tween.play();
            },
            onLeave: function() {
                contact_tween.reverse();
            },
            onEnterBack: function() {
                contact_tween.play();
            },
            onLeaveBack: function() {
                contact_tween.reverse();
            }
        })
    }
</script>

<style>
    body {
        overflow-x: hidden;
    }
</style>