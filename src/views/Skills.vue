<template>
    <transition appear @before-enter="beforeEnter" @enter="enter">
        <div class="w-screen flex flex-col items-center justify-start text-center min-h-screen gap-10 p-10 skills_showcase" style="opacity: 1">
            <h1 class="w-screen text-9xl font-slab text-quaternary">
                Skills
            </h1>

            <ul class="w-screen flex flex-col items-center justify-start gap-20">
                <img src="../assets/skills_bg/blob-scene-haikei.svg" alt="" class="absolute top-0 left-0 w-screen -z-[1]">
                <img src="../assets/skills_bg/blob-scene-haikei(1).svg" alt="" class="absolute top-[330vh] left-0 w-screen -z-[1]">
                <img src="../assets/skills_bg/blob-scene-haikei(3).svg" alt="" class="absolute top-[600vh] left-0 w-screen -z-[2]">
                <li class="img_left flex flex-row items-center justify-center h-[40vh] gap-[-10vw] w-full">
                    <img src="../assets/skills_showcase/blender_showcase_1.png" alt="" class="h-full">
                    <div class="" style="">
                        <h5>
                            Blender
                        </h5>

                        <p>
                            Blender is a free and open-source 3D computer graphics software toolset used for creating animated films, 
                            visual effects, art, 3D-printed models, motion graphics, interactive 3D applications, virtual reality, and, formerly, video games.
                            While working with Three.js, I have spent countless hours working in Blender to create my own 3D models for use with Three.js
                        </p>
                    </div>
                </li>

                <li class="img_right flex flex-row items-center justify-center h-[40vh]">
                    <div class="w-1/2 h-full">
                        <h5>
                            C/C++
                        </h5>

                        <p>
                            Having been through the Computer Science curriculum at NTU, we were taught the C and C++ programming languages.
                            Since then, I have been very comfortable working with C/C++, especially with pointers and memory management, a highlight of C and its derivatives,
                            after having spent hours using them in coursework and exams.
                        </p>
                    </div>
                    <img src="../assets/skills_showcase/c-cpp_showcase.png" alt="" class = "w-1/2 h-full">
                </li>

                <li class="img_left flex flex-row items-center justify-center h-[40vh]">
                    <img src="../assets/skills_showcase/flask_showcase.png" alt="" class="w-1/2 h-full">
                    <div class="w-1/2 h-full">
                        <h5>
                            Flask
                        </h5>

                        <p>
                            Flask is a web framework, it's a Python module that lets you develop web applications easily. With Python being a very accessible language,
                            I have been able to pick up flask very quickly, and have used it to create a few web applications, as well as using it to easily interact with a database.
                            This skill was best shown off in my Kiip At It project, where I used Flask to quickly host it, and a SQL database to store the data.
                        </p>
                    </div>
                </li>

                <li class="img_right flex flex-row items-center justify-center h-[40vh]">
                    <div class="w-1/2 h-full">
                        <h5>
                            Java
                        </h5>

                        <p>
                            Java is a very well-known, as well as widely used object oriented programming language. One of the most well known project made with Java is Minecraft, which goes to show its capabilities.
                            During my time in NTU, I have been taught Object Oriented Programming, with Java as the focus language. Using Java, me and my team created a simple line-based utility program for restaurant point of sale service.
                            On my own time, I have used Java to create and display different fractals, with the ability to change the colour spectrum as well.
                        </p>
                    </div>
                    <img src="../assets/skills_showcase/java_showcase.png" alt="" class = "w-1/2 h-full">
                </li>

                <li class="img_left flex flex-row items-center justify-center">
                    <img src="../assets/skills_showcase/django_showcase.png" alt="" class="w-1/2 h-full">
                    <div class="w-1/2">
                        <h5>
                            Django
                        </h5>

                        <p>
                            Django is a free and open-source, Python-based web framework that follows the model-template-views architectural pattern. Django is more commonly used for larger projects than Flask,
                            giving any backend developer comfortable in the Python Language to be able to customize a website to certain degrees easily.
                        </p>
                    </div>
                </li>

                <li class="img_right flex flex-row items-center justify-center h-[40vh]">
                    <div class="w-1/2 h-full">
                        <h5>
                            Javascript
                        </h5>

                        <p>
                            Javascript is the main language used in web development, and with the release of NodeJS, Javascript can be used as a runtime as well. In my tenure developing web applications, I have
                            used Javascript to create interactive webpages, without having to fall back on the use of other programming languages. As such, I am also very comfortable in using Javascript on a day-to-day basis,
                            as well as in development. Using only the basics, HTML, CSS, and Javascript, I have been able to create multiple simple yet interactive web applications, such as my project titled A Sketchy Website.
                        </p>
                    </div>
                    <img src="../assets/skills_showcase/javascript_showcase.png" alt="" class = "w-1/2 h-full">
                </li>

                <li class="img_left flex flex-row items-center justify-center h-[40vh]">
                    <img src="../assets/skills_showcase/firebase_showcase.png" alt="" class="w-1/2 h-full">
                    <div class="w-1/2 h-full">
                        <h5>
                            Firebase
                        </h5>

                        <p>
                            Firebase is a platform developed by Google for creating mobile and web applications. Similar to Amazon Web Services and Heroku, Firebase provides a backend as a services, as well as non-SQL based databases to choose from.
                            Using Firebase, I am able to fully develop and deploy web applications quickly, without having to deal with getting a server, and all the other requirements that come with it. After using Firebase to host
                            a few of my projects, including this portfolio website, I am comfortable with navigating about the options Firebase offers, and am able to manage budegets and other aspects of the platform.
                        </p>
                    </div>
                </li>

                <li class="img_right flex flex-row items-center justify-center h-[40vh]">
                    <div class="w-1/2 h-full">
                        <h5>
                            Three.js
                        </h5>

                        <p>
                            Three.js is a cross-browser JavaScript library and application programming interface used to create and display animated 3D computer graphics in a web browser using WebGL. Three.js is what allowed me to
                            create the interactive background of this website, all in the comfort of a web browser. Using Three.js, I am able to create stunning and attractive websites, with more freedom than the two dimensions of a standard
                            webpage. After spending hours working with Three.js, I am able to get desired views and effects, while being able to optimize the speed at which the models are loaded.
                        </p>
                    </div>
                    <img src="../assets/skills_showcase/threejs_showcase.png" alt="" class = "w-1/2 h-full">
                </li>

                <li class="img_left flex flex-row items-center justify-center h-[40vh]">
                    <img src="../assets/skills_showcase/premiere_showcase.png" alt="" class="w-1/2 h-full">
                    <div class="w-1/2">
                        <h5>
                            Adobe Premiere Pro
                        </h5>

                        <p>
                            Adobe Premiere Pro is one of the most widely used video editing software out in the industry. Having been in a video production CCA since secondary school, and being Vice-Chairman of my JC's videography club,
                            I have hours of experience using Adobe Premiere Pro to edit videos. Alongside my experience in video production, direction, and cinematography, being able to use Adoble Premiere Pro has allowed me to
                            work on a wide variety of video projects, and even winning some video competitions with my teams.
                        </p>
                    </div>
                </li>

                <li class="img_right flex flex-row items-center justify-center h-[40vh]">
                    <div class="w-1/2">
                        <h5>
                            Adobe Photoshop
                        </h5>

                        <p>
                            Adobe Photoshop is the industry standard for image editing, and is even a common household name, synonymous with the act of editing images. Having been through some photography classes, I was given the opportunity
                            to learn this valuable skill, and have used it in photo gallery projects, as well as photo printing. Besides freshening up captured images, I am also able to use photoshop for simple image editing,
                            as well as use it for a myriad of other purposes, not limited to creating pixel art. 
                        </p>
                    </div>
                    <img src="../assets/skills_showcase/photoshop_showcase.png" alt="" class = "w-1/2">
                </li>

                <li class="img_left flex flex-row items-center justify-center h-[40vh]">
                    <img src="../assets/skills_showcase/python_showcase.png" alt="" class="w-1/2">
                    <div class="w-1/2">
                        <h5>
                            Python
                        </h5>

                        <p>
                            Python is a very accessible general purpose programming language, and one of the first few languages I have learnt. I am very comfortable in the basic capabilities of Python,
                            and have been able to use it to develop simple scripts, as well as a Discord bot. However, Python is also able to be used for Data Analysis, with the help of libraries such as Numpy, Pandas, and Matplotlib,
                            which I have also learnt, and used while analysing data in different projects. I have also used Python to carry out some Artificial Intelligence, including a document scanning and data entry, as well
                            as bots to beat simple games such as Woodcutter.
                        </p>
                    </div>
                </li>

                <li class="img_right flex flex-row items-center justify-center h-[40vh]">
                    <div class="w-1/2">
                        <h5>
                            Ruby
                        </h5>

                        <p>
                            Ruby is an interpreted, high-level, general-purpose programming language which supports multiple programming paradigms. It was the first programming langauge I learnt, and was able to use it to create 
                            simple webpages, a text-based game, and a Sudoku solver. With the help of Ruby on Rails, I am also able to create server-side web applications.
                        </p>
                    </div>
                    <img src="../assets/skills_showcase/ruby_showcase.png" alt="" class = "w-1/2">
                </li>

                <li class="img_left flex flex-row items-center justify-center h-[40vh]">
                    <img src="../assets/skills_showcase/office_showcase.png" alt="" class="w-1/2">
                    <div class="w-1/2">
                        <h5>
                            Microsoft Office
                        </h5>

                        <p>
                            Microsoft Office needs no introduction, with its array of applications, from Microsoft Word, to Excel, to Powerpoint. I have used Microsoft Office for a wide variety of purposes, from creating presentations in primary school,
                            to creating spreadsheets and simple scripts in Visual Basic in National Service, to learning how to use Excel's powerful functions to make business management decisions, to using Outlook for interfacing with clients via E-mail,
                            I am comfortable in using Microsoft Office, and what it has to offer.
                        </p>
                    </div>
                </li>
            </ul>
        </div>
    </transition>
