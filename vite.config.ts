import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

// Read version from package.json so a single source of truth drives both the
// npm version AND the `__APP_VERSION__` constant injected into the bundle. The
// version shows up in a console.log at startup so users can verify which
// build is actually loaded after a deploy (this also acts as a cache-bust
// sanity check).
const pkgVersion: string = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')
).version;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {

    server: {
      port: 3001,
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        '/piapi-upload': {
          target: 'https://upload.theapi.app',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/piapi-upload/, '/api/ephemeral_resource'),
        },
        '/piapi-api': {
          target: 'https://api.piapi.ai',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/piapi-api/, ''),
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      '__APP_VERSION__': JSON.stringify(pkgVersion),
      '__APP_BUILD_TIME__': JSON.stringify(new Date().toISOString()),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
