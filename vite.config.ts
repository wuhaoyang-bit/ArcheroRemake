import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';
import { jsonSettingsPlugin } from './tools/settings-server.ts';

const paramsFile = fileURLToPath(new URL('./public/params.json', import.meta.url));

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [jsonSettingsPlugin(paramsFile), ...(mode === 'mobile' ? [basicSsl({ name: 'ArcheroRemake' })] : [])],
  server: {
    port: mode === 'mobile' ? 5174 : 5173, strictPort: true,
    // Saving tuning must not reload the game and interrupt an active test.
    watch: { ignored: ['**/public/params.json', '**/public/.params-*.tmp'] },
  },
  preview: { port: 4173 },
  build: { target: 'es2022', rolldownOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), spider: fileURLToPath(new URL('./spider-viewer.html', import.meta.url)) } } },
}));
