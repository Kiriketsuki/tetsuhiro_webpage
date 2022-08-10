<template>
    <div class="w-screen flex flex-col items-center gap-24 my-24">
        <h1 class="text-9xl font-slab text-secondary">
            Placeholders - Find My HDB
        </h1>

        <div class="code border-8 w-[80vw] h-[80vh]">
            <img src="../assets/project_gallery/fractals.jpg" alt="" class="w-full h-full">
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
                <img src="../../assets/project_gallery/fractals/fractal_0.png" alt="">
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
                <img src="../../assets/project_gallery/fractals/fractal_1.png" alt="">
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <img src="../../assets/project_gallery/fractals/fractal_2.png" alt="">
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