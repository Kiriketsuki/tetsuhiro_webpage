<template>
    <div class="case">
        <h1 class="case-title">
            Dancing Tables
        </h1>

        <div class="case-hero frame frame-line">
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
        <router-link to="/projects" class="action">All projects</router-link>
    </div>


</template>

<style scoped>
/*
 * The 2022 write-ups, reset into the frame style: a serif title over a rose
 * rule, the demo in a solid frame, then text and pictures in two columns on
 * wide screens and one on phones. No tilt and no gradient headings.
 */
.case {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(3rem, 8vw, 6rem);
    width: 100vw;
    padding: 4rem 1.25rem 8rem;
}

.case-title {
    width: min(70rem, 100%);
    padding-bottom: 1.25rem;
    border-bottom: 2px solid var(--color-rose);
    color: var(--color-text-strong);
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 7vw, 5.5rem);
    line-height: 1;
}

.case-hero {
    width: min(70rem, 100%);
    height: min(80vh, 44rem);
    padding: 6px;
}

.case-hero > * {
    width: 100%;
    height: 100%;
}

.section {
    width: min(70rem, 100%);
}

.text {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}

.text > p {
    max-width: 65ch;
    color: var(--color-text-body);
    font-size: 1.05rem;
    line-height: 1.7;
}

.text > h5 {
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--color-line);
    color: var(--color-sand);
    font-family: var(--font-label);
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}

.text_left,
.text_right {
    display: grid;
    gap: 2rem;
    align-items: center;
}

@media (min-width: 900px) {
    .text_left,
    .text_right {
        grid-template-columns: 1fr 1fr;
    }
}

.image {
    aspect-ratio: 4 / 3;
    padding: 4px;
    background: var(--color-bg-base);
    border: 1px solid var(--color-line);
}

img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
</style>
