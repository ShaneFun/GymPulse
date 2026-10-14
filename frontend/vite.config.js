import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to all interfaces so the dev server is reachable from a phone,
    // not just from this machine.
    host: true,
    // Vite rejects requests whose Host header it does not recognise. Tailscale
    // serves the app on a *.ts.net name, so without this the phone gets a
    // blank page rather than the app.
    allowedHosts: ['.ts.net'],
    proxy: {
      // The frontend calls a relative /api path, and Vite forwards it to the
      // backend. This keeps everything on one origin, which means the API URL
      // is not pinned to 127.0.0.1 (meaningless on a phone) and the browser
      // never makes a cross-origin request, so CORS does not apply.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
