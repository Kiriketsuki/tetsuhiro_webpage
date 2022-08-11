<template>
    <div class="w-screen flex flex-col items-center gap-24 my-24">
        <h1 class="text-9xl font-slab text-secondary">
            Fractals in Java
        </h1>

        <div class="code border-8 w-[80vw] h-[80vh]">
            <img src="../../assets/project_gallery/fractals.jpg" alt="" class="w-full h-full">
        </div>

        <div class="text_center section">
            <div class="text" style="width: 100%;">
                <h5>
                    Introduction
                </h5>
                <p>
                    After learning how to work on Java projects, I set out to do a fun yet aesthetically pleasing project. Inspired by YouTube videos on the Mandelbrot set,
                    I decided to create a program in Java that would be able to generate the Mandelbrot set, while letting me zoom in or pan as I please.
                </p>

                <p>
                    I started off by breaking down the project into small chunks, to make it easier to work on. First, I would require a frame, and a panel to actually draw
                    and colour in the fractal. Next, I would need to calculate the fractal, based on its equation. Lastly, I need to decide how to colour each pixel,
                    based on the value outputted by the equation
                </p>

                <p>
                    After solving these issues for the Mandelbrot set, I was able to extend the problem, and apply the same solutions to the Julia set. I also plan on expanding
                    the program to include support for other fractals, such as the Burning Ship set.
                </p>
            </div>
        </div>

        <div class="text_right section">
            <div class="image">
                <img src="../../assets/project_gallery/fractals/fractal_0.png" alt="">
            </div>

            <div class="text">
                <h5>
                    GUI
                </h5>

                <p>
                    With languages such as C and Java, most of the interactivity is via the Command Line, making it impractical to display images. However, after some research into
                    Java, I have found that one of the most used library by Java for creating GUIs is Swing. As such, I decided to use Swing to create a GUI for my project.
                </p>

                <p>
                    Swing requires different objects to make up the entire GUI. First, there is the frame, which is the window that the user sees. The frame is defined by its width and height,
                    and also includes the title of the program that is running. 
                </p>
                <p>
                    Next, there is the panel, the actual area where pixels are coloured and drawn. Using Java's inhertiance system,
                    I created multiple different panels for different fractals, all extending from the base panel
                </p>
                <p>
                    Lastly, there is the toolbar. While it isn't strictly necessary to have one, I added a toolbar
                    to allow the user to determine how many iterations, and by extension how detailed, the fractal should have. It also includes an undo button, such that the user would be able to zoom out.
                </p>
            </div>
        </div>

        <div class="text_left section">
            <div class="text">
                <h5>
                    The Equation
                </h5>

                <p>
                    By definition, the Mandelbrot set is the set of complex numbers c, for which the function f(z) = z^2 + c does not diverge when iterated from z = 0, i.e., for which the sequence f(0), f(f(0)), ... remains bounded in absolute value.
                </p>

                <p>
                    In order to visualise this set, the program would need to repeatedly iterate over the values of z, and storing the complex numbers outputted. The starting value of z is defined
                    by each coordinate pair of each pixel in my frame, with the x coordinate being the real part, and the y coordinate being the imaginary part of the complex number z. As such, 
                    the program would need to iterate through every pixel, and for each pixel, iterate through the equation, to determine if the particular starting value of z diverges to infinity.
                </p>

                <p>
                    With this basic premise in mind, creating a 1000 * 1000 px image was able to yield a passable display of the mandelbrot set. However, the iteration loop was not optimized, and generating
                    the image can take a while, especially with higher levels of iteration, or a bigger picture.
                </p>

                <p>
                    As such, I dug into more research, and learnt more about different ways to calculate the equation. First, there is the optimized escape time algorithm, which does not require the implementation
                    and logic of complex numbers, and simplified into basic algebra. There is a further optimization available, which uses the logarithm of the values, instead of the values themselves, resulting in  
                    better looking and faster generated images.
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
                    Colouring Algorithms
                </h5>

                <p>
                    After solving the problem of optimization, there is the issue of making the fractal look nicer. First, I would need to decide upon a colour scheme, instead of merely
                    colouring in the image with only black and white, where black does not diverge, and white does diverge. To create my colour palettes, I would choose colours I would
                    think look nice, and then enter them into a short script I coded to interpolate and generate a gradient between the colours.
                </p>

                <p>
                    Besides the colour palette, the next thing to do is to decide how to colour each pixel based on the number of iterations each pixel took to diverge, or not at all.
                    Using a simple colouring algorithm, the fractal was able to emerge, but there are clear banding issues, as the number of iterations are too discrete of values
                </p>

                <p>
                    To solve this issue, I tried many different colouring algorithms, such as the Histogram colouring, which while still produces bands, it makes each band bigger and smoother
                </p>

                <p>
                    Next, there are other algorithms I tried out, including the smooth histogram optimized algorithm, as well as the smooth continuous colouring algorithm, which gets rid of the banding
                    issue altogether, as it uses continuous values, instead of discrete values
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