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
                    How it started
                </h5>

                <p>
                    Dancing Tables was my first freelance job. The client makes a table lifting robot for banquet halls, and they
                    asked for a website that would wow people: interactive, in 3D, the works.
                </p>

                <p>
                    I had never built a 3D website before. I said yes anyway, learnt what I needed along the way, and shipped it.
                </p>
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <img src="../../assets/project_gallery/dancing/dancing_0.png" alt="The banquet hall scene from the Dancing Tables site.">
            </div>

            <div class="text">
                <h5>
                    Three.js
                </h5>

                <p>
                    Before this, my front end work was plain HTML, CSS and JavaScript. I could do parallax and hover tricks, but a
                    real 3D scene needed something else, so I picked up Three.js.
                </p>

                <p>
                    I learnt it from scratch: lights, shadows, textures and rendering. Then I learnt how to keep it fast enough for
                    phones and older laptops, without the scene turning into a mess.
                </p>
            </div>
        </div>

        <div class="text_left section">
            <div class="text">
                <h5>
                    3D modelling
                </h5>

                <p>
                    The client wanted a full banquet hall to show the robot off, but they had no models to give me. So the models
                    were my job too.
                </p>

                <p>
                    I learnt Blender for it, and used what I knew from Photoshop for the textures. I built the hall, the furnished
                    tables and the robot itself.
                </p>

                <p>
                    I also learnt some basic animation, so the site could show the robot setting up a hall next to the old way,
                    with staff moving every table by hand.
                </p>
            </div>

            <div class="image">
                <img src="../../assets/project_gallery/dancing/dancing_1.png" alt="A furnished table in the banquet hall.">
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <img src="../../assets/project_gallery/dancing/dancing_2.png" alt="The table lifting robot in the banquet hall.">
            </div>
            <div class="text">
                <h5>
                    Working with a client
                </h5>

                <p>
                    The person who hired me was great to work with. His partner was harder. I was there as a web developer, but he
                    wanted full product animations from someone who did not know the product inside out.
                </p>

                <p>
                    It was my first freelance job, and the pay was low for what they asked. I did not know yet how to say so.
                </p>

                <p>
                    I still delivered everything on the list, kept the client happy, and ended up with a site I am proud of. I also
                    learnt how to price my time, which was worth more than the pay.
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
