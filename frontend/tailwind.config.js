/** @type {import('tailwindcss').Config} */
export default {
  // 'class' strategy: dark mode is toggled by adding/removing the 'dark' class
  // on <html>, which ThemeContext.jsx manages.
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}