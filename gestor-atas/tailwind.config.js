/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Verde institucional do Cremesp (logo: #18986F)
        cremesp: {
          50: '#ecfaf4',
          100: '#d1f2e4',
          200: '#a6e4cb',
          300: '#6fd0ad',
          400: '#38b88b',
          500: '#1fa378',
          600: '#18986f',
          700: '#127a5a',
          800: '#11614a',
          900: '#0f503e',
        },
      },
    },
  },
  plugins: [],
};
