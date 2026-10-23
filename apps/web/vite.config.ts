import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, new URL('../..', import.meta.url).pathname, '');
  // In development the API runs separately; Vite proxies it so the browser only
  // ever talks to one origin (cookies, CSRF and WebSockets just work).
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:3001';
  const proxy = {
    '/api': { target: apiTarget, changeOrigin: false },
    '/socket.io': { target: apiTarget, ws: true, changeOrigin: false },
  };
  return {
    plugins: [react()],
    envDir: '../..',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: { host: '0.0.0.0', port: 5173, allowedHosts: true, proxy },
    preview: { host: '0.0.0.0', port: 4173, allowedHosts: true, proxy },
    build: {
      target: 'es2022',
      sourcemap: true,
      chunkSizeWarningLimit: 1800,
    },
  };
});
