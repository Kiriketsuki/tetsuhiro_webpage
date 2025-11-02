<template>
    <div class="case">
        <h1 class="case-title">
            Find My HDB
        </h1>

        <div class="case-hero frame frame-line">
            <embed src="https://placeholders-d4876.web.app" type="" class="w-full h-full">
        </div>

        <div class="text_center section">
            <div class="text" style="width: 100%;">
                <h5>
                    The brief
                </h5>

                <p>
                    A team project for my software engineering module at NTU. Our team was called Placeholders, which tells you
                    how long we spent on the name.
                </p>

                <p>
                    The brief was to build an app on government open data, and to build it the proper way: Agile, sprints and
                    UML from day one.
                </p>
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <iframe src="https://data.gov.sg/dataset/resale-flat-prices/resource/f1765b54-a209-4718-8d38-a39237f502b3/view/093ff0f0-783f-4f6a-be52-7e506a8c58ca" frameBorder="0" class="w-full h-full" title="HDB resale prices on data.gov.sg"> </iframe>
            </div>

            <div class="text">
                <h5>
                    The idea
                </h5>

                <p>
                    We used the <a href="https://data.gov.sg/dataset/resale-flat-prices" class="text-link">HDB resale price data</a>.
                    It has the flat type, the number of rooms, the town and the price, which is plenty to work with. You tell the
                    app what flat you want, and it finds the listings that fit.
                </p>

                <p>
                    We built it as a web app. I had built web apps before, and the module cared more about the process than the
                    language, so the web was the easy choice.
                </p>
            </div>
        </div>

        <div class="text_left section">
            <div class="text">
                <h5>
                    The process
                </h5>

                <p>
                    There were six of us, with a scrum master, sprints and reviews. Clear roles and a bit of pair programming kept
                    the updates coming on time.
                </p>

                <p>
                    Each feature lived on its own Git branch and went into main through a pull request, and we went through them
                    together at each review. It was the first time most of us worked like that.
                </p>

                <p>
                    We went from a requirements spec to a data dictionary to working software, one sprint at a time.
                </p>
            </div>

            <div class="image">
                <img src="../../assets/project_gallery/placeholders/placeholders_0.png" alt="A page from the Find My HDB web app.">
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <img src="../../assets/project_gallery/placeholders/placeholders_1.jpg" alt="One of the UML diagrams for Find My HDB.">
            </div>
            <div class="text">
                <h5>
                    UML diagrams
                </h5>

                <p>
                    We drew a lot of diagrams: use cases, classes, sequences, a dialog map and more. The design followed Model View
                    Controller, so the logic and the screens stayed apart.
                </p>

                <p>
                    I was not sold on that many diagrams at first. By the end I got it: every part had a picture that said what it
                    was for, and that made the whole team faster.
                </p>

                <p>
                    You can watch our <a href="https://youtu.be/d8rzBvEPVec" class="text-link">final presentation</a> on YouTube.
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
