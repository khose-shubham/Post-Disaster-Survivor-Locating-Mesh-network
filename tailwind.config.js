/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'command-bg': '#0a0a0a',
        'command-panel': '#141414',
        'command-border': '#333333',
        'command-text': '#e0e0e0',
        'command-accent': '#00ffcc', // Just in case we need a non-alarming accent
      }
    },
  },
  plugins: [],
}
