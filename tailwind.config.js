/** @type {import('tailwindcss').Config} */

module.exports = {
    content: [
        "./public/**/*.html",
        "./src/**/*.{vue, js, ts, jsx, tsx}",
        './node_modules/tw-elements/dist/js/**/*.js',
      ],
    theme: {
        extend: {
            fontFamily: {
                gabriola: ["Gabriola"],
                slab: ['Roboto Slab'],
                press_start: [`"Press Start 2P"`],
                roboto: ["Roboto"]
            }
        },
        backgroundOpacity : ['active'],
    },
    plugins: [require('tw-elements/dist/plugin')],
}
