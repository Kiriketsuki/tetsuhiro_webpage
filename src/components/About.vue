<template>
    <div class = "flex lg:flex-row items-center justify-center lg:h-[85vh] flex-col md:h-screen md:mt-10 sm:mt-10 sm:h-screen">
        <div class="lg:w-[20vw]">
            <div class="bg-tertiary block rounded-lg shadow-lg h-full" style="background-color: rgba(5, 27, 69, 0.55)">
                <div class="relative overflow-hidden bg-no-repeat bg-cover " >
                    <img src="../assets/photo.jpg" class="w-full rounded-t-lg" />
                    <a href="#!"> <div class="absolute top-0 right-0 bottom-0 left-0 w-full h-full overflow-hidden bg-fixed"></div> </a>
                    <!-- <svg class="absolute text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320" style="left: 0; bottom: 0"> <path fill="#fff" d="M0,288L48,272C96,256,192,224,288,197.3C384,171,480,149,576,165.3C672,181,768,235,864,250.7C960,267,1056,245,1152,250.7C1248,256,1344,288,1392,304L1440,320L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"> </path> </svg> -->
                </div>

                <div class="p-6 font-slab">
                    <h5 class="lg:text-5xl font-bold mb-4 text-secondary">Jovian Lim</h5>
                    <p class=" mb-4 text-2xl text-tertiary">Software Engineer</p>
                    <ul class="list-inside flex mx-auto justify-center">
                        <a href="#!" class="px-2">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" class="w-8 h-8 text-quinary"> <path fill="currentColor" d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z" /> </svg>
                        </a>
                        <a href="#!" class="px-2">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" class="w-8 h-8 text-quinary"> <path fill="currentColor" d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z" /> </svg>
                        </a>
                    </ul>
                </div>
            </div>
        </div>

        <div class = "lg:w-[50vw] lg:h-[58vh] shadow-md flex flex-col items-center justify-center lg:text-3xl lg:gap-10 text-left rounded-lg font-roboto text-secondary" style="background-color: rgba(5, 27, 69, 0.65)">
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
</template>

<script>
    export default {}
</script>