/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#5553A0',
          dark: '#3D3B8E',
          darker: '#2D2A6E',
        },
        accent: {
          DEFAULT: '#F5A623',
          dark: '#E8890C',
        },
        danger: '#E84040',
      },
    },
  },
  plugins: [],
}
