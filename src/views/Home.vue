<template>
    <div class="h-[500vh] w-[95vw]">
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
            Section 4
        </section>
        <section class="h-screen">
            Section 5
        </section>
    </div>
</template>

<script>
    import Name from '../components/Name.vue';
    import About from '../components/About.vue';
    import Skills from '../components/Skills.vue';
    export default  {
        name: 'Tetsuhiro Webpage',
        components: {
            Name,
            About,
            Skills
        },
        methods: {
        }
    }
</script>