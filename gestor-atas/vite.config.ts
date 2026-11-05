import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` gera o site normal em dist/ (para Vercel).
// `npm run build:single` gera um único arquivo HTML autocontido em dist-single/.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
}));
