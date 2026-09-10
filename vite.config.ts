import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: { port: 3000, host: true },
    plugins: [react()],
    define: {
      __BUILD_TS__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
    // Authority acceptance tests simulate several full matches each; under parallel workers they
    // can exceed vitest's 5 s default. Thirty seconds keeps a hang visible without false failures.
    test: { testTimeout: 30_000 },
  };
});
