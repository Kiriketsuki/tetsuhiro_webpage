<template>
    <div class="case">
        <h1 class="case-title">
            Placeholders - Find My HDB
        </h1>

        <div class="case-hero frame frame-line">
            <embed src="https://placeholders-d4876.web.app" type="" class="w-full h-full">
        </div>

        <div class="text_center section">
            <div class="text" style="width: 100%;">
                <h5>
                    Introduction
                </h5>

                <p>
                    A project for my Software Engineering class.
                </p>

                <p>
                    For this project, we were required to use data provided by the government to create an application, be it a web app, mobile app, or desktop app. In the process
                    of creating this app, we were required to use the Agile methodology taught in this class, as well as learn UML.
                </p>
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <iframe src="https://data.gov.sg/dataset/resale-flat-prices/resource/f1765b54-a209-4718-8d38-a39237f502b3/view/093ff0f0-783f-4f6a-be52-7e506a8c58ca" frameBorder="0" class="w-full h-full"> </iframe> 
            </div>

            <div class="text">
                <h5>
                    Project Topic
                </h5>

                <p>
                    The data we decided to use was the resale prices of HDBs, and we obtained the data from <a href="https://data.gov.sg/dataset/resale-flat-prices">here</a>.
                    We chose this dataset as it has a fair bit of data for us to work on, including type of flat, number of rooms, location, and resale price. Using this data,
                    we decided to create an app that would allow users to enter their preferences for a flat, and our app would use the data collected to provide the most relevant
                    listings
                </p>

                <p>
                    We decided to go with a web application approach, instead of a mobile or desktop application, as I had prior experience with creating web applications, and
                    as this class was about the process of engineering software, as compared to focusing on what language the software was programmed in, we felt that a web application
                    would be the best approach.
                </p>
            </div>
        </div>

        <div class="text_left section">
            <div class="text">
                <h5>
                    The Software Engineering Process
                </h5>

                <p>
                    Not only does the project required us to have a team of 6 working on the software, we were also required to adopt Agile methodology, with scrum masters, sprints, and reviews.
                    With the help of our diagrams, clear role assignments, and a good understanding of Agile methodology and pair programming, we were able to push working updates to our web application
                    in a timely fashion.
                </p>

                <p>
                    With the help of Git, we were able to demarcate our work into different branches, and merge them into the main branch when they were ready to be pushed to the live website.
                    This allowed us to work on different parts of the project at the same time, and to ensure that the code we pushed to the live website was stable and bug-free.
                    We also had to learn how to perform pull requests, as well as perform merge requests during our review meetings as part of the Agile methodology.
                </p>

                <p>
                    From start to finish, we implemented proper software engineering procedure, with software requirement specification at the start, to creating a data dictionary,
                    to using Agile to develop the application, and were thus able to create a satisfactory web application.
                </p>
            </div>

            <div class="image">
                <img src="../../assets/project_gallery/placeholders/placeholders_0.png" alt="">
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <img src="../../assets/project_gallery/placeholders/placeholders_1.jpg" alt="">
            </div>
            <div class="text">
                <h5>
                    UML Diagrams
                </h5>

                <p>
                    Besides the Agile methodology, we also had to learn and implement the usage of UML diagrams. These diagrams were used to help us clearly understand every single cog's purpose in this machine.
                    We included the Model View Controller pattern when designing the software, which emphasizes a separation between the logic and display.
                </p>

                <p>
                    We came up with many diagrams, from use case diagrams, class diagrams, sequence diagrams, class relation diagram, key boundary classes, dialog map, and many more. All of which, can be viewed at
                    our Github Repository.
                </p>

                <p>
                    For every step of the development process, there was a diagram to help us work efficiently, and in the end, we created a successful web application.
                    Our final presentation can be viewed here <a href="https://youtu.be/d8rzBvEPVec"> here</a>, while the actual web page can be accessed <a href=""> here</a>.
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
