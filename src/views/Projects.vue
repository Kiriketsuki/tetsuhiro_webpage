<template>
    <transition appear @before-enter="beforeEnter" @enter="enter">
        <div class="flex flex-col items-center justify-center text-[10rem] text-secondary font-slab w-screen gap-24">
            <h1>Projects</h1>

            <div class="project_container fractal stagger-anim">
                <div class="image_description stagger-anim" :v-if="big" style="opacity: 1">
                    <div class="text_left">
                        <div class="text">
                            <p>
                                After learning how to use Java, I decided to use it to create a project in my own time. Having always been interested in Mathematics, I looked into Fractals, and decided to try coding a program to display them
                            </p>
                            <p>
                                I started with one of the most well known fractals, the Mandelbrot set, using various different algorithms to escape the calculation, and thus optimizing the speed and detail of the set.
                            </p>
                        </div>

                        <div class="buttons">
                            <button type="button" class="proj_button bg-quinary" @click="$router.push('projects/fractals')">
                                Learn More
                            </button>

                            <button type="button" class="proj_button">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" class = "h-12 w-12">
                                    <path fill="rgb(83,179,203)" d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="divider">
                    </div>
                    <div class="text_right">
                        <div class="text">
                            <p>
                                I have also implemented different methods of colouring in the set as outputted by the escape time algorithms, including continuous, hsv, and histogram colouring.
                            </p>
                            <p>
                                Lastly, I also created mutiple ways to generate a colour palette for the
                                colouring algorithms to fill in the screen
                            </p>

                            <p>
                                Click on the image to find out more!
                            </p>
                        </div>
                    </div>
                </div>

                <div class="project_image stagger-anim" @mouseover=hover($event) @mouseleave=leave($event) @click="$router.push('projects/fractals')" style="width:50%">
                    <img src="../assets/project_gallery/fractals.jpg" alt="" class="w-full h-full">
                </div>

                <div class="stagger-anim">
                    <h5>
                        Fractals in Java
                    </h5>
                </div>
            </div>

            <div class="project_container rrpss stagger-anim">
                <div class="image_description stagger-anim" :v-if="big" style="opacity: 1">
                    <div class="text_left">
                        <div class="text">
                            <p>
                                An assignment from school, to create a fully functioning Restaurant Reservation and
                                Point of Sale System, coded entirely in Java.
                            </p>
                            <p>
                                We used Object Oriented Programming Design
                                principles, including encapsulation, abstraction, inheritance, and polymorphism.
                            </p>
                        </div>

                    </div>
                    <div class="divider">
                    </div>
                    <div class="text_right">
                        <div class="text">
                            <p>
                                Besides the actual final product created, we had to learn how to operate as a software
                                engineering team, implenting systems such as the Agile methodlogy to pace the work
                                of every member.
                            </p>

                            <p>
                                We also learnt how to, and submitted, various design maps and diagrams, with allowed
                                for clear and straightforward development of the final program
                            </p>

                        </div>


                        <div class="buttons">
                            <button type="button" class="proj_button bg-quinary" @click="$router.push('projects/rrpss')">
                                Learn More
                            </button>

                            <button type="button" class="proj_button">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" class = "h-12 w-12">
                                    <path fill="rgb(83,179,203)" d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="project_image stagger-anim" @mouseover=hover($event) @mouseleave=leave($event) @click="$router.push('projects/rrpss')" style="width:50%">
                    <img src="../assets/project_gallery/sixma.jpg" alt="">
                </div>

                <div class="stagger-anim">
                    <h5>
                        Restaurant Reservation and Point of Sale System
                    </h5>
                </div>
            </div>

            <div class="project_container placeholders stagger-anim">
                <div class="image_description stagger-anim" :v-if="big" style="opacity: 1">
                    <div class="text_left">
                        <div class="text">
                            <p>
                                An assignment from school, where we have to apply software engineering design principles and
                                methodlogy, in order to work as a team and come up with an application based on data from
                                data.gov.sg
                            </p>
                        </div>

                        <div class="buttons">
                            <button type="button" class="proj_button bg-quinary" @click="$router.push('projects/placeholders')">
                                Learn More
                            </button>

                            <button type="button" class="proj_button">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" class = "h-12 w-12">
                                    <path fill="rgb(83,179,203)" d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="divider">
                    </div>
                    <div class="text_right">
                        <div class="text">
                            <p>
                                We came up with an web app, using data that contains the information of all sales of second-hand
                                HDBs, and created an algorithm that takes in the requirements a client would want in a house,
                                and search through the data for a list of most viable HDBs that fits their budget and criteria.
                            </p>

                            <p>
                                Hence, we named the webpage “Find My (the client's) HDB"
                            </p>

                        </div>


                    </div>
                </div>
                <div class="project_image" @mouseover=hover($event) @mouseleave=leave($event) @click="$router.push('projects/placeholders')" style="width:50%">
                    <img src="../assets/project_gallery/placeholders.jpg" alt="">
                </div>

                <div>
                    <h5>
                        Placeholders - Find My HDB
                    </h5>
                </div>
            </div>

            <div class="project_container dancing_tables stagger-anim">
                <div class="image_description stagger-anim" :v-if="big" style="opacity: 1">
                    <div class="text_left">
                        <div class="text">
                            <p>
                                Dancing Tables was my first professional web design product. A company approaced me to create a website to help advertise their product, the Dancing Tables robot.
                            </p>
                        </div>

                    </div>
                    <div class="divider">
                    </div>
                    <div class="text_right">
                        <div class="text">
                            <p>
                                It was a robot meant to be used to lift heavy tables and chairs, such as the ones typically found at banquets. In my webpage, I was able
                                to put the viewer into a 3D scene of a banquet hall itself
                            </p>

                            <p>
                                Using Three.js, the viewer was able to see how the product can be used, and even allowed the viewer to be upclose and personal, and inspect a 3D model of the robot itself
                            </p>

                        </div>


                        <div class="buttons">
                            <button type="button" class="proj_button bg-quinary" @click="$router.push('projects/dancing_tables')">
                                Learn More
                            </button>

                            <button type="button" class="proj_button">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" class = "h-12 w-12">
                                    <path fill="rgb(83,179,203)" d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="project_image stagger-anim" @mouseover=hover($event) @mouseleave=leave($event) @click="$router.push('projects/dancing_tables')" style="width:50%">
                    <img src="../assets/project_gallery/dancing_table.jpg" alt="">
                </div>

                <div class="stagger-anim">
                    <h5>
                        Dancing Tables
                    </h5>
                </div>
            </div>
        </div>
    </transition>
</template>

<script>
    import gsap from 'gsap';
    import { ScrollTrigger } from 'gsap/ScrollTrigger';
    import VanillaTilt from 'vanilla-tilt';

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

            VanillaTilt.init(document.querySelectorAll(".text"), {
                scale: 1.05,
                max: 10
            });
        },
        methods: {
            hover,
            leave
        }
    }

    function hover($event) {
        var image_container = $event.target.parentElement;
        image_container.style.cursor = "pointer";
        var image_description = image_container.previousElementSibling;
        gsap.to(image_description.style, {
            opacity: 0,
            duration: 0.1,
        })
        gsap.to(image_container.style, {
            width: "100%",
            duration: 0.2,
            delay: 0.1
        })
    }

    function leave($event) {
        var image_container = $event.target;
        var image_description = image_container.previousElementSibling;
        gsap.to(image_container.style, {
            width: "50%",
            duration: 0.2,
        })

        gsap.to(image_description.style, {
            opacity: 1,
            duration: 0.1,
            delay: 0.2
        })

    }
