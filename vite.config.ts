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
  build: { target: 'es2022', rolldownOptions: { input: { slimeAdhesionResearch: fileURLToPath(new URL('./slime-adhesion-research.html', import.meta.url)), puddleShapes: fileURLToPath(new URL('./puddle-shapes.html', import.meta.url)), slimeBurstLab: fileURLToPath(new URL('./slime-burst-lab.html', import.meta.url)), slimeBurstResearch: fileURLToPath(new URL('./slime-burst-research.html', import.meta.url)), injection: fileURLToPath(new URL('./slime-injection-lab.html', import.meta.url)), inflation: fileURLToPath(new URL('./slime-inflation-lab.html', import.meta.url)), yellowSlime: fileURLToPath(new URL('./yellow-slime-lab.html', import.meta.url)), bowRelease: fileURLToPath(new URL('./bow-release-lab.html', import.meta.url)), main: fileURLToPath(new URL('./index.html', import.meta.url)), spider: fileURLToPath(new URL('./spider-viewer.html', import.meta.url)), juice: fileURLToPath(new URL('./juice-lab.html', import.meta.url)) } } },
}));
