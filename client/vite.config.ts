import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In compose the proxy target is http://server:8080 (service DNS);
// bare-metal `npm run dev` falls back to the API's launchSettings port.
export default defineConfig({
  plugins: [react()],
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