</template>

<script>
    import gsap from 'gsap';
    export default {
        setup() {
            const beforeEnter = (el) => {
                console.log('beforeEnter');
                el.style.opacity = 0;
            };

            const enter = (el) => {
                console.log('enter');
                setTimeout(() => {
                    gsap.to(el, {
                        opacity: 1,
                        duration: 0.5,
                    });
                }, 600);
            }

            return {beforeEnter, enter};
        },
    }
</script>

<style scoped>
    p {
        @apply text-quinary text-2xl w-[90%] px-20 py-4;
        text-shadow: 1px white;
    }


    .img_left > div {
        @apply text-right rounded-r-xl rounded-l-sm;
        transform: translateX(-15%);
    }

    .img_right > div {
        @apply text-left rounded-l-xl rounded-r-sm shadow-lg;
        height: 110%;
        transform: translate(15%);
    }

    .img_right > img {
        z-index: 1;
    }

    li > img {
        width: 80%;
        object-fit: cover;
        @apply h-full rounded-2xl shadow-2xl;
    }

    li > div {
        width: 50%;
        height: 90%;
        background: hsla(0, 0%, 50%, 0.15); 
        backdrop-filter: blur(100px); 
        @apply flex flex-col items-center justify-center;
    }

    li {
        @apply h-[55vh] w-[95%] gap-10 px-10;
    }

    h5 {
        @apply text-4xl;
        text-transform: capitalize;
    }

    h1 {
        text-shadow: 3px white;
    }
</style>