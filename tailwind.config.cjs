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
                secondary: "#E01A4F",
                primary: "#051b45",
                tertiary: "#498467",
                quaternary: "#F9C22E",
                quinary: "#53B3CB",
                primary_shade: "#001220",
            },
        }
    }
  }
