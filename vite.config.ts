import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
