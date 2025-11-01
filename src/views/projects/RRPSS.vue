<template>
    <div class="case">
        <h1 class="case-title">Restaurant Reservation and Point of Sale System</h1>

        <div class="case-hero frame frame-line">
            <iframe src="https://replit.com/@Kiriketsuki/Sixma?embed=true" frameborder="0" class="w-full h-full"></iframe>
        </div>

        <div class="text_center section">
            <div class="text" style="width: 100%;">
                <h5>
                    Introduction
                </h5>
                <p>
                    As part of my curriculum to learn Java, we were given an assignment to code up an entire system to be used for reservation creation and point of sale. During this project,
                    I had to learn Java's syntax, as well as how to use the Visual Paradigm software.
                </p>

                <p>
                    In this assignment, we were required to show our understanding of the principles of object oriented programming, namely encapsulation, inheritance, and polymorphism,
                    as well as SOLID design principles. We also had to create Class Diagrams and Sequence Diagrams, to show our thought process when designing the entire system
                </p>

                <p>
                    The entire project was compressed into a jar file, which I have embedded above using Replit. Feel free to run the program, and see what we have created!
                </p>
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <img src="../../assets/project_gallery/rrpss/rrpss_0.png" alt="">
            </div>

            <div class="text">
                <h5>
                    Class Diagrams
                </h5>

                <p>
                    Class Diagrams are one of the first few diagrams needed to be created when designing a system. They describe the structure of a system by showing the system's classes,
                    their attributes, and their methods. They also show the relationships between the classes, such as inheritance, aggregation, and composition.
                </p>
                
                <p>
                    We created as many classes as we could, trying to achieve Single Responsibility Principle. As such, we created Food, MenuItems, Order, OrderInvoice, Table, Staff, and Reservation
                </p>

                <p>
                    With a clear separation of the different objects that make up the restaurant and the system, we were able to easily implement our ideas into code. 
                </p>
            </div>
        </div>

        <div class="text_left section">
            <div class="text">
                <h5>
                    Sequence Diagrams
                </h5>

                <p>
                    A sequence diagram is a diagram which shows process interactions arranged in time sequence. It depicts the processes involved, and the sequence of messages exchanged
                    between each process needed to carry out functionality.
                    We made two diagrams, one to encapsulate how the process of making an order using the Point of Sale component of our system, and another to show how the process of making a reservation
                </p>

                <p>
                    In the ordering diagram, we showed how every single step and possible outcome for a customer making an order. We start with the customer, an agent requesting our staff, to pass them the menu.
                    This is followed by the customer choosing the items they want, and conveying that message to the staff. The staff then passes the order along to the kitchen. The diagram also shows how
                    the system deals with problems, such as what happens when the ordered item isn't on the menu, or when the customer cannot pay for the order.
                </p>

                <p>
                    In the reservation diagram, we showed the process of a customer making a reservation. We begin with the customer calling the restaurant, where the staff will take down details
                    such as date of reservation, customer name, contact details, as well as information on how many people should the table be able to seat. The diagram also showcases how the system
                    checks for available tables, and how it creates the reservation.
                </p>
            </div>

            <div class="image">
                <img src="../../assets/project_gallery/rrpss/rrpss_1.png" alt="">
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <img src="../../assets/project_gallery/rrpss/rrpss_2.png" alt="">
            </div>
            <div class="text">
                <h5>
                    Final Product
                </h5>

                <p>
                    Through out the entire project, we divided up the work load, with each person working on a different component of the system. With the help of Git branches,
                    we were able to work without impeding each other. With the help of the diagrams, we were able to ensure that the classes we coded would be able to interface 
                    with each other properly
                </p>

                <p>
                    Due to the scope of this class, we were not required to implement a GUI. As such, we made everything work within the command line terminal. Nonetheless,
                    we were able to use ASCII art to make the program easier to use, while also being aesthetically pleasing. The program was also coded such that it does not
                    have a heavy time complexity, and thus it was able to run smoothly.
                </p>

                <p>
                    As part of the final product, we were required to create a video presenting our system. The video can be viewed at <a href="https://youtu.be/vAlrSAihjYc"> https://youtu.be/vAlrSAihjYc </a>
                    while the code can be found at our Github Repository, and interacted with on Replit, embedded at the top of this page.
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
