<template>
    <div id = "home" class="h-[900vh] w-[99vw] flex flex-col items-center justify-between">
        <section class="h-screen mb-[100vh]">
            <Name/>
        </section>
        <section class="h-screen my-[125vh]">
            <About/>
        </section>
        <section class="h-screen mb-[75vh]">
            <Skills/>
        </section>
        <section class="h-screen mb-[75vh]">
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