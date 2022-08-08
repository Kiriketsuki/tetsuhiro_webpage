<template>
    <transition appear @before-enter="beforeEnter" @enter="enter">
        <div style="opacity: 0;">
            <img src="../assets/project_gallery/bg.svg" alt="" class = "bg">
            <div class = "flex flex-col items-center justify-start my-10 gap-20">
                <h1 class = "text-secondary text-9xl font-slab">
                    Projects
                </h1>

                <div class = "project rrpss grid grid-rows-2 grid-cols-2 stagger-anim">
                    <div class="text row-start-2 col-start-2 w-[80%] stagger-anim">
                        <h5 class = "mb-10 stagger-anim">
                            RRPSS in Java
                        </h5>

                        <div class="para flex flex-col gap-4 stagger-anim">
                            <p>
                                An assignment from school, to create a fully functioning Restaurant Reservation and
                                Point of Sale System, coded entirely in Java, using Object Oriented Programming Design
                                principles, including encapsulation, abstraction, inheritance, and polymorphism.
                            </p>

                            <p v-if="big">
                                Besides the actual final product created, we had to learn how to operate as a software
                                engineering team, implenting systems such as the Agile methodlogy to pace the work
                                of every member.
                            </p>

                            <p v-if="big">
                                We also learnt how to, and submitted, various design maps and diagrams, with allowed
                                for clear and straightforward development of the final program
                            </p>
                        </div>
                    </div>

                    <button>
                        more
                    </button>
                </div>

                <div class="project grid placeholders grid-rows-5 grid-cols-8 stagger-anim">
                    <div class="text lg:row-start-4 lg:col-start-2 lg:col-end-5 stagger-anim">
                        <h5 class =  "mb-10 stagger-anim">
                            Placeholders - Find My HDB
                        </h5>

                        <div class="para flex flex-col gap-4 stagger-anim">
                            <p>
                                An assignment from school, where we have to apply software engineering design principles and
                                methodlogy, in order to work as a team and come up with an application based on data from
                                data.gov.sg
                            </p>

                            <p v-if="big">
                                We came up with an web app, using data that contains the information of all sales of second-hand
                                HDBs, and created an algorithm that takes in the requirements a client would want in a house,
                                and search through the data for a list of most viable HDBs that fits their budget and criteria.
                            </p>

                            <p v-if="big">
                                Hence, we named the webpage “Find My (the client's) HDB"
                            </p>
                        </div>
                    </div>

                </div>

                <div class = "flex flex-col">
                    <div class="project fractal flex flex-row items-center justify-end relative stagger-anim">
                        <div class="fractal_image absolute top-0 left-0 right-0 w-[80vw] flex flex-row items-start justify-end rounded-3xl stagger-anim">
                            <div class = "h-full w-1/2 rounded-xl">

                            </div>
                        </div>

                        <div v-if="big" class="text flex flex-col items-center justify-center w-1/2 stagger-anim">
                            <h5 class="mb-10 stagger-anim lg:text-5xl">
                                Fractals in Java
                            </h5>

                            <div class="para flex flex-col gap-4 w-[90%] stagger-anim">
                                <p class ="text-primary">
                                    After learning how to use Java, I decided to use it to create a project in my own time. 
                                    Having always been interested in Mathematics, I looked into Fractals, and decided to try coding a program to display them
                                </p>

                                <p class ="text-primary" v-if="big">
                                    I started with one of th emost well known fractals, the Mandelbrot set, using various different algorithms to escape the calculation, 
                                    and thus optimizing the speed and detail of the set.
                                </p>

                                <p class ="text-primary" v-if="big">
                                    I have also implemented different methods of colouring in the set as outputted by the escape time algorithms, including continuous, hsv, and histogram colouring.
                                </p>

                                <p class ="text-primary" v-if="big">
                                    Lastly, I also created mutiple ways to generate a colour palette for the 
                                    colouring algorithms to fill in the screen
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- <div v-if="big" class="text flex flex-col items-center justify-center w-1/2 stagger-anim">
                        <h5 class="mb-10 stagger-anim lg:text-5xl">
                            Fractals in Java
                        </h5>

                        <div class="para flex flex-col gap-4 w-[90%] stagger-anim">
                            <p class ="text-primary">
                                After learning how to use Java, I decided to use it to create a project in my own time. 
                                Having always been interested in Mathematics, I looked into Fractals, and decided to try coding a program to display them
                            </p>
                        </div>
                    </div> -->
                </div>

                <div class="project dancing_tables relative grid grid-cols-2 grid-rows-2 stagger-anim">
                    <div class="dancing_tables_image w-[90vw] h-[90vh] absolute top-0 left-0 stagger-anim">

                    </div>
                    
                    <div class="text w-1/2 flex flex-col items-center justify-center gap-4 h-1/2 row-start-2 col-start-1 col-end-3 stagger-anim">
                        <h5 class ="stagger-anim">
                            Dancing Tables
                        </h5>

                        <div class="para flex flex-col items-center justify-center gap-4 w-[90%] stagger-anim">
                            <p>
                                Dancing Tables was my first professional web design product. A company approaced me to create a website to help advertise their product, the Dancing Tables robot.
                            </p>

                            <p v-if="big">
                                It was a robot meant to be used to lift heavy tables and chairs, such as the ones typically found at banquets. In my webpage, I was able
                                to put the viewer into a 3D scene of a banquet hall itself
                            </p>

                            <p v-if="big">
                                Using Three.js, the viewer was able to see how the product can be used, and even allowed the viewer to be upclose and personal, and inspect a 3D model of the robot itself
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </transition>
</template>

<script>
    import gsap from 'gsap';
    import { ScrollTrigger } from 'gsap/ScrollTrigger';
    gsap.registerPlugin(ScrollTrigger);
    export default {
        setup() {
            const beforeEnter = (el) => {
                el.style.opacity = 0;
            };
            var big = true;
            const enter = (el) => {
                console.log('enter');
                setTimeout(() => {
                    gsap.to(el, {
                        opacity: 1,
                        duration: 1,
                    });
                }, 1000);
            }
            if (window.innerWidth < 640) {
                big = false;
            }
            return {beforeEnter, enter, big};
        },
        mounted() {
            var list_items = Array.from(document.querySelectorAll(".stagger-anim"));
            list_items.forEach((item, index) => {
                gsap.fromTo(item, {
                    opacity: 0,
                    yPercent: 5 + 5/3 * (index % 2)
                },{
                    opacity: 1,
                    yPercent: 0,
                    stagger: 0.2,
                    delay: index % 3 * 0.1,
                    scrollTrigger: {
                        trigger: item,
                        start: "top bottom",
                    }
                })
            })
        }
    }
</script>

<style scoped>
    .bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 110vw;
        z-index: -2;
        object-fit: contain;
    }
    .project {
        @apply w-[90vw] h-[90vh] rounded-xl shadow-lg;
    }

    .rrpss {
        background-image: linear-gradient(0deg, rgba(0, 0, 0, 0.61), rgba(0, 0, 0, 0.61)), url("../assets/project_gallery/sixma.jpg");
        background-size: cover;
    }

    .placeholders {
        background-image: url("../assets/project_gallery/placeholders.jpg");
    }

    /* .fractal {
        background: linear-gradient(270deg, #7476E5 0.89%, rgba(17, 20, 181, 0) 56.69%);
    } */

    .fractal_image {
        width: 90vw;
        height: 90vh;
        background: linear-gradient(90deg, #7476E5 0.89%, #7476E5 0.89%);
        transform: rotate(-180deg);
        z-index: -1;
    }

    .fractal_image > div {
        background: linear-gradient(90deg, #7476E5 0.89%, rgba(17, 20, 181, 0) 56.69%), url("../assets/project_gallery/fractals.jpg");
        background-size: cover;
        z-index: -1;
    }

    .dancing_tables_image {
        background: linear-gradient(0deg, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("../assets/project_gallery/dancing_table.jpg");
        background-size: cover;
        filter: blur(10px);
        z-index: -1;
    }

    h5 {
        @apply lg:text-3xl text-2xl font-slab text-quaternary text-center;
    }

    .para {
        @apply lg:text-xl text-xs font-slab;
    }
</style>