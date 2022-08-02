<template>
    <div class="w-[80vw] flex flex-row items-center justify-center h-full stagger_anim">
        <div class="w-1/2 h-[60vh] stagger_anim">
            <div class="flex flex-col justify-between h-11/12 rounded-lg shadow-lg px-6 py-12 lg:py-6 xl:py-12 md:px-12 lg:-mr-14 stagger_anim" style="background: hsla(0, 0%, 100%, 0.05); backdrop-filter: blur(100px)">
                <h3 class="text-7xl text-secondary font-bold mb-3 font-slab stagger_anim">Thank you for checking out my portfolio</h3>
                <h5 class="text-4xl text-tertiary font-bold mb-12 lg:mb-10 xl:mb-12 font-slab stagger_anim">I would love to hear from you</h5>

                <div class = "stagger_anim">
                    <p class="text-2xl mb-4 text-quaternary font-slab">Socials</p>
                    <p class="text-xl text-gra-500 mb-6 font-roboto">
                        Lorem ipsum dolor sit amet consectetur, adipisicing elit. Sunt
                        autem numquam dolore molestias aperiam culpa alias veritatis
                        architecto eos, molestiae vitae ex eligendi libero eveniet
                        dolorem, doloremque rem aliquid perferendis.
                    </p>
                </div>

                <div class = "stagger_anim">
                    <p class="text-2xl mb-4 text-quaternary font-slab">Contact</p>
                    <p class="text-xl text-gra-500 mb-6 font-roboto">
                        Feel free to contact me if you have any questions for me, or simply would like me to take a look at a project idea of yours.
                        I would love to have the opportunity to, and I will respond to all messages promptly!
                    </p>
                </div>
            </div>
        </div>


        <div class="block p-6 rounded-lg shadow-lg w-1/2 h-[50vh] stagger_anim" style="background: hsla(0, 0%, 100%, 0.55); backdrop-filter: blur(30px)">
            <form class = "w-full stagger_anim h-11/12">
                <div class="form-group mb-6">
                    <input type="text" class="form-control block w-full px-3 py-1.5 text-base font-normal text-gray-700 bg-clip-padding border border-solid border-gray-300 rounded transition ease-in-out m-0 focus:text-gray-700 focus:border-blue-600 focus:outline-none" id="exampleInput7" placeholder="Name">
                </div>
                <div class="form-group mb-6">
                    <input type="email" class="form-control block w-full px-3 py-1.5 text-base font-normal text-gray-700 bg-clip-padding border border-solid border-gray-300 rounded transition ease-in-out m-0 focus:text-gray-700 focus:border-blue-600 focus:outline-none" id="exampleInput8" placeholder="Email address">
                </div>
                <div class="form-group mb-6">
                    <textarea class=" form-control block w-full px-3 py-1.5 text-base font-normal text-gray-700 bg-clip-padding border border-solid border-gray-300 rounded transition ease-in-out m-0 focus:text-gray-700 focus:border-quinary focus:outline-none " id="exampleFormControlTextarea13" rows="14" placeholder="Message" ></textarea>
                </div>
                <button type="submit" class="
                w-full
                px-6
                py-2.5
                bg-blue-600
                text-white
                font-medium
                text-xs
                leading-tight
                uppercase
                rounded
                shadow-md
                hover:bg-blue-700 hover:shadow-lg
                focus:bg-blue-700 focus:shadow-lg focus:outline-none focus:ring-0
                active:bg-blue-800 active:shadow-lg
                transition
                duration-150
                ease-in-out">Send</button>
            </form>
        </div>
    </div>
</template>

<script>
    export default {}
</script>