import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/') && (id.includes('/gsap/') || id.includes('/@gsap/'))) return 'motion-vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/.taste-skill/**', '**/shots/**', '**/artifacts/**'] },
  },
})
