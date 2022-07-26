<template>
    <!-- <three class = "fixed w-screen h-screen"></three> -->
    <div id = "main_div" class = "absolute top-0 left-0 w-[500vw] h-screen flex flex-row justify-between items-center text-center" >
        <div class = "text-9xl text-center">
            Jovian's Portfolio
        </div>

        <div class = "text-center flex flex-row gap-10">
            <div class="w-[20vw]">
                <div class="bg-white block rounded-lg shadow-lg">
                    <div class="relative overflow-hidden bg-no-repeat bg-cover">
                        <img src="../assets/logo.png" class="w-full rounded-t-lg" />
                        <a href="#!"> <div class="absolute top-0 right-0 bottom-0 left-0 w-full h-full overflow-hidden bg-fixed"></div> </a>
                        <svg class="absolute" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320" style="left: 0; bottom: 0"> <path fill="#fff" d="M0,288L48,272C96,256,192,224,288,197.3C384,171,480,149,576,165.3C672,181,768,235,864,250.7C960,267,1056,245,1152,250.7C1248,256,1344,288,1392,304L1440,320L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"> </path> </svg>
                    </div>

                    <div class="p-6 font-custom">
                        <h5 class="text-5xl font-bold mb-4 text-primary">Jovian Lim</h5>
                        <p class="text-gray-500 mb-4 text-2xl">Software Engineer</p>
                        <ul class="list-inside flex mx-auto justify-center">
                            <a href="#!" class="px-2">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" class="w-8 h-8 text-blue-600"> <path fill="currentColor" d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z" /> </svg>
                            </a>
                            <a href="#!" class="px-2">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="w-8 h-8 text-blue-600"> <path fill="currentColor" d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z" /> </svg>
                            </a>
                        </ul>
                    </div>
                </div>
            </div>

            <div class = "w-[50vw] shadow-md flex flex-col items-center justify-center text-3xl gap-10 text-left rounded-lg">
                <p class = 'w-11/12'>
                    Hey there! I am Jovian Lim, and I am currently a student at Nanyang Technological University (NTU) in Singapore!
                    I am majoring in Computer Science, and I am specializing in Data Science and Artificial Intelligence.
                </p>
                <br>
                <p class = 'w-11/12'>
                    About my educational history, I took the GCE O Levels in 2015, and went on to be admitted into Anglo-Chinese Junior College, where I took the A levels in 2017.
                    My subjects were Physics, Chemistry, and Mathematics, as well as H1 Economics. After, I served my National Service, before starting school at NTU, where I am currently expecting to graduate from in 2024 
                </p>
                <br>
                <p class = 'w-11/12'>
                    My hobbies include playing games, watching shows, photography, videography, and most importantly of all, programming! I have done quite a few passion projects, and you can find out more by scrolling! 
                </p>
            </div>
        </div>

        <div class = "w-[100vw] flex flex-row items-center justify-between gap-10">
            <img class = "w-6/12 h-full" src="../assets/skill_tree.png" style = "object-fit: contain;" alt="">
            <div class="flex justify-center h-full w-6/12 flex-wrap text-2xl gap-10">
                <ul class="bg-white rounded-lg border border-gray-200 text-gray-900 w-5/12">
                    <li class="px-6 py-2 border-b border-gray-200 w-full rounded-t-lg bg-blue-600 text-white"> Programming Languages </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/java_logo.png" class = "w-16 h-16"/> Java</li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/cpp_logo.png" class = "w-16 h-16"/> C/C++ </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/python_logo.png" class = "w-16 h-16"/> Python </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/ruby_logo.png" class = "w-16 h-16"/> Ruby </li>
                    <li class="px-6 py-2 w-full rounded-b-lg flex flex-row items-center justify-start gap-3"><img src = "../assets/js_logo.png" class = "w-16 h-16"/>Javascript</li>
                </ul>

                <ul class="bg-white rounded-lg border border-gray-200 text-gray-900 w-5/12">
                    <li class="px-6 py-2 border-b border-gray-200 w-full rounded-t-lg bg-blue-600 text-white"> Fullstack Web Development </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/logo.png" class = "w-16 h-16"/> VueJS</li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/three_logo.png" class = "w-16 h-16"/> ThreeJS </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/firebase_logo.png" class = "w-16 h-16"/> Firebase </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/flask_logo.png" class = "w-16 h-16"/> Flask </li>
                    <li class="px-6 py-2 w-full rounded-b-lg flex flex-row items-center justify-start gap-3"><img src = "../assets/django_logo.png" class = "w-16 h-16"/>Django</li>
                </ul>

                <ul class="bg-white rounded-lg border border-gray-200 text-gray-900 w-5/12">
                    <li class="px-6 py-2 border-b border-gray-200 w-full rounded-t-lg bg-blue-600 text-white"> Art </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/photo_logo.png" class = "w-16 h-16"/> Photography </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/video_logo.png" class = "w-16 h-16"/> Videography </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/ps_logo.png" class = "w-16 h-16"/> Photoshop </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/premiere_logo.png" class = "w-16 h-16"/> Premiere Pro </li>
                    <li class="px-6 py-2 w-full rounded-b-lg flex flex-row items-center justify-start gap-3"><img src = "../assets/blender_logo.png" class = "w-16 h-16"/>Blender</li>
                </ul>

                <ul class="bg-white rounded-lg border border-gray-200 text-gray-900 w-5/12">
                    <li class="px-6 py-2 border-b border-gray-200 w-full rounded-t-lg bg-blue-600 text-white"> Miscellaneous </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/excel_logo.png" class = "w-16 h-16"/> Excel </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/suite_logo.png" class = "w-16 h-16"/> Microsoft Suite </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/phone_logo.png" class = "w-16 h-16"/> Secretarial Duties </li>
                    <li class="px-6 py-2 border-b border-gray-200 w-full flex flex-row items-center justify-start gap-3"> <img src = "../assets/client_logo.png" class = "w-16 h-16"/> Facing Clients </li>
                    <li class="px-6 py-2 w-full rounded-b-lg flex flex-row items-center justify-start gap-3"><img src = "../assets/data_logo.png" class = "w-16 h-16"/>Data Entry</li>
                </ul>
            </div>
        </div>

        <div>
            Projects
        </div>

        <div>
            Contact
        </div>
    </div>
</template>

<script>
    import three from '../components/three_canvas.vue'
    export default {
        components: {
            three
        },
        mounted() {
            const div_item = document.getElementById('main_div');
            window.addEventListener("wheel", (e) => {
                e.preventDefault();
                e.deltaY > 0 ? document.scrollingElement.scrollLeft += 10 : document.scrollingElement.scrollLeft -= 10;
            }, {passive: false});
        }
    }
</script>

<style>
    body {
        overflow-y: hidden;
    }
</style>