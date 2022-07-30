<template>
    <div class = "w-[80vw] h-[75vh] flex flex-col items-center justify-center gap-10">
        <h1 class = "font-slab font-bold text-5xl text-secondary">
            Explosive Projects
        </h1>

        <div id="carouselExampleCaptions" class="carousel relative w-[80vw] h-[75vh] rounded-3xl shadow-xl" data-bs-ride="carousel" data-bs-interval = "false">
            <div class="carousel-indicators absolute right-0 bottom-0 left-0 flex justify-center p-0 mb-4">
                <button type="button" data-bs-target="#carouselExampleCaptions" data-bs-slide-to="0" class="active" aria-current="true" aria-label="Slide 1" ></button>
                <button type="button" data-bs-target="#carouselExampleCaptions" data-bs-slide-to="1" aria-label="Slide 2"></button>
                <button type="button" data-bs-target="#carouselExampleCaptions" data-bs-slide-to="2" aria-label="Slide 3" ></button>
                <button type="button" data-bs-target="#carouselExampleCaptions" data-bs-slide-to="3" aria-label="Slide 4" ></button>

            </div>
            <div class="carousel-inner relative overflow-hidden h-[75vh] w-full rounded-3xl font-gabriola">

                <div class="carousel-item relative active float-left w-full h-full">
                    <img src="../assets/project_gallery/fractals.png" class="block w-full h-full" alt="..." />
                    <div class="carousel-caption hidden md:block absolute text-center">
                        <h5 class="text-xl">Fractals in Java</h5>
                        <p>A simple program using Java to image fractals such as the Mandelbrot Set</p>
                    </div>
                </div>

                <div class="carousel-item relative float-left w-full h-full">
                    <img src="../assets/project_gallery/sixma.png" class="block w-full h-full" alt="..." />
                    <div class="carousel-caption hidden md:block absolute text-center">
                            <h5 class="text-xl">Sixma Restaurant</h5>
                            <p>Restaurant Reservaction and Point of Sale System</p>
                    </div>
                </div>
                <div class="carousel-item  relative float-left w-full h-full">
                    <img src="../assets/project_gallery/placeholders.png" class="block w-full h-full" alt="..."/>

                    <div class="carousel-caption hidden md:block absolute text-center text-black">
                        <h5 class="text-xl">Placeholder Apartments</h5>
                        <p>A website designed to recommend second hand apartments based on government-provided data</p>
                    </div>
                </div>



                <div class="carousel-item relative float-left w-full h-full">
                    <img src="../assets/project_gallery/dancing_table.png" class="block w-full h-full" alt="..." />
                    <div class="carousel-caption hidden md:block absolute text-center">
                        <h5 class="text-xl">Dancing Tables</h5>
                        <p>A promotional website for the Dancing Tables product</p>
                    </div>
                </div>
            </div>

            <button class="carousel-control-prev absolute top-0 bottom-0 flex items-center justify-center p-0 text-center border-0 hover:outline-none hover:no-underline focus:outline-none focus:no-underline left-0" type="button" data-bs-target="#carouselExampleCaptions" data-bs-slide="prev" >
                <span class="carousel-control-prev-icon inline-block bg-no-repeat" aria-hidden="true"></span>
                <span class="visually-hidden">Previous</span>
            </button>
            <button class="carousel-control-next absolute top-0 bottom-0 flex items-center justify-center p-0 text-center border-0 hover:outline-none hover:no-underline focus:outline-none focus:no-underline right-0" type="button" data-bs-target="#carouselExampleCaptions" data-bs-slide="next" >
                <span class="carousel-control-next-icon inline-block bg-no-repeat" aria-hidden="true"></span>
                <span class="visually-hidden">Next</span>
            </button>
        </div>

        <button type="button" class=" inline-block px-6 py-2.5 text-white font-medium text-xs leading-tight uppercase rounded shadow-md hover:shadow-lg focus:shadow-lg focus:outline-none focus:ring-0 active:shadow-lg transition duration-150 ease-in-out">More</button>
    </div>
</template>

<script>
    export default {}
</script>

<style>
    img {
        object-fit: cover;
    }
</style>