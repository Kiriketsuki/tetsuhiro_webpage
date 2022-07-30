/** @type {import('tailwindcss').Config} */

module.exports = {
    content: ['./src/**/*.{html,vue,js}', './node_modules/tw-elements/dist/js/**/*.js', "./index.html",],
    plugins: [
      require('tw-elements/dist/plugin')
    ],
    theme: {
        extend: {
            fontFamily: {
                slab: [`"Roboto Slab"`, "sans-serif"],
                roboto: [`"Roboto"`, "sans-serif"],
            },
            colors: {
                secondary: "#483C46",
                primary: "#3C6E71",
                tertiary: "#70AE6E",
                quaternary: "#CA907E",
                quinary: "#F6AE2D",
            }
        }
    }
  }