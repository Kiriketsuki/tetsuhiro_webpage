<template>
    <div class="w-screen flex flex-col items-center gap-24 my-24">
        <h1 class="text-9xl font-slab text-secondary">
            Dancing Tables
        </h1>

        <div class="code border-8 w-[80vw] h-[80vh]">
            <embed src="https://dancing-tables.web.app/" type="" class="w-full h-full">
        </div>

        <div class="text_center section">
            <div class="text" style="width: 100%;">
                <h5>
                    Introduction
                </h5>

                <p>
                    Dancing Tables was my first foray into free-lancing as a web developer. When approached by the company, they requested a mindblowing
                    website, with amazing effects, citing that they wanted an interactive, 3D website.
                </p>

                <p>
                    Although it was a challenge, I took it upon myself to learn various different skills in order to create the website that they envisioned,
                    and I succeeded.
                </p>
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <img src="../../assets/project_gallery/dancing/dancing_0.png" alt="">
            </div>

            <div class="text">
                <h5>
                    Three.js
                </h5>

                <p>
                    Before taking on this job, my experience with front-end development was the classic HTML, CSS, and JavaScript. I was able to create stunning
                    2D websites, using CSS animations and Javascript libraries, pulling off tricks such as parallax scrolling and 3D hover effects. However, in order
                    to make a fully 3D website, I needed a way to draw 3D models, and Three.js was the perfect solution.
                </p>

                <p>
                    I had to learn from scratch how to use Three.js, and its various intricacies, such as lighting, rendering, shadows, texture mapping, and more.
                    In order to even render the page on various browsers and different devices, I had to learn how to optimize how Three.js was rendering the scene,
                    how to manage models, and how to deal with lighting, without making the entire webpage looking like a mess.
                </p>
            </div>
        </div>

        <div class="text_left section">
            <div class="text">
                <h5>
                    3D Modeling
                </h5>

                <p>
                    The client wanted a fully fledged 3D scene to fully showcase the capabilities of their product, the Dancing Table. However, the client did not have any
                    resources for me to pull upon, and it was up to me to create the models needed to flesh out the scene.
                </p>

                <p>
                    I started to learn how to use Blender, and with my knowledge of photoshop, I was able to create an entire banquet hall, with fully furnished tables, as well
                    as the product being used within the banquet hall, all while having the correct textures.
                </p>

                <p>
                    Furthermore, as the intention was to showcase how the product works, I had learnt some basic animations to visually demonstrate the benefits of using their product,
                    over a more traditional setup, with workers manually setting up the tables.
                </p>
            </div>

            <div class="image">
                <img src="../../assets/project_gallery/dancing/dancing_1.png" alt="">
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <img src="../../assets/project_gallery/dancing/dancing_2.png" alt="">
            </div>
            <div class="text">
                <h5>
                    Interfacing with the client
                </h5>

                <p>
                    While the client whom sought me out was ernest and professional, he had a partner that was more difficult to work with. I was brought on as a web developer,
                    and I do not know the ins and outs of their product, but the partner wanted me to be able to fully animate and showcase the product. 
                </p>

                <p>
                    As previously mentioned, it was my first experience as a freelancer, and the client tried to low-ball me, while requesting a very high level of work, especially
                    given that I had never dealt with 3D websites before. My experience before then was solely with web technology, and I did not expect to be asked to create
                    3D models.
                </p>

                <p>
                    Nonetheless, I was able to push myself, while not losing my client as a customer. I ended up being able to do what was required of me, and more, while being able
                    to provide a product that I am satisfied with. This experience has taught me a lot on how to be a freelancer, as well as how to interact with clients, and now I am
                    much more confident in my skills to work as a freelancer web developer.
                </p>
            </div>

        </div>
    </div>


</template>

<script>
    import VanillaTilt from 'vanilla-tilt';

    export default {
        mounted() {
            VanillaTilt.init(document.querySelectorAll(".image"), {
                max: 10,
            });
        }
    }
</script>

<style scoped>
    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .section {
        @apply w-[70vw];
    }

    .text {
        @apply w-[50%] flex flex-col gap-8;
    }

    .text > p {
        @apply text-2xl;
    }

    .text > h5 {
        @apply text-5xl font-slab h-16;
        background-image: var(--gradient);
        background-clip: text;
        color: transparent;
        background-size: 500%;
        animation: gradient_animation 10s ease infinite alternate;
    }

    .text_left, .text_right {
        @apply flex flex-row gap-8 justify-center items-center;
    }

    .image {
        @apply w-[50%] h-[50vh];
    }
</style>