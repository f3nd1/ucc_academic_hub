import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // host:true binds to 0.0.0.0 so the Codespace forwarded port (5173) can reach it.
  server: { host: true, port: 5173 },
})
