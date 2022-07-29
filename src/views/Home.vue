<template>
    <div id = "home" class="w-[99vw] flex flex-col items-center justify-between">
        <section class="h-screen">
            <Name/>
        </section>
        <section class="h-screen">
            <About/>
        </section>
        <section class="h-screen">
            <Skills/>
        </section>
        <section class="h-screen">
            <Projects/>
        </section>
        <section class="h-screen">
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
        }
    }
</script>