</script>

<style scoped>
    img {
        @apply w-full h-full rounded-xl;
        object-fit: cover;
    }

    .project_container {
        @apply w-[80vw] h-[80vh] flex flex-col items-center justify-start gap-5 relative border-b-2 border-[#00274695];
        /* background-color: hsla(0, 0%, 100%, 0.1); */
        backdrop-filter: blur(100px);
    }

    .image_description {
        @apply w-full h-[90%] flex justify-between absolute top-0 left-0 flex-nowrap gap-10;
    }

    .divider {
        @apply w-1/2 shrink-0;
    }

    .text_left, .text_right {
        @apply flex flex-col items-center justify-center w-[25%] h-full px-5;
    }

    .text_left {
        transform: translateY(-10%);
    }

    .text_right {
        transform: translateY(10%);
    }

    .text_right > .text > p{
        @apply text-tertiary;
    }

    .buttons {
        @apply flex items-center justify-center gap-5 w-full h-[10%];
    }

    .proj_button {
        @apply px-6 py-2.5 text-white font-medium text-xs leading-tight uppercase rounded shadow-md hover:bg-tertiary hover:shadow-lg focus:bg-blue-700 focus:shadow-lg focus:outline-none focus:ring-0 transition duration-150 ease-in-out
    }

    .text {
        @apply flex flex-col gap-10 p-5 rounded-xl shadow-md;
        background: hsla(0, 0%, 100%, 0.1);
    }

    .project_image {
        @apply  w-1/2 h-[90%] z-10 shrink-0 rounded-xl;
    }

    h5 {
        @apply text-5xl;
    }

    p {
        @apply lg:text-2xl text-sm;
    }
</style>
