import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // host:true binds to 0.0.0.0 so the Codespace forwarded port (5173) can reach it.
  server: {
    host: true,
    port: 5173,
    // ERPNext CORS: the app calls ERPNext directly with the token header (see
    // src/erpnext.ts), which needs the Frappe site to allow this origin
    // (allow_cors in site_config.json). If you cannot enable CORS server-side,
    // a Vite dev proxy is the alternative — but its target is STATIC at config
    // time, so you must hard-code the ERPNext base URL here rather than reading
    // it from Settings:
    //
    // proxy: {
    //   '/erpnext': {
    //     target: 'https://erp.unitedceres.edu.sg', // hard-coded; not from Settings
    //     changeOrigin: true,
    //     rewrite: (p) => p.replace(/^\/erpnext/, ''),
    //   },
    // },
  },
})
