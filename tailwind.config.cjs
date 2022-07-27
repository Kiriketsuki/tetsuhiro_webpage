/** @type {import('tailwindcss').Config} */

module.exports = {
    content: ['./src/**/*.{html,vue,js}', './node_modules/tw-elements/dist/js/**/*.js'],
    plugins: [
      require('tw-elements/dist/plugin')
    ]
  }