/** @type {import('tailwindcss').Config} */
const tom = (n) => `rgb(var(--marca-${n}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Cor de cada órgão cliente, definida em src/marca.ts (variáveis --marca-50 … --marca-900)
        marca: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, tom(n)])),
        // Menu lateral escuro (variável --sidebar-bg em src/index.css, padrão azul-marinho)
        sidebar: 'rgb(var(--sidebar-bg) / <alpha-value>)',
        gelo: '#f3f5f9',
        coral: '#ff6f61',
      },
      boxShadow: {
        suave: '0 6px 24px rgba(29, 35, 64, 0.07), 0 1px 3px rgba(29, 35, 64, 0.05)',
      },
    },
  },
  plugins: [],
};
