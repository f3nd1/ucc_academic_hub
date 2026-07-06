import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The ERPNext server does not return CORS headers, so direct browser calls fail
// with "Failed to fetch" / a CORS preflight block. The app therefore always
// calls same-origin '/erp/...' (src/erpnext.ts, erpBase) and this proxy forwards
// it. The proxy is applied to BOTH the dev server AND the preview server, so a
// built app served with `npm run preview` behaves exactly like dev — no CORS in
// production either. The target is STATIC at config time (it cannot read the
// base URL from Settings) so it is fixed here; ERP_PROXY_TARGET lets tests point
// it at a mock and lets a deployment repoint it without touching code.
//
// NOTE: vite.config.ts is only read at startup — after editing this file (or
// changing ERP_PROXY_TARGET) the dev/preview server must be RESTARTED for the
// proxy to take effect.
const ERP_TARGET = process.env.ERP_PROXY_TARGET ?? 'https://sms.unitedceres.edu.sg'

const erpProxy = {
  '/erp': {
    target: ERP_TARGET,
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/erp/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // host:true binds to 0.0.0.0 so a forwarded/remote port can reach the server.
  server: {
    host: true,
    port: 5173,
    proxy: erpProxy,
  },
  // `npm run preview` serves the production build; it needs the SAME /erp proxy
  // so a deployed build never calls ERPNext cross-origin.
  preview: {
    host: true,
    port: 4173,
    proxy: erpProxy,
  },
})
