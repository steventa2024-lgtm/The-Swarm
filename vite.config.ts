import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Tauri expects a fixed dev port and must not clear the terminal.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Inline config stops Vite from discovering a stray postcss.config.js in a parent folder.
  css: { postcss: { plugins: [] } },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: { target: 'es2022', sourcemap: false },
})
