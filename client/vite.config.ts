import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In compose the proxy target is http://server:8080 (service DNS);
// bare-metal `npm run dev` falls back to the API's launchSettings port.
export default defineConfig({
  plugins: [react()],
  // r3f-perf vendors its own drei 9 and stats-gl vendors three 0.170; without
  // deduping, Vite can serve a second copy of three/react into the same page
  // ("Multiple instances of Three.js", "Invalid hook call").
  resolve: {
    dedupe: ['three', 'react', 'react-dom', '@react-three/fiber'],
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5210',
        changeOrigin: true,
      },
    },
  },
})
