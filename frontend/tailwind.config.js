/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    ".public/*.{js,jsx,ts,tsx,html}"
  ],
  theme: {
    extend: {
      aspectRatio: {
        '2/3': '2 / 3',
      },
      lineClamp: {
        16: '16',
      },
      spacing: {
        '128': '32rem',
      },
    },
  },
  plugins: [],
}