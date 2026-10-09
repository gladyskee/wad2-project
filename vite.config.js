/* import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // During development, send /api/... requests to the Express server
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
}) */

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true, // listen on all addresses, IPv4 and IPv6
    proxy: {
      '/api': 'http://127.0.0.1:3000'
    }
  }
})
