/** @type {import('tailwindcss').Config} */

module.exports = {
    content: ['./src/**/*.{html,vue,js}', "./index.html",],
    theme: {
        extend: {
            fontFamily: {
                slab: ["var(--font-display)"],
                roboto: ["var(--font-body)"],
            },
            colors: {
                secondary: "var(--color-ruby)",
                primary: "var(--color-bg-raised)",
                tertiary: "var(--color-moss)",
                quaternary: "var(--color-amber)",
                quinary: "var(--color-teal)",
                primary_shade: "var(--color-bg-base)",
            },
        }
    }
  }
