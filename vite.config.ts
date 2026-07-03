import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The ERPNext server does not return CORS headers for the Codespace origin, so
// direct browser calls fail with "Failed to fetch". In dev the app therefore
// calls same-origin '/erp/...' and this proxy forwards it (src/erpnext.ts picks
// the path via erpBase()). The Vite proxy target is STATIC at config time —
// it cannot read the base URL from Settings — so it is fixed here.
// ERP_PROXY_TARGET exists so tests can point the proxy at a mock server.
//
// NOTE: vite.config.ts is only read at startup — after editing this file
// (or changing ERP_PROXY_TARGET) the dev server must be RESTARTED for the
// proxy to take effect.
const ERP_TARGET = process.env.ERP_PROXY_TARGET ?? 'https://sms.unitedceres.edu.sg'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // host:true binds to 0.0.0.0 so the Codespace forwarded port (5173) can reach it.
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/erp': {
        target: ERP_TARGET,
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/erp/, ''),
      },
    },
  },
})
