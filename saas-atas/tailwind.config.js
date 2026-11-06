/** @type {import('tailwindcss').Config} */
const tom = (n) => `rgb(var(--marca-${n}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cor de cada órgão cliente, definida em src/marca.ts (variáveis --marca-50 … --marca-900)
        marca: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, tom(n)])),
      },
    },
  },
  plugins: [],
};